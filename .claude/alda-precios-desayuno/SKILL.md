---
name: alda-precios-desayuno
description: Cómo traer el precio correcto del desayuno (y demás regímenes de comida) por hotel y tipo, sin depender de ninguna ficha externa y sin caer en los bugs de agregación conocidos del modelo de board services de Alda. Usar SIEMPRE que se pida "precio del desayuno", "tarifa de desayuno", "cuánto cuesta el desayuno" por hotel, o al construir un dashboard/informe con esa cifra.
---

# Precio correcto del desayuno por hotel — PMS Alda

Esta skill nace de una investigación real (2026-08-20) que encontró y corrigió
**tres bugs de agregación** al intentar sacar "el precio del desayuno" de la BD,
y una discrepancia real entre la **configuración estática** de régimen
(`pms_board_service_room_type_line`) y lo que de verdad se cobra. La solución
**no depende de ningún Excel ni ficha externa** — todo se deriva del propio
sistema, combinando configuración con **precio realmente cobrado en
transacciones recientes**. Léela entera antes de escribir una query de
precios — cada bug de abajo dio un número plausible pero incorrecto la primera
vez que se calculó.

Skills relacionadas: `alda-consultas-bd` (conexión y reglas de prudencia),
`alda-datos-negocio` (semántica general del PMS), `alda-informes` (si el destino
final es un informe/dashboard HTML).

## 1. Modelo de datos

El desayuno es un **régimen** (`pms.board.service`), no una tabla propia:

- `pms_board_service` — catálogo de regímenes (17 filas: desayunos, media
  pensión, pensión completa). Campo `default_code` identifica el tipo.
- `pms_board_service_room_type_rel` — qué régimen está disponible en qué
  hotel + tipo de habitación, con flag `by_default` ("Apply by Default", campo
  real del modelo `pms.board.service.room.type`, confirmado en
  `src/pms/pms/models/pms_board_service_room_type.py`).
- `pms_board_service_room_type_line` — el precio **configurado** (estático),
  con columnas `amount`, `adults` (bool), `children` (bool). Fiable para los
  regímenes de venta directa/negociada/grupos, no fiable para los de
  colaborador (ver sección 3).
- `pms_service` / `pms_service_line` — consumo en **producción** (la reserva,
  antes de facturar), con `is_board_service=True`, `price_unit`. Es la base
  para el precio real (sección 3), pero **no siempre es la última palabra** —
  ver 2.6.
- `folio_sale_line` (unida a `pms_service_line` vía
  `folio_sale_line_pms_service_line_rel`) → `account_move_line` (línea de
  factura real, vía `folio_sale_line_invoice_rel`) — el precio que **de
  verdad se facturó**, que puede diferir del de producción si alguien corrigió
  el importe al facturar (ver 2.6). Cuando existe factura `posted`, es la
  fuente más autorizada.

## 2. Bugs de agregación encontrados (no repetirlos)

### 2.1 `pms_board_service_room_type_rel.amount` duplica el precio

Ese campo es un **rollup calculado** (`compute="_compute_board_amount"`, ver
código fuente) que **siempre es la suma de las líneas de adulto + niño**, no un
precio por persona. Ejemplo verificado: Hotel Alda Centro Gijón, régimen `AD` →
`rel.amount = 9,00 €` porque suma línea adulto (4,50 €) + línea niño (4,50 €).
El precio real por adulto es 4,50 €.

**Regla**: para el precio configurado de un régimen, leer siempre
`pms_board_service_room_type_line.amount` filtrando `adults = true` (precio
adulto) y `children = true` (precio niño) **por separado**. Nunca sumar ni usar
`rel.amount` como precio.

### 2.2 No promediar entre tipos de habitación

Un mismo hotel puede tener precios distintos para el mismo régimen según el
tipo de habitación (p. ej. Albergue Alda Estella Hostel, régimen `ADE`: 6,50 €
en 6 tipos de habitación y 6,95 € en otros 4). **Si hay una tarifa configurada,
esa prevalece tal cual** — no promediar (`avg()`) entre tipos de habitación
para sacar "un" número, porque el resultado no es un precio que pague nadie.
Si se necesita un único valor por hotel para una tarjeta de KPI, listar los
valores reales distintos o usar la regla de régimen principal (sección 4), no
una media.

