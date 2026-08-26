# Definiciones canónicas de KPIs — PMS Alda

Documento de referencia única para el cálculo de KPIs, con destino al
dashboard `paneles-gestionalda` (backend Django, `backend/core/hoteles/`).

Cada KPI aparece **una sola vez**, con su explicación y un único bloque de
código (función Python, con su consulta SQL ya dentro — no hay una versión
"solo SQL" y otra "en Python" por separado). Los KPIs devuelven un total
agregado por hotel para el rango de fechas filtrado (`dict[pms_property_id,
valor]`), igual convención que `fetch_alojados`/`fetch_desayunos` ya
existentes en el repo real — sin desglose diario.

**Regla de mantenimiento**: si un KPI base cambia de criterio, se actualiza
únicamente su función aquí. Los KPIs compuestos nunca reescriben el SQL de un
KPI base — lo llaman como función y combinan el resultado en código (ver
sección de compuestos).

**Este documento describe un modelo propuesto, no el código desplegado hoy.**
Verificado (2026-08-26) contra `backend/core/hoteles/repository.py` real:
ninguna de las funciones de aquí (`fetch_rn`, `fetch_alojados_reservas`,
`calcular_ratio_penetracion`, etc.) existe con ese nombre en el repo. El repo
real usa otra familia (`fetch_alojados`, `fetch_desayunos`,
`fetch_fnb_desayuno`, `fetch_presupuesto_desayuno`...) con su propia lógica,
que en dos puntos concretos **todavía tiene hoy** los mismos fallos que este
documento corrige más abajo: el presupuesto se une por cuenta analítica en
vez de `pms_property_id` directo (punto 2), y los ingresos/gastos reales de
F&B se calculan con `price_subtotal` en vez de saldo contable, sin filtrar
`move_type` (punto 3). Hasta que alguien traslade estas correcciones también
a `repository.py`, este documento y el dashboard en producción divergirán.

## Criterio unificado de "reserva viva"

