"""Carga de datos reales desde Odoo para el listado de Hoteles: ocupación
(habitaciones-noche de huéspedes reales) y ventas de desayuno. Solo lectura,
mismo patrón que core/bloqueos/repository.py.

Los productos de desayuno se identifican por el catálogo real de régimen
(pms_board_service, vía pms_board_service_room_type_line), no por nombre de
producto — ver .claude/alda-precios-desayuno/SKILL.md. Verificado
(2026-08-21) que el catálogo y el antiguo filtro ILIKE coinciden al 99.5%,
así que el cambio no es "el filtro estaba mal": es más robusto ante
productos nuevos/renombrados y permite distinguir "colaborador" sin
adivinar por texto. is_board_service (el flag que sugiere la skill) NO es
fiable en esta instancia: ~50% de las líneas de desayuno reales tienen el
flag en false — no usarlo como filtro.
"""
from __future__ import annotations

import datetime

from django.db import connections

from ..cache import cache_result

# Régimenes de desayuno vigentes (ver pms_board_service.default_code).
# DESCOL/DESNEGCOL/DESGRUPCOL son "colaborador" (venta a partner/agencia,
# no directa al huésped): cuentan en producción (es dinero real) pero no en
# la penetración, porque una reserva de colaborador puede no corresponder a
# ningún huésped contado en "alojados" — mezclarlos infla la penetración
# por encima del 100% (motivo verificado, no solo teórico).
_REGIMENES_DESAYUNO = ("AD", "ADB", "ADE", "ADN", "DESCOL", "DESGRUP", "DESGRUPCOL", "DESNEGCOL", "SAD")
_REGIMENES_COLABORADOR = ("DESCOL", "DESNEGCOL", "DESGRUPCOL")

# Tipo Desayuno (filtro de negocio, distinto del régimen de arriba): un mismo
# régimen mezcla productos de tipo distinto (ej. "ADE" tiene tanto "Desayuno
# Infantil" como "Express Breakfast", verificado 2026-08-24) — se clasifica
# por NOMBRE del producto, no por régimen. Lo que no encaja en
# buffet/express/colaborador (Grupos, Negociado, Infantil suelto) cae en
# "otros" — decisión explícita, no repartirlo en las otras 3.
_TODOS_TIPOS_DESAYUNO = ("buffet", "express", "colaborador", "otros")

# KPIs financieros F&B (Ingresos/Gastos/Margen), definidos por el
# departamento financiero vía cuenta contable — no por régimen PMS, y
# excluyen colaborador por completo (ni ingresos ni gastos), a diferencia de
# "producción" de arriba. Son dos fuentes de verdad distintas a propósito:
# ver .claude/alda-precios-desayuno/SKILL.md, sección histórico
# "Desayunos - Campos generales.csv" (2026-08-21).
_CUENTA_INGRESO_DESAYUNO = "70500000020"  # "Desayunos"
_CUENTAS_GASTO_DESAYUNO = ("60100000001", "60100000002", "60100000003")  # compras de materias primas F&B
# Explícitamente excluidas de gastos (no son coste directo de materia
# prima): 60910000000 (rappel), 60700000000/60700000001 (colaborador/externo).

_HOTELES_SQL = """
    SELECT prop.id, partner.name, prop.pms_property_code, prop.company_id
    FROM pms_property prop
    JOIN res_partner partner ON partner.id = prop.partner_id
"""

_COMPANIES_SQL = "SELECT id, name FROM res_company"

# Submarca (Basic/Standard/Plus/Nomad): pms_property.partner_id -> res_partner
# .brand_id -> res_brand.partner_id -> res_partner.name (res_brand no tiene
# columna "name" propia, la marca es a su vez un partner). No depende de
# fecha_inicio/fecha_fin. 57 de 132 hoteles no tienen brand_id asignado
# (verificado 2026-08-24) -> service.get_hoteles() resuelve ese None como
# "Sin submarca", igual que zona_de() resuelve "Zona No Definida".
_SUBMARCAS_SQL = """
    SELECT prop.id, brand_partner.name
    FROM pms_property prop
    JOIN res_partner partner ON partner.id = prop.partner_id
    LEFT JOIN res_brand brand ON brand.id = partner.brand_id
    LEFT JOIN res_partner brand_partner ON brand_partner.id = brand.partner_id
"""

# Personas-noche, no habitaciones-noche: una habitación puede alojar varios
# adultos (p.ej. las propiedades "Rooms", con habitaciones de hasta 4), así
# que contar solo habitaciones subestima a los alojados y puede dar
# penetraciones de desayuno por encima del 100%.
_ALOJADOS_SQL = """
    SELECT rl.pms_property_id, SUM(COALESCE(r.adults, 0) + COALESCE(r.children_occupying, 0))
    FROM pms_reservation_line rl
    JOIN pms_reservation r ON r.id = rl.reservation_id
    WHERE rl.date BETWEEN %s AND %s AND rl.overnight_room = true
      AND r.reservation_type = 'normal' AND rl.state NOT IN ('draft', 'cancel')
    GROUP BY rl.pms_property_id
"""

# Comparación declarado (reserva) vs. check-in confirmado (pms_checkin_partner),
# solo para AUDITORÍA — no se usa para "alojados"/penetración. Probado contra
# la BD real (2026-08-24): usar el check-in en vez del declarado da SIEMPRE
# menos personas (ej. hotel 9, agosto 2026: -15%; agosto 2025: -19%), porque
# el check-in es un registro de viajeros, no un censo de ocupación — no
# garantiza una fila por persona alojada (cientos de miles de reservas
# "normal" ya completadas no tienen ningún check-in). Este informe es para
# detectar hoteles/periodos con muchas reservas sin check-in registrado, no
# para sustituir el dato declarado.
_CALIDAD_CHECKIN_SQL = """
    WITH checkin_real AS (
        SELECT cp.reservation_id,
               count(*) FILTER (
                   WHERE cp.birthdate_date IS NULL
                      OR date_part('year', age(COALESCE(cp.checkin, current_date), cp.birthdate_date)) >= 14
               ) AS adultos_checkin,
               count(*) FILTER (
                   WHERE cp.birthdate_date IS NOT NULL
                     AND date_part('year', age(COALESCE(cp.checkin, current_date), cp.birthdate_date)) < 14
               ) AS ninos_checkin
        FROM pms_checkin_partner cp
        WHERE cp.state IN ('onboard', 'done')
        GROUP BY cp.reservation_id
    )
    SELECT
        rl.pms_property_id,
        SUM(COALESCE(r.adults, 0) + COALESCE(r.children_occupying, 0)) AS declarado,
        SUM(COALESCE(cr.adultos_checkin, 0) + COALESCE(cr.ninos_checkin, 0)) AS checkin,
        COUNT(DISTINCT r.id) AS reservas_total,
        COUNT(DISTINCT r.id) FILTER (WHERE cr.reservation_id IS NULL) AS reservas_sin_checkin
    FROM pms_reservation_line rl
    JOIN pms_reservation r ON r.id = rl.reservation_id
    LEFT JOIN checkin_real cr ON cr.reservation_id = rl.reservation_id
    WHERE rl.date BETWEEN %s AND %s AND rl.overnight_room = true
      AND r.reservation_type = 'normal' AND rl.state NOT IN ('draft', 'cancel') AND rl.date < CURRENT_DATE
    GROUP BY rl.pms_property_id
"""