### 2.3 `AD` (id=1, "Breakfast") es un régimen legado

`AD` es el código de régimen más antiguo del catálogo y **ya no se usa como
principal** (confirmado por negocio 2026-08-20; volumen transaccional real muy
por debajo de `ADB`/`ADE`/`ADN` en los últimos 3 meses). No usarlo como
régimen por defecto al elegir "el" precio de un hotel — usar la prioridad de
la sección 4. Se mantiene como último recurso porque 3 hoteles solo tienen
`AD` configurado.

### 2.4 Unir transacciones a configuración solo por `product_id` multiplica filas

`pms_service_line.product_id` no es único por régimen — el mismo producto se
reutiliza en cientos de combinaciones hotel × tipo de habitación en
`pms_board_service_room_type_line`. Si se necesita saber a qué régimen
pertenece una transacción real, unir **también** por `pms_property_id` y por
el `room_type_id` de la reserva (ver query 5.3) — nunca solo por `product_id`,
o el resultado sale con órdenes de magnitud de más filas de las reales.

### 2.5 Exigir que exista configuración activa esconde ventas reales (bug encontrado 2026-08-20)

Un hotel puede vender un desayuno como **servicio suelto** en una reserva sin
que exista una combinación activa en `pms_board_service_room_type_rel`/`_line`
para ese hotel + tipo de habitación (config borrada, cambiada, o nunca creada
para ese tipo de habitación concreto; producto legado que se sigue añadiendo a
mano). Si el precio real reciente (sección 3) se calcula **uniendo primero a
la configuración** (`INNER JOIN` a `pms_board_service_room_type_rel`/`_line`),
esas ventas desaparecen silenciosamente del resultado.

Verificado: 24 combinaciones hotel×producto con ventas reales en los últimos
180 días (algunas con cientos de líneas — p. ej. Hotel Alda Arteixo, "Express
Breakfast", 698 líneas; Hotel Alda Palacio Valdés, "Express Breakfast", 1.016
líneas) **no tenían ninguna configuración activa que las respaldara**. Con un
`INNER JOIN` a la configuración, estos hoteles habrían salido como "sin datos"
pese a tener desayuno activo y con volumen alto.

**Regla**: para el precio real reciente, consultar `pms_service_line`
directamente (`is_board_service=true`, agrupado por hotel + producto), **sin
unir a la tabla de configuración**. La configuración solo se usa para saber
qué está *pensado* ofrecerse (sección 4.3 tipo de documento técnico) o como
`fallback` cuando no hay transacciones — nunca como filtro obligatorio de qué
ventas contar.

### 2.6 Producción y facturación pueden diferir — la factura manda cuando existe

`pms_service_line.price_unit` (producción, la reserva) y el precio realmente
**facturado** (`account_move_line.price_unit`, alcanzable desde
`pms_service_line` vía `folio_sale_line_pms_service_line_rel` →
`folio_sale_line` → `folio_sale_line_invoice_rel` → `account_move_line`)
suelen coincidir (99,93% de 38.669 líneas facturadas comprobadas), pero no
siempre: alguien puede corregir el importe al facturar sin que la reserva
quede actualizada. Ejemplo real encontrado: Alda Corrubedo, "Desayuno
Colaborador" — 26 líneas de abril 2026 con `price_unit` de producción = 5,50 €
pero factura `posted` a 8,95 €/7,95 € (la tarifa correcta del hotel). Si el
precio real reciente se calcula solo con `pms_service_line.price_unit`, se
queda con el importe equivocado (el de producción) en vez del que realmente
se cobró.

