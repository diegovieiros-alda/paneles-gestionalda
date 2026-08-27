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

# CTEs compartidas por las tres queries de desayuno de abajo.
#   productos_desayuno: qué product_id pertenece a un régimen de desayuno
#     (catálogo real, no nombre de producto).
#   facturado: importe realmente facturado por línea de folio, agregado por
#     si acaso una línea se dividió en varias líneas de factura (evita
#     multiplicar filas al unir 1:N — bug de cardinalidad verificado).
#     Prioridad: factura `posted` > producción (folio_sale_line.price_subtotal)
#     cuando no hay factura o aún no se ha emitido.
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
        JOIN account_move_line aml ON aml.id = ir.invoice_line_id
        JOIN account_move am ON am.id = aml.move_id AND am.state = 'posted'
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
_DESAYUNOS_SQL = (
    _CTES_DESAYUNO
    + """
    SELECT
        fsl.pms_property_id,
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
    WHERE fsl.date_order BETWEEN %(desde)s AND %(hasta)s
      AND fsl.state NOT IN ('draft', 'cancel')
    GROUP BY fsl.pms_property_id
"""
)

# Variante de _CTES_DESAYUNO/_DESAYUNOS_SQL que añade la clasificación por
# Tipo Desayuno (ver _TODOS_TIPOS_DESAYUNO) y filtra por ella. Deliberadamente
# UNA QUERY APARTE, no una modificación de las de arriba: así el camino sin
# filtro (tipos_desayuno=None o los 4 completos) sigue ejecutando la SQL
# original sin tocar, byte a byte — cero riesgo de cambiar el número de
# Penetración/Producción que ya usa toda la app cuando no se pide este filtro.
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