# CTEs compartidas por las queries de desayuno de abajo.
#   productos_desayuno: qué product_id pertenece a un régimen de desayuno
#     (catálogo real, no nombre de producto).
#   facturado: importe realmente facturado por línea de folio, agregado por
#     si acaso una línea se dividió en varias líneas de factura (evita
#     multiplicar filas al unir 1:N — bug de cardinalidad verificado).
#     Prioridad: factura `posted` > producción (folio_sale_line.price_subtotal)
#     cuando no hay factura o aún no se ha emitido.
#
# Filtro de fecha en "facturado" (2026-09-02, causa real de "cargar un hotel
# individual tarda muchísimo"): esta CTE no filtraba por fecha en absoluto —
# agregaba TODO el histórico de facturación de TODA la cadena en cada
# consulta, aunque el resto de la query solo pidiera un hotel y un día.
# Medido contra producción: 14,7s de EXPLAIN ANALYZE, escaneando 12,3M filas
# de account_move_line + 3,7M de account_move + 3,2M de
# folio_sale_line_invoice_rel al completo, sin importar el rango pedido.
# El join a folio_sale_line de aquí no cambia ningún resultado: toda query
# que usa esta CTE ya hace `LEFT JOIN facturado f ON f.sale_line_id = fsl.id`
# contra un `fsl` filtrado por el mismo `date_order BETWEEN %(desde)s AND
# %(hasta)s` — cualquier sale_line_id que pudiera producir un match ya
# cumple esa condición, así que restringir aquí antes de agregar no excluye
# ninguna fila que antes sí contara, solo evita escanear las que ya eran
# imposibles de emparejar.
_CTES_DESAYUNO = """
    WITH productos_desayuno AS (
        SELECT DISTINCT l.product_id, bs.default_code
        FROM pms_board_service_room_type_line l
        JOIN pms_board_service_room_type_rel rel ON rel.id = l.pms_board_service_room_type_id
        JOIN pms_board_service bs ON bs.id = rel.pms_board_service_id
        WHERE bs.default_code = ANY(%(regimenes)s)
    ),
    facturado AS (
        SELECT ir.sale_line_id, SUM(aml.price_subtotal) AS monto_facturado
        FROM folio_sale_line_invoice_rel ir
        JOIN folio_sale_line fsl_fact ON fsl_fact.id = ir.sale_line_id
        JOIN account_move_line aml ON aml.id = ir.invoice_line_id
        JOIN account_move am ON am.id = aml.move_id AND am.state = 'posted'
        WHERE fsl_fact.date_order BETWEEN %(desde)s AND %(hasta)s
        GROUP BY ir.sale_line_id
    )
"""

# cantidad_directa/cantidad_total: la primera excluye colaborador (para
# penetración), la segunda lo incluye (para precio medio). produccion_total
# siempre incluye colaborador — es la cifra de negocio real.
#
# facturada/sin_facturar: desglose de produccion_total por si ya tiene
# factura posted vinculada (f.sale_line_id IS NOT NULL) o no — misma
# CTE "facturado", solo separada en vez de colapsada con COALESCE.
# produccion_facturada + produccion_sin_facturar == produccion_total
# siempre (invariante verificado contra producción 2026-08-27, Sada Marina
# agosto 2026: 12.980,64 € + 3.345,87 € = 16.326,51 €). "sin_facturar" usa
# fsl.price_subtotal (precio del folio, aún no hay importe de factura real)
# — es una estimación, no un hecho contable, igual que ya lo era dentro de
# produccion_total antes de este desglose.
# Variante de _CTES_DESAYUNO que añade la clasificación por Tipo Desayuno
# (ver _TODOS_TIPOS_DESAYUNO), sin filtrar por ella — fetch_desayunos_por_tipo
# (más abajo) trae SIEMPRE el desglose completo de los 4 tipos, cacheado sin
# depender de qué tipos se pidieron. Antes (hasta 2026-09-02) el filtro de
# Producto elegía en tiempo de consulta entre esta query y una variante con
# WHERE tipo_desayuno = ANY(...), así que cada combinación de tipos era una
# entrada de caché distinta y una consulta nueva contra Odoo — cambiar
# Producto era tan lento como cambiar de Periodo (reportado: "los filtros
# tardan mucho en cargar"). Con el desglose siempre completo, fetch_desayunos
# pasa a ser un compuesto que solo suma en Python (mismo patrón que
# fetch_ud_desayunos_produccion en kpis-definiciones.md) — cambiar Producto
# ya no toca la base de datos en absoluto tras el primer fetch del periodo.
_CTES_DESAYUNO_CON_TIPO = (
    _CTES_DESAYUNO
    + """,
    -- productos_desayuno puede tener varias filas por product_id (un mismo
    -- producto puede estar ligado a más de un régimen/room-type-line), por
    -- eso se deduplica el product_id ANTES de unir con product_template: si
    -- no, el join de abajo (pty.product_id = fsl.product_id) multiplicaría
    -- filas de fsl por cada fila duplicada, inflando las sumas por encima
    -- del total real (bug de cardinalidad verificado 2026-08-24, mismo
    -- patrón que la CTE "facturado" ya evita para las facturas).
    producto_tipo AS (
        SELECT pid.product_id,
               CASE
                   WHEN pt.name->>'es_ES' ILIKE '%%express%%' THEN 'express'
                   WHEN pt.name->>'es_ES' ILIKE '%%buffet%%' THEN 'buffet'
                   WHEN pt.name->>'es_ES' ILIKE '%%colaborador%%' THEN 'colaborador'
                   ELSE 'otros'
               END AS tipo_desayuno
        FROM (SELECT DISTINCT product_id FROM productos_desayuno) pid
        JOIN product_product pp ON pp.id = pid.product_id
        JOIN product_template pt ON pt.id = pp.product_tmpl_id
    )
"""
)

_DESAYUNOS_POR_TIPO_SQL = (
    _CTES_DESAYUNO_CON_TIPO
    + """
    SELECT
        fsl.pms_property_id,
        pty.tipo_desayuno,
        SUM(fsl.product_uom_qty) FILTER (WHERE pd.default_code != ALL(%(colaborador)s)) AS cantidad_directa,
        SUM(fsl.product_uom_qty) AS cantidad_total,
        SUM(fsl.product_uom_qty) FILTER (WHERE f.sale_line_id IS NOT NULL) AS cantidad_facturada,
        SUM(fsl.product_uom_qty) FILTER (WHERE f.sale_line_id IS NULL) AS cantidad_sin_facturar,
        SUM(COALESCE(f.monto_facturado, fsl.price_subtotal)) AS produccion_total,
        SUM(f.monto_facturado) FILTER (WHERE f.sale_line_id IS NOT NULL) AS produccion_facturada,
        SUM(fsl.price_subtotal) FILTER (WHERE f.sale_line_id IS NULL) AS produccion_sin_facturar
    FROM folio_sale_line fsl
    JOIN productos_desayuno pd ON pd.product_id = fsl.product_id
    JOIN producto_tipo pty ON pty.product_id = fsl.product_id
    LEFT JOIN facturado f ON f.sale_line_id = fsl.id
    WHERE fsl.date_order BETWEEN %(desde)s AND %(hasta)s
      AND fsl.state NOT IN ('draft', 'cancel')
    GROUP BY fsl.pms_property_id, pty.tipo_desayuno
"""
)

_SERIE_MENSUAL_SQL = (
    _CTES_DESAYUNO
    + """
    SELECT
        date_trunc('month', fsl.date_order)::date,
        SUM(fsl.product_uom_qty) AS cantidad_total,
        SUM(COALESCE(f.monto_facturado, fsl.price_subtotal)) AS produccion_total
    FROM folio_sale_line fsl
    JOIN productos_desayuno pd ON pd.product_id = fsl.product_id
    LEFT JOIN facturado f ON f.sale_line_id = fsl.id
    WHERE fsl.date_order BETWEEN %(desde)s AND %(hasta)s
      AND fsl.state NOT IN ('draft', 'cancel')
    GROUP BY 1
    ORDER BY 1
"""
)

# Variante con filtro de Producto y/o Hotel, para Tendencias (2026-09-03) —
# mismo patrón que _TURNOS_DESAYUNO_FILTRADO_SQL: una segunda consulta con
# los JOIN/WHERE de más, en vez de meterlos siempre con un IS NULL OR,
# para no arriesgar el plan de ejecución del camino sin filtrar (cadena
# completa, precalentado por el cron cada hora).
_SERIE_MENSUAL_FILTRADO_SQL = (
    _CTES_DESAYUNO_CON_TIPO
    + """
    SELECT
        date_trunc('month', fsl.date_order)::date,
        SUM(fsl.product_uom_qty) AS cantidad_total,
        SUM(COALESCE(f.monto_facturado, fsl.price_subtotal)) AS produccion_total
    FROM folio_sale_line fsl
    JOIN productos_desayuno pd ON pd.product_id = fsl.product_id
    JOIN producto_tipo pty ON pty.product_id = fsl.product_id
    LEFT JOIN facturado f ON f.sale_line_id = fsl.id
    WHERE fsl.date_order BETWEEN %(desde)s AND %(hasta)s
      AND fsl.state NOT IN ('draft', 'cancel')
      AND pty.tipo_desayuno = ANY(%(tipos)s)
      AND (%(hotel_ids)s::int[] IS NULL OR fsl.pms_property_id = ANY(%(hotel_ids)s))
    GROUP BY 1
    ORDER BY 1
"""
)