**Regla**: al calcular el precio real (sección 3), usar
`COALESCE(precio_facturado, precio_produccion)` — priorizar el precio de la
línea de factura cuando existe una factura en estado `posted` (o `draft` si
no hay `posted`), y caer al precio de producción solo si la línea aún no se
ha facturado (frecuente en reservas recientes/futuras, no es un error).
Etiquetar siempre la fuente (`facturacion` / `produccion`) en el resultado.

## 3. La configuración estática no es fiable para todos los regímenes — usar el precio real reciente

**No hace falta ninguna ficha externa para detectar ni corregir esto: se
compara con datos del propio sistema.** Comparando `pms_board_service_room_type_line.amount`
(configuración) contra el **precio realmente cobrado** en transacciones de los
últimos 6 meses (`pms_service_line.price_unit`, agregado por moda — el valor
más frecuente — por hotel y régimen), para las 7 variantes de desayuno
vigentes (`ADB`, `ADE`, `ADN`, `DESGRUP`, `DESCOL`, `DESNEGCOL`, `DESGRUPCOL`):

| Régimen | Configuración estática fiable | Nota |
|---|---|---|
| ADB, ADE, ADN, DESGRUP | **Sí** (verificado: coincide con lo realmente cobrado en la inmensa mayoría de hoteles) | Usar `pms_board_service_room_type_line` directamente (query 5.1) |
| DESCOL, DESNEGCOL, DESGRUPCOL | **No** — suelen quedarse en un precio de catálogo antiguo (8,00 €/9,00 €) que ya no se cobra | Usar el **precio real reciente** (query 5.2), no la configuración |

Ejemplo verificado: Hotel Alda Avenida, régimen `DESNEGCOL` —
`pms_board_service_room_type_line.amount` = 6,50 €, pero el precio que
aparece en 335 líneas de servicio reales de los últimos 6 meses es,
consistentemente, 5,50 €. La configuración quedó desactualizada cuando se
renegoció la tarifa; las reservas ya se están facturando al precio nuevo.

**Regla de negocio**: para `DESCOL`/`DESNEGCOL`/`DESGRUPCOL`, calcular el
precio como la **moda (`mode() WITHIN GROUP`) de `price_unit`** en
`pms_service_line` de los últimos 180 días, filtrando `is_board_service=true`
y el producto correspondiente — **consultando la transacción directamente,
sin exigir que exista una configuración activa que la respalde** (ver 2.5:
exigir el join a configuración esconde ventas reales, algunas con volumen
alto). Solo si no hay transacciones recientes (0 líneas en la ventana), caer
a la configuración estática como último recurso, marcando el resultado como
**baja confianza** (ver límites más abajo).

### Límites de esta corrección (léelo antes de dar un precio de colaborador por bueno)

Verificado contra 21 combinaciones hotel×régimen donde se sabía que la
configuración estaba mal: el precio real reciente coincidió con la tarifa que
negocio confirma en ~20 de 21 casos comprobables. Aun así:

1. **Sin transacciones recientes no hay señal.** Varios hoteles con régimen
   `DESNEGCOL` configurado no han tenido ni una sola venta en 180 días — ahí no
   hay forma de derivar el precio real del sistema; solo queda la
   configuración (marcarla como no verificada) o preguntar a negocio.
2. **Un caso encontrado no coincidió**: Hotel Alda Mirador Del Moncayo,
   `DESNEGCOL` — el precio real reciente (8,00 €, n=5 transacciones) coincidía
   con la configuración antigua, no con la tarifa que negocio dijo que era la
   vigente (5,50 €) en su momento. Puede ser que el hotel siga cobrando mal, o
   que la cifra de negocio de aquel momento ya estuviera desactualizada — no
   asumir cuál es la correcta sin confirmarlo.
3. **Un caso con divergencia leve**: Hotel Alda Egues Rooms, `DESCOL` — precio
   real 6,70 €, tarifa confirmada por negocio 6,30 € (diferencia ~6%, posible
   subida de precio no comunicada o al revés).
4. **Volumen bajo = menos fiable.** Con menos de ~10 transacciones en la
   ventana, tratar el resultado como orientativo, no definitivo — indicarlo en
   el output (columna `n_lineas` de la query 5.2).

