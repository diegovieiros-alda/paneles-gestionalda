---
name: alda-datos-negocio
description: Semántica de los datos del PMS Roomdoo/Alda para análisis y revenue (precios con/sin IVA, folios vs reservas, grupos, disponibilidad vs capacidad, ocupación >100%, regímenes, cancelaciones, dashboards). Usar al interpretar cifras de la API o de informes, cuadrar totales, o responder dudas de revenue/dirección sobre "por qué este número".
---

# Interpretación de datos de negocio — PMS Alda

Semántica verificada (2026) del modelo de datos y la API. Regla nº1: **no afirmar
lógica de negocio sin verificarla** — si algo no está confirmado aquí o en el código,
presentarlo como hipótesis.

## Modelo básico

- **Folio** (`pms.folio`) = expediente/carpeta. **1 folio : N reservas**; una reserva
  pertenece a exactamente un folio.
- **Reserva** (`pms.reservation`) = una habitación con fechas. Sus noches son
  `pms.reservation.line` (una línea por noche, con `price`/`price_day_total` y
  descuentos).
- **Servicio** (`pms.service`) = extras y regímenes. Un régimen (desayuno, media
  pensión) es un servicio con `is_board_service=True`; sus cantidades diarias van en
  líneas de servicio.
- **Checkin partner** (`pms.checkin.partner`) = huésped registrado en una reserva.
- **No existe "reserva de grupo"** como tipo: `reservation_type` real =
  `normal` / `staff` / `out` (fuera de servicio). Un "grupo" es un folio con N
  reservas.

## Precios e IVA (config Alda — verificado en prod)

- El campo `price` de la línea de reserva (y `priceTotal`, `priceOnlyRoom`,
  `priceOnlyServices` en la API) va **CON IVA**. El neto sin IVA está en los subtotal
  aparte (`priceTax` en cabecera de API).
- Neto por noche con IVA = `price × (1 − discount/100) × (1 − cancelDiscount/100)`
  = `price_day_total`.
- **`cancelDiscount` es binario 0/100** (100 solo si la reserva entera está
  cancelada), nunca parcial. Las penalizaciones de cancelación van como servicio
  "Cancel Penalty" aparte.

## Trampas clásicas al agregar revenue

1. **Habitaciones a 0 € en grupos**: en folios multi-habitación el precio puede
   consolidarse en UNA reserva del folio; las demás salen con
   `priceTotal`/`priceOnlyRoom` = 0. NO es un bug ni revenue perdido: **agregar por
   folio**, no por habitación. El resto de reservas a 0 legítimas: cortesías, staff,
   out of service.
2. **Grupos facturados fuera del PMS**: reservas a 0 cuyo cobro se hizo externamente
   — ese revenue NO está en la API. Detectable como folios con `amountTotal` 0 o solo
   servicios.
3. **Estados**: excluir canceladas (`state != 'cancel'`) y normalmente `staff`/`out`
   de los cálculos de ingreso. Ojo: algún endpoint antiguo (`get_daily_billings`) no
   filtraba canceladas/staff — verificar qué endpoint alimenta cada informe.
4. **Regímenes vs extras**: `priceOnlyServices` suma TODO (régimen + extras, con
   IVA). Para separar desayunos etc., filtrar por `isBoardService` a nivel de
   servicio.
5. **Régimen a 0** (bolsa legacy 2025-2026): reservas con desayuno `day_qty=0` por el
   bug de board services huérfanos infra-facturan — el total de Neo será mayor que el
   de Roomdoo justo por el importe del régimen. Ver `alda-api-logs-replay`.

## Disponibilidad, capacidad y ocupación

- El endpoint de availability devuelve **habitaciones LIBRES restantes**, NO
  capacidad. No derivar "número de habitaciones del hotel" de ahí (error real: hotel
  de 31 habitaciones tratado como de 27 → ocupaciones ">100%" fantasma).
- Capacidad = habitaciones activas en `pms.room` (¡cuidado con archivadas: para
  históricos usar `active_test=False` y las fechas de alta/baja si existen!).
- **Roomdoo SÍ permite overbooking** (forzado para usuarios API/channel): los
  dashboards deben tolerar ocupación >100% real.
- `pms.availability.plan.rule`: fechas sin regla caen al default del plan
  (`default_availability`, típicamente 0) — un tipo "sin regla" no es "sin límite".

## Dashboards y filtros de fecha

- Bug patrón (spreadsheet dashboards): filtros de mes que en realidad seleccionan
  `[último día del mes anterior … último día del mes]` por un off-by-one de zona
  horaria (fieldMatching sin `type: date` → rama datetime → UTC). Síntoma: **la suma
  de los meses no cuadra con el total anual** y cada mes viene inflado con la última
  noche del anterior. Ante cualquier descuadre mensual vs anual, comprobar primero la
  ventana real del filtro contra una query limpia de mes natural.
- Al comparar cifras entre fuentes, fijar SIEMPRE: rango de fechas por **fecha de
  estancia** (`date` de la línea) vs fecha de checkin vs fecha de venta; con/sin IVA;
  estados incluidos; staff/out incluidos o no. El 90% de los "no me cuadra" es una de
  estas cuatro.

## KPIs (alda_pms_kpi)

- La regeneración histórica de KPIs cuenta habitaciones con `active=True` **a fecha
  actual** — si se archivaron habitaciones, los KPIs históricos regenerados salen mal
  (denominador actual, no el de la época). Tenerlo en cuenta antes de "regenerar y
  comparar".

## Para integradores externos (API REST)

- Autenticación y endpoints de `pms_api_rest`; servicios de reserva en
  `/reservations/{id}/services` (con `serviceLines`).
- Campos que NO existen en la API aunque aparezcan en capas intermedias de terceros
  (Synchub): `boardServices_total_amount`, `priceOnlyServices_amount`. Los reales de
  cabecera: `priceOnlyRoom`, `priceOnlyServices`, `priceTotal`, `servicesDiscount`,
  `priceTax`.
- Las dudas sobre informes internos de Alda (Presupuesto vs año anterior, OTB) las
  gestiona Alda (contacto: informática de Alda), no el equipo Roomdoo.