_DESAYUNOS_SQL_CON_TIPO = (
    _CTES_DESAYUNO_CON_TIPO
    + """
    SELECT
        fsl.pms_property_id,
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
      AND pty.tipo_desayuno = ANY(%(tipos)s)
    GROUP BY fsl.pms_property_id
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


@cache_result
def fetch_desayunos(
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
    tipos_desayuno: tuple[str, ...] | None = None,
) -> dict[int, dict]:
    filtrado = tipos_desayuno is not None and set(tipos_desayuno) != set(_TODOS_TIPOS_DESAYUNO)
    params = {
        "regimenes": list(_REGIMENES_DESAYUNO),
        "colaborador": list(_REGIMENES_COLABORADOR),
        "desde": fecha_inicio,
        "hasta": fecha_fin,
    }
    if filtrado:
        sql = _DESAYUNOS_SQL_CON_TIPO
        params["tipos"] = list(tipos_desayuno)
    else:
        sql = _DESAYUNOS_SQL
    with connections["odoo"].cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return {
        r[0]: {
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


@cache_result
def fetch_serie_mensual(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> list[dict]:
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _SERIE_MENSUAL_SQL,
            {"regimenes": list(_REGIMENES_DESAYUNO), "desde": fecha_inicio, "hasta": fecha_fin},
        )
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
# de cadena. Incluye también fetch_vendedores_desayuno/_hotel más abajo (mismo
# bug, misma cuenta de ingreso).
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

# Presupuesto (account.move.budget): mismas cuentas que Ingresos/Gastos
# reales, para poder comparar. La línea de presupuesto es mensual (fecha
# siempre día 1) y solo cuenta si el presupuesto está state='confirmed'
# (los 'draft' no son oficiales). El signo en contabilidad es al revés del
# que parece intuitivo: en una cuenta de ingreso el importe presupuestado
# vive en `credit` (balance = debit-credit sale negativo para ingresos);
# en una cuenta de gasto vive en `debit`. Por eso credit-debit para
# ingresos y debit-credit para gastos, no al revés.
# hotel_analytic_account_id = pms_property.analytic_account_id (verificado
# 2026-08-21) es como se une el presupuesto a un hotel concreto.
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

_VENDEDORES_SQL = """
    SELECT COALESCE(rp.name, ru.login, 'Sin asignar') AS vendedor,
           SUM(aml.credit - aml.debit) AS importe,
           COUNT(*) AS lineas
    FROM account_move_line aml
    JOIN account_account aa ON aa.id = aml.account_id
    JOIN account_move am ON am.id = aml.move_id
    LEFT JOIN res_users ru ON ru.id = aml.create_uid
    LEFT JOIN res_partner rp ON rp.id = ru.partner_id
    WHERE aa.code = %(cuenta_ingreso)s AND am.state = 'posted'
      AND aml.date BETWEEN %(desde)s AND %(hasta)s
    GROUP BY 1
    ORDER BY 2 DESC
"""

# Variantes por hotel de las tres queries de arriba (fnb mensual, presupuesto
# mensual, vendedores), para la ficha individual — mismas cuentas y mismas
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

_VENDEDORES_HOTEL_SQL = """
    SELECT COALESCE(rp.name, ru.login, 'Sin asignar') AS vendedor,
           SUM(aml.credit - aml.debit) AS importe,
           COUNT(*) AS lineas
    FROM account_move_line aml
    JOIN account_account aa ON aa.id = aml.account_id
    JOIN account_move am ON am.id = aml.move_id
    LEFT JOIN res_users ru ON ru.id = aml.create_uid
    LEFT JOIN res_partner rp ON rp.id = ru.partner_id
    LEFT JOIN pms_property pp ON pp.analytic_account_id = aml.hotel_analytic_account_id AND aml.pms_property_id IS NULL
    WHERE COALESCE(aml.pms_property_id, pp.id) = %(hotel_id)s AND aa.code = %(cuenta_ingreso)s AND am.state = 'posted'
      AND aml.date BETWEEN %(desde)s AND %(hasta)s
    GROUP BY 1
    ORDER BY 2 DESC
"""


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
def fetch_presupuesto_desayuno(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[int, dict]:
    """Presupuesto de ingresos/gastos de desayuno por hotel (account.move.budget,
    solo state='confirmed'), mismas cuentas que fetch_fnb_desayuno."""
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
def fetch_presupuesto_serie_mensual(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[str, dict]:
    """Igual que fetch_presupuesto_desayuno pero agregado por mes (cadena
    completa), para comparar contra lo real en el gráfico de evolución."""
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _PRESUPUESTO_MENSUAL_SQL,
            {
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
def fetch_fnb_serie_mensual(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[str, dict]:
    """Igual que fetch_fnb_desayuno pero agregado por mes (cadena completa),
    para el gráfico de evolución de ingresos/gastos/margen."""
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _FNB_MENSUAL_SQL,
            {
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
def fetch_vendedores_desayuno(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> list[dict]:
    """Top vendedores (usuario que creó la línea contable) por ingresos de
    desayuno, cadena completa — no por hotel."""
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _VENDEDORES_SQL,
            {"cuenta_ingreso": _CUENTA_INGRESO_DESAYUNO, "desde": fecha_inicio, "hasta": fecha_fin},
        )
        rows = cur.fetchall()
    return [{"vendedor": r[0], "importe": float(r[1] or 0), "lineas": r[2]} for r in rows]


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
def fetch_presupuesto_serie_mensual_hotel(hotel_id: int, fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[str, dict]:
    """Igual que fetch_presupuesto_serie_mensual pero para un único hotel (ficha individual)."""
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
def fetch_vendedores_desayuno_hotel(hotel_id: int, fecha_inicio: datetime.date, fecha_fin: datetime.date) -> list[dict]:
    """Igual que fetch_vendedores_desayuno pero para un único hotel (ficha individual)."""
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _VENDEDORES_HOTEL_SQL,
            {"hotel_id": hotel_id, "cuenta_ingreso": _CUENTA_INGRESO_DESAYUNO, "desde": fecha_inicio, "hasta": fecha_fin},
        )
        rows = cur.fetchall()
    return [{"vendedor": r[0], "importe": float(r[1] or 0), "lineas": r[2]} for r in rows]