**Por eso**: el resultado de esta skill debe llevar siempre una columna de
confianza (alta / baja / sin verificar) y, cuando la cifra importe para una
decisión de negocio (no solo un dashboard informativo), recomendar una
confirmación puntual con el hotel o con el equipo de revenue — no es infalible,
pero es sustancialmente más fiable que la configuración estática sola, y no
depende de que alguien mantenga un Excel aparte.

## 4. Cómo calcular "el" precio de un hotel (régimen principal)

Cuando se necesita un único precio de desayuno por hotel (no el desglose
completo), aplicar en este orden:

1. Si algún régimen de desayuno tiene `by_default = true` para ese hotel +
   tipo de habitación, ese gana (¡ojo!: `by_default` suele ser `NULL`, no
   `false` — ordenar con `COALESCE(by_default, false) DESC`, nunca
   `by_default DESC` a secas, o los `NULL` se cuelan antes que los `true`).
2. Si no, usar esta prioridad entre los regímenes configurados (de más a menos
   relevante en volumen real de venta, `AD` deliberadamente al final por ser
   legado):
   `ADB > ADE > DESCOL > ADN > DESNEGCOL > SAD > DESGRUP > DESGRUPCOL > AD`
3. Dentro del régimen elegido: para `ADB`/`ADE`/`ADN`/`DESGRUP`/`SAD` usar la
   configuración (query 5.1); para `DESCOL`/`DESNEGCOL`/`DESGRUPCOL` usar el
   precio real reciente (query 5.2).
4. Si el precio varía por tipo de habitación (2.2), listar los valores reales,
   no promediar.

Esta prioridad es una convención razonable a falta de una regla de negocio más
explícita — **no está confirmada como regla oficial**, solo como el orden que
mejor refleja qué régimen es "el principal" según volumen de uso real.

## 5. Queries de referencia

### 5.1 Precio configurado (adulto/niño), por hotel y régimen — fiable para ADB/ADE/ADN/DESGRUP/SAD

```sql
SELECT rp.name AS hotel, bs.default_code AS regimen,
       string_agg(DISTINCT l.amount::text, ' / ' ORDER BY l.amount::text)
         FILTER (WHERE l.adults)   AS precio_adulto_config,
       string_agg(DISTINCT l.amount::text, ' / ' ORDER BY l.amount::text)
         FILTER (WHERE l.children) AS precio_nino_config
FROM pms_board_service_room_type_line l
JOIN pms_board_service_room_type_rel rel ON rel.id = l.pms_board_service_room_type_id
JOIN pms_board_service bs ON bs.id = rel.pms_board_service_id
JOIN pms_property p ON p.id = rel.pms_property_id
JOIN res_partner rp ON rp.id = p.partner_id
WHERE l.active AND rel.active
  AND bs.default_code IN ('ADB','ADE','DESCOL','ADN','DESNEGCOL','DESGRUP','DESGRUPCOL')
  AND (:property_id IS NULL OR rel.pms_property_id = :property_id)
GROUP BY 1,2
ORDER BY 1,2;
```

### 5.2 Precio real reciente (moda últimos 180 días) — facturación &gt; producción &gt; configuración

