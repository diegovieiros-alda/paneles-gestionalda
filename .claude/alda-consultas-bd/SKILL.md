---
name: alda-consultas-bd
description: Cómo consultar la base de datos de producción de Alda en modo solo lectura desde este entorno — conexión psql (service alda-ro), reglas de prudencia (LIMIT, acotar por hotel y fechas, timeout), introspección del esquema y consultas canónicas. Usar SIEMPRE antes de lanzar cualquier SQL contra la BD.
---

# Consultas a la BD de producción (solo lectura)

## Conexión

La conexión está preconfigurada por el script de setup como **servicio `alda-ro`**
(usuario `readonly_user`, BD de producción). Ejecutar consultas así:

```bash
psql service=alda-ro -c "SELECT ..."
# o para consultas largas, con fichero:
psql service=alda-ro -f consulta.sql
```

- El usuario es de **solo lectura a nivel de servidor** y la conexión `alda-ro`
  lleva configurados `statement_timeout=30s` (una consulta pesada se corta sola) y
  modo transacción solo-lectura. No quitar ni subir esos límites. Aun así, aplican
  las reglas de abajo: es la base de datos REAL de los hoteles en horario de
  trabajo.
- Si la conexión falla: comprobar que se ejecutó `setup` (crea
  `~/.pg_service.conf` y la contraseña en `~/.pgpass`) y avisar al instructor
  (puede ser el filtro de red).

## Reglas de prudencia (obligatorias)

1. **Acotar SIEMPRE por hotel y fechas**: `pms_property_id = …` y un rango de
   `date`/`request_date`. Nunca barrer tablas enteras "a ver qué hay".
2. **`LIMIT` en toda consulta exploratoria** (100-500 filas). Para totales, usar
   agregados (`count`, `sum`), no traer filas y contar.
3. **Nada de `SELECT *`** en tablas grandes (`pms_api_log` tiene payloads de texto
   enormes; `account_move_line` tiene millones de filas): pedir solo las columnas
   necesarias.
4. **`LIKE '%texto%'` es un escaneo completo**: usarlo solo acotado por fecha y
   property (los índices trigram existentes cubren búsquedas de partner, no el
   resto).
5. Si una consulta se corta por timeout, NO relanzarla "a ver si cuela": reescribirla
   más acotada (menos rango, más filtros, agregada).
6. **Una consulta cada vez** — no lanzar varias pesadas en paralelo.
7. **Datos personales** (huéspedes: nombres, teléfonos, emails, documentos):
   consultarlos solo si el caso lo exige, mostrar el mínimo, y NUNCA volcarlos a
   informes o ficheros que salgan del entorno. Preferir agregados.

## Introspección del esquema

Antes de asumir un nombre de columna, verificarlo:

```bash
psql service=alda-ro -c "\d pms_reservation_line"
psql service=alda-ro -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='pms_folio' ORDER BY ordinal_position"
```

Documentación del esquema, de menos a más detalle (en `alda-ia-taller/contexto/`):

1. `mapa-bd.md` — esencial: tablas y campos clave (español).
2. `relaciones-bd.md` — grafo de relaciones: FKs, m2m, rutas
   folio→factura→pago→caja, volúmenes y trampas de nombres (español).
3. `schema/` — **data dictionary completo en inglés generado del esquema real de
   producción**: un fichero por dominio con TODAS las columnas (tipo, null, FK,
   selections con sus valores, labels/help de Odoo), los campos visibles en Odoo
   que NO son columnas SQL (computed/related/x2many y cómo obtenerlos), constraints
   e índices. Índice tabla→fichero en `schema/README.md`; volcado
   machine-readable en `schema/schema.json`.

Para cualquier join no trivial: buscar la tabla en `schema/README.md` y leer su
entrada ANTES de escribir SQL. La semántica de negocio (IVA, grupos, estados a
excluir) está en `alda-datos-negocio`.

## Consultas canónicas

```sql
-- lista de hoteles (para resolver "¿qué property_id es X?")
-- OJO: pms_property NO tiene columna name (hereda de res_partner vía partner_id)
SELECT pp.id, rp.name
FROM pms_property pp
JOIN res_partner rp ON rp.id = pp.partner_id
ORDER BY rp.name;

-- ocupación de un hotel por día (noches ocupadas / habitaciones activas)
SELECT rl.date,
       count(*) FILTER (WHERE rl.occupies_availability) AS noches_ocupadas,
       (SELECT count(*) FROM pms_room rm
         WHERE rm.pms_property_id = :property_id AND rm.active) AS habitaciones,
       round(100.0 * count(*) FILTER (WHERE rl.occupies_availability)
             / NULLIF((SELECT count(*) FROM pms_room rm
                        WHERE rm.pms_property_id = :property_id AND rm.active), 0), 1)
         AS ocupacion_pct
FROM pms_reservation_line rl
JOIN pms_reservation r ON r.id = rl.reservation_id
WHERE rl.pms_property_id = :property_id
  AND rl.date >= :desde AND rl.date < :hasta
  AND r.state != 'cancel'
GROUP BY rl.date ORDER BY rl.date;

-- producción de alojamiento (CON IVA) por canal, un hotel y rango
SELECT COALESCE(sc.name, 'Sin canal') AS canal,
       count(DISTINCT r.folio_id) AS folios,
       round(sum(rl.price * (1 - rl.discount/100.0)
                          * (1 - rl.cancel_discount/100.0))::numeric, 2) AS produccion
FROM pms_reservation_line rl
JOIN pms_reservation r ON r.id = rl.reservation_id
LEFT JOIN pms_sale_channel sc ON sc.id = r.sale_channel_origin_id
WHERE rl.pms_property_id = :property_id
  AND rl.date >= :desde AND rl.date < :hasta
  AND r.state != 'cancel' AND r.reservation_type = 'normal'
GROUP BY 1 ORDER BY produccion DESC;
```

Notas: la ocupación puede superar el 100% (overbooking permitido); ADR = producción
/ noches ocupadas; para separar alojamiento de extras/regímenes, ver
`pms_service`/`pms_service_line` (`is_board_service`).

## Qué NO se puede hacer desde aquí

INSERT/UPDATE/DELETE (el rol lo impide), crear objetos, tocar configuración, ni
"probar a ver si deja". Si un análisis concluye que hay que corregir datos, se
documenta (skill `alda-reporte-bugs`) y lo ejecuta el equipo técnico.