_DESAYUNOS_MENSUAL_HOTEL_SQL = (
    _CTES_DESAYUNO
    + """
    SELECT
        date_trunc('month', fsl.date_order)::date,
        SUM(fsl.product_uom_qty) FILTER (WHERE pd.default_code != ALL(%(colaborador)s)) AS cantidad_directa,
        SUM(fsl.product_uom_qty) AS cantidad_total,
        SUM(fsl.product_uom_qty) FILTER (WHERE f.sale_line_id IS NOT NULL) AS cantidad_facturada,
        SUM(fsl.product_uom_qty) FILTER (WHERE f.sale_line_id IS NULL) AS cantidad_sin_facturar,
        SUM(COALESCE(f.monto_facturado, fsl.price_subtotal)) AS produccion_total,
        SUM(f.monto_facturado) FILTER (WHERE f.sale_line_id IS NOT NULL) AS produccion_facturada,
        SUM(fsl.price_subtotal) FILTER (WHERE f.sale_line_id IS NULL) AS produccion_sin_facturar
    FROM folio_sale_line fsl
    JOIN productos_desayuno pd ON pd.product_id = fsl.product_id
    LEFT JOIN facturado f ON f.sale_line_id = fsl.id
    WHERE fsl.pms_property_id = %(hotel_id)s AND fsl.date_order BETWEEN %(desde)s AND %(hasta)s
      AND fsl.state NOT IN ('draft', 'cancel')
    GROUP BY 1
    ORDER BY 1
"""
)

# "Desglose por producto vendido": agrupa por NOMBRE real del producto de
# Odoo (no por Tipo Desayuno) — producto_nombre es el mismo patrón que
# producto_tipo (deduplicar product_id antes de unir con product_template,
# o se multiplican las sumas), solo que agrupando por nombre en vez de
# clasificar. Construida sobre folio_sale_line + el catálogo de régimen,
# la misma fuente que el resto de este módulo — decisión explícita
# 2026-09-03: NO reutilizar la consulta de kpis-definiciones.md
# (pms_service_line + una lista fija de product_id), que es de una fuente
# distinta y pondría una tercera cifra de "producción" en la ficha que no
# reconciliaría con Producción/Desayunos ya mostrados ahí.
_DESAYUNOS_POR_PRODUCTO_HOTEL_SQL = (
    _CTES_DESAYUNO_CON_TIPO
    + """,
    producto_nombre AS (
        SELECT pid.product_id, COALESCE(pt.name->>'es_ES', pt.name->>'en_US') AS nombre
        FROM (SELECT DISTINCT product_id FROM productos_desayuno) pid
        JOIN product_product pp ON pp.id = pid.product_id
        JOIN product_template pt ON pt.id = pp.product_tmpl_id
    )
    SELECT
        pn.nombre,
        SUM(fsl.product_uom_qty) AS unidades,
        SUM(COALESCE(f.monto_facturado, fsl.price_subtotal)) AS ventas
    FROM folio_sale_line fsl
    JOIN productos_desayuno pd ON pd.product_id = fsl.product_id
    JOIN producto_tipo pty ON pty.product_id = fsl.product_id
    JOIN producto_nombre pn ON pn.product_id = fsl.product_id
    LEFT JOIN facturado f ON f.sale_line_id = fsl.id
    WHERE fsl.pms_property_id = %(hotel_id)s AND fsl.date_order BETWEEN %(desde)s AND %(hasta)s
      AND fsl.state NOT IN ('draft', 'cancel')
      AND pty.tipo_desayuno = ANY(%(tipos)s)
    GROUP BY pn.nombre
    ORDER BY ventas DESC
"""
)


@cache_result
def fetch_desayunos_por_producto_hotel(
    hotel_id: int,
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
    tipos_desayuno: tuple[str, ...] | None = None,
) -> list[dict]:
    """Unidades vendidas y ventas € por producto (nombre real de Odoo) de un
    hotel — respeta el mismo filtro de Producto que "actual" (ver
    get_hotel_desayunos), para que no vuelva a pasar lo de "las fichas no
    muestran los mismos datos que la lista" con este desglose nuevo."""
    tipos = tipos_desayuno if tipos_desayuno is not None else _TODOS_TIPOS_DESAYUNO
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _DESAYUNOS_POR_PRODUCTO_HOTEL_SQL,
            {
                "regimenes": list(_REGIMENES_DESAYUNO),
                "hotel_id": hotel_id,
                "desde": fecha_inicio,
                "hasta": fecha_fin,
                "tipos": list(tipos),
            },
        )
        rows = cur.fetchall()
    return [{"producto": r[0] or "Sin nombre", "unidades": float(r[1] or 0), "ventas": float(r[2] or 0)} for r in rows]


@cache_result
def fetch_hoteles() -> list[dict]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_HOTELES_SQL)
        rows = cur.fetchall()
    return [{"id": r[0], "name": r[1], "property_code": r[2], "company_id": r[3]} for r in rows]


@cache_result
def fetch_companies() -> dict[int, str]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_COMPANIES_SQL)
        return dict(cur.fetchall())


@cache_result
def fetch_submarcas() -> dict[int, str | None]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_SUBMARCAS_SQL)
        rows = cur.fetchall()
    return dict(rows)


@cache_result
def fetch_alojados(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[int, int]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_ALOJADOS_SQL, [fecha_inicio, fecha_fin])
        rows = cur.fetchall()
    return {r[0]: int(r[1] or 0) for r in rows}