```sql
-- Precio realmente cobrado, por hotel y PRODUCTO (no por régimen configurado:
-- ver bug 2.5 — exigir el join a configuración esconde ventas reales).
-- Prioriza la factura (posted) sobre el precio de producción (ver 2.6).
SELECT rp.name AS hotel,
       pt.name->>'es_ES' AS producto,
       mode() WITHIN GROUP (ORDER BY COALESCE(aml.price_unit, sl.price_unit)) AS precio_frecuente,
       count(*) AS n_lineas,
       count(*) FILTER (WHERE aml.price_unit IS NOT NULL) AS n_facturadas,
       max(sl.date) AS ultima_transaccion,
       CASE
         WHEN count(*) FILTER (WHERE aml.price_unit IS NOT NULL) >= 10 THEN 'facturacion'
         WHEN count(*) >= 10 THEN 'produccion'
         WHEN count(*) > 0 THEN 'produccion_bajo_volumen'
         ELSE 'SIN_DATOS_USAR_CONFIG'
       END AS fuente
FROM pms_service_line sl
JOIN pms_property p ON p.id = sl.pms_property_id
JOIN res_partner rp ON rp.id = p.partner_id
JOIN product_product pp ON pp.id = sl.product_id
JOIN product_template pt ON pt.id = pp.product_tmpl_id
LEFT JOIN folio_sale_line_pms_service_line_rel r ON r.pms_service_line_id = sl.id
LEFT JOIN folio_sale_line fsl ON fsl.id = r.folio_sale_line_id
LEFT JOIN folio_sale_line_invoice_rel ir ON ir.sale_line_id = fsl.id
LEFT JOIN account_move_line aml ON aml.id = ir.invoice_line_id
  AND EXISTS (SELECT 1 FROM account_move am WHERE am.id = aml.move_id AND am.state = 'posted')
WHERE sl.is_board_service = true
  AND sl.date >= CURRENT_DATE - INTERVAL '180 days'
  AND (pt.name->>'es_ES' ILIKE '%desayuno%' OR pt.name->>'es_ES' ILIKE '%breakfast%')
  AND (:property_id IS NULL OR p.id = :property_id)
GROUP BY 1,2
ORDER BY 1,2;
```

Notas:
- `n_facturadas` bajo respecto a `n_lineas` no es un error — reservas
  recientes/futuras aún no se han facturado (se factura normalmente al
  checkout o después). Es esperable que una parte de las líneas de los
  últimos días salga como `produccion`.
- Esta query da **un precio por producto**, no separa adulto/niño —
  `pms_service_line`/`account_move_line` no llevan ese flag (vive solo en la
  configuración). Para productos donde adulto y niño son productos distintos
  (p. ej. "Desayuno Colaborador" vs "Desayuno Infantil Colaborador") esto ya
  resuelve la separación de forma natural. Para productos donde adulto/niño
  comparten producto y solo se distinguen por la línea de configuración (el
  caso legado de `AD`, sección 2.3), esta query no puede separarlos — cruzar
  con la configuración (5.1) solo para obtener la etiqueta adulto/niño de ese
  producto, sin dejar que el cruce excluya filas sin match (`LEFT JOIN`, nunca
  `INNER JOIN`).

Sin resultado (`fuente = 'SIN_DATOS_USAR_CONFIG'`) para un hotel/producto →
caer a la configuración (query 5.1) para ese hotel+régimen y marcar el
resultado como no verificado.

### 5.3 Régimen "principal" por hotel/tipo de habitación (regla de la sección 4)

```sql
WITH lineas AS (
  SELECT rp.name AS hotel, rt.id AS room_type_id, rt.default_code AS tipo_hab,
         bs.default_code AS regimen, rel.by_default,
         l.amount, l.adults, l.children,
         CASE bs.default_code
           WHEN 'ADB' THEN 1 WHEN 'ADE' THEN 2 WHEN 'DESCOL' THEN 3
           WHEN 'ADN' THEN 4 WHEN 'DESNEGCOL' THEN 5 WHEN 'SAD' THEN 6
           WHEN 'DESGRUP' THEN 7 WHEN 'DESGRUPCOL' THEN 8 WHEN 'AD' THEN 9
         END AS prioridad
  FROM pms_board_service_room_type_line l
  JOIN pms_board_service_room_type_rel rel ON rel.id = l.pms_board_service_room_type_id
  JOIN pms_board_service bs ON bs.id = rel.pms_board_service_id
  JOIN pms_room_type rt ON rt.id = rel.pms_room_type_id
  JOIN pms_property p ON p.id = rel.pms_property_id
  JOIN res_partner rp ON rp.id = p.partner_id
  WHERE l.active AND rel.active
    AND bs.default_code IN ('AD','SAD','ADB','ADE','ADN','DESCOL','DESNEGCOL','DESGRUPCOL','DESGRUP')
),
regimen_elegido AS (
  SELECT DISTINCT ON (hotel, room_type_id)
         hotel, room_type_id, tipo_hab, regimen, by_default
  FROM lineas
  ORDER BY hotel, room_type_id, COALESCE(by_default, false) DESC, prioridad ASC
)
SELECT re.hotel, re.tipo_hab, re.regimen, re.by_default,
       max(l.amount) FILTER (WHERE l.adults)   AS precio_adulto_config,
       max(l.amount) FILTER (WHERE l.children) AS precio_nino_config
FROM regimen_elegido re
JOIN lineas l ON l.hotel = re.hotel AND l.room_type_id = re.room_type_id AND l.regimen = re.regimen
GROUP BY re.hotel, re.tipo_hab, re.regimen, re.by_default
ORDER BY re.hotel, re.tipo_hab;
```

