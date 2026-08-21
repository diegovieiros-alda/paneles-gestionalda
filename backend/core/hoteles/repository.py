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
_DESAYUNOS_SQL = (
    _CTES_DESAYUNO
    + """
    SELECT
        fsl.pms_property_id,
        SUM(fsl.product_uom_qty) FILTER (WHERE pd.default_code != ALL(%(colaborador)s)) AS cantidad_directa,
        SUM(fsl.product_uom_qty) AS cantidad_total,
        SUM(COALESCE(f.monto_facturado, fsl.price_subtotal)) AS produccion_total
    FROM folio_sale_line fsl
    JOIN productos_desayuno pd ON pd.product_id = fsl.product_id
    LEFT JOIN facturado f ON f.sale_line_id = fsl.id
    WHERE fsl.date_order BETWEEN %(desde)s AND %(hasta)s
      AND fsl.state NOT IN ('draft', 'cancel')
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
        SUM(COALESCE(f.monto_facturado, fsl.price_subtotal)) AS produccion_total
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
def fetch_alojados(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[int, int]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_ALOJADOS_SQL, [fecha_inicio, fecha_fin])
        rows = cur.fetchall()
    return {r[0]: int(r[1] or 0) for r in rows}


@cache_result
def fetch_desayunos(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict[int, dict]:
    with connections["odoo"].cursor() as cur:
        cur.execute(
            _DESAYUNOS_SQL,
            {
                "regimenes": list(_REGIMENES_DESAYUNO),
                "colaborador": list(_REGIMENES_COLABORADOR),
                "desde": fecha_inicio,
                "hasta": fecha_fin,
            },
        )
        rows = cur.fetchall()
    return {
        r[0]: {"cantidad": float(r[1] or 0), "cantidad_total": float(r[2] or 0), "produccion": float(r[3] or 0)}
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
            "produccion": float(r[3] or 0),
        }
        for r in rows
    }


# Ingresos y gastos en la misma query (FILTER), por hotel: un único scan de
# account_move_line acotado a las cuentas que importan, no a todo el mayor.
_FNB_SQL = """
    SELECT
        aml.pms_property_id,
        SUM(aml.price_subtotal) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS ingresos,
        SUM(aml.quantity) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS unidades,
        SUM(aml.price_subtotal) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s)) AS gastos
    FROM account_move_line aml
    JOIN account_account aa ON aa.id = aml.account_id
    JOIN account_move am ON am.id = aml.move_id
    WHERE am.state = 'posted'
      AND aml.date BETWEEN %(desde)s AND %(hasta)s
      AND (aa.code = %(cuenta_ingreso)s OR aa.code = ANY(%(cuentas_gasto)s))
    GROUP BY aml.pms_property_id
"""

_FNB_MENSUAL_SQL = """
    SELECT
        date_trunc('month', aml.date)::date,
        SUM(aml.price_subtotal) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS ingresos,
        SUM(aml.quantity) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS unidades,
        SUM(aml.price_subtotal) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s)) AS gastos
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
           SUM(aml.price_subtotal) AS importe,
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
        SUM(aml.price_subtotal) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS ingresos,
        SUM(aml.quantity) FILTER (WHERE aa.code = %(cuenta_ingreso)s) AS unidades,
        SUM(aml.price_subtotal) FILTER (WHERE aa.code = ANY(%(cuentas_gasto)s)) AS gastos
    FROM account_move_line aml
    JOIN account_account aa ON aa.id = aml.account_id
    JOIN account_move am ON am.id = aml.move_id
    WHERE aml.pms_property_id = %(hotel_id)s AND am.state = 'posted'
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
           SUM(aml.price_subtotal) AS importe,
           COUNT(*) AS lineas
    FROM account_move_line aml
    JOIN account_account aa ON aa.id = aml.account_id
    JOIN account_move am ON am.id = aml.move_id
    LEFT JOIN res_users ru ON ru.id = aml.create_uid
    LEFT JOIN res_partner rp ON rp.id = ru.partner_id
    WHERE aml.pms_property_id = %(hotel_id)s AND aa.code = %(cuenta_ingreso)s AND am.state = 'posted'
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
