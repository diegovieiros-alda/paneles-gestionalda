"""Carga de datos reales desde Odoo para el listado de Hoteles: ocupación
(habitaciones-noche de huéspedes reales) y ventas de desayuno. Solo lectura,
mismo patrón que core/bloqueos/repository.py.

Odoo no tiene una categoría de producto para "desayuno" ni un campo de coste,
así que las ventas de desayuno se identifican por nombre de producto
(ILIKE 'desayuno' / 'breakfast') sobre folio_sale_line.
"""
from __future__ import annotations

import datetime

from django.db import connections

_HOTELES_SQL = """
    SELECT prop.id, partner.name, prop.pms_property_code, prop.company_id
    FROM pms_property prop
    JOIN res_partner partner ON partner.id = prop.partner_id
"""

_COMPANIES_SQL = "SELECT id, name FROM res_company"

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

# "Colaborador" (tarifas de partner/agencia) y "Desvio/Desvío Desayunos"
# (ajustes internos entre propiedades) no son venta directa a huésped: se
# excluyen porque distorsionan la penetración (líneas masivas atípicas
# pueden superar el número de huéspedes alojados).
_DESAYUNOS_SQL = """
    SELECT fsl.pms_property_id, SUM(fsl.product_uom_qty), SUM(fsl.price_subtotal)
    FROM folio_sale_line fsl
    JOIN product_product pp ON pp.id = fsl.product_id
    JOIN product_template pt ON pt.id = pp.product_tmpl_id
    WHERE fsl.date_order BETWEEN %s AND %s
      AND fsl.state NOT IN ('draft', 'cancel')
      AND (pt.name::text ILIKE %s OR pt.name::text ILIKE %s)
      AND pt.name::text NOT ILIKE %s
      AND pt.name::text NOT ILIKE %s
      AND pt.name::text NOT ILIKE %s
    GROUP BY fsl.pms_property_id
"""


def fetch_hoteles() -> list[dict]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_HOTELES_SQL)
        rows = cur.fetchall()
    return [{"id": r[0], "name": r[1], "property_code": r[2], "company_id": r[3]} for r in rows]


def fetch_companies() -> dict[int, str]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_COMPANIES_SQL)
        return dict(cur.fetchall())


def fetch_alojados(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[int, int]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_ALOJADOS_SQL, [fecha_inicio, fecha_fin])
        rows = cur.fetchall()
    return {r[0]: int(r[1] or 0) for r in rows}


def fetch_desayunos(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[int, dict]:
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _DESAYUNOS_SQL,
            [fecha_inicio, fecha_fin, "%desayuno%", "%breakfast%", "%colaborador%", "%desvio%", "%desvío%"],
        )
        rows = cur.fetchall()
    return {r[0]: {"cantidad": float(r[1] or 0), "produccion": float(r[2] or 0)} for r in rows}


# Serie mensual (cadena completa) de ventas de desayuno, mismos criterios de
# inclusión/exclusión que _DESAYUNOS_SQL, para el gráfico de evolución.
_SERIE_MENSUAL_SQL = """
    SELECT date_trunc('month', fsl.date_order)::date, SUM(fsl.product_uom_qty), SUM(fsl.price_subtotal)
    FROM folio_sale_line fsl
    JOIN product_product pp ON pp.id = fsl.product_id
    JOIN product_template pt ON pt.id = pp.product_tmpl_id
    WHERE fsl.date_order BETWEEN %s AND %s
      AND fsl.state NOT IN ('draft', 'cancel')
      AND (pt.name::text ILIKE %s OR pt.name::text ILIKE %s)
      AND pt.name::text NOT ILIKE %s
      AND pt.name::text NOT ILIKE %s
      AND pt.name::text NOT ILIKE %s
    GROUP BY 1
    ORDER BY 1
"""


def fetch_serie_mensual(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> list[dict]:
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _SERIE_MENSUAL_SQL,
            [fecha_inicio, fecha_fin, "%desayuno%", "%breakfast%", "%colaborador%", "%desvio%", "%desvío%"],
        )
        rows = cur.fetchall()
    return [{"mes": r[0].isoformat(), "desayunos": float(r[1] or 0), "produccion": float(r[2] or 0)} for r in rows]


# Mismas dos métricas que arriba, pero para un solo hotel y agrupadas por mes
# (ficha individual de hotel).
_ALOJADOS_MENSUAL_HOTEL_SQL = """
    SELECT date_trunc('month', rl.date)::date, SUM(COALESCE(r.adults, 0) + COALESCE(r.children_occupying, 0))
    FROM pms_reservation_line rl
    JOIN pms_reservation r ON r.id = rl.reservation_id
    WHERE rl.pms_property_id = %s AND rl.date BETWEEN %s AND %s AND rl.overnight_room = true
      AND r.reservation_type = 'normal' AND rl.state NOT IN ('draft', 'cancel')
    GROUP BY 1
    ORDER BY 1
"""

_DESAYUNOS_MENSUAL_HOTEL_SQL = """
    SELECT date_trunc('month', fsl.date_order)::date, SUM(fsl.product_uom_qty), SUM(fsl.price_subtotal)
    FROM folio_sale_line fsl
    JOIN product_product pp ON pp.id = fsl.product_id
    JOIN product_template pt ON pt.id = pp.product_tmpl_id
    WHERE fsl.pms_property_id = %s AND fsl.date_order BETWEEN %s AND %s
      AND fsl.state NOT IN ('draft', 'cancel')
      AND (pt.name::text ILIKE %s OR pt.name::text ILIKE %s)
      AND pt.name::text NOT ILIKE %s
      AND pt.name::text NOT ILIKE %s
      AND pt.name::text NOT ILIKE %s
    GROUP BY 1
    ORDER BY 1
"""


def fetch_alojados_mensual_hotel(hotel_id: int, fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[str, int]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_ALOJADOS_MENSUAL_HOTEL_SQL, [hotel_id, fecha_inicio, fecha_fin])
        rows = cur.fetchall()
    return {r[0].isoformat(): int(r[1] or 0) for r in rows}


def fetch_desayunos_mensual_hotel(hotel_id: int, fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[str, dict]:
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _DESAYUNOS_MENSUAL_HOTEL_SQL,
            [hotel_id, fecha_inicio, fecha_fin, "%desayuno%", "%breakfast%", "%colaborador%", "%desvio%", "%desvío%"],
        )
        rows = cur.fetchall()
    return {r[0].isoformat(): {"cantidad": float(r[1] or 0), "produccion": float(r[2] or 0)} for r in rows}