Si el régimen elegido para un hotel/tipo de habitación es `DESCOL`,
`DESNEGCOL` o `DESGRUPCOL`, sustituir `precio_adulto_config`/`precio_nino_config`
por el resultado de la query 5.2 para el producto correspondiente a ese hotel
(con su nivel de confianza). Da igual si ese producto tenía o no una fila de
configuración activa — 5.2 no lo exige (ver 2.5).

### 5.4 Procedimiento recomendado (todo derivado del sistema, sin ficha externa)

Orden de prioridad de la fuente, de más a menos autorizada:
**factura `posted`** (2.6) > **producción sin facturar** (reserva reciente,
normal que aún no tenga factura) > **configuración estática** (4.4, solo como
último recurso).

1. Ejecutar 5.2 (precio real reciente, por producto, con `COALESCE(factura,
   producción)`, **sin** exigir join a configuración) para todos los hoteles —
   es la fuente primaria de lo que se está cobrando de verdad, incluidas
   ventas sin configuración activa (bug 2.5) y con la corrección de
   facturación aplicada cuando existe (bug 2.6).
2. Ejecutar 5.1 (configuración) solo como catálogo de qué está *pensado*
   ofrecerse y como fallback para hotel+régimen sin ninguna transacción
   reciente (`fuente = 'SIN_DATOS_USAR_CONFIG'` en 5.2).
3. Para `ADB`/`ADE`/`ADN`/`DESGRUP`/`SAD`: si 5.2 tiene datos con fuente
   `facturacion` o `produccion`, usarlos (suelen coincidir con 5.1, pero 5.2
   es la fuente más directa y no depende de que la config esté al día); si no,
   usar 5.1.
4. Para `DESCOL`/`DESNEGCOL`/`DESGRUPCOL`: usar 5.2 siempre que haya datos
   (la config es conocida por no ser fiable, sección 3); si no hay datos, usar
   5.1 marcando `NO_VERIFICADO`.
5. Devolver siempre la columna de fuente (`facturacion` / `produccion` /
   `produccion_bajo_volumen` / `config_no_verificado`) junto al precio — nunca
   presentar un precio sin decir de dónde sale ni cuántas líneas lo respaldan.

## 6. Qué NO asumir

- No hay un flag de negocio que distinga "desayuno" de "media pensión/pensión
  completa" dentro de los regímenes — se distingue por `default_code`/nombre de
  producto. Si aparece un régimen nuevo no listado en las prioridades de arriba,
  no asumir a qué familia pertenece: comprobar el nombre del producto asociado
  en `pms_board_service_room_type_line` antes de clasificarlo.
- No dar un precio de `DESCOL`/`DESNEGCOL`/`DESGRUPCOL` sacado solo de la
  configuración estática como "el precio correcto" — usar el precio real
  reciente (sección 3) y decir de dónde sale.
- El precio real reciente **tampoco es infalible** (sección 3, límites 1-4):
  sin transacciones no hay señal, y hay al menos un caso confirmado donde
  coincidió con la configuración vieja en vez de con la tarifa vigente. Ante
  una decisión de negocio importante, ofrecer confirmar con el hotel/revenue,
  no solo devolver el número.