Antes de esta revisión, tres KPIs que se comparan entre sí filtraban de
forma distinta lo que cuenta como reserva/servicio activo: `fetch_rn` excluía
`draft`, `fetch_alojados_reservas` no, y los KPIs de desayuno de producción
mezclaban estado de folio con estado de reserva. Resultado: penetraciones
por encima del 100% que no eran (solo) colaborador, sino numerador y
denominador midiendo universos distintos (ver CSV adjunto: "Alda Soria
Rooms" 144,3%, "Hotel Alda Alpina" 101,4%).

**Criterio único, aplicado ahora a los tres**:
- A nivel de **reserva**: `r.state NOT IN ('draft', 'cancel')`. `draft` es
  pre-reserva (no huésped confirmado); `cancel` es obvio. El resto de
  estados (`confirm`, `onboard`, `done`, `arrival_delayed`,
  `departure_delayed`) cuentan.
- A nivel de **folio** (solo aplica a los KPIs que pasan por
  `pms_service`/`folio_id`, porque `pms_service.state` es en realidad el
  estado del folio, no un estado propio del servicio — ver justificación
  corregida más abajo): folio no cancelado (`s.state NOT IN ('cancel',
  'draft')`).
- `rl.state` (en `pms_reservation_line`) **no se usa como filtro
  independiente**: es un campo `related` almacenado a `reservation_id.state`
  (`pms/models/pms_reservation_line.py:67`), no un estado por noche. Antes
  de esta revisión el documento decía lo contrario (ver corrección más
  abajo en `fetch_rn`).

Cada KPI de la sección "KPIs base" referencia este criterio en vez de
repetir su justificación.

**Decisión pendiente de confirmar — convención de rango de fechas (5.1)**:
todas las consultas de este documento usan `>= desde AND < hasta` (fin
exclusivo). Los KPIs ya existentes en el repo real (`fetch_alojados`,
`fetch_desayunos`) usan `BETWEEN %s AND %s`, con el fin **inclusivo**. Si
la vista de Django que llame a estas funciones sigue enviando el mismo
`fecha_fin` que hoy usa para las funciones reales, se pierde el último día
de cada rango en todos los KPIs de este documento, en silencio.
**Propuesta**: renombrar el parámetro a `hasta_exclusivo` en todas las
firmas (no solo en la documentación) para que sea imposible pasarlo por
error como si fuera inclusivo, y dejar la conversión inclusivo→exclusivo
(`hasta_exclusivo = hasta_inclusivo + timedelta(days=1)`) en la capa que
llama a estas funciones desde Django, no aquí. Alternativa no elegida:
cambiar todo el documento a `BETWEEN` inclusivo para igualar el repo real —
se descarta porque mezclar `BETWEEN` (inclusivo) con los JOIN a
`account_move_budget_line`/`pms_budget` (que agregan por mes completo) es
más propenso a errores de borde que un exclusivo explícito. **Pendiente de
confirmar** con quien conecte esto a la vista de Django — aplicado ya en el
código de este documento (todas las firmas usan `hasta_exclusivo` a partir
de esta revisión), pero no se ha verificado el lado que llama.

**Aviso de rendimiento/seguridad para toda consulta de este documento**:
todas corren contra la base de **producción**, sin `statement_timeout` en
el rol de solo lectura, y `pms_service_line.date` / `pms_reservation_line.date`
no tienen índice. Evitar rangos amplios (más de 1-2 años) sin acotar también
por hotel, y evitar lanzar varias de golpe.

---

## KPIs base

### Alojados reservados — `fetch_alojados_reservas`

**Qué mide**: personas (adultos + niños) reservadas, en habitaciones de
estancia real, excluyendo reselling/overbooking. Es un dato **declarado** (no
verificado con check-in).

**Criterio**:
- Solo tipos de habitación `overnight_room = TRUE` (campo propio de
  `pms_reservation_line`, no hace falta unir a `pms_room_type`).
- Reserva viva según el [criterio unificado](#criterio-unificado-de-reserva-viva)
  (`r.state NOT IN ('draft', 'cancel')`).
- **Cambio (2026-08-26, punto 4)**: antes filtraba solo `r.state != 'cancel'`,
  lo que incluía reservas `draft` (pre-reserva) en el pax "reservado" — a
  diferencia de `fetch_rn`, que ya excluía `draft`. Los dos KPIs se comparan
  entre sí (`calcular_ratio_penetracion` los combina), así que medir
  universos distintos sesgaba el ratio. **Esto cambia el resultado
  numérico** (antes incluía pre-reservas, ahora no) — la cifra de Sada
  Marina de más abajo queda **pendiente de revalidar**.
- `reservation_type = 'normal'` — excluye `staff` y `out` (bloqueos).
- Excluye reselling/overbooking (`occupies_availability = TRUE`,
  `overbooking = FALSE`).
- Personas = `adults + children` declarados en la reserva. **Ver decisión
  abierta 5.5**: el dashboard real usa `children_occupying`, no `children` —
  no se cambia aquí todavía, queda como decisión pendiente de confirmar más
  abajo.
- **Aviso de nombre (ver punto 4 del documento de correcciones)**: con este
  criterio, `fetch_alojados_reservas` seguirá dando un número **distinto**
  del "Alojados" que ya muestra el dashboard real hoy (que usa
  `rl.state NOT IN ('draft','cancel')` sobre `adults + children_occupying`,
  sin el filtro de `occupies_availability`/`overbooking` de aquí). Tener dos
  "Alojados" distintos en el mismo negocio es peor que cualquiera de los dos
  criterios por separado — si este KPI llega a mostrarse junto al dashboard
  real, debe llamarse de forma visiblemente distinta ("Pax reservado", no
  "Alojados") hasta que alguien decida cuál es la fuente de verdad única.

```python
_ALOJADOS_RESERVAS_SQL = """
    SELECT rl.pms_property_id,
           SUM(r.adults + COALESCE(r.children, 0)) AS pax_reservado
    FROM pms_reservation_line rl
    JOIN pms_reservation r ON r.id = rl.reservation_id
    WHERE rl.date >= %(desde)s AND rl.date < %(hasta_exclusivo)s
      AND rl.overnight_room = true
      AND r.state NOT IN ('draft', 'cancel')
      AND r.reservation_type = 'normal'
      AND rl.occupies_availability = true
      AND rl.overbooking = false
    GROUP BY rl.pms_property_id
"""

@cache_result
def fetch_alojados_reservas(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, int]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_ALOJADOS_RESERVAS_SQL, {"desde": fecha_inicio, "hasta_exclusivo": hasta_exclusivo})
        rows = cur.fetchall()
    return {r[0]: int(r[1] or 0) for r in rows}
```

**⚠️ Pendiente de revalidar**: la cifra siguiente se calculó con el filtro
anterior (`r.state != 'cancel'`, incluía `draft`). Con el criterio unificado
puede bajar. Re-ejecutar contra Hotel Sada Marina, julio 2026 antes de dar
el número por bueno.

~~Validado contra: Hotel Alda Palacio Valdés, Hotel Sada Marina, Hotel Alda
Valladolid Sur (julio 2026). Sada Marina julio 2026 recalculado tras excluir
staff: 5.719 pax (sin cambio frente a la versión anterior — 0 reservas
`staff` en la muestra).~~ — cifra calculada con el criterio de reserva viva
anterior a esta revisión, no vigente.

---

### RN — Room Nights comercial — `fetch_rn`

**Qué mide**: noches de habitación vendidas. Incluye overbooking a
propósito (esa noche se vendió/facturó igual). No depende de check-in.

**Criterio**:
- Solo `overnight_room = TRUE`.
- Reserva viva según el [criterio unificado](#criterio-unificado-de-reserva-viva)
  (`r.state NOT IN ('draft', 'cancel')`).
- **Corregido (2026-08-26)**: la versión anterior de este documento filtraba
  por `rl.state NOT IN ('draft','cancel')` y decía que era "campo propio de
  `pms_reservation_line`" que "cubre cancelaciones parciales de una sola
  noche". Es falso: `state` en `pms_reservation_line` es un `related`
  almacenado a `reservation_id.state` (`pms/models/pms_reservation_line.py:67`),
  no hay estado por noche — no existe cancelación parcial de una sola noche
  en este campo. El propio módulo lo reconoce con un
  `# TODO: Refact method and allowed cancelled single days` sobre
  `_compute_cancel_discount`; lo que sí marca una noche cancelada dentro de
  una reserva viva es `cancel_discount = 100`, que no se usaba aquí. El
  filtro no hacía daño (al ser un related, `rl.state NOT IN ('draft','cancel')`
  produce exactamente el mismo conjunto de filas que `r.state NOT IN
  ('draft','cancel')`), así que la cifra ya validada **no cambia** — se
  corrige la consulta para filtrar directamente sobre `r.state` (más
  honesto sobre qué comprueba) y se corrige la explicación.
- `reservation_type = 'normal'` — excluye `staff` y `out`.
- No excluye reselling/overbooking (a diferencia de `alojados_reservas`) — es
  RN comercial, no ocupación física.
- Sin filtro de `active`: un histórico no depende de si la habitación sigue
  existiendo hoy.
- `rl.id` es la PK de `pms_reservation_line`: el `DISTINCT` de la versión
  anterior no aportaba nada (parece resto de una versión con join adicional)
  — quitado.

```python
_RN_SQL = """
    SELECT rl.pms_property_id,
           COUNT(rl.id) AS rn
    FROM pms_reservation_line rl
    JOIN pms_reservation r ON r.id = rl.reservation_id
    WHERE rl.date >= %(desde)s AND rl.date < %(hasta_exclusivo)s
      AND rl.overnight_room = true
      AND r.state NOT IN ('draft', 'cancel')
      AND r.reservation_type = 'normal'
    GROUP BY rl.pms_property_id
"""

@cache_result
def fetch_rn(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, int]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_RN_SQL, {"desde": fecha_inicio, "hasta_exclusivo": hasta_exclusivo})
        rows = cur.fetchall()
    return {r[0]: int(r[1] or 0) for r in rows}
```

Validado contra: columna `Rn` del dashboard original, coincidencia exacta en
Hotel Alda Palacio Valdés y Hotel Sada Marina, julio 2026. Sada Marina julio
2026 recalculado tras excluir staff: 2.683 RN (sin cambio — 0 reservas
`staff` en la muestra). Criterio alineado con `paneles-gestionalda`, que
también filtra `reservation_type = 'normal'`. **Cifra de 2.683 RN
confirmada como vigente**: el cambio de filtro de esta revisión es
equivalente al anterior (mismo conjunto de filas), no invalida el número.

---

### RN — presupuesto — `fetch_rn_presupuesto`

**Qué mide**: Room Nights presupuestadas, por hotel y mes, para comparar
contra el `fetch_rn` real.

**Origen del dato**: tabla `pms_budget` — **no** es la misma fuente que el
presupuesto de desayuno (`account_move_budget_line`). Esta es una tabla
propia de PMS/Roomdoo, específica para el presupuesto cargado para DataBI
(RN, ingreso de habitación, estancias), con `pms_property_id` directo (no
hace falta pasar por cuenta analítica).

**Criterio**:
- `month`/`year` están guardados como texto, uno por mes — se construye una
  fecha con `TO_DATE(year || '-' || month || '-01', 'YYYY-MM-DD')` para
  poder filtrar por el mismo rango `desde`/`hasta` que el resto de KPIs.
  Verificado que `TO_DATE` acepta el mes sin cero a la izquierda (`'7'` →
  julio) sin problema.
- Sin filtro de estado: esta tabla no tiene un campo de estado tipo
  `draft`/`confirmed` como el presupuesto contable — cada fila es ya el
  presupuesto cargado, no hay versiones a filtrar.
- **Corregido (punto 6)**: `room_nights` es `fields.Float(digits=(6,2))`, no
  un entero. La versión anterior hacía `int(SUM(...))`, que trunca (no
  redondea) — un hotel con 2.666,7 RN presupuestadas daba 2.666, perdiendo
  0,7 en silencio y de forma sistemáticamente sesgada a la baja en todos los
  hoteles. Se cambia a `round(..., 2)` conservando el decimal, y el tipo de
  retorno pasa a `float`.
- **Comprobación de duplicados pendiente (punto 6)**: `pms.budget` no tiene
  estado ni restricción de unicidad por hotel/mes — si una carga se repitió,
  esta suma la cuenta dos veces sin avisar. Ver consulta de verificación en
  el apéndice de auditoría al final del documento; ejecutarla antes de dar
  por buena cualquier cifra de este KPI.

```python
_RN_PRESUPUESTO_SQL = """
    SELECT pb.pms_property_id,
           SUM(pb.room_nights) AS rn
    FROM pms_budget pb
    WHERE TO_DATE(pb.year || '-' || pb.month || '-01', 'YYYY-MM-DD') >= %(desde)s
      AND TO_DATE(pb.year || '-' || pb.month || '-01', 'YYYY-MM-DD') < %(hasta_exclusivo)s
    GROUP BY pb.pms_property_id
"""

@cache_result
def fetch_rn_presupuesto(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, float]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_RN_PRESUPUESTO_SQL, {"desde": fecha_inicio, "hasta_exclusivo": hasta_exclusivo})
        rows = cur.fetchall()
    return {r[0]: round(float(r[1] or 0), 2) for r in rows}
```

**Nota**: la tabla también trae `room_revenue` (ingreso de habitación
presupuestado) y `estancias`, no declarados aquí como KPI porque no se han
pedido todavía — si se necesitan, seguir el mismo patrón (misma tabla, mismo
filtro de fecha, sumando la columna correspondiente) sin duplicar esta
consulta base.

**⚠️ Pendiente de revalidar**: la cifra de abajo se calculó con `int()`
(truncando decimales) y con la comprobación de duplicados de `pms.budget`
todavía sin ejecutar. Puede variar ligeramente al recalcular.

~~Validado contra: Hotel Sada Marina, julio 2026 → 2.666 RN presupuestadas
frente a 2.683 RN reales (`fetch_rn`) — diferencia de +17 (~0,6%), muy
cercano.~~ — cifra truncada, no vigente hasta recalcular con `round()`.

---

### Desayunos de producción, por producto — `fetch_ud_desayunos_produccion_por_producto`

**KPI base real de esta familia** — la única consulta que toca
`pms_service_line` para desayunos de producción. El total por hotel y el
precio medio por hotel (más abajo) son **compuestos derivados de esta**, no
consultas SQL aparte, para no repetir el filtro.

**Qué mide**: unidades servidas y precio medio, **desglosado por producto**,
por fecha real de consumo — no de venta ni de factura. Ver la versión de
facturación más abajo para conciliación contable (fechas no comparables
entre sí, día a día).

**Criterio**:
- Folio no cancelado ni en borrador. **Corregido (punto 4)**:
  `pms_service.state` NO es un estado propio del servicio, es un `related`
  al estado del folio (`pms/models/pms_service.py:120`,
  `help="Service status, it corresponds with folio status"`). El nombre del
  criterio pasa a ser explícito: "folio no cancelado/borrador", no "servicio
  no cancelado".
- Reserva viva según el [criterio unificado](#criterio-unificado-de-reserva-viva)
  (`r.state NOT IN ('draft', 'cancel')`). **Cambio (punto 4)**: antes solo
  `r.state != 'cancel'`, lo que dejaba pasar servicios de reservas `draft`
  (pre-reserva) — mezclando, para el mismo periodo, un numerador de
  penetración con distinto universo que el denominador
  (`fetch_alojados_reservas`). **Esto cambia el resultado numérico** — la
  cifra de más abajo queda pendiente de revalidar.
- `product_id` limitado a una **lista fija de 12 productos verificados uno a
  uno** (no por nombre ni por régimen dinámico) — evita falsos positivos
  ("Suplemento Desayuno Grupos" contiene "Desayuno" en el nombre pero no lo
  es) y no pierde productos archivados con ventas reales (`product_id = 11`).
- **Precio medio con descuento aplicado**: usa `price_day_subtotal` (importe
  neto de la línea, sin IVA, ya con el descuento restado), no `price_unit`
  (precio de lista, sin descontar). Verificado con datos reales: una línea
  con `price_unit=6,50 €`, `discount=23,06%`, `day_qty=2` da
  `price_day_subtotal=9,09 €` — usar `price_unit` a pelo habría inflado el
  precio medio en los productos con descuento. `price_day_subtotal` ya es el
  total de la línea (multiplicado por `day_qty`), no un precio por unidad —
  no volver a multiplicar.
- **Aviso, no filtro (punto 6)**: `pms_service_line._compute_discount` copia
  el descuento de la línea de reserva a la línea de servicio, así que una
  reserva con 100% de descuento cuenta unidades con `price_day_subtotal = 0`
  y tira el precio medio hacia abajo. No es un error del KPI — es el
  comportamiento correcto de "precio medio neto" — pero conviene poder
  aislarlo si un hotel concreto sale con un precio medio sospechosamente
  bajo (comparar `unidades` vs. `importe` por producto en el desglose).
- **Corregido (punto 6)**: `GROUP BY pt.name->>'es_ES'` agrupaba por `NULL`
  cualquier producto sin traducción `es_ES`, perdiéndolo o mezclándolo con
  otros `NULL`. Cambiado a `COALESCE(pt.name->>'es_ES', pt.name->>'en_US')`.

```python
_PRODUCTOS_DESAYUNO = (11, 10794, 198, 327, 328, 3978, 10795, 10810, 10811, 10812, 10813, 10815)
# 11: Express Breakfast (archivado, con volumen real alto — no quitar)  | 10794: Express Breakfast
# 198: Desayuno Buffet Alda   | 327: Desayuno Negociado   | 328: Desayuno Infantil
# 3978: Desayuno Grupos       | 10795: Desayuno Colaborador
# 10810: Desayuno Infantil Colaborador   | 10811: Desayuno Grupos Infantil
# 10812: Desayuno Grupos Colaborador     | 10813: Desayuno Grupos Colaborador Infantil
# 10815: Desayuno Negociado Colaborador
# Mantenimiento de esta lista: ver procedimiento de refresco en la skill alda-precios-desayuno.

_PRODUCTOS_DESAYUNO_COLABORADOR = (10795, 10810, 10812, 10813, 10815)
# Subconjunto de _PRODUCTOS_DESAYUNO que es venta a colaborador/agencia (no
# directa al huésped): 10795 Desayuno Colaborador, 10810 Desayuno Infantil
# Colaborador, 10812 Desayuno Grupos Colaborador, 10813 Desayuno Grupos
# Colaborador Infantil, 10815 Desayuno Negociado Colaborador. Cuenta en
# producción/precio medio (es dinero real) pero se excluye del numerador de
# penetración — ver fetch_ud_desayunos_produccion_directa y decisión 5.6
# (cerrada en esta revisión). Nota: 10811 "Desayuno Grupos Infantil" NO es
# colaborador pese al nombre similar a 10812/10813 — verificado uno a uno,
# no queda en esta lista.

_PRODUCTOS_SUPLEMENTO_DESAYUNO = (10264,)
# 10264: Suplemento Desayuno Grupos — NO es un desayuno (no genera unidad),
# es un importe añadido sobre un grupo que ya tiene su desayuno contado por
# otro producto. Por eso cuenta en € (importe/ingresos) pero nunca en
# unidades. Detectado porque el export de Odoo (que filtra por nombre
# "desayuno", no por ID) sí lo incluye y el nuestro no — diferencia de 42,00 €
# con IVA (38,18 € neto) en Sada Marina julio 2026, ya reconciliada.

_UD_DESAYUNOS_PRODUCCION_POR_PRODUCTO_SQL = """
    SELECT sl.pms_property_id,
           s.product_id,
           COALESCE(pt.name->>'es_ES', pt.name->>'en_US') AS producto,
           SUM(sl.day_qty) AS unidades,
           SUM(sl.price_day_subtotal) AS importe,
           ROUND(SUM(sl.price_day_subtotal) / NULLIF(SUM(sl.day_qty), 0), 2) AS precio_medio
    FROM pms_service_line sl
    JOIN pms_service s ON s.id = sl.service_id
    JOIN pms_reservation r ON r.id = s.reservation_id
    JOIN product_product pp ON pp.id = s.product_id
    JOIN product_template pt ON pt.id = pp.product_tmpl_id
    WHERE sl.date >= %(desde)s AND sl.date < %(hasta_exclusivo)s
      AND s.state NOT IN ('cancel', 'draft')
      AND r.state NOT IN ('draft', 'cancel')
      AND s.product_id IN %(productos_desayuno)s
    GROUP BY sl.pms_property_id, s.product_id, COALESCE(pt.name->>'es_ES', pt.name->>'en_US')
"""

@cache_result
def fetch_ud_desayunos_produccion_por_producto(
    fecha_inicio: datetime.date, hasta_exclusivo: datetime.date
) -> dict[int, list[dict]]:
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _UD_DESAYUNOS_PRODUCCION_POR_PRODUCTO_SQL,
            {"desde": fecha_inicio, "hasta_exclusivo": hasta_exclusivo, "productos_desayuno": _PRODUCTOS_DESAYUNO},
        )
        rows = cur.fetchall()
    resultado: dict[int, list[dict]] = {}
    for hotel_id, product_id, producto, unidades, importe, precio_medio in rows:
        resultado.setdefault(hotel_id, []).append({
            "product_id": product_id,
            "producto": producto,
            "unidades": int(unidades or 0),
            "importe": float(importe or 0),
            "precio_medio": float(precio_medio or 0),
        })
    return resultado
```

**⚠️ Pendiente de revalidar**: la cifra de abajo se calculó con
`r.state != 'cancel'` (incluía `draft`). Con el criterio unificado puede
bajar ligeramente.

~~Validado contra: Hotel Sada Marina, agosto 2026 → 2.441 unidades en total
(suma de todos los productos), tras descartar "Suplemento Desayuno Grupos" y
las líneas `cancel`, que un filtro por nombre `ILIKE '%desayuno%'` sí colaba
incorrectamente.~~ — cifra calculada con el criterio de reserva viva
anterior a esta revisión, no vigente.

---

### Importe de suplemento de desayuno — producción — `fetch_importe_suplemento_desayuno_produccion`

**Qué mide**: importe neto (€) del producto `10264` (Suplemento Desayuno
Grupos), por fecha de servicio (producción). Mismo criterio de estado que el
KPI base de arriba, pero **su propia lista de producto**
(`_PRODUCTOS_SUPLEMENTO_DESAYUNO`) — no se mezcla con
`_PRODUCTOS_DESAYUNO` porque este importe **cuenta en ingresos pero nunca en
unidades** (no es un desayuno servido, es un cargo añadido sobre un grupo que
ya tiene su desayuno contado por otro producto).

**Criterio de reserva/folio vivos**: mismo [criterio unificado](#criterio-unificado-de-reserva-viva)
que el KPI base de arriba (`r.state NOT IN ('draft','cancel')`, folio no
cancelado/borrador) — cambiado en esta revisión por el mismo motivo (punto 4).

```python
_IMPORTE_SUPLEMENTO_DESAYUNO_PRODUCCION_SQL = """
    SELECT sl.pms_property_id,
           SUM(sl.price_day_subtotal) AS importe
    FROM pms_service_line sl
    JOIN pms_service s ON s.id = sl.service_id
    JOIN pms_reservation r ON r.id = s.reservation_id
    WHERE sl.date >= %(desde)s AND sl.date < %(hasta_exclusivo)s
      AND s.state NOT IN ('cancel', 'draft')
      AND r.state NOT IN ('draft', 'cancel')
      AND s.product_id IN %(productos_suplemento)s
    GROUP BY sl.pms_property_id
"""

@cache_result
def fetch_importe_suplemento_desayuno_produccion(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, float]:
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _IMPORTE_SUPLEMENTO_DESAYUNO_PRODUCCION_SQL,
            {"desde": fecha_inicio, "hasta_exclusivo": hasta_exclusivo, "productos_suplemento": _PRODUCTOS_SUPLEMENTO_DESAYUNO},
        )
        rows = cur.fetchall()
    return {r[0]: float(r[1] or 0) for r in rows}
```

---

### Unidades de desayuno — producción, total por hotel — `fetch_ud_desayunos_produccion` (compuesto)

**Depende de**: `fetch_ud_desayunos_produccion_por_producto`. No ejecuta
ninguna consulta SQL propia — suma el desglose ya calculado.

**Qué mide**: lo mismo que el KPI granular de arriba, pero sumado por hotel
(sin desglose de producto) — para tablas que solo necesitan el total.

```python
def fetch_ud_desayunos_produccion(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, int]:
    desglose = fetch_ud_desayunos_produccion_por_producto(fecha_inicio, hasta_exclusivo)
    return {
        hotel_id: sum(p["unidades"] for p in productos)
        for hotel_id, productos in desglose.items()
    }
```

**Comprobación de integridad**: la suma de `unidades` de todos los productos
de un hotel en el desglose granular debe coincidir siempre con este total —
si no coincide, señal de que las dos han dejado de compartir el mismo
`WHERE` (no debería poder pasar con esta estructura, pero es el chequeo a
hacer si algún día aparece una discrepancia).

---

### Unidades de desayuno — producción directa (sin colaborador), por hotel — `fetch_ud_desayunos_produccion_directa` (compuesto)

**Depende de**: `fetch_ud_desayunos_produccion_por_producto`. No ejecuta
ninguna consulta SQL propia — suma el desglose ya calculado, excluyendo los
`product_id` de `_PRODUCTOS_DESAYUNO_COLABORADOR`.

**Qué mide**: lo mismo que `fetch_ud_desayunos_produccion`, pero sin las
ventas a colaborador/agencia — pensado como numerador de la penetración
(ver decisión 5.6, **cerrada** en esta revisión).

**Por qué existe como KPI aparte** (y no como filtro dentro del total): una
venta a colaborador es dinero real y debe seguir contando en producción
total y en precio medio (`fetch_ud_desayunos_produccion`,
`fetch_precio_medio_desayuno_produccion` siguen intactos, sin colaborador
excluido), pero puede no corresponder a ningún huésped contado en
"alojados" — mezclarla en el numerador de penetración puede disparar el
ratio por encima del 100% de forma artificial. Motivo verificado (no solo
teórico) en el criterio ya validado del dashboard real
(`paneles-gestionalda`, comentario en `repository.py`:
`_REGIMENES_COLABORADOR` se excluye de la penetración por el mismo motivo).

```python
def fetch_ud_desayunos_produccion_directa(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, int]:
    desglose = fetch_ud_desayunos_produccion_por_producto(fecha_inicio, hasta_exclusivo)
    return {
        hotel_id: sum(
            p["unidades"] for p in productos
            if p["product_id"] not in _PRODUCTOS_DESAYUNO_COLABORADOR
        )
        for hotel_id, productos in desglose.items()
    }
```

**Pendiente de validar** con datos reales (ejecutar contra un hotel con
ventas a colaborador conocidas y comparar el delta contra
`fetch_ud_desayunos_produccion`).

---

### Ingresos de desayuno — producción, total por hotel — `fetch_ingresos_desayuno_produccion` (compuesto)

**Depende de**: `fetch_ud_desayunos_produccion_por_producto` +
`fetch_importe_suplemento_desayuno_produccion`. No ejecuta ninguna consulta
SQL propia — suma el campo `importe` ya calculado en el desglose por
producto (`SUM(sl.price_day_subtotal)`, neto de IVA y con descuento ya
aplicado) **más** el importe del suplemento de grupos, que no forma parte
del desglose por producto porque no cuenta como unidad de desayuno.

**Qué mide**: importe neto (€) de desayuno por **fecha de servicio**
(producción), no de factura — análogo a `fetch_ingresos_desayuno_facturacion`
pero en el otro criterio temporal. No comparable día a día contra el de
facturación (fechas de naturaleza distinta), solo totales de periodo.

**Criterio de reconciliación con el export de Odoo**: un export de Odoo
filtrado por nombre "desayuno" incluye el producto `10264` (Suplemento
Desayuno Grupos), que nuestro desglose por producto excluye a propósito
(no es una unidad de desayuno real). Por eso el importe total de este KPI
**sí** suma el suplemento (es un cargo real, en €), aunque sus unidades
nunca se cuenten en ningún KPI de unidades. Verificado: la diferencia entre
nuestro primer cálculo (sin suplemento) y el export de Odoo era exactamente
42,00 € = el importe del suplemento en ese periodo.

**Nota**: se suma `importe` directamente (no `unidades × precio_medio`) para
evitar el error de redondeo que arrastraría multiplicar por un precio medio
ya redondeado a 2 decimales.

```python
def fetch_ingresos_desayuno_produccion(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, float]:
    desglose = fetch_ud_desayunos_produccion_por_producto(fecha_inicio, hasta_exclusivo)
    suplemento = fetch_importe_suplemento_desayuno_produccion(fecha_inicio, hasta_exclusivo)

    resultado = {
        hotel_id: sum(p["importe"] for p in productos)
        for hotel_id, productos in desglose.items()
    }
    for hotel_id, importe_suplemento in suplemento.items():
        resultado[hotel_id] = resultado.get(hotel_id, 0) + importe_suplemento
    return resultado
```

**⚠️ Pendiente de revalidar**: hereda el cambio de criterio de reserva viva
de `fetch_ud_desayunos_produccion_por_producto` (punto 4).

~~Validado contra: Hotel Sada Marina, julio 2026 → 12.156,36 € (sin
suplemento) + 38,18 € (suplemento, neto) = **12.194,54 €** (producción) vs.
12.086,57 € (facturación) — diferencia de +107,97 €, coherente con el mismo
desfase ya visto en unidades (producción 1.987 vs. facturación 1.980,
servicios de fin de mes aún sin facturar) más el propio suplemento (que en
facturación ya iba incluido dentro de `fetch_ingresos_desayuno_facturacion`,
al no filtrar por producto).~~ — cifra calculada con el criterio de reserva
viva anterior a esta revisión, no vigente. La cifra de facturación
(12.086,57 €) referenciada aquí como comparación **también** queda pendiente
de revalidar por el cambio del punto 3 (saldo contable en vez de
`price_subtotal`) — ver más abajo.

---

### Precio medio de desayuno — producción, total por hotel — `fetch_precio_medio_desayuno_produccion` (compuesto)

**Depende de**: `fetch_ingresos_desayuno_produccion`,
`fetch_ud_desayunos_produccion`. No ejecuta ninguna consulta SQL propia —
divide dos totales ya calculados.

**Qué mide**: precio medio neto (sin IVA, con descuento aplicado) de
desayuno de producción, para el hotel completo (sin desglose de producto).

**Criterio**:
- **Incluye el suplemento de grupos en el numerador** (vía
  `fetch_ingresos_desayuno_produccion`, que ya lo suma), aunque el
  denominador (`fetch_ud_desayunos_produccion`) no lo cuenta como unidad —
  es el mismo criterio que en `fetch_ingresos_desayuno_produccion`: el
  suplemento es un cargo real en €, pero no genera una unidad de desayuno
  propia. Antes de este cambio el precio medio no incluía el suplemento;
  ahora sí, para que sea consistente con el total de ingresos.
- Un hotel sin unidades en el periodo debe salir sin entrada (no `0`
  engañoso ni error de división).

```python
def fetch_precio_medio_desayuno_produccion(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, float]:
    ingresos = fetch_ingresos_desayuno_produccion(fecha_inicio, hasta_exclusivo)   # KPI compuesto, ya declarado (incluye suplemento)
    unidades = fetch_ud_desayunos_produccion(fecha_inicio, hasta_exclusivo)        # KPI compuesto, ya declarado (sin suplemento)
    return {
        hotel_id: ingresos[hotel_id] / ud
        for hotel_id, ud in unidades.items()
        if ud > 0 and hotel_id in ingresos
    }
```

**⚠️ Pendiente de revalidar**: hereda el cambio de criterio del punto 4.

~~Validado contra: Hotel Sada Marina, julio 2026 → (12.156,36 + 38,18) / 1.987
= **6,14 €/unidad** (antes 6,12 € sin el suplemento).~~ — no vigente, ver
aviso arriba.

---

### Desayunos de producción, por turno y tipo de usuario — `fetch_ud_desayunos_produccion_por_turno` (auditoría interna)

**Reutiliza** la misma lista `_PRODUCTOS_DESAYUNO` y el mismo
[criterio unificado de reserva viva](#criterio-unificado-de-reserva-viva)
(`s.state NOT IN ('cancel','draft')`, `r.state NOT IN ('draft','cancel')`)
que `fetch_ud_desayunos_produccion_por_producto` — mismo universo de líneas,
solo cambia el agrupado. No es un compuesto (no puede derivarse del desglose
por producto, necesita otra dimensión de la línea: quién y cuándo la creó),
así que sí lleva su propio SQL, pero comparte constante para no duplicar la
lista de productos.

**Qué mide**: unidades de desayuno de producción, agrupadas por **quién creó
la línea de servicio** y **en qué franja horaria** — pensado como análisis
interno de canal de venta, no como KPI de cara al dashboard externo.

**Origen y limitación (importante, ver aviso completo dado al usuario)**:
- Usa `sl.create_date` (creación de la **línea** de servicio, no de la
  cabecera `pms_service`) como proxy del momento de venta — más preciso que
  `s.create_date`, pero sigue siendo "cuándo se creó el registro", no
  necesariamente "cuándo se sirvió/vendió" si hay ediciones posteriores.
- `tipo_usuario` es un patrón sobre `res_users.login`, no un catálogo
  mantenido: `@sh360` → central de reservas (CAC/CDR); `roomdoo` o
  `Wubook %` → automático (Neobookings/canales); resto → recepción del hotel.
  Si aparecen logins nuevos con otros patrones, esta clasificación necesita
  revisión manual — **no es fiable sin contraste** (así lo asumió el usuario
  explícitamente al pedir este análisis).
- Las franjas horarias (07-15h, 15-23h, 23-7h) son una convención de turnos
  habituales, no confirmadas contra el horario real de cada hotel.
- Convertido a hora de Madrid (`AT TIME ZONE 'UTC' AT TIME ZONE
  'Europe/Madrid'`) porque `create_date` se guarda en UTC.

```python
_UD_DESAYUNOS_PRODUCCION_POR_TURNO_SQL = """
    SELECT sl.pms_property_id,
           CASE
               WHEN ru.login ILIKE '%%@sh360%%' THEN 'CAC_CDR'
               WHEN ru.login ILIKE '%%roomdoo%%' OR ru.login ILIKE 'Wubook %%' THEN 'automatico'
               WHEN ru.login IS NULL THEN 'sin_usuario'
               ELSE 'recepcion_hotel'
           END AS tipo_usuario,
           CASE
               WHEN EXTRACT(HOUR FROM (sl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) >= 7
                    AND EXTRACT(HOUR FROM (sl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) < 15
                   THEN 'manana_07_15'
               WHEN EXTRACT(HOUR FROM (sl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) >= 15
                    AND EXTRACT(HOUR FROM (sl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) < 23
                   THEN 'tarde_15_23'
               ELSE 'noche_23_07'
           END AS turno,
           SUM(sl.day_qty) AS unidades,
           COUNT(DISTINCT sl.create_uid) AS n_usuarios_distintos
    FROM pms_service_line sl
    JOIN pms_service s ON s.id = sl.service_id
    JOIN pms_reservation r ON r.id = s.reservation_id
    LEFT JOIN res_users ru ON ru.id = sl.create_uid
    WHERE sl.date >= %(desde)s AND sl.date < %(hasta_exclusivo)s
      AND s.state NOT IN ('cancel', 'draft')
      AND r.state NOT IN ('draft', 'cancel')
      AND s.product_id IN %(productos_desayuno)s
    GROUP BY sl.pms_property_id, tipo_usuario, turno
"""

@cache_result
def fetch_ud_desayunos_produccion_por_turno(
    fecha_inicio: datetime.date, hasta_exclusivo: datetime.date
) -> dict[int, list[dict]]:
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _UD_DESAYUNOS_PRODUCCION_POR_TURNO_SQL,
            {"desde": fecha_inicio, "hasta_exclusivo": hasta_exclusivo, "productos_desayuno": _PRODUCTOS_DESAYUNO},
        )
        rows = cur.fetchall()
    resultado: dict[int, list[dict]] = {}
    for hotel_id, tipo_usuario, turno, unidades, n_usuarios in rows:
        resultado.setdefault(hotel_id, []).append({
            "tipo_usuario": tipo_usuario,
            "turno": turno,
            "unidades": int(unidades or 0),
            "n_usuarios_distintos": int(n_usuarios or 0),
        })
    return resultado
```

**Comprobación de integridad**: la suma de `unidades` de todo el desglose de
un hotel debe coincidir con `fetch_ud_desayunos_produccion` del mismo hotel y
rango (mismo universo de líneas, solo cambia el agrupado).

**⚠️ Pendiente de revalidar** (hereda el cambio de criterio del punto 4):

~~Validado contra: Hotel Sada Marina, julio 2026 → recepción hotel 1.135
(57%), automático 793 (40%), CAC/CDR 59 (3%); total 1.987, coincide con
`fetch_ud_desayunos_produccion` del mismo periodo.~~ — no vigente.

**Nota de confidencialidad**: este KPI clasifica por tipo de canal/usuario a
nivel agregado, no expone nombres ni identifica personas — no debe
extenderse a un desglose por empleado individual sin autorización interna
expresa (ver regla de confidencialidad de datos laborales).

---

### Unidades de desayuno — facturación — `fetch_ud_desayunos_facturacion`

**Qué mide**: unidades de desayuno facturadas, por **fecha de factura**
(`invoice_date`) — a propósito distinta de la de servicio, porque este KPI
sirve para conciliar con contabilidad (coste, precio medio), no para
desglose operativo. **No comparable día a día contra el KPI de producción**
(fechas de naturaleza distinta); solo tiene sentido comparar totales de
periodo, y aun así con holgura (ver validación).

**Criterio**:
- Cuenta contable exacta `70500000020` ("Desayunos") — código exacto, nunca
  `LIKE '705%20%'` (ese patrón también engancha `70520000000`, cuenta sin
  relación).
- Solo facturas `posted`.
- Mismos 12 `product_id` que producción.
- **Corrección obligatoria de signo en rectificativas**: Odoo guarda
  `quantity` en positivo tanto en `out_invoice` como en `out_refund` — hay
  que restar a mano las líneas de `out_refund`, o el total sale inflado (caso
  real: sin la corrección, Sada Marina julio 2026 daba 2.620 unidades en vez
  de 1.980 — un 32% de más).
- **Aviso pendiente de comprobar (punto 6)**: el `INNER JOIN pms_property p
  ON p.id = am.pms_property_id` descarta sin avisar cualquier factura sin
  hotel asignado. Antes de dar por buena la cobertura de este KPI, contar
  cuántas líneas de la cuenta `70500000020` tienen `am.pms_property_id IS
  NULL` en el rango que se vaya a usar (consulta en el apéndice de
  auditoría al final del documento).

```python
_UD_DESAYUNOS_FACTURACION_SQL = """
    SELECT p.id AS pms_property_id,
           SUM(CASE WHEN am.move_type = 'out_refund' THEN -aml.quantity ELSE aml.quantity END) AS unidades
    FROM account_move_line aml
    JOIN account_account acc ON acc.id = aml.account_id
    JOIN account_move am ON am.id = aml.move_id
    JOIN pms_property p ON p.id = am.pms_property_id
    WHERE acc.code = '70500000020'
      AND am.state = 'posted'
      AND aml.product_id IN %(productos_desayuno)s
      AND am.invoice_date >= %(desde)s AND am.invoice_date < %(hasta_exclusivo)s
    GROUP BY p.id
"""

@cache_result
def fetch_ud_desayunos_facturacion(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, int]:
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _UD_DESAYUNOS_FACTURACION_SQL,
            {"desde": fecha_inicio, "hasta_exclusivo": hasta_exclusivo, "productos_desayuno": _PRODUCTOS_DESAYUNO},
        )
        rows = cur.fetchall()
    return {r[0]: int(r[1] or 0) for r in rows}
```

Validado contra: Hotel Sada Marina, julio 2026 → producción 1.987 vs.
facturación (corregida) 1.980 — diferencia de -7, coherente con desayunos de
fin de mes aún sin facturar. Antes de la corrección de rectificativas, el
total salía en 2.620 (muy por encima de producción, señal de que algo no
cuadraba).

---

### Ingresos de desayuno — facturación — `fetch_ingresos_desayuno_facturacion`

**Qué mide**: importe neto (€) vendido en la cuenta contable `70500000020`
("Desayunos"), por hotel, para el rango de fechas — cifra de negocio real
para cuadrar contra contabilidad.

**Corregido (2026-08-26, punto 3) — por qué se abandona `price_subtotal`**:
la versión anterior de este documento afirmaba que `price_subtotal` "es lo
que cuadra contra el saldo contable de la cuenta". Es falso, por dos vías:
- `am.invoice_date` es `NULL` en los asientos manuales (`move_type =
  'entry'`), así que el filtro por rango de fechas ya los descartaba solo.
- Aunque entrasen, su `price_subtotal` vale `0`: en OCB 16 ese campo solo se
  computa a partir de `quantity × price_unit × (1−discount)` sobre líneas de
  producto de factura (`account/models/account_move_line.py:839
  _compute_totals`) — un apunte manual no lo rellena.

Es decir: `price_subtotal` no es "el saldo contable filtrado", es "el saldo
de solo una parte de los movimientos, ciega a los asientos manuales" — y
esta misma métrica ya lo demostraba sin darse cuenta, porque el KPI de
gastos (más abajo) usaba el mismo campo a `0` en asientos `entry` para
justificar excluirlos, en vez de leerlo como "esta métrica no ve una parte
real de la cuenta". **Se cambia a saldo contable** (`credit - debit`, a
prueba de signo — ya no hace falta el `CASE` de `out_refund`, que se
resolvía solo porque un abono también invierte crédito/débito), y **se
cambia el filtro de fecha de `am.invoice_date` a `aml.date`**: para un
asiento manual la única fecha útil es `aml.date` (`invoice_date` es NULL),
así que filtrar por `invoice_date` seguiría descartándolos aunque ahora sí
tuvieran importe.

**Criterio**:
- Cuenta contable exacta `70500000020` (código exacto, no `LIKE`).
- Solo apuntes `posted` (`am.state = 'posted'`) — **ya no se filtra por
  `move_type`**: al usar saldo contable, un asiento manual (`entry`) suma
  correctamente sin necesitar un `CASE` de signo por tipo de documento.
- `SUM(aml.credit - aml.debit)`: en una cuenta de ingreso el saldo vive en
  `credit`; una rectificativa (`out_refund`) ya invierte crédito/débito por
  sí sola en la contabilidad, así que no hace falta el `CASE` que restaba a
  mano — el saldo contable ya lo resuelve.
- Filtro de fecha por `aml.date` (fecha contable), no `invoice_date` (solo
  existe para facturas, no para asientos manuales).
- Sin filtro de `product_id`: la cuenta contable ya identifica el desayuno
  por sí sola.
- **Aviso pendiente de comprobar (punto 6)**: mismo aviso que en unidades de
  facturación — el `INNER JOIN pms_property` descarta sin avisar cualquier
  apunte sin hotel asignado. Contar antes de dar la cobertura por buena.

```python
_INGRESOS_DESAYUNO_FACTURACION_SQL = """
    SELECT p.id AS pms_property_id,
           SUM(aml.credit - aml.debit) AS importe
    FROM account_move_line aml
    JOIN account_account acc ON acc.id = aml.account_id
    JOIN account_move am ON am.id = aml.move_id
    JOIN pms_property p ON p.id = am.pms_property_id
    WHERE acc.code = '70500000020'
      AND am.state = 'posted'
      AND aml.date >= %(desde)s AND aml.date < %(hasta_exclusivo)s
    GROUP BY p.id
"""

@cache_result
def fetch_ingresos_desayuno_facturacion(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, float]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_INGRESOS_DESAYUNO_FACTURACION_SQL, {"desde": fecha_inicio, "hasta_exclusivo": hasta_exclusivo})
        rows = cur.fetchall()
    return {r[0]: float(r[1] or 0) for r in rows}
```

**⚠️ Pendiente de revalidar**: el cambio de `price_subtotal` a saldo
contable y de `invoice_date` a `aml.date` puede mover la cifra (para bien:
ahora sí incluye asientos manuales reales en esta cuenta, si los hay).

~~Validado contra: Hotel Sada Marina, julio 2026 → 12.086,57 € (precio medio
implícito ~6,10 €/unidad frente a las 1.980 unidades facturadas corregidas —
dentro del rango de precios de desayuno ya visto en otros hoteles).~~ — no
vigente, recalcular con la consulta corregida.

---

### Gastos de desayuno — facturación — `fetch_gastos_desayuno_facturacion`

**Qué mide**: importe neto (€) de compras (materias primas de
alimentos/bebidas) en la cuenta contable `60100000001`, por hotel, para el
rango de fechas — coste real para cruzar contra ingresos de desayuno y sacar
margen.

**Corregido (2026-08-26, punto 3)**: mismo motivo que en
`fetch_ingresos_desayuno_facturacion` — este documento ya había observado
que `price_subtotal` de los asientos `entry` "está siempre a 0 en esta
cuenta" y usaba esa observación para justificar excluirlos con
`move_type IN ('in_invoice','in_refund')`. La conclusión correcta no era
"filtrémoslos para que quede explícito", sino "esta métrica es ciega a
ellos". Se cambia a saldo contable y se deja de filtrar por `move_type`
(un asiento manual ahora suma bien, sin necesitarlo) y por `invoice_date`
(pasa a `aml.date`, la única fecha que tienen los asientos manuales).

**Criterio**: mismo patrón que `fetch_ingresos_desayuno_facturacion`, pero en
el lado de compras:
- Cuenta contable exacta `60100000001` ("Compra de materias primas dpto.
  alimentos y bebidas") — código exacto, no `LIKE`. **Ver decisión abierta
  5.4**: el dashboard real usa además `60100000002` y `60100000003` — no se
  amplía aquí todavía, queda como decisión pendiente de confirmar más abajo.
- Solo apuntes `posted`.
- `SUM(aml.debit - aml.credit)`: en una cuenta de gasto el saldo vive en
  `debit`; un abono de proveedor (`in_refund`) ya invierte débito/crédito
  por sí solo, así que no hace falta el `CASE` de signo de la versión
  anterior.
- Filtro de fecha por `aml.date`, no `invoice_date`.
- Sin filtro de `product_id`: la cuenta contable ya identifica la compra de
  alimentos/bebidas por sí sola.
- **Aviso pendiente de comprobar (punto 6)**: mismo aviso de `INNER JOIN
  pms_property` que en los KPIs anteriores — aquí es más relevante todavía,
  porque en facturas de **compra** no está garantizado que
  `pms_property_id` venga siempre relleno. Contar antes de dar la cobertura
  por buena.

```python
_GASTOS_DESAYUNO_FACTURACION_SQL = """
    SELECT p.id AS pms_property_id,
           SUM(aml.debit - aml.credit) AS importe
    FROM account_move_line aml
    JOIN account_account acc ON acc.id = aml.account_id
    JOIN account_move am ON am.id = aml.move_id
    JOIN pms_property p ON p.id = am.pms_property_id
    WHERE acc.code = '60100000001'
      AND am.state = 'posted'
      AND aml.date >= %(desde)s AND aml.date < %(hasta_exclusivo)s
    GROUP BY p.id
"""

@cache_result
def fetch_gastos_desayuno_facturacion(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, float]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_GASTOS_DESAYUNO_FACTURACION_SQL, {"desde": fecha_inicio, "hasta_exclusivo": hasta_exclusivo})
        rows = cur.fetchall()
    return {r[0]: float(r[1] or 0) for r in rows}
```

**⚠️ Pendiente de revalidar**: cambio de `price_subtotal` a saldo contable,
de `invoice_date` a `aml.date`, y ya no se excluyen asientos manuales — la
cifra puede subir si hay apuntes `entry` reales en esta cuenta.

~~Validado contra: Hotel Sada Marina, julio 2026 → 7.535,80 € (todo
`in_invoice`, sin `in_refund` en ese mes/hotel concreto — el ajuste de signo
no se ha podido contrastar todavía con un caso real de abono de proveedor en
esta cuenta para ese hotel/periodo).~~ — no vigente, recalcular con la
consulta corregida.

**Nota**: esta cuenta agrega "alimentos y bebidas" en general, no solo
desayuno — el nombre de la cuenta y su código son los que existen en el plan
contable real; si se necesita un coste específico de desayuno más fino,
habría que revisar con contabilidad si existe una subcuenta o centro de
coste más granular.

---

### Ingresos de desayuno — presupuesto — `fetch_ingresos_desayuno_presupuesto`

**Qué mide**: importe presupuestado (€) en la cuenta contable `70500000020`
("Desayunos"), por hotel y mes, para comparar contra el real (producción o
facturación).

**Origen del dato**: no viene de `account_move_line` (facturación real) sino
de `account_move_budget_line` — la tabla que respalda la pantalla "Cuenta
Movimiento Presupuestos" de Odoo (Presupuestos → Artículos Presupuestarios).
Cada línea ya es mensual y por hotel; no hay que agrupar por día.

**Retractado (2026-08-26, misma revisión — el "corregido" de más abajo
resultó ser falso)**: el punto 2 de la revisión de este mismo día afirmaba
que el módulo `pms_account_move_budget` estaba instalado y añadía
`account.move.budget.line.pms_property_id` directo. **Verificado contra la
base de producción real** (no solo contra el código fuente disponible):

```
ir_module_module: ('pms_account_move_budget', 'uninstalled')   -- NO instalado
ir_model_fields:  0 filas para (name='pms_property_id', model='account.move.budget.line')
information_schema.columns: la tabla account_move_budget_line no tiene
  columna pms_property_id (solo hotel_analytic_account_id y
  project_analytic_account_id)
```

El módulo existe en el código fuente disponible (`odoo/auto/addons`) pero
**no está activado en esta instancia** — de ahí la confusión: comprobar
"existe el módulo" no es lo mismo que comprobar "está instalado". El único
`pms_property_id` real en el esquema está en `pms_budget` (tabla distinta,
la del KPI `fetch_rn_presupuesto`), no en `account_move_budget_line`.

**Se revierte al criterio original** (el que ya usa
`backend/core/hoteles/repository.py` sin cambios): unir por
`hotel_analytic_account_id = pms_property.analytic_account_id`. No es un
bug — es el único camino disponible con el esquema real. Los dos fallos
silenciosos descritos en la versión retractada (propiedad sin cuenta
analítica pierde su presupuesto; dos propiedades que comparten analítica
duplican el total) siguen siendo un riesgo teórico real del JOIN por
analítica, pero no se puede evitar sin instalar el módulo — **queda anotado
como mejora futura condicionada a esa instalación, no como algo a corregir
ahora en el código**.

**Criterio**:
- Cuenta contable exacta `70500000020` (código exacto, no `LIKE`).
- El hotel se identifica vía `hotel_analytic_account_id = pms_property
  .analytic_account_id` (no hay alternativa directa en el esquema actual).
- **Solo presupuestos `confirmed`** (`account_move_budget.state`) — se
  excluyen `draft` y `cancelled`. Importante: esto puede dejar sin dato
  periodos recientes si el presupuesto de ese hotel/mes concreto todavía no
  se ha confirmado (verificado en Sada Marina: julio 2026 solo tiene una
  versión `draft`, por lo que con este criterio ese mes no aparece en el
  resultado — no es un `0`, es ausencia de presupuesto confirmado).
- Cuentas de ingreso se guardan en `credit` (con `balance` negativo) — se usa
  `credit` directamente para que el importe salga en positivo.
- Sin filtro de `product_id`: la cuenta ya identifica el desayuno, igual que
  en `fetch_ingresos_desayuno_facturacion`.

```python
_INGRESOS_DESAYUNO_PRESUPUESTO_SQL = """
    SELECT p.id,
           SUM(l.credit) AS importe
    FROM account_move_budget_line l
    JOIN account_move_budget b ON b.id = l.budget_id
    JOIN account_account acc ON acc.id = l.account_id
    JOIN pms_property p ON p.analytic_account_id = l.hotel_analytic_account_id
    WHERE acc.code = '70500000020'
      AND b.state = 'confirmed'
      AND l.date >= %(desde)s AND l.date < %(hasta_exclusivo)s
    GROUP BY p.id
"""

@cache_result
def fetch_ingresos_desayuno_presupuesto(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, float]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_INGRESOS_DESAYUNO_PRESUPUESTO_SQL, {"desde": fecha_inicio, "hasta_exclusivo": hasta_exclusivo})
        rows = cur.fetchall()
    return {r[0]: float(r[1] or 0) for r in rows}
```

**Revalidado 2026-08-26** (re-ejecutada la consulta contra producción, join
por cuenta analítica, acotada a los 3 hoteles de referencia): Hotel Sada
Marina, octubre 2026 → **6.742,41 €** presupuestados de ingresos — coincide
exactamente con la cifra ya validada el 2026-08-25, confirmando que el
criterio original (nunca cambiado en `repository.py`) es correcto. Cifra
vigente de nuevo, ya no "pendiente de revalidar".

---

### Gastos de desayuno — presupuesto — `fetch_gastos_desayuno_presupuesto`

**Qué mide**: importe presupuestado (€) en la cuenta contable `60100000001`
(compra de materias primas alimentos/bebidas), por hotel y mes.

**Retractado (2026-08-26, misma revisión)**: igual que en
`fetch_ingresos_desayuno_presupuesto` — el módulo `pms_account_move_budget`
está desinstalado en producción (verificado, ver esa sección para la
evidencia completa), así que `pms_property_id` no existe en
`account_move_budget_line`. Se revierte al criterio original por cuenta
analítica, que es el que ya usa `repository.py` sin cambios.

**Criterio**: mismo patrón que `fetch_ingresos_desayuno_presupuesto`, pero:
- Cuenta contable exacta `60100000001`. **Ver decisión abierta 5.4** (mismo
  tema que en `fetch_gastos_desayuno_facturacion`): no se amplía aquí a
  `60100000002`/`60100000003` todavía.
- El hotel se identifica vía `hotel_analytic_account_id = pms_property
  .analytic_account_id`.
- Cuentas de gasto se guardan en `debit` (con `balance` positivo) — se usa
  `debit` directamente.
- Igual que en ingresos: **solo `confirmed`**, excluidos `draft` y
  `cancelled`.

```python
_GASTOS_DESAYUNO_PRESUPUESTO_SQL = """
    SELECT p.id,
           SUM(l.debit) AS importe
    FROM account_move_budget_line l
    JOIN account_move_budget b ON b.id = l.budget_id
    JOIN account_account acc ON acc.id = l.account_id
    JOIN pms_property p ON p.analytic_account_id = l.hotel_analytic_account_id
    WHERE acc.code = '60100000001'
      AND b.state = 'confirmed'
      AND l.date >= %(desde)s AND l.date < %(hasta_exclusivo)s
    GROUP BY p.id
"""

@cache_result
def fetch_gastos_desayuno_presupuesto(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, float]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_GASTOS_DESAYUNO_PRESUPUESTO_SQL, {"desde": fecha_inicio, "hasta_exclusivo": hasta_exclusivo})
        rows = cur.fetchall()
    return {r[0]: float(r[1] or 0) for r in rows}
```

**Revalidado 2026-08-26** (re-ejecutada contra producción, join por cuenta
analítica, acotada a los 3 hoteles de referencia): Hotel Sada Marina,
octubre 2026 → **3.364,46 €** presupuestados de gasto — coincide
exactamente con la cifra ya validada el 2026-08-25. Cifra vigente de nuevo.

**Aviso de cobertura de datos**: filtrar solo `confirmed` reduce todavía más
la cobertura real. Verificado en Sada Marina: con `confirmed` el gasto solo
existe de octubre 2026 en adelante, y los ingresos tienen un hueco completo
entre septiembre 2024 y septiembre 2026 (nada confirmado en ese rango, solo
`draft`). Un hotel/periodo sin presupuesto confirmado simplemente no aparece
en el resultado (no sale con `0`) — comprobar esto antes de calcular
cualquier desviación o margen presupuestado, para no confundir "sin dato
confirmado" con "presupuesto cero".

---

## KPIs compuestos

Nunca reimplementan el SQL de un KPI base: llaman a su función y combinan el
resultado en código.

### Ratio de penetración de desayuno — `calcular_ratio_penetracion`

**Depende de**: `fetch_alojados_reservas`,
`fetch_ud_desayunos_produccion_directa`.

**Qué mide**: nº de desayunos vendidos (venta directa, sin colaborador) por
cada persona alojada (declarada).

**Decisión 5.6 — colaborador en la penetración — CERRADA (2026-08-26)**:
antes quedaba pendiente y sugería crear una variante sin colaborador "si
hiciera falta". Con la lista por `product_id` ya construida
(`_PRODUCTOS_DESAYUNO_COLABORADOR`), es trivial cerrarla ahora: el numerador
pasa a ser `fetch_ud_desayunos_produccion_directa` (excluye colaborador) en
vez de `fetch_ud_desayunos_produccion` (lo incluye). Motivo: replica el
criterio ya validado del dashboard real (`paneles-gestionalda`, régimen
`DESCOL`/`DESNEGCOL`/`DESGRUPCOL` fuera del numerador de penetración, dentro
de producción y precio medio) en vez de divergir de él — una venta a
colaborador puede no corresponder a ningún huésped contado en "alojados", y
mezclarla dispara la penetración por encima del 100% de forma artificial que
no refleja consumo real de huéspedes.

**Criterio**:
- Un hotel sin ninguna venta de desayuno debe salir con ratio `0`, no
  desaparecer del resultado (`.get(hotel_id, 0)`, no filtrar).
- Denominador: `alojados_reservas` por defecto (robusto en todos los
  hoteles, no depende de que el check-in esté bien registrado). **Ver
  decisión abierta 5.5** (`children` vs. `children_occupying`).
- Numerador: **venta directa** (sin colaborador) — ver decisión 5.6 cerrada
  arriba.
- El ratio puede superar el 100% de forma legítima incluso en venta directa
  (más de un desayuno por persona en el rango, grupos con desayuno no
  vinculado 1:1) — no tratarlo como error automático, pero un valor muy por
  encima de 100% sigue siendo señal de revisar el hotel/periodo concreto.

```python
def calcular_ratio_penetracion(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, float | None]:
    alojados = fetch_alojados_reservas(fecha_inicio, hasta_exclusivo)                 # KPI base, ya declarado
    desayunos = fetch_ud_desayunos_produccion_directa(fecha_inicio, hasta_exclusivo)  # KPI compuesto, ya declarado (sin colaborador)

    return {
        hotel_id: (desayunos.get(hotel_id, 0) / pax) if pax > 0 else None
        for hotel_id, pax in alojados.items()
    }
```

**⚠️ Pendiente de validar con datos reales** (ejecutar contra un hotel y
rango de fechas concreto antes de darlo por definitivo — depende de dos
KPIs base que a su vez quedan pendientes de revalidar por el punto 4, así
que no tiene sentido validar este hasta tener esos dos firmes).

---

### Coste medio por desayuno — facturación — `calcular_coste_medio_desayuno`

**Depende de**: `fetch_gastos_desayuno_facturacion`,
`fetch_ud_desayunos_facturacion`.

**Qué mide**: coste medio (€) por unidad de desayuno, en base a facturación
(no producción) — gasto de la cuenta `60100000001` entre unidades facturadas
de la cuenta `70500000020`. Ambos KPIs base ya usan **fecha de factura**
(`invoice_date`), así que el periodo es homogéneo entre numerador y
denominador (a diferencia de mezclar un dato de producción con uno de
facturación).

**Criterio**:
- Un hotel sin unidades facturadas en el periodo debe salir con coste medio
  `None` (división por cero), no un error ni un 0 engañoso.
- No confundir con el precio medio de venta (`fetch_precio_medio_desayuno_produccion`,
  que es ingreso/unidad de producción) — este es coste/unidad de
  facturación, magnitudes distintas que solo tiene sentido comparar entre sí
  para ver margen bruto por unidad.

```python
def calcular_coste_medio_desayuno(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, float | None]:
    gastos = fetch_gastos_desayuno_facturacion(fecha_inicio, hasta_exclusivo)   # KPI base, ya declarado
    unidades = fetch_ud_desayunos_facturacion(fecha_inicio, hasta_exclusivo)    # KPI base, ya declarado

    return {
        hotel_id: (gastos.get(hotel_id, 0) / ud) if ud > 0 else None
        for hotel_id, ud in unidades.items()
    }
```

**⚠️ Pendiente de revalidar**: hereda el cambio de `fetch_gastos_desayuno_facturacion`
(punto 3).

~~Validado contra: Hotel Sada Marina, julio 2026 → gastos 7.535,80 € / 1.980
unidades = **3,81 €/desayuno**. Frente al ingreso medio implícito de ~6,10
€/unidad, sale un margen bruto de ~2,29 € (~37,5%) — orden de magnitud
razonable, aunque probablemente **sobreestimado**: la cuenta de gasto es
"alimentos y bebidas" en general (no exclusiva de desayuno), así que si el
hotel también carga aquí otras comidas, el coste real por desayuno sería
menor al calculado aquí.~~ — no vigente, recalcular. Además, el "ingreso
medio implícito ~6,10 €/unidad" de referencia mezclaba una cuenta sin filtro
de producto con un recuento que sí filtra — ver decisión abierta 5.3.

---

### Margen bruto de desayuno — facturación — `calcular_margen_bruto_desayuno`

**Depende de**: `fetch_ingresos_desayuno_facturacion`,
`fetch_gastos_desayuno_facturacion`.

**Qué mide**: margen bruto (%) de desayuno en base a facturación —
`(ingresos - gastos) / ingresos * 100`. Ambos KPIs base ya usan fecha de
factura, periodo homogéneo entre los dos términos.

**Criterio**:
- Un hotel sin ingresos en el periodo debe salir con margen `None`
  (división por cero), no error ni 0 engañoso.
- Hereda la misma salvedad que `fetch_gastos_desayuno_facturacion`: la cuenta
  de gasto (`60100000001`) no es exclusiva de desayuno, así que este margen
  puede estar infravalorado si el hotel carga ahí otras compras de
  alimentos/bebidas no ligadas al desayuno.

```python
def calcular_margen_bruto_desayuno(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, float | None]:
    ingresos = fetch_ingresos_desayuno_facturacion(fecha_inicio, hasta_exclusivo)   # KPI base, ya declarado
    gastos = fetch_gastos_desayuno_facturacion(fecha_inicio, hasta_exclusivo)       # KPI base, ya declarado

    return {
        hotel_id: ((ingreso - gastos.get(hotel_id, 0)) / ingreso * 100) if ingreso > 0 else None
        for hotel_id, ingreso in ingresos.items()
    }
```

**⚠️ Pendiente de revalidar**: hereda el cambio de sus dos KPIs base
(punto 3).

~~Validado contra: Hotel Sada Marina, julio 2026 → (12.086,57 − 7.535,80) /
12.086,57 × 100 = **37,65 %**.~~ — no vigente, recalcular.

---

### Resultado de desayunos — facturación — `calcular_resultado_desayunos_facturacion`

**Depende de**: `fetch_ingresos_desayuno_facturacion`,
`fetch_gastos_desayuno_facturacion`. Mismos dos KPIs base que
`calcular_margen_bruto_desayuno` — no vuelve a declarar el SQL, solo cambia
la combinación (resta en € en vez de porcentaje).

**Qué mide**: resultado F&B en € (ingresos − gastos) en base a facturación,
por hotel y rango de fechas. A diferencia del margen bruto (%), esta es la
cifra absoluta de negocio, útil para sumar entre hoteles o comparar
magnitudes, no solo rentabilidad relativa.

**Criterio**:
- Si un hotel solo tiene gastos y ningún ingreso en el periodo (o viceversa),
  se calcula igual usando `0` como valor por defecto del lado que falte —
  no se descarta el hotel (a diferencia del margen bruto, aquí no hay
  división, así que no hace falta devolver `None`).
- Hereda la misma salvedad que `fetch_gastos_desayuno_facturacion`: la cuenta
  de gasto (`60100000001`) no es exclusiva de desayuno, así que este
  resultado puede estar infravalorado si el hotel carga ahí otras compras de
  alimentos/bebidas no ligadas al desayuno.

```python
def calcular_resultado_desayunos_facturacion(fecha_inicio: datetime.date, hasta_exclusivo: datetime.date) -> dict[int, float]:
    ingresos = fetch_ingresos_desayuno_facturacion(fecha_inicio, hasta_exclusivo)   # KPI base, ya declarado
    gastos = fetch_gastos_desayuno_facturacion(fecha_inicio, hasta_exclusivo)       # KPI base, ya declarado

    hoteles = set(ingresos) | set(gastos)
    return {
        hotel_id: ingresos.get(hotel_id, 0) - gastos.get(hotel_id, 0)
        for hotel_id in hoteles
    }
```

**⚠️ Pendiente de revalidar**: hereda el cambio de sus dos KPIs base
(punto 3).

~~Validado contra: Hotel Sada Marina, julio 2026 → 12.086,57 − 7.535,80 =
**4.550,77 €**.~~ — no vigente, recalcular.

---

## Decisiones pendientes de confirmar

Ninguna de estas se da por cerrada en esta revisión (salvo 5.6, cerrada más
arriba en `calcular_ratio_penetracion`) — cada una propone una opción con su
razón, a validar por quien tenga el criterio de negocio final.

### 5.2 — Presupuesto con rango parcial = 0 silencioso

`pms_budget` y `account_move_budget_line` guardan la fecha como el día 1 del
mes. Con `>= desde AND < hasta_exclusivo`, un rango que no empiece en día 1
(p. ej. "del 5 al 20 de julio") devuelve **cero** presupuesto, no una parte
proporcional — parece "sin presupuesto" cuando en realidad es un problema de
alineación de fechas. (El dashboard actual en producción tiene el error
contrario: devuelve el mes entero para un rango de tres días.)

**Propuesta**: restringir los KPIs de presupuesto (`fetch_rn_presupuesto`,
`fetch_ingresos_desayuno_presupuesto`, `fetch_gastos_desayuno_presupuesto`) a
meses naturales, y que devuelvan `None` con un motivo explícito
(`"rango_no_es_mes_natural"`) si el rango pedido no lo es, en vez de un `0`
o un prorrateo. Razón: prorratear por días asume que el presupuesto se
consume uniformemente dentro del mes, una asunción no verificada y que
además complicaría comparar contra el gasto/ingreso real (que sí varía
día a día). **No implementado todavía en el código de este documento** —
pendiente de confirmar antes de tocar las tres funciones.

### 5.3 — Perímetros mezclados en el precio medio de facturación

`fetch_ingresos_desayuno_facturacion` **no** filtra por producto (toda la
cuenta `70500000020`); `fetch_ud_desayunos_facturacion` **sí** filtra (los
12 `product_id`). Cualquier "precio medio implícito" que divida el primero
entre el segundo (como se hacía en las notas de validación de este
documento) mezcla dos perímetros distintos: si en la cuenta hay líneas de
productos fuera de la lista — el propio `10264`, que se excluye de unidades
a propósito — el precio medio sale inflado.

**Propuesta**: no calcular ese precio medio implícito como KPI mientras los
perímetros no se unifiquen. Dos caminos, ninguno aplicado todavía:
(a) añadir el filtro de los 12 `product_id` también a
`fetch_ingresos_desayuno_facturacion` (unifica perímetro, pero pierde la
ventaja de "la cuenta contable ya identifica el desayuno por sí sola" que
justificaba no filtrar); o (b) medir el hueco con la consulta del apéndice
de auditoría (unidades e importe en la `705` con `product_id` fuera de la
lista) y decidir con datos si el hueco es material. Cada decisión (filtrar
o no filtrar `fetch_ingresos_desayuno_facturacion`) está bien justificada
por separado — el problema es combinarlas sin darse cuenta.

### 5.4 — Cuentas de gasto (60100000001 vs. + 002; 60100000003 no existe)

Este documento usa solo `60100000001`. El código real de
`paneles-gestionalda` (`backend/core/hoteles/repository.py`,
`_CUENTAS_GASTO_DESAYUNO`) declara **tres** códigos: `60100000001`,
`60100000002` y `60100000003` — pero de esos tres, solo los dos primeros
existen de verdad en el plan contable (ver retractación más abajo). El
mismo hotel y mes darían dos cifras distintas de "gastos de desayuno" en
dos pantallas del mismo producto si esto no se unifica.

**Retractado (2026-08-26) — resuelta la pregunta E del apéndice de
auditoría**: la entrada anterior afirmaba, sin ejecutar la consulta, que
"la afirmación de que 60100000003 no existe no se sostiene". Era un error
de razonamiento (indicación, no evidencia): que el código *consulte* un
código de cuenta no implica que esa cuenta *exista* — un `JOIN`/`ANY` sobre
un código que no aparece en `account_account` simplemente no aporta filas,
sin error. **Verificado ahora contra `account_account` directamente, las
10 compañías del grupo**: `60100000001` existe en 8 de las 10, `60100000002`
en 6 de las 10, `60100000003` en **ninguna** — 0 filas. La afirmación
original ("aún no existe en el plan contable") era correcta.

**Consecuencia práctica**: `_CUENTAS_GASTO_DESAYUNO` en `repository.py`
incluye un código de cuenta fantasma que nunca aporta nada a ningún
resultado — no es un bug de cifras (no infla ni desinfla nada, el `JOIN` lo
descarta solo), pero sí conviene que quien lo mantenga sepa que hoy
`_CUENTAS_GASTO_DESAYUNO` es, en la práctica, `60100000001` +
`60100000002`.

**Propuesta, ajustada**: unificar a las **dos** cuentas que existen de
verdad (`60100000001`, `60100000002`) en `fetch_gastos_desayuno_facturacion`
y `fetch_gastos_desayuno_presupuesto`, para igualar el criterio ya en
producción. Sigue pendiente confirmar con contabilidad qué cubre cada una
de las dos antes de sumarlas sin más (podrían no ser todas "materia prima
F&B de desayuno" en sentido estricto) — **no aplicado todavía**.

### 5.5 — `adults + children` vs. `adults + children_occupying`

Este documento usa `children` (total de niños, ocupen plaza o no) en
`fetch_alojados_reservas`; el dashboard real usa `children_occupying` (solo
los que cuentan para ocupación). Como `children ⊇ children_occupying`, la
penetración de este documento saldrá sistemáticamente **más baja** que la
del dashboard real para el mismo hotel y mes.

**Propuesta**: cambiar a `children_occupying`, igualando el criterio ya
validado del dashboard real. Razón: para desayuno, "personas presentes que
ocupan plaza" es probablemente la definición operativa correcta (un bebé en
cuna que no ocupa plaza tampoco suele generar una unidad de desayuno
propia), y mantiene consistencia con la otra fuente de "Alojados" que ya
existe en producción. **No aplicado todavía** — los objetivos operativos
(55% / 85% de penetración, si existen como referencia) están calibrados
sobre una definición concreta que hay que confirmar antes de cambiar el
denominador, porque cambiar solo el código sin avisar movería esos
objetivos sin que nadie lo decidiera.

---

## Apéndice de auditoría — consultas de solo lectura pendientes

Todas van contra la base de **producción**, sin `statement_timeout` en el
rol de lectura — acotar por hotel y rango de fechas corto al probarlas, y no
lanzar varias a la vez. Ninguna de estas escribe nada; son para cerrar lo
que no se puede saber solo leyendo el código (magnitudes, cobertura de
datos), antes de dar cifras del documento por definitivas.

**A. Retirada (2026-08-26)** — la pregunta original ("¿cuántas líneas de
`account_move_budget_line` no tienen `pms_property_id` relleno?") ya no
aplica: verificado que esa columna no existe en producción (el módulo
`pms_account_move_budget` está `uninstalled`, ver corrección del punto 2 en
`fetch_ingresos_desayuno_presupuesto`). Se retoma si algún día se instala
ese módulo.

**B. Duplicados en `pms_budget`** (punto 6 — sin estado ni restricción de
unicidad por hotel/mes)
```sql
SELECT pms_property_id, year, month, count(*) AS num_filas
FROM pms_budget
GROUP BY pms_property_id, year, month
HAVING count(*) > 1
ORDER BY num_filas DESC
LIMIT 100;
```

**C. Facturas/asientos sin hotel asignado en las cuentas de desayuno**
(punto 6 — el `INNER JOIN pms_property` de los KPIs de facturación los
descarta sin avisar)
```sql
SELECT am.move_type, count(*) AS lineas, sum(aml.credit - aml.debit) AS importe
FROM account_move_line aml
JOIN account_account acc ON acc.id = aml.account_id
JOIN account_move am ON am.id = aml.move_id
WHERE acc.code IN ('70500000020', '60100000001', '60100000002', '60100000003')
  AND am.state = 'posted'
  AND am.pms_property_id IS NULL
GROUP BY am.move_type;
```

**D. Hueco de perímetro en el precio medio de facturación** (decisión 5.3 —
unidades e importe en la cuenta `705` con `product_id` fuera de la lista de
12)
```sql
SELECT count(DISTINCT aml.product_id) AS productos_distintos,
       sum(aml.quantity) AS unidades,
       sum(aml.credit - aml.debit) AS importe
FROM account_move_line aml
JOIN account_account acc ON acc.id = aml.account_id
JOIN account_move am ON am.id = aml.move_id
WHERE acc.code = '70500000020'
  AND am.state = 'posted'
  AND (aml.product_id IS NULL
       OR aml.product_id NOT IN (11, 10794, 198, 327, 328, 3978, 10795, 10810, 10811, 10812, 10813, 10815, 10264));
```

**E. Resuelta (2026-08-26)** — ¿existe realmente la cuenta `60100000003`?
No: `SELECT code, company_id, count(*) FROM account_account WHERE code LIKE
'601000000%' GROUP BY code, company_id` sobre las 10 compañías del grupo da
`60100000001` en 8, `60100000002` en 6, `60100000003` en **0**. (Nota:
`name` en `account_account` es `varchar` normal en esta instancia, no
`jsonb` — la consulta original de este apéndice con `name->>'es_ES'`
fallaría con `operator does not exist`.)

**F. Magnitud del asiento manual en las cuentas de desayuno** (punto 3 —
comprobar si `move_type = 'entry'` tiene volumen real en estas cuentas antes
de asumir que el cambio a saldo contable mueve algo)
```sql
SELECT count(*) AS lineas, sum(aml.credit - aml.debit) AS importe
FROM account_move_line aml
JOIN account_account acc ON acc.id = aml.account_id
JOIN account_move am ON am.id = aml.move_id
WHERE acc.code IN ('70500000020', '60100000001', '60100000002', '60100000003')
  AND am.state = 'posted'
  AND am.move_type = 'entry';
```

**G. Delta `children` vs. `children_occupying`** (decisión 5.5 — magnitud
real del sesgo antes de decidir)
```sql
SELECT sum(COALESCE(children, 0)) AS total_children,
       sum(COALESCE(children_occupying, 0)) AS total_children_occupying,
       sum(COALESCE(children, 0)) - sum(COALESCE(children_occupying, 0)) AS delta
FROM pms_reservation
WHERE state NOT IN ('draft', 'cancel')
  AND create_date >= now() - interval '90 days';
```

---

## Historial de cambios

- 2026-08-25: creado el documento. Registrados `alojados_reservas`, `rn`,
  `ud_desayunos_produccion`, `ud_desayunos_facturacion` (KPIs base, con su
  implementación en Python) y `ratio_penetracion` (KPI compuesto, pendiente
  de decidir tratamiento de colaborador y de validar con datos reales).
- 2026-08-25: reestructurado el documento — antes cada KPI aparecía dos veces
  (bloque SQL suelto + función Python repitiendo la misma consulta). Ahora
  cada KPI tiene una sola explicación y un único bloque de código.
- 2026-08-25: añadido `fetch_ingresos_desayuno_facturacion` (KPI base,
  importe neto cuenta 70500000020, validado en Sada Marina julio 2026:
  12.086,57 €). Reestructurada la familia de desayunos de producción: el
  desglose por producto (`fetch_ud_desayunos_produccion_por_producto`) pasa a
  ser el KPI base real; el total por hotel (`fetch_ud_desayunos_produccion`)
  y el nuevo precio medio (`fetch_precio_medio_desayuno_produccion`) quedan
  como compuestos derivados de él, sin SQL propia. Corregido además el precio
  medio para usar `price_day_subtotal` (neto, con descuento aplicado) en vez
  de `price_unit` (precio de lista, sin descontar) — verificado con datos
  reales que `price_unit` sin corregir infla el precio en productos con
  descuento.
- 2026-08-25: añadido `fetch_ud_desayunos_produccion_por_turno` (auditoría
  interna, no compuesto: reutiliza `_PRODUCTOS_DESAYUNO` pero necesita SQL
  propia por agrupar por `tipo_usuario`/`turno` en vez de por producto).
  Clasifica por patrón de login (`@sh360` → CAC/CDR, `roomdoo`/`Wubook %` →
  automático, resto → recepción hotel) y franja horaria de
  `sl.create_date` convertida a hora de Madrid. Validado en Sada Marina julio
  2026 (1.987 unidades, cuadra con el total de producción). Marcado como no
  fiable sin contraste y sujeto a la regla de confidencialidad de datos
  laborales — no extender a nivel de empleado individual sin autorización.
- 2026-08-25: añadido `fetch_gastos_desayuno_facturacion` (KPI base, cuenta
  contable `60100000001`, compras de alimentos/bebidas). Mismo patrón que
  ingresos pero en compras: `in_invoice` como documento normal, `in_refund`
  (abono de proveedor) restado por el mismo motivo de signo positivo en
  Odoo. Validado en Sada Marina julio 2026: 7.535,80 € (sin `in_refund` en
  ese caso concreto, ajuste de signo no contrastado aún con un ejemplo real).
- 2026-08-25: añadido `calcular_coste_medio_desayuno` (KPI compuesto, sin SQL
  propia: `fetch_gastos_desayuno_facturacion` / `fetch_ud_desayunos_facturacion`,
  ambos ya en fecha de factura). Validado en Sada Marina julio 2026: 3,81
  €/desayuno (margen bruto ~2,29 € frente al ingreso medio ~6,10 €/unidad),
  con la salvedad de que la cuenta de gasto no es exclusiva de desayuno.
- 2026-08-25: añadido `calcular_margen_bruto_desayuno` (KPI compuesto, sin
  SQL propia: `(ingresos - gastos) / ingresos * 100` a partir de
  `fetch_ingresos_desayuno_facturacion` y `fetch_gastos_desayuno_facturacion`).
  Validado en Sada Marina julio 2026: 37,65 %.
- 2026-08-25: añadido `importe` (SUM de `price_day_subtotal`) al desglose
  base `fetch_ud_desayunos_produccion_por_producto`, y con él el nuevo KPI
  compuesto `fetch_ingresos_desayuno_produccion` (sin SQL propia). Validado
  en Sada Marina julio 2026: 12.156,36 € (producción) vs. 12.086,57 €
  (facturación).
- 2026-08-25: detectada y corregida la exclusión del producto `10264`
  (Suplemento Desayuno Grupos) de `fetch_ingresos_desayuno_produccion` — no
  es una unidad de desayuno (nunca cuenta en KPIs de unidades), pero sí es un
  importe real que debe sumarse a los ingresos. Añadido KPI base
  `fetch_importe_suplemento_desayuno_produccion` (lista propia
  `_PRODUCTOS_SUPLEMENTO_DESAYUNO`) y sumado dentro de
  `fetch_ingresos_desayuno_produccion` sin tocar el desglose por producto.
  Detectado al reconciliar contra un export de Odoo (13.415,08 €) que
  filtraba por nombre "desayuno" y sí colaba este producto: diferencia
  exacta de 42,00 € con IVA (38,18 € neto). Total corregido en Sada Marina
  julio 2026: 12.194,54 € (producción) vs. 12.086,57 € (facturación).
- 2026-08-25: añadido `calcular_resultado_desayunos_facturacion` (KPI compuesto, sin
  SQL propia: `ingresos - gastos` en €, mismos dos KPIs base que
  `calcular_margen_bruto_desayuno`). Validado en Sada Marina julio 2026:
  4.550,77 €.
- 2026-08-25: añadidos `fetch_ingresos_desayuno_presupuesto` y
  `fetch_gastos_desayuno_presupuesto` (KPIs base, mismas cuentas
  `70500000020`/`60100000001` pero sobre `account_move_budget_line` —
  presupuestos, no reales). El hotel se identifica vía
  `hotel_analytic_account_id` = `pms_property.analytic_account_id` (no hay
  `pms_property_id` directo en esa tabla). Filtrado a **solo `confirmed`**
  (excluidos `draft` y `cancelled`), por indicación expresa del usuario.
  Validado en Sada Marina octubre 2026 (única ventana con dato confirmado en
  ambas cuentas a la vez): ingresos 6.742,41 €, gastos 3.364,46 €. Detectada
  cobertura incompleta con este filtro: en Sada Marina no hay ingresos
  confirmados entre septiembre 2024 y septiembre 2026 (solo `draft` en ese
  hueco), y el gasto confirmado solo existe desde octubre 2026 — un
  hotel/periodo sin presupuesto confirmado no sale con `0`, simplemente no
  aparece.
- 2026-08-25: añadido `fetch_rn_presupuesto` (KPI base, tabla `pms_budget` —
  fuente distinta al presupuesto contable de desayuno, con `pms_property_id`
  directo y `month`/`year` en texto, convertidos con `TO_DATE` para filtrar
  por rango de fechas). Sin filtro de estado (la tabla no tiene versiones
  draft/confirmed). Validado en Sada Marina julio 2026: 2.666 RN
  presupuestadas vs. 2.683 reales (`fetch_rn`), diferencia de +17 (~0,6%).
  Quedan sin declarar `room_revenue` y `estancias` de la misma tabla, a
  añadir con el mismo patrón si se piden.
- 2026-08-25: corregido `fetch_precio_medio_desayuno_produccion` para
  incluir el suplemento de grupos en el numerador (antes solo ponderaba el
  desglose por producto, que excluye el suplemento a propósito). Ahora
  depende de `fetch_ingresos_desayuno_produccion` /
  `fetch_ud_desayunos_produccion` (división directa) en vez de recalcular la
  ponderación por producto, y se reordenó su sección para que aparezca
  después de `fetch_ingresos_desayuno_produccion`, de la que ahora depende.
  Validado en Sada Marina julio 2026: 6,14 €/unidad (antes 6,12 € sin el
  suplemento).
- 2026-08-25: corregidos `fetch_alojados_reservas` y `fetch_rn` para excluir
  reservas `staff` (`reservation_type = 'normal'`, antes
  `IN ('normal', 'staff')`), alineado con el criterio verificado del
  dashboard real (`paneles-gestionalda`). Sin cambio en las cifras validadas
  de Sada Marina julio 2026 (0 reservas `staff` en esa muestra).
- 2026-08-26: revisión contra el código fuente de OCA/pms 16.0 y OCB 16.0
  desplegados en Alda. Corregidos tres errores de hecho (puntos 1-3),
  unificado el criterio de "reserva viva" en los tres KPIs que se comparan
  entre sí (punto 4), documentadas seis decisiones abiertas con una
  propuesta cada una (sección "Decisiones pendientes de confirmar" —
  ninguna cerrada salvo la 5.6), aplicados los menores del punto 6, y
  añadido un apéndice de consultas de solo lectura pendientes de ejecutar
  contra producción. Detalle:
  - **Punto 1**: corregida la justificación de `rl.state` en `fetch_rn` —
    no es un estado por noche, es un `related` a `reservation_id.state`.
    La consulta se reescribe para filtrar directamente sobre `r.state`
    (mismo resultado, comentario honesto). Cifra de RN de Sada Marina
    (2.683) confirmada como vigente, sin cambio.
  - **Punto 2 (retractado más abajo, mismo día)**: se afirmó que
    `account_move_budget_line` tiene `pms_property_id` directo (módulo
    `pms_account_move_budget` instalado) y se corrigieron
    `fetch_ingresos_desayuno_presupuesto`/`fetch_gastos_desayuno_presupuesto`
    para unir por ese campo. **Verificado después contra producción que el
    módulo está `uninstalled`** — ver la entrada de más abajo, que revierte
    este punto.
  - **Punto 3**: `price_subtotal` no cuadra con el saldo contable (los
    asientos manuales tienen `invoice_date` NULL y `price_subtotal = 0`).
    Cambiados `fetch_ingresos_desayuno_facturacion` y
    `fetch_gastos_desayuno_facturacion` a saldo contable
    (`credit - debit` / `debit - credit`), eliminado el `CASE` de
    `out_refund`/`in_refund` (innecesario con saldo) y cambiado el filtro
    de fecha de `invoice_date` a `aml.date`. Cifras de Sada Marina julio
    2026 (ingresos 12.086,57 €, gastos 7.535,80 €, y todos sus compuestos:
    margen bruto, resultado, coste medio) marcadas pendientes de revalidar.
  - **Punto 4**: criterio único de reserva viva
    (`r.state NOT IN ('draft','cancel')` + folio no cancelado/borrador para
    los KPIs que pasan por `pms_service`), documentado una sola vez en la
    cabecera. Cambia el resultado de `fetch_alojados_reservas` (antes
    incluía `draft`) y de la familia de desayunos de producción (mismo
    motivo) — cifras correspondientes marcadas pendientes de revalidar.
    `fetch_rn` no cambia numéricamente (el filtro anterior ya era
    equivalente). Añadido aviso: `fetch_alojados_reservas` seguirá sin
    coincidir con el "Alojados" que ya muestra el dashboard real (que usa
    `adults + children_occupying`, ver decisión 5.5) — evitar mostrar
    ambos con el mismo nombre.
  - **Punto 5.6, cerrada**: la penetración excluye ahora colaborador del
    numerador. Añadidos `_PRODUCTOS_DESAYUNO_COLABORADOR` (5 `product_id`
    verificados) y el KPI compuesto `fetch_ud_desayunos_produccion_directa`;
    `calcular_ratio_penetracion` pasa a depender de él en vez de
    `fetch_ud_desayunos_produccion`.
  - **Puntos 5.1-5.5, documentadas como pendientes de confirmar**, cada una
    con una propuesta: 5.1 renombrar el parámetro a `hasta_exclusivo` en
    todas las firmas (hecho ya en el código de este documento) y dejar la
    conversión inclusivo→exclusivo en la vista de Django; 5.2 restringir
    presupuesto a meses naturales y devolver `None` con motivo si el rango
    no lo es; 5.3 no calcular el precio medio implícito de facturación
    hasta unificar perímetro de producto entre ingresos y unidades; 5.4
    unificar a las tres cuentas de gasto (`60100000001/2/3`), con evidencia
    de que la 003 sí se consulta en el dashboard real en producción; 5.5
    cambiar a `children_occupying` para igualar el dashboard real.
  - **Punto 6, aplicados**: quitado el `DISTINCT` redundante en `fetch_rn`;
    `fetch_rn_presupuesto` deja de truncar con `int()` y devuelve `float`
    redondeado; `GROUP BY pt.name->>'es_ES'` cambiado a
    `COALESCE(pt.name->>'es_ES', pt.name->>'en_US')`; documentado (sin
    cambio de código) el efecto de descuentos del 100% sobre el precio
    medio; documentada la falta de índice en `pms_service_line.date` /
    `pms_reservation_line.date` como aviso de rendimiento en la cabecera;
    documentado que falta un KPI de capacidad/habitaciones disponibles y el
    sesgo a evitar (`pms_room WHERE active = true` reintroduce el sesgo
    histórico que `fetch_rn` evita a propósito) — no añadido en esta
    revisión, no se ha pedido todavía.
  - Añadida nota de gobierno de datos: verificado contra
    `backend/core/hoteles/repository.py` real que este documento describe
    un modelo distinto al desplegado hoy, y que los mismos fallos de los
    puntos 2 y 3 están presentes en el código de producción actual.
- 2026-08-26: **retractado el punto 2** de la entrada anterior (mismo día,
  sesión distinta). Se había afirmado que `account_move_budget_line` tiene
  `pms_property_id` directo porque el módulo `pms_account_move_budget`
  "está instalado" — esa comprobación se hizo contra el código fuente
  disponible (`odoo/auto/addons`), no contra la instancia real. Verificado
  ahora contra producción con tres consultas independientes:
  `ir_module_module` marca el módulo como `uninstalled`; `ir_model_fields`
  no tiene ninguna fila para `pms_property_id` en el modelo
  `account.move.budget.line`; `information_schema.columns` confirma que esa
  tabla no tiene esa columna (el único `pms_property_id` real del esquema
  está en `pms_budget`, tabla distinta, la de `fetch_rn_presupuesto`). Se
  revierte el criterio de `fetch_ingresos_desayuno_presupuesto` y
  `fetch_gastos_desayuno_presupuesto` a unir por
  `hotel_analytic_account_id = pms_property.analytic_account_id` — el mismo
  que ya usa `repository.py` sin cambios, que por tanto **no tenía este
  fallo**. Re-ejecutadas ambas consultas contra producción (acotadas a los
  hoteles de referencia Sada Marina/Alda Palacio Valdés/Alda Valladolid
  Sur): Sada Marina octubre 2026 reproduce exactamente 6.742,41 € de
  ingresos y 3.364,46 € de gastos presupuestados — cifras ya validadas el
  2026-08-25, ahora **vigentes de nuevo** (dejan de estar "pendientes de
  revalidar"). La nota de gobierno de datos de la entrada anterior queda
  corregida: de los puntos 2 y 3, solo el **punto 3** (ingresos/gastos F&B
  reales con `price_subtotal` en vez de saldo contable) sigue confirmado
  como fallo presente en `repository.py`; el punto 2 no lo es.
- 2026-08-26: **retractada la retractación de la decisión 5.4**. Se iba a
  corregir `frontend/src/components/dashboard/desayunos-origen-datos.tsx`
  (decía "2 cuentas de gasto, la 60100000003 no existe") dando por buena la
  entrada anterior de este documento, que afirmaba lo contrario ("la
  afirmación de que no existe no se sostiene"). Antes de tocar el frontend,
  se ejecutó por fin la consulta E del apéndice de auditoría (nunca se había
  llegado a correr): `SELECT code, company_id, count(*) FROM account_account
  WHERE code LIKE '601000000%' GROUP BY code, company_id`, sobre las 10
  compañías del grupo. Resultado: `60100000001` existe en 8 compañías,
  `60100000002` en 6, `60100000003` en **0**. La entrada anterior confundía
  "el código consulta este código de cuenta" con "el código de cuenta
  existe" — un `JOIN`/`ANY` sobre un código ausente en `account_account` no
  da error, simplemente no aporta filas. El texto del frontend **era
  correcto** y no se ha tocado. Se corrige la sección 5.4 con la evidencia
  directa; la propuesta de unificación pasa de "las tres cuentas" a "las dos
  que existen" (`60100000001`/`60100000002`). Sigue sin aplicarse en
  `repository.py` — `_CUENTAS_GASTO_DESAYUNO` sigue declarando el código
  fantasma `60100000003`, sin efecto en ninguna cifra (verificado: no aporta
  filas), pendiente de una limpieza de bajo riesgo si se decide hacerla.
- 2026-08-26: **verificado que los dos criterios de "colaborador" coinciden**
  (duda abierta desde la revisión del filtro Tipo Desayuno, commit
  `6077b1e`): `_REGIMENES_COLABORADOR` clasifica por código de régimen
  (`DESCOL`/`DESNEGCOL`/`DESGRUPCOL`), mientras que `_CTES_DESAYUNO_CON_TIPO`
  clasifica el bucket "colaborador" del filtro Tipo Desayuno por `ILIKE
  '%colaborador%'` sobre el nombre del producto — dos mecanismos
  independientes que, en teoría, podían no coincidir para el mismo producto.
  Verificado contra producción, los 17 productos reales de
  `productos_desayuno`: **coinciden exactamente** — los 6 productos bajo los
  tres régimenes colaborador ("Desayuno Colaborador", "Desayuno Infantil
  Colaborador" ×2, "Desayuno Grupos Colaborador", "Desayuno Grupos
  Colaborador Infantil", "Desayuno Negociado Colaborador") son también los
  únicos 6 que el `ILIKE` clasifica como tipo `colaborador`; ningún producto
  de régimen no-colaborador cae en ese bucket. No hay fallo que corregir —
  se documenta para no volver a abrir la misma duda sin necesidad.