@cache_result
def fetch_calidad_checkin(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[int, dict]:
    """Declarado vs. check-in confirmado, solo fechas pasadas del rango (ver
    _CALIDAD_CHECKIN_SQL) — informe de auditoría, no reemplaza fetch_alojados."""
    with connections["odoo"].cursor() as cur:
        cur.execute(_CALIDAD_CHECKIN_SQL, [fecha_inicio, fecha_fin])
        rows = cur.fetchall()
    return {
        r[0]: {
            "declarado": int(r[1] or 0),
            "checkin": int(r[2] or 0),
            "reservasTotal": r[3],
            "reservasSinCheckin": r[4],
        }
        for r in rows
    }


_CLAVES_DESAYUNO = (
    "cantidad", "cantidad_total", "cantidad_facturada", "cantidad_sin_facturar",
    "produccion", "produccion_facturada", "produccion_sin_facturar",
)
_DESAYUNO_VACIO = dict.fromkeys(_CLAVES_DESAYUNO, 0.0)


@cache_result
def fetch_desayunos_por_tipo(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[int, dict[str, dict]]:
    """Desglose de fetch_desayunos por Tipo Desayuno (buffet/express/
    colaborador/otros) — KPI base real: fetch_desayunos (más abajo) es un
    compuesto que suma este desglose en Python, sin ninguna consulta propia,
    para que cambiar el filtro de Producto no dependa de qué combinación de
    tipos ya se pidió antes (ver comentario en _CTES_DESAYUNO_CON_TIPO)."""
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _DESAYUNOS_POR_TIPO_SQL,
            {"regimenes": list(_REGIMENES_DESAYUNO), "colaborador": list(_REGIMENES_COLABORADOR),
             "desde": fecha_inicio, "hasta": fecha_fin},
        )
        rows = cur.fetchall()
    resultado: dict[int, dict[str, dict]] = {}
    for hotel_id, tipo, c_directa, c_total, c_fact, c_sinfact, p_total, p_fact, p_sinfact in rows:
        resultado.setdefault(hotel_id, {})[tipo] = {
            "cantidad": float(c_directa or 0),
            "cantidad_total": float(c_total or 0),
            "cantidad_facturada": float(c_fact or 0),
            "cantidad_sin_facturar": float(c_sinfact or 0),
            "produccion": float(p_total or 0),
            "produccion_facturada": float(p_fact or 0),
            "produccion_sin_facturar": float(p_sinfact or 0),
        }
    return resultado


def fetch_desayunos(
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
    tipos_desayuno: tuple[str, ...] | None = None,
) -> dict[int, dict]:
    """Compuesto: suma fetch_desayunos_por_tipo para los tipos pedidos (todos
    si tipos_desayuno es None) — no ejecuta ninguna consulta SQL propia."""
    desglose = fetch_desayunos_por_tipo(fecha_inicio, fecha_fin)
    tipos = tipos_desayuno if tipos_desayuno is not None else _TODOS_TIPOS_DESAYUNO
    resultado: dict[int, dict] = {}
    for hotel_id, por_tipo in desglose.items():
        suma = dict(_DESAYUNO_VACIO)
        for tipo in tipos:
            d = por_tipo.get(tipo)
            if d is None:
                continue
            for clave in _CLAVES_DESAYUNO:
                suma[clave] += d[clave]
        resultado[hotel_id] = suma
    return resultado


@cache_result
def fetch_serie_mensual(
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
    tipos_desayuno: tuple[str, ...] | None = None,
    hotel_ids: tuple[int, ...] | None = None,
) -> list[dict]:
    """Sin filtro (tipos_desayuno=None y hotel_ids=None) usa la consulta de
    siempre, sin tocar — es la que precalienta el cron cada hora para la
    cadena completa. Con cualquiera de los dos usa la variante filtrada
    (mismo patrón que fetch_turnos_desayuno)."""
    filtrado = (tipos_desayuno is not None and set(tipos_desayuno) != set(_TODOS_TIPOS_DESAYUNO)) or hotel_ids is not None
    params = {"regimenes": list(_REGIMENES_DESAYUNO), "desde": fecha_inicio, "hasta": fecha_fin}
    if filtrado:
        sql = _SERIE_MENSUAL_FILTRADO_SQL
        params["tipos"] = list(tipos_desayuno) if tipos_desayuno is not None else list(_TODOS_TIPOS_DESAYUNO)
        params["hotel_ids"] = list(hotel_ids) if hotel_ids is not None else None
    else:
        sql = _SERIE_MENSUAL_SQL
    with connections["odoo"].cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return [{"mes": r[0].isoformat(), "desayunos": float(r[1] or 0), "produccion": float(r[2] or 0)} for r in rows]


# Mismas métricas que arriba, pero para un solo hotel y agrupadas por mes
# (ficha individual de hotel).
@cache_result
def fetch_alojados_mensual_hotel(hotel_id: int, fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[str, int]:
    with connections["odoo"].cursor() as cur:
        cur.execute(
            """
            SELECT date_trunc('month', rl.date)::date, SUM(COALESCE(r.adults, 0) + COALESCE(r.children_occupying, 0))
            FROM pms_reservation_line rl
            JOIN pms_reservation r ON r.id = rl.reservation_id
            WHERE rl.pms_property_id = %s AND rl.date BETWEEN %s AND %s AND rl.overnight_room = true
              AND r.reservation_type = 'normal' AND rl.state NOT IN ('draft', 'cancel')
            GROUP BY 1
            ORDER BY 1
            """,
            [hotel_id, fecha_inicio, fecha_fin],
        )
        rows = cur.fetchall()
    return {r[0].isoformat(): int(r[1] or 0) for r in rows}


@cache_result
def fetch_desayunos_mensual_hotel(hotel_id: int, fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[str, dict]:
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _DESAYUNOS_MENSUAL_HOTEL_SQL,
            {
                "regimenes": list(_REGIMENES_DESAYUNO),
                "colaborador": list(_REGIMENES_COLABORADOR),
                "hotel_id": hotel_id,
                "desde": fecha_inicio,
                "hasta": fecha_fin,
            },
        )
        rows = cur.fetchall()
    return {
        r[0].isoformat(): {
            "cantidad": float(r[1] or 0),
            "cantidad_total": float(r[2] or 0),
            "cantidad_facturada": float(r[3] or 0),
            "cantidad_sin_facturar": float(r[4] or 0),
            "produccion": float(r[5] or 0),
            "produccion_facturada": float(r[6] or 0),
            "produccion_sin_facturar": float(r[7] or 0),
        }
        for r in rows
    }


# Ingresos y gastos en la misma query (FILTER), por hotel: un único scan de
# account_move_line acotado a las cuentas que importan, no a todo el mayor.
#
# Saldo contable (credit-debit / debit-credit), no price_subtotal — verificado
# contra producción (2026-08-26, ver kpis-definiciones.md punto 3):
# price_subtotal no invierte signo en abonos (out_refund/in_refund suman en
# vez de restar) y vale 0 en asientos manuales (move_type='entry', que sí
# tienen saldo real). Medido en cadena completa, cuenta 70500000020: 24.112
# líneas out_refund con price_subtotal positivo (388.889,14 €, debería restar)
# y 35 líneas entry con price_subtotal=0 pero saldo real de 149.237,36 € -
# con price_subtotal sin corregir, ingresos salía inflado en más de 600.000 €
# de cadena. Incluía también fetch_vendedores_desayuno/_hotel (mismo bug,
# misma cuenta de ingreso) — esas dos funciones ya no existen: sustituidas
# (2026-08-28) por fetch_turnos_desayuno/_hotel, que no usa account_move_line
# en absoluto (ver _TURNOS_DESAYUNO_SQL, protección de datos de empleados).
#
# "unidades" (denominador de precioMedioVenta/costeMedioGasto en
# service._fnb_json): mismo problema de signo que ingresos/gastos tenían con
# price_subtotal, verificado en cadena completa sobre la cuenta de ingreso —
# out_refund suma +74.040,17 uds en vez de restar, y las 35 líneas 'entry'
# (asientos manuales) aportan 1 unidad fantasma cada una (quantity=1 por
# defecto, no representan un desayuno vendido). Corregido: solo
# out_invoice/out_refund cuentan, con signo (CASE), 'entry' y cualquier otro
# move_type aportan 0.
#
# Fallback por cuenta analítica (2026-08-27, hallazgo trasladado desde
# kpis-definiciones.md): aml.pms_property_id viene NULL en asientos del
# diario "Operaciones Varias" (periodificaciones, move_type='entry') que no
# se registran contra un hotel PMS directamente. Antes, esas líneas se
# agrupaban bajo pms_property_id=NULL y fetch_fnb_desayuno las descartaba
# (`if r[0] is not None`) — silenciosamente, ni error ni aviso. La mayoría
# sí tiene aml.hotel_analytic_account_id relleno (mismo campo que ya usa
# _PRESUPUESTO_SQL para unir presupuesto a hotel), así que se resuelve por
# ahí como alternativa. Verificado contra producción: cuenta 70500000020
# (ingresos) no tiene ninguna línea afectada; cuenta 60100000001 (gastos)
# sí — 81 líneas con aml.pms_property_id NULL, de las cuales 76 se resuelven
# con este fallback (5 quedan sin hotel resoluble, asientos de cierre de
# 2022-12-31 sin analítica tampoco). Los 3 hoteles de referencia (Sada
# Marina/Alda Palacio Valdés/Alda Valladolid Sur) no tienen ninguna línea
# afectada — el fallback no les cambia nada. Sí cambian, entre otros,
# Alda Alborán Rooms (id 81, −83,72 € en gastos, histórico completo) y
# Alda Don Carlos (id 105, −59,72 €).
_FNB_SQL = """
    SELECT
        COALESCE(aml.pms_property_id, pp.id),
        SUM(aml.credit - aml.debit) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS ingresos,
        SUM(CASE am.move_type WHEN 'out_invoice' THEN aml.quantity WHEN 'out_refund' THEN -aml.quantity ELSE 0 END)
          FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS unidades,
        SUM(aml.debit - aml.credit) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s)) AS gastos
    FROM account_move_line aml
    JOIN account_account aa ON aa.id = aml.account_id
    JOIN account_move am ON am.id = aml.move_id
    LEFT JOIN pms_property pp ON pp.analytic_account_id = aml.hotel_analytic_account_id AND aml.pms_property_id IS NULL
    WHERE am.state = 'posted'
      AND aml.date BETWEEN %(desde)s AND %(hasta)s
      AND (aa.code = %(cuenta_ingreso)s OR aa.code = ANY(%(cuentas_gasto)s))
    GROUP BY COALESCE(aml.pms_property_id, pp.id)
"""

_FNB_MENSUAL_SQL = """
    SELECT
        date_trunc('month', aml.date)::date,
        SUM(aml.credit - aml.debit) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS ingresos,
        SUM(CASE am.move_type WHEN 'out_invoice' THEN aml.quantity WHEN 'out_refund' THEN -aml.quantity ELSE 0 END)
          FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS unidades,
        SUM(aml.debit - aml.credit) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s)) AS gastos
    FROM account_move_line aml
    JOIN account_account aa ON aa.id = aml.account_id
    JOIN account_move am ON am.id = aml.move_id
    WHERE am.state = 'posted'
      AND aml.date BETWEEN %(desde)s AND %(hasta)s
      AND (aa.code = %(cuenta_ingreso)s OR aa.code = ANY(%(cuentas_gasto)s))
    GROUP BY 1
    ORDER BY 1
"""

# Variante con filtro de Hotel para Tendencias — mismo fallback por cuenta
# analítica que _FNB_SQL (ver el aviso largo más arriba: aml.pms_property_id
# viene NULL en asientos de "Operaciones Varias", se resuelve por
# aml.hotel_analytic_account_id). Sin filtro de Producto: ninguna consulta
# contable de esta app lo admite (las cuentas no se desglosan por tipo de
# desayuno), igual que en la ficha de un hotel.
_FNB_MENSUAL_FILTRADO_SQL = """
    SELECT
        date_trunc('month', aml.date)::date,
        SUM(aml.credit - aml.debit) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS ingresos,
        SUM(CASE am.move_type WHEN 'out_invoice' THEN aml.quantity WHEN 'out_refund' THEN -aml.quantity ELSE 0 END)
          FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS unidades,
        SUM(aml.debit - aml.credit) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s)) AS gastos
    FROM account_move_line aml
    JOIN account_account aa ON aa.id = aml.account_id
    JOIN account_move am ON am.id = aml.move_id
    LEFT JOIN pms_property pp ON pp.analytic_account_id = aml.hotel_analytic_account_id AND aml.pms_property_id IS NULL
    WHERE am.state = 'posted'
      AND aml.date BETWEEN %(desde)s AND %(hasta)s
      AND (aa.code = %(cuenta_ingreso)s OR aa.code = ANY(%(cuentas_gasto)s))
      AND COALESCE(aml.pms_property_id, pp.id) = ANY(%(hotel_ids)s)
    GROUP BY 1
    ORDER BY 1
"""

# Presupuesto de desayuno: combina DOS fuentes (decisión 2026-09-02,
# corregida sobre la marcha — primero se planteó sustituir Odoo por la hoja
# de Finanzas, pero "hay que traer también el dato de Odoo, creo que sería
# bueno indicar de dónde viene el dato"):
#   - Odoo (account_move_budget_line, confirmed-only): el presupuesto
#     oficial ya confirmado en contabilidad, cuando existe. Prioritario.
#   - La hoja de Finanzas "PRESUPUESTOS F&B" (PresupuestoDesayunoMensual,
#     importada por management/commands/importar_presupuesto_fb.py):
#     rellena los meses/hoteles donde Odoo todavía no tiene nada
#     confirmado (ver aviso de cobertura en kpis-definiciones.md — solo
#     cubre algunos hoteles a partir de octubre 2026).
# El origen efectivamente usado por hotel/mes se expone en la API como
# "presupuestoOrigen" (ver fetch_presupuesto_desayuno más abajo y
# hoteles/service.py::_fnb_json) — nunca se mezclan los dos dentro del
# mismo hotel/mes, se elige uno completo.
#
# El signo en contabilidad es al revés del que parece intuitivo: en una
# cuenta de ingreso el importe presupuestado vive en `credit` (balance =
# debit-credit sale negativo para ingresos); en una cuenta de gasto vive
# en `debit`. Por eso credit-debit para ingresos y debit-credit para
# gastos, no al revés. hotel_analytic_account_id =
# pms_property.analytic_account_id (verificado 2026-08-21) es como se une
# el presupuesto de Odoo a un hotel concreto.
_PRESUPUESTO_SQL = """
    SELECT
        p.id,
        SUM(bl.credit) FILTER (WHERE aa.code = %(cuenta_ingreso)s)
          - SUM(bl.debit) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS presupuesto_ingresos,
        SUM(bl.debit) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s))
          - SUM(bl.credit) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s)) AS presupuesto_gastos
    FROM account_move_budget_line bl
    JOIN account_account aa ON aa.id = bl.account_id
    JOIN account_move_budget b ON b.id = bl.budget_id
    JOIN pms_property p ON p.analytic_account_id = bl.hotel_analytic_account_id
    WHERE b.state = 'confirmed'
      AND date_trunc('month', bl.date) BETWEEN date_trunc('month', %(desde)s) AND date_trunc('month', %(hasta)s)
      AND (aa.code = %(cuenta_ingreso)s OR aa.code = ANY(%(cuentas_gasto)s))
    GROUP BY p.id
"""

_PRESUPUESTO_MENSUAL_SQL = """
    SELECT
        date_trunc('month', bl.date)::date,
        SUM(bl.credit) FILTER (WHERE aa.code = %(cuenta_ingreso)s)
          - SUM(bl.debit) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS presupuesto_ingresos,
        SUM(bl.debit) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s))
          - SUM(bl.credit) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s)) AS presupuesto_gastos
    FROM account_move_budget_line bl
    JOIN account_account aa ON aa.id = bl.account_id
    JOIN account_move_budget b ON b.id = bl.budget_id
    WHERE b.state = 'confirmed'
      AND date_trunc('month', bl.date) BETWEEN date_trunc('month', %(desde)s) AND date_trunc('month', %(hasta)s)
      AND (aa.code = %(cuenta_ingreso)s OR aa.code = ANY(%(cuentas_gasto)s))
    GROUP BY 1
    ORDER BY 1
"""

# Variante con filtro de Hotel para Tendencias — mismo JOIN que
# _PRESUPUESTO_MENSUAL_HOTEL_SQL (analítica de la línea de presupuesto ->
# pms_property), pero para una lista de hoteles en vez de uno solo.
_PRESUPUESTO_MENSUAL_FILTRADO_SQL = """
    SELECT
        date_trunc('month', bl.date)::date,
        SUM(bl.credit) FILTER (WHERE aa.code = %(cuenta_ingreso)s)
          - SUM(bl.debit) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS presupuesto_ingresos,
        SUM(bl.debit) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s))
          - SUM(bl.credit) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s)) AS presupuesto_gastos
    FROM account_move_budget_line bl
    JOIN account_account aa ON aa.id = bl.account_id
    JOIN account_move_budget b ON b.id = bl.budget_id
    JOIN pms_property p ON p.analytic_account_id = bl.hotel_analytic_account_id
    WHERE b.state = 'confirmed'
      AND date_trunc('month', bl.date) BETWEEN date_trunc('month', %(desde)s) AND date_trunc('month', %(hasta)s)
      AND (aa.code = %(cuenta_ingreso)s OR aa.code = ANY(%(cuentas_gasto)s))
      AND p.id = ANY(%(hotel_ids)s)
    GROUP BY 1
    ORDER BY 1
"""

_PRESUPUESTO_MENSUAL_HOTEL_SQL = """
    SELECT
        date_trunc('month', bl.date)::date,
        SUM(bl.credit) FILTER (WHERE aa.code = %(cuenta_ingreso)s)
          - SUM(bl.debit) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS presupuesto_ingresos,
        SUM(bl.debit) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s))
          - SUM(bl.credit) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s)) AS presupuesto_gastos
    FROM account_move_budget_line bl
    JOIN account_account aa ON aa.id = bl.account_id
    JOIN account_move_budget b ON b.id = bl.budget_id
    JOIN pms_property p ON p.analytic_account_id = bl.hotel_analytic_account_id
    WHERE p.id = %(hotel_id)s AND b.state = 'confirmed'
      AND date_trunc('month', bl.date) BETWEEN date_trunc('month', %(desde)s) AND date_trunc('month', %(hasta)s)
      AND (aa.code = %(cuenta_ingreso)s OR aa.code = ANY(%(cuentas_gasto)s))
    GROUP BY 1
    ORDER BY 1
"""

# fecha_inicio.replace(day=1) en el filtro inferior de las funciones Excel
# (más abajo): replica a propósito el date_trunc('month', ...) que ya hace
# la consulta de Odoo sobre "desde" (mes/año fiscal/rango custom pueden
# llegar con fecha_inicio que no sea día 1 en la serie de 12 meses de
# get_resumen) — el límite superior no necesita el mismo tratamiento
# porque "mes" siempre es día 1, así que "mes <= fecha_fin" ya equivale a
# compararlo truncado.

# Reemplaza el antiguo ranking "Vendedores" (nombre de la persona que creó
# la línea contable, dato personal/laboral — ver instrucciones de
# organización sobre protección de datos de empleados) por un desglose SIN
# nombres: unidades de desayuno por turno (franja horaria) y canal de venta.
#
# Usa folio_sale_line (mismo criterio de desayuno/reserva viva que
# fetch_desayunos: catálogo real de régimen, fsl.state NOT IN
# ('draft','cancel')) en vez de account_move_line — verificado contra
# producción (julio 2026) que account_move_line.create_date NO sirve para
# esto: >6.500 líneas (la mayoría del mes) caen todas en la hora 23h,
# dominadas por un proceso automático de asiento nocturno ("OdooBot"), no
# por venta real. folio_sale_line.create_date sí tiene una distribución
# horaria plausible (pico 07-14h, horario de desayuno) porque son líneas
# creadas por recepción/PMS en el momento del servicio, no un batch
# contable posterior.
#
# Limitaciones sin confirmar (mismo precedente que kpis-definiciones.md,
# sección "Desayunos de producción, por turno y tipo de usuario" —
# análisis interno nunca llevado a repository.py, aquí adaptado a
# folio_sale_line para que "unidades" cuadre con "desayunos"/"producción"
# del resto de la app en vez de con pms_service_line):
# - Las franjas horarias (07-15/15-23/23-7) son una convención de turnos
#   habituales, decidida con el usuario (2026-08-28) sabiendo que no está
#   confirmada contra el horario real de cada hotel.
# - "canal" es una heurística sobre el patrón del login de quien creó la
#   línea (@sh360 -> central de reservas, roomdoo/Wubook -> automático,
#   resto -> recepción del hotel), no un catálogo mantenido ni un dato
#   fiable al 100% si aparecen logins con otros patrones.
#
# produccion_facturada/produccion_sin_facturar (2026-08-28): mismo
# desglose "Facturado / Sin facturar" ya usado en _DESAYUNOS_SQL (CTE
# "facturado" de _CTES_DESAYUNO, factura posted vinculada vía
# folio_sale_line_invoice_rel) — no es un cálculo nuevo, se reutiliza tal
# cual para la dimensión turno/canal en vez de hotel.
_TURNOS_DESAYUNO_SQL = (
    _CTES_DESAYUNO
    + """
    SELECT
        CASE
            WHEN EXTRACT(HOUR FROM (fsl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) >= 7
                 AND EXTRACT(HOUR FROM (fsl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) < 15
                THEN 'manana_07_15'
            WHEN EXTRACT(HOUR FROM (fsl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) >= 15
                 AND EXTRACT(HOUR FROM (fsl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) < 23
                THEN 'tarde_15_23'
            ELSE 'noche_23_07'
        END AS turno,
        CASE
            WHEN ru.login ILIKE '%%@sh360%%' THEN 'central_reservas'
            WHEN ru.login ILIKE '%%roomdoo%%' OR ru.login ILIKE 'Wubook %%' THEN 'automatico'
            WHEN ru.login IS NULL THEN 'sin_usuario'
            ELSE 'recepcion_hotel'
        END AS canal,
        SUM(fsl.product_uom_qty) AS unidades,
        SUM(f.monto_facturado) FILTER (WHERE f.sale_line_id IS NOT NULL) AS produccion_facturada,
        SUM(fsl.price_subtotal) FILTER (WHERE f.sale_line_id IS NULL) AS produccion_sin_facturar
    FROM folio_sale_line fsl
    JOIN productos_desayuno pd ON pd.product_id = fsl.product_id
    LEFT JOIN facturado f ON f.sale_line_id = fsl.id
    LEFT JOIN res_users ru ON ru.id = fsl.create_uid
    WHERE fsl.date_order BETWEEN %(desde)s AND %(hasta)s
      AND fsl.state NOT IN ('draft', 'cancel')
    GROUP BY 1, 2
"""
)

# Variante de _TURNOS_DESAYUNO_SQL con clasificación por Tipo Desayuno y
# filtro opcional por lista de hoteles (zona/submarca/búsqueda de hotel del
# frontend, resueltas ahí a una lista de IDs — esos filtros son client-side
# y no tienen columna propia que unir en SQL). Deliberadamente UNA QUERY
# APARTE, mismo motivo que _DESAYUNOS_SQL_CON_TIPO (ver arriba): el camino
# sin ningún filtro (Producto en "todos" y sin restricción de hotel) sigue
# ejecutando _TURNOS_DESAYUNO_SQL sin tocar, byte a byte — cero riesgo de
# cambiar los números ya validados y desplegados cuando no se pide ningún
# filtro (2026-08-28, pedido explícito: "opción completa" tras encontrar
# que Turnos ignoraba Hotel/Zona/Submarca/Producto).
_TURNOS_DESAYUNO_FILTRADO_SQL = (
    _CTES_DESAYUNO_CON_TIPO
    + """
    SELECT
        CASE
            WHEN EXTRACT(HOUR FROM (fsl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) >= 7
                 AND EXTRACT(HOUR FROM (fsl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) < 15
                THEN 'manana_07_15'
            WHEN EXTRACT(HOUR FROM (fsl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) >= 15
                 AND EXTRACT(HOUR FROM (fsl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) < 23
                THEN 'tarde_15_23'
            ELSE 'noche_23_07'
        END AS turno,
        CASE
            WHEN ru.login ILIKE '%%@sh360%%' THEN 'central_reservas'
            WHEN ru.login ILIKE '%%roomdoo%%' OR ru.login ILIKE 'Wubook %%' THEN 'automatico'
            WHEN ru.login IS NULL THEN 'sin_usuario'
            ELSE 'recepcion_hotel'
        END AS canal,
        SUM(fsl.product_uom_qty) AS unidades,
        SUM(f.monto_facturado) FILTER (WHERE f.sale_line_id IS NOT NULL) AS produccion_facturada,
        SUM(fsl.price_subtotal) FILTER (WHERE f.sale_line_id IS NULL) AS produccion_sin_facturar
    FROM folio_sale_line fsl
    JOIN productos_desayuno pd ON pd.product_id = fsl.product_id
    JOIN producto_tipo pty ON pty.product_id = fsl.product_id
    LEFT JOIN facturado f ON f.sale_line_id = fsl.id
    LEFT JOIN res_users ru ON ru.id = fsl.create_uid
    WHERE fsl.date_order BETWEEN %(desde)s AND %(hasta)s
      AND fsl.state NOT IN ('draft', 'cancel')
      AND pty.tipo_desayuno = ANY(%(tipos)s)
      AND (%(hotel_ids)s::int[] IS NULL OR fsl.pms_property_id = ANY(%(hotel_ids)s))
    GROUP BY 1, 2
"""
)

# Variantes por hotel de las tres queries de arriba (fnb mensual, presupuesto
# mensual, turnos), para la ficha individual — mismas cuentas y mismas
# reglas, solo con el filtro de hotel añadido.
_FNB_MENSUAL_HOTEL_SQL = """
    SELECT
        date_trunc('month', aml.date)::date,
        SUM(aml.credit - aml.debit) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS ingresos,
        SUM(CASE am.move_type WHEN 'out_invoice' THEN aml.quantity WHEN 'out_refund' THEN -aml.quantity ELSE 0 END)
          FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS unidades,
        SUM(aml.debit - aml.credit) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s)) AS gastos
    FROM account_move_line aml
    JOIN account_account aa ON aa.id = aml.account_id
    JOIN account_move am ON am.id = aml.move_id
    LEFT JOIN pms_property pp ON pp.analytic_account_id = aml.hotel_analytic_account_id AND aml.pms_property_id IS NULL
    WHERE COALESCE(aml.pms_property_id, pp.id) = %(hotel_id)s AND am.state = 'posted'
      AND aml.date BETWEEN %(desde)s AND %(hasta)s
      AND (aa.code = %(cuenta_ingreso)s OR aa.code = ANY(%(cuentas_gasto)s))
    GROUP BY 1
    ORDER BY 1
"""

_TURNOS_DESAYUNO_HOTEL_SQL = (
    _CTES_DESAYUNO
    + """
    SELECT
        CASE
            WHEN EXTRACT(HOUR FROM (fsl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) >= 7
                 AND EXTRACT(HOUR FROM (fsl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) < 15
                THEN 'manana_07_15'
            WHEN EXTRACT(HOUR FROM (fsl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) >= 15
                 AND EXTRACT(HOUR FROM (fsl.create_date AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')) < 23
                THEN 'tarde_15_23'
            ELSE 'noche_23_07'
        END AS turno,
        CASE
            WHEN ru.login ILIKE '%%@sh360%%' THEN 'central_reservas'
            WHEN ru.login ILIKE '%%roomdoo%%' OR ru.login ILIKE 'Wubook %%' THEN 'automatico'
            WHEN ru.login IS NULL THEN 'sin_usuario'
            ELSE 'recepcion_hotel'
        END AS canal,
        SUM(fsl.product_uom_qty) AS unidades,
        SUM(f.monto_facturado) FILTER (WHERE f.sale_line_id IS NOT NULL) AS produccion_facturada,
        SUM(fsl.price_subtotal) FILTER (WHERE f.sale_line_id IS NULL) AS produccion_sin_facturar
    FROM folio_sale_line fsl
    JOIN productos_desayuno pd ON pd.product_id = fsl.product_id
    LEFT JOIN facturado f ON f.sale_line_id = fsl.id
    LEFT JOIN res_users ru ON ru.id = fsl.create_uid
    WHERE fsl.pms_property_id = %(hotel_id)s AND fsl.date_order BETWEEN %(desde)s AND %(hasta)s
      AND fsl.state NOT IN ('draft', 'cancel')
    GROUP BY 1, 2
"""
)


@cache_result
def fetch_fnb_desayuno(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[int, dict]:
    """Ingresos/gastos/unidades de desayuno por hotel, vía contabilidad
    (cuenta 70500000020 y cuentas de compra de materia prima F&B)."""
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _FNB_SQL,
            {
                "cuenta_ingreso": _CUENTA_INGRESO_DESAYUNO,
                "cuentas_gasto": list(_CUENTAS_GASTO_DESAYUNO),
                "desde": fecha_inicio,
                "hasta": fecha_fin,
            },
        )
        rows = cur.fetchall()
    return {
        r[0]: {"ingresos": float(r[1] or 0), "unidades": float(r[2] or 0), "gastos": float(r[3] or 0)}
        for r in rows
        if r[0] is not None
    }


@cache_result
def fetch_presupuesto_desayuno_odoo(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[int, dict]:
    """Presupuesto confirmado en Odoo (account_move_budget_line) por
    hotel — cobertura parcial, ver aviso en kpis-definiciones.md."""
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _PRESUPUESTO_SQL,
            {
                "cuenta_ingreso": _CUENTA_INGRESO_DESAYUNO,
                "cuentas_gasto": list(_CUENTAS_GASTO_DESAYUNO),
                "desde": fecha_inicio,
                "hasta": fecha_fin,
            },
        )
        rows = cur.fetchall()
    return {
        r[0]: {"presupuestoIngresos": float(r[1] or 0), "presupuestoGastos": float(r[2] or 0)}
        for r in rows
        if r[0] is not None
    }


@cache_result
def fetch_presupuesto_desayuno_excel(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[int, dict]:
    """Previsión de desayuno por hotel, calculada a partir de los 4
    componentes de la hoja de Finanzas (PresupuestoDesayunoMensual):
    ingresos = alojados_previstos × penetracion_prevista × precio_interno;
    gastos = lo mismo × coste_interno en vez de precio. La fórmula vive
    aquí a propósito (no en la hoja ni en el comando de importación) para
    que sea visible y auditable."""
    from ..models import PresupuestoDesayunoMensual

    codigo_a_id = {h["property_code"]: h["id"] for h in fetch_hoteles() if h["property_code"]}
    filas = PresupuestoDesayunoMensual.objects.filter(
        mes__gte=fecha_inicio.replace(day=1), mes__lte=fecha_fin
    ).values("property_code", "alojados_previstos", "penetracion_prevista", "precio_interno", "coste_interno")
    resultado: dict[int, dict] = {}
    for fila in filas:
        hotel_id = codigo_a_id.get(fila["property_code"])
        if hotel_id is None:
            continue
        unidades = fila["alojados_previstos"] * fila["penetracion_prevista"]
        acc = resultado.setdefault(hotel_id, {"presupuestoIngresos": 0.0, "presupuestoGastos": 0.0})
        acc["presupuestoIngresos"] += unidades * fila["precio_interno"]
        acc["presupuestoGastos"] += unidades * fila["coste_interno"]
    return resultado


def _combinar_presupuesto(odoo: dict, excel: dict) -> dict:
    """Combina presupuesto de Odoo (prioritario, oficial confirmado) y de
    la hoja de Finanzas (respaldo) por clave (hotel_id o mes) — nunca se
    mezclan los dos dentro de la misma clave para la cifra "elegida"
    (presupuestoIngresos/Gastos), pero se conservan también los dos valores
    por separado (…Odoo/…Excel, None si esa fuente no tiene dato) para
    poder compararlos en el frontend — pedido explícito 2026-09-02:
    "vamos a poner los 2 presupuestos... para comparar".

    alojadosPrevistos/desayunosPrevistos (unidades, no €): solo existen en
    la variante mensual por hotel del Excel (fetch_presupuesto_serie_mensual_
    hotel_excel) — None en las demás llamadas (Odoo no tiene presupuesto en
    unidades, solo en €) y también None cuando gana Odoo para esa clave,
    aunque Excel sí tuviera unidades — de ahí para el gráfico "Alojados vs
    ud desayunos" (unidades, no dinero) hace falta mirar siempre la fuente
    Excel, gane o no la cifra en €."""
    resultado: dict = {}
    for clave in set(odoo) | set(excel):
        o, e = odoo.get(clave), excel.get(clave)
        elegido, origen = (o, "odoo") if o is not None else (e, "excel")
        resultado[clave] = {
            **elegido,
            "presupuestoOrigen": origen,
            "presupuestoIngresosOdoo": o["presupuestoIngresos"] if o else None,
            "presupuestoGastosOdoo": o["presupuestoGastos"] if o else None,
            "presupuestoIngresosExcel": e["presupuestoIngresos"] if e else None,
            "presupuestoGastosExcel": e["presupuestoGastos"] if e else None,
            "alojadosPrevistos": e.get("alojadosPrevistos") if e else None,
            "desayunosPrevistos": e.get("desayunosPrevistos") if e else None,
        }
    return resultado


def fetch_presupuesto_desayuno(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[int, dict]:
    """Combina Odoo (prioritario, presupuesto oficial confirmado) y la
    hoja de Finanzas (rellena los hoteles/meses que Odoo no tiene
    confirmados todavía) — ver _combinar_presupuesto."""
    odoo = fetch_presupuesto_desayuno_odoo(fecha_inicio, fecha_fin)
    excel = fetch_presupuesto_desayuno_excel(fecha_inicio, fecha_fin)
    return _combinar_presupuesto(odoo, excel)


@cache_result
def fetch_presupuesto_serie_mensual_odoo(
    fecha_inicio: datetime.date, fecha_fin: datetime.date, hotel_ids: tuple[int, ...] | None = None
) -> dict[str, dict]:
    """Igual que fetch_presupuesto_desayuno_odoo pero agregado por mes
    (cadena completa, o restringido a hotel_ids para Tendencias), para
    comparar contra lo real en el gráfico de evolución."""
    params = {
        "cuenta_ingreso": _CUENTA_INGRESO_DESAYUNO,
        "cuentas_gasto": list(_CUENTAS_GASTO_DESAYUNO),
        "desde": fecha_inicio,
        "hasta": fecha_fin,
    }
    if hotel_ids is not None:
        sql = _PRESUPUESTO_MENSUAL_FILTRADO_SQL
        params["hotel_ids"] = list(hotel_ids)
    else:
        sql = _PRESUPUESTO_MENSUAL_SQL
    with connections["odoo"].cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return {
        r[0].isoformat(): {"presupuestoIngresos": float(r[1] or 0), "presupuestoGastos": float(r[2] or 0)}
        for r in rows
    }


@cache_result
def fetch_presupuesto_serie_mensual_excel(
    fecha_inicio: datetime.date, fecha_fin: datetime.date, hotel_ids: tuple[int, ...] | None = None
) -> dict[str, dict]:
    """Igual que fetch_presupuesto_desayuno_excel pero agregado por mes
    (cadena completa, o restringido a hotel_ids para Tendencias)."""
    from ..models import PresupuestoDesayunoMensual

    filas = PresupuestoDesayunoMensual.objects.filter(
        mes__gte=fecha_inicio.replace(day=1), mes__lte=fecha_fin
    ).values("mes", "property_code", "alojados_previstos", "penetracion_prevista", "precio_interno", "coste_interno")
    ids_permitidos = set(hotel_ids) if hotel_ids is not None else None
    codigo_a_id = {h["property_code"]: h["id"] for h in fetch_hoteles() if h["property_code"]} if ids_permitidos is not None else None
    resultado: dict[str, dict] = {}
    for fila in filas:
        if ids_permitidos is not None and codigo_a_id.get(fila["property_code"]) not in ids_permitidos:
            continue
        unidades = fila["alojados_previstos"] * fila["penetracion_prevista"]
        acc = resultado.setdefault(fila["mes"].isoformat(), {"presupuestoIngresos": 0.0, "presupuestoGastos": 0.0})
        acc["presupuestoIngresos"] += unidades * fila["precio_interno"]
        acc["presupuestoGastos"] += unidades * fila["coste_interno"]
    return resultado


def fetch_presupuesto_serie_mensual(
    fecha_inicio: datetime.date, fecha_fin: datetime.date, hotel_ids: tuple[int, ...] | None = None
) -> dict[str, dict]:
    """Igual que fetch_presupuesto_desayuno pero agregado por mes (cadena
    completa, o restringido a hotel_ids) — ver _combinar_presupuesto."""
    odoo = fetch_presupuesto_serie_mensual_odoo(fecha_inicio, fecha_fin, hotel_ids)
    excel = fetch_presupuesto_serie_mensual_excel(fecha_inicio, fecha_fin, hotel_ids)
    return _combinar_presupuesto(odoo, excel)


@cache_result
def fetch_fnb_serie_mensual(
    fecha_inicio: datetime.date, fecha_fin: datetime.date, hotel_ids: tuple[int, ...] | None = None
) -> dict[str, dict]:
    """Igual que fetch_fnb_desayuno pero agregado por mes (cadena completa,
    o restringido a hotel_ids para Tendencias), para el gráfico de
    evolución de ingresos/gastos/margen."""
    params = {
        "cuenta_ingreso": _CUENTA_INGRESO_DESAYUNO,
        "cuentas_gasto": list(_CUENTAS_GASTO_DESAYUNO),
        "desde": fecha_inicio,
        "hasta": fecha_fin,
    }
    if hotel_ids is not None:
        sql = _FNB_MENSUAL_FILTRADO_SQL
        params["hotel_ids"] = list(hotel_ids)
    else:
        sql = _FNB_MENSUAL_SQL
    with connections["odoo"].cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return {
        r[0].isoformat(): {"ingresos": float(r[1] or 0), "unidades": float(r[2] or 0), "gastos": float(r[3] or 0)}
        for r in rows
    }


@cache_result
def fetch_turnos_desayuno(
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
    tipos_desayuno: tuple[str, ...] | None = None,
    hotel_ids: tuple[int, ...] | None = None,
) -> list[dict]:
    """Unidades de desayuno por turno y canal, sin nombre de ninguna persona
    (ver _TURNOS_DESAYUNO_SQL). Cadena completa y sin restricción de hotel
    si no se pasa ningún filtro; con tipos_desayuno y/o hotel_ids usa
    _TURNOS_DESAYUNO_FILTRADO_SQL (mismo criterio de desayuno/reserva viva
    que fetch_desayunos)."""
    filtrado = (tipos_desayuno is not None and set(tipos_desayuno) != set(_TODOS_TIPOS_DESAYUNO)) or hotel_ids is not None
    params = {"regimenes": list(_REGIMENES_DESAYUNO), "desde": fecha_inicio, "hasta": fecha_fin}
    if filtrado:
        sql = _TURNOS_DESAYUNO_FILTRADO_SQL
        params["tipos"] = list(tipos_desayuno) if tipos_desayuno is not None else list(_TODOS_TIPOS_DESAYUNO)
        params["hotel_ids"] = list(hotel_ids) if hotel_ids is not None else None
    else:
        sql = _TURNOS_DESAYUNO_SQL
    with connections["odoo"].cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return [
        {
            "turno": r[0],
            "canal": r[1],
            "unidades": float(r[2] or 0),
            "produccionFacturada": float(r[3] or 0),
            "produccionSinFacturar": float(r[4] or 0),
        }
        for r in rows
    ]


@cache_result
def fetch_fnb_serie_mensual_hotel(hotel_id: int, fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[str, dict]:
    """Igual que fetch_fnb_serie_mensual pero para un único hotel (ficha individual)."""
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _FNB_MENSUAL_HOTEL_SQL,
            {
                "hotel_id": hotel_id,
                "cuenta_ingreso": _CUENTA_INGRESO_DESAYUNO,
                "cuentas_gasto": list(_CUENTAS_GASTO_DESAYUNO),
                "desde": fecha_inicio,
                "hasta": fecha_fin,
            },
        )
        rows = cur.fetchall()
    return {
        r[0].isoformat(): {"ingresos": float(r[1] or 0), "unidades": float(r[2] or 0), "gastos": float(r[3] or 0)}
        for r in rows
    }


@cache_result
def fetch_presupuesto_serie_mensual_hotel_odoo(
    hotel_id: int, fecha_inicio: datetime.date, fecha_fin: datetime.date
) -> dict[str, dict]:
    """Igual que fetch_presupuesto_serie_mensual_odoo pero para un único hotel."""
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _PRESUPUESTO_MENSUAL_HOTEL_SQL,
            {
                "hotel_id": hotel_id,
                "cuenta_ingreso": _CUENTA_INGRESO_DESAYUNO,
                "cuentas_gasto": list(_CUENTAS_GASTO_DESAYUNO),
                "desde": fecha_inicio,
                "hasta": fecha_fin,
            },
        )
        rows = cur.fetchall()
    return {
        r[0].isoformat(): {"presupuestoIngresos": float(r[1] or 0), "presupuestoGastos": float(r[2] or 0)}
        for r in rows
    }


@cache_result
def fetch_presupuesto_serie_mensual_hotel_excel(
    hotel_id: int, fecha_inicio: datetime.date, fecha_fin: datetime.date
) -> dict[str, dict]:
    """Igual que fetch_presupuesto_desayuno_excel pero para un único hotel, mes
    a mes. Además de los importes, expone alojadosPrevistos/desayunosPrevistos
    (unidades, no €) — antes se calculaban y se descartaban (solo se usaban
    para llegar al importe); hacen falta tal cual para el gráfico "Alojados
    vs ud desayunos" de la ficha de hotel (comparar unidades, no dinero)."""
    from ..models import PresupuestoDesayunoMensual

    property_code = next((h["property_code"] for h in fetch_hoteles() if h["id"] == hotel_id), None)
    if not property_code:
        return {}
    filas = PresupuestoDesayunoMensual.objects.filter(
        property_code=property_code, mes__gte=fecha_inicio.replace(day=1), mes__lte=fecha_fin
    ).values("mes", "alojados_previstos", "penetracion_prevista", "precio_interno", "coste_interno")
    resultado: dict[str, dict] = {}
    for fila in filas:
        unidades = fila["alojados_previstos"] * fila["penetracion_prevista"]
        resultado[fila["mes"].isoformat()] = {
            "presupuestoIngresos": unidades * fila["precio_interno"],
            "presupuestoGastos": unidades * fila["coste_interno"],
            "alojadosPrevistos": fila["alojados_previstos"],
            "desayunosPrevistos": unidades,
        }
    return resultado


def fetch_presupuesto_serie_mensual_hotel(
    hotel_id: int, fecha_inicio: datetime.date, fecha_fin: datetime.date
) -> dict[str, dict]:
    """Igual que fetch_presupuesto_serie_mensual pero para un único hotel
    (ficha individual) — ver _combinar_presupuesto."""
    odoo = fetch_presupuesto_serie_mensual_hotel_odoo(hotel_id, fecha_inicio, fecha_fin)
    excel = fetch_presupuesto_serie_mensual_hotel_excel(hotel_id, fecha_inicio, fecha_fin)
    return _combinar_presupuesto(odoo, excel)


@cache_result
def fetch_turnos_desayuno_hotel(hotel_id: int, fecha_inicio: datetime.date, fecha_fin: datetime.date) -> list[dict]:
    """Igual que fetch_turnos_desayuno pero para un único hotel (ficha individual)."""
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _TURNOS_DESAYUNO_HOTEL_SQL,
            {"regimenes": list(_REGIMENES_DESAYUNO), "hotel_id": hotel_id, "desde": fecha_inicio, "hasta": fecha_fin},
        )
        rows = cur.fetchall()
    return [
        {
            "turno": r[0],
            "canal": r[1],
            "unidades": float(r[2] or 0),
            "produccionFacturada": float(r[3] or 0),
            "produccionSinFacturar": float(r[4] or 0),
        }
        for r in rows
    ]