- No filtrar el precio real por "tiene que tener configuración activa" (bug
  2.5) — un hotel puede vender el desayuno como servicio suelto sin que exista
  esa combinación en `pms_board_service_room_type_rel`/`_line`, y esas ventas
  son igual de reales. La configuración es un catálogo de qué está *pensado*
  ofrecerse, no una lista cerrada de lo que se puede vender.
- No usar `pms_service_line.price_unit` (producción) como si fuera siempre el
  precio final (bug 2.6) — cuando existe factura `posted`, esa es la fuente
  más autorizada, porque puede llevar una corrección que la reserva no tiene
  (caso real: Alda Corrubedo, 26 líneas facturadas a un precio distinto del de
  producción). Usar `COALESCE(factura, producción)`, nunca solo producción.
- Esta skill se basa en el estado del código y del volumen transaccional a
  2026-08-20. Antes de reutilizarla en una tarea nueva, si ha pasado mucho
  tiempo, volver a comprobar rápidamente si `DESCOL`/`DESNEGCOL`/`DESGRUPCOL`
  siguen desactualizados en la configuración (query 3, comparando 5.1 vs 5.2) —
  si negocio ya corrigió la BD, la sección 3 deja de aplicar y se puede usar
  5.1 para todo.

## 7. Addendum verificado (2026-08-21, dashboard Producción/Desayunos)

Al reconstruir el dashboard de desayunos de `Dashboard-Alda`
(`backend/core/hoteles/repository.py`), verificado sobre datos reales:

- **`is_board_service` (en `pms_service_line` y en `folio_sale_line`) no es
  fiable en esta instancia.** Sobre 180 días, ~50% de las líneas que por
  producto son inequívocamente desayuno tienen el flag en `false`. Usarlo
  como filtro (tal cual sugiere la query 5.2 de este documento) descarta
  aprox. la mitad de las ventas reales. **No usarlo como filtro de
  clasificación.** En su lugar, identificar el producto por pertenencia al
  catálogo (`pms_board_service_room_type_line.product_id` para los
  `default_code` de desayuno), que en esta verificación coincidió al 99.5%
  con el filtro por nombre (ILIKE) que ya se usaba — el nombre de producto
  no estaba mal, solo es más frágil ante productos nuevos/renombrados.
- **Colaborador (`DESCOL`/`DESNEGCOL`/`DESGRUPCOL`) es ~24% de la
  producción real de desayuno de la cadena** (180 días) y no son datos
  marginales — un hotel concreto puede tener el 100% de su desayuno en
  colaborador. Si un dashboard de "producción de desayuno" excluye
  colaborador por completo (motivo típico: evitar que la penetración por
  huésped supere el 100%, ver razonamiento en el propio código), esa
  exclusión debe aplicarse **solo al cálculo de penetración**, nunca a la
  cifra de producción/precio medio — excluirla de todo esconde ~1 de cada 4
  euros de ingreso real.
- **La divergencia facturación vs producción (bug 2.6) es del orden de
  +6-7% en agregado** (180 días, cadena completa: producción bruta
  1.707.516,56 € vs facturación real 1.821.095,50 €) — material, no
  anecdótica. Al agregar `account_move_line` contra `folio_sale_line` por
  `folio_sale_line_invoice_rel`, esa relación **no es 1:1**: una línea de
  folio puede repartirse en varias líneas de factura (verificado). Sumar
  `account_move_line.price_subtotal` primero agrupando por
  `sale_line_id` (subconsulta/CTE) antes de unir 1:1 a `folio_sale_line` —
  unir directamente sin agregar antes multiplica filas y también infla el
  total.

## Histórico (fichero de referencia opcional, no es una dependencia)

`referencia/ficha-tarifas-desayuno.csv` contiene una ficha de tarifas que
negocio compartió el 2026-08-20 y que se usó **solo para validar** el método
del precio real reciente (sección 3) — no es necesaria para que esta skill
funcione, ni se debe volver a depender de ella. Se conserva como snapshot
histórico/auditoría, no como fuente en las queries de la sección 5.
