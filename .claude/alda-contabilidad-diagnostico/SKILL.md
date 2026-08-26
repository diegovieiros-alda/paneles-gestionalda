---
name: alda-contabilidad-diagnostico
description: Diagnóstico contable en el Odoo de Alda, solo lectura — descuadres de balance, cierres de caja con diferencia fantasma, facturas simplificadas y cliente anónimo, pagos de OTAs. Usar ante "no cuadra el balance", "la caja pide un importe raro" o "falta un pago de Booking". Diagnostica y documenta; las correcciones las ejecuta el equipo técnico.
---

# Contabilidad y cajas — diagnóstico (solo lectura)

Patrones de incidencias contables reales de Alda. Este entorno **no corrige datos**:
identifica el patrón, cuantifica el alcance con SQL de solo lectura y lo traslada al
equipo técnico con la evidencia.

## Descuadre de balance

Odoo exige asientos cuadrados, así que un balance descuadrado implica **asientos con
líneas incompletas** (algo se saltó el ORM o un flujo borró una pata).

Diagnóstico:
```sql
-- asientos descuadrados
SELECT move_id, SUM(debit) - SUM(credit) AS descuadre
FROM account_move_line
GROUP BY move_id
HAVING ABS(SUM(debit) - SUM(credit)) > 0.005
LIMIT 200;
```
Después, mirar el patrón de esos asientos: ¿son de una sola línea? ¿mismo diario?
¿misma fecha de modificación? (caso real: una campaña de corrección de fechas borró
la contrapartida de 48 asientos de pago del mismo diario). Ojo: los descuadres
pueden casi compensarse entre sí — el descuadre visible puede ser mucho menor que el
daño real. Reportar la lista de `move_id` afectados, el diario y el patrón común;
la restauración de las patas la hace el equipo técnico con script validado en staging.

## Cierre de caja: "diferencia fantasma" / importe teórico inflado

Bug conocido: si en un diario de caja quedan **dos extractos del mismo día** — uno
abierto y vacío y otro cerrado con las líneas reales — el cierre puede contar la
recaudación **dos veces** (el extracto vacío con fecha nula "tapa" al cerrado y
hereda su saldo final como saldo inicial).

Qué hacer:
1. **Avisar al hotel de que NO pulse "Forzar caja"**: crearía una línea de pérdida
   falsa e intentaría re-conciliar pagos ya conciliados.
2. Verificar el patrón:
```sql
-- extractos sospechosos (vacíos/incompletos) de los diarios de caja de un hotel
-- (diario↔hotel es m2m: account_journal_pms_property_rel, NO una columna)
SELECT s.id, j.name AS diario, s.date, s.is_complete,
       s.balance_start, s.balance_end_real,
       (SELECT count(*) FROM account_bank_statement_line l
         WHERE l.statement_id = s.id) AS n_lineas
FROM account_bank_statement s
JOIN account_journal j ON j.id = s.journal_id
JOIN account_journal_pms_property_rel jr ON jr.account_journal_id = j.id
WHERE j.type = 'cash' AND jr.pms_property_id = :property_id
ORDER BY s.create_date DESC LIMIT 50;
```
   Firma del bug: un extracto con `n_lineas = 0` e `is_complete = false` conviviendo
   con otro cerrado del mismo día.
3. Escalar con el `id` del extracto fantasma: el arreglo operativo (borrarlo) y la
   verificación del fix de código los hace el equipo técnico.

## Facturas simplificadas y cliente anónimo

- Las facturas simplificadas usan un **partner anónimo** compartido, referenciado por
  cientos de miles de asientos. Está **protegido por guards**: no se puede modificar
  por UI/API ("Cannot modify the anonymous customer"). Es deliberado — un flujo llegó
  a renombrarlo y contaminó todas las simplificadas.
- Si un análisis muestra miles de facturas al mismo cliente genérico, no es un error
  de datos: es el diseño de las simplificadas. Para análisis por cliente real, usar
  solo facturas no simplificadas o cruzar por folio/huésped.

## Pagos de OTAs (prepagos Booking, etc.)

El registro automático de pagos OTA depende de configuración por hotel: pagos
permitidos + texto identificador que matchea en el payload + diario destino. Si un
folio OTA aparece cobrado en el canal pero sin pago en Roomdoo:

1. ¿Otros folios del mismo hotel/canal sí registran pagos esos días? (si ninguno lo
   hace, apunta a configuración del hotel, no a un fallo puntual).
2. Revisar los `pms_api_log` del folio (skill `alda-triaje-basico`): ¿el PUT llegó
   con éxito y el pago falló después, o el payload no traía el identificador?
3. Escalar con folio, hotel y los IDs de log — la config de pagos del hotel la
   revisa/corrige el equipo técnico.

## Contexto operativo útil

- Las cifras de folio (con IVA, grupos consolidados) se interpretan con
  `alda-datos-negocio` antes de compararlas con contabilidad (sin IVA en apuntes).
- El envío de partes RH al SES está desactivado a propósito en Alda desde 2025-09;
  no reportar como incidencia su "atraso".
- Regla transversal: cuantificar SIEMPRE el alcance (nº de asientos/extractos/folios
  y suma de importes) antes de escalar — convierte un "algo no cuadra" en un caso
  accionable.
