"""Listado de Hoteles con datos reales de Odoo: ocupación, producción de
desayunos y financiero F&B (ingresos/gastos/presupuesto contable). No incluye
regional/tipo/segmento (no existen en el PMS ni está previsto añadirlos).
Submarca sí existe (res_partner.brand_id, ver repository.fetch_submarcas) —
"Sin submarca" cuando el hotel no tiene marca asignada (43% de los casos,
verificado 2026-08-24), no se oculta ese hueco.

"desayunos"/"produccion"/"precioMedio" incluyen colaborador (es dinero y
unidades reales); solo "penetracion" lo excluye (no son huéspedes alojados
contados en "alojados" — colaborador puede superar el 100% si se incluye,
motivo verificado) — ver repository._REGIMENES_COLABORADOR y
.claude/alda-precios-desayuno/SKILL.md. Por eso "penetracion" no se puede
recalcular como desayunos/alojados: usa un numerador distinto al mostrado
en "desayunos" a propósito (si no, un hotel 100% colaborador mostraría
"0 desayunos" junto a producción real — confuso, aunque "correcto")."""
from __future__ import annotations

import datetime

from ..bloqueos.engine import es_hotel_excluido, zona_de
from . import repository

_DESAYUNO_VACIO = {
    "cantidad": 0.0,
    "cantidad_total": 0.0,
    "cantidad_facturada": 0.0,
    "cantidad_sin_facturar": 0.0,
    "produccion": 0.0,
    "produccion_facturada": 0.0,
    "produccion_sin_facturar": 0.0,
}
_FNB_VACIO = {"ingresos": 0.0, "unidades": 0.0, "gastos": 0.0}
_PRESUPUESTO_VACIO = {"presupuestoIngresos": 0.0, "presupuestoGastos": 0.0}


def _precio_medio(d: dict) -> float:
    """produccion / cantidad_total (incluye colaborador en ambos lados, ver
    repository._REGIMENES_COLABORADOR) — no dividir por "cantidad" (directa,
    sin colaborador), o el precio medio sale inflado."""
    return (d["produccion"] / d["cantidad_total"]) if d["cantidad_total"] > 0 else 0.0


def _facturacion_json(d: dict) -> dict:
    """Desglose de produccion/cantidad_total según tengan ya factura posted
    vinculada (facturado) o no (sin_facturar, estimado con el precio del
    folio — no es un hecho contable todavía). Ver repository._DESAYUNOS_SQL:
    produccionFacturada + produccionSinFacturar == produccion siempre."""
    return {
        "desayunosFacturados": round(d["cantidad_facturada"]),
        "desayunosSinFacturar": round(d["cantidad_sin_facturar"]),
        "produccionFacturada": round(d["produccion_facturada"], 2),
        "produccionSinFacturar": round(d["produccion_sin_facturar"], 2),
        "porcentajeFacturado": round(d["produccion_facturada"] / d["produccion"], 4) if d["produccion"] > 0 else 0.0,
    }


def _rango_es_mes_natural(desde: datetime.date, hasta: datetime.date) -> bool:
    """True si [desde, hasta] es uno o varios meses naturales completos
    (desde es día 1, hasta es el último día de su mes).

    kpis-definiciones.md, decisión 5.2: pms_budget/account_move_budget_line
    guardan la fecha como el día 1 del mes, así que comparar un rango
    parcial (p.ej. "los últimos 7 días") contra el presupuesto del mes
    entero da un "cumplimiento" engañoso, sin avisar — parece un dato real
    cuando en realidad es un problema de alineación de fechas."""
    if desde.day != 1:
        return False
    primer_dia_mes_siguiente = (hasta.replace(day=1) + datetime.timedelta(days=32)).replace(day=1)
    return hasta == primer_dia_mes_siguiente - datetime.timedelta(days=1)


_MOTIVO_RANGO_PARCIAL = "rango_no_es_mes_natural"


def _fnb_json(f: dict, presupuesto: dict = _PRESUPUESTO_VACIO, motivo_presupuesto: str | None = None) -> dict:
    """KPIs financieros F&B (ver repository._CUENTA_INGRESO_DESAYUNO): fuente
    contable, no PMS — deliberadamente distinta de produccion/precioMedio de
    arriba (que sí incluyen colaborador). No confundir "precioMedioVenta"
    (esta sección, contable) con "precioMedio" (producción, PMS).

    cumplimientoIngresos/Gastos: real/presupuesto (1.0 = 100% del
    presupuesto). None si no hay presupuesto confirmado para ese periodo —
    "0%" sería engañoso (parece que no se vendió nada, no que falta
    presupuesto). motivo_presupuesto distingue esa razón de la otra posible
    ("rango_no_es_mes_natural", ver _rango_es_mes_natural) — quien llame ya
    debe pasar presupuesto={} en ese caso, este parámetro es solo para que
    el frontend sepa por qué está vacío."""
    ingresos, gastos = f["ingresos"], f["gastos"]
    unidades = f["unidades"]
    presupuesto_ingresos = presupuesto["presupuestoIngresos"]
    presupuesto_gastos = presupuesto["presupuestoGastos"]
    return {
        "ingresos": round(ingresos, 2),
        "gastos": round(gastos, 2),
        "resultadoFB": round(ingresos - gastos, 2),
        "margenBruto": round((ingresos - gastos) / ingresos, 4) if ingresos > 0 else 0.0,
        "precioMedioVenta": round(ingresos / unidades, 2) if unidades > 0 else 0.0,
        "costeMedioGasto": round(gastos / unidades, 2) if unidades > 0 else 0.0,
        "presupuestoIngresos": round(presupuesto_ingresos, 2),
        "presupuestoGastos": round(presupuesto_gastos, 2),
        "cumplimientoIngresos": round(ingresos / presupuesto_ingresos, 4) if presupuesto_ingresos > 0 else None,
        "cumplimientoGastos": round(gastos / presupuesto_gastos, 4) if presupuesto_gastos > 0 else None,
        "presupuestoMotivo": motivo_presupuesto,
    }


_CALIDAD_CHECKIN_VACIO = {"declarado": 0, "checkin": 0, "reservasTotal": 0, "reservasSinCheckin": 0}


def get_hoteles(
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
    tipos_desayuno: tuple[str, ...] | None = None,
) -> dict:
    hoteles = repository.fetch_hoteles()
    companies = repository.fetch_companies()
    submarcas = repository.fetch_submarcas()
    alojados = repository.fetch_alojados(fecha_inicio, fecha_fin)
    desayunos = repository.fetch_desayunos(fecha_inicio, fecha_fin, tipos_desayuno)
    fnb = repository.fetch_fnb_desayuno(fecha_inicio, fecha_fin)
    rango_valido = _rango_es_mes_natural(fecha_inicio, fecha_fin)
    presupuesto = repository.fetch_presupuesto_desayuno(fecha_inicio, fecha_fin) if rango_valido else {}
    motivo_presupuesto = None if rango_valido else _MOTIVO_RANGO_PARCIAL
    calidad_checkin = repository.fetch_calidad_checkin(fecha_inicio, fecha_fin)

    resultado = []
    for h in hoteles:
        if es_hotel_excluido(h["id"], h["property_code"]):
            continue
        d = desayunos.get(h["id"], _DESAYUNO_VACIO)
        a = alojados.get(h["id"], 0)
        penetracion = (d["cantidad"] / a) if a > 0 else 0.0
        precio_medio = _precio_medio(d)
        resultado.append(
            {
                "id": h["id"],
                "name": h["name"],
                # or "": 2 de 132 hoteles no tienen property_code (verificado
                # 2026-08-28, ej. "Gestión Proyectos") — sin este fallback,
                # el frontend rompía al filtrar por texto (h.codigo era
                # null, no un string vacío).
                "codigo": h["property_code"] or "",
                "zona": zona_de(h["property_code"]),
                "sociedad": companies.get(h["company_id"], "—"),
                "submarca": submarcas.get(h["id"]) or "Sin submarca",
                "alojados": a,
                "desayunos": round(d["cantidad_total"]),
                "penetracion": round(penetracion, 4),
                "produccion": round(d["produccion"], 2),
                "precioMedio": round(precio_medio, 2),
                **_facturacion_json(d),
                **_fnb_json(fnb.get(h["id"], _FNB_VACIO), presupuesto.get(h["id"], _PRESUPUESTO_VACIO), motivo_presupuesto),
                "calidadCheckin": calidad_checkin.get(h["id"], _CALIDAD_CHECKIN_VACIO),
            }
        )

    resultado.sort(key=lambda h: h["produccion"], reverse=True)
    return {
        "fechaInicio": fecha_inicio.isoformat(),
        "fechaFin": fecha_fin.isoformat(),
        "hoteles": resultado,
    }


def get_turnos_desayuno(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> list[dict]:
    return repository.fetch_turnos_desayuno(fecha_inicio, fecha_fin)


def _hace_n_meses(fecha: datetime.date, n: int) -> datetime.date:
    mes = fecha.month - n
    anio = fecha.year
    while mes <= 0:
        mes += 12
        anio -= 1
    return fecha.replace(year=anio, month=mes, day=1)


def get_resumen(
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
    tipos_desayuno: tuple[str, ...] | None = None,
) -> dict:
    """Resumen para la portada: hoteles del periodo (para alertas/ranking/
    oportunidad) + serie mensual de los últimos 12 meses (para los gráficos
    de evolución) + desayunos por turno/canal del periodo, en una sola
    llamada. La serie mensual junta PMS (desayunos/producción) y contable
    (ingresos/gastos/margen) por mes — dos fuentes distintas, ver _fnb_json."""
    datos = get_hoteles(fecha_inicio, fecha_fin, tipos_desayuno)
    inicio_serie = _hace_n_meses(fecha_fin, 11)
    serie = repository.fetch_serie_mensual(inicio_serie, fecha_fin)
    fnb_por_mes = repository.fetch_fnb_serie_mensual(inicio_serie, fecha_fin)
    presupuesto_por_mes = repository.fetch_presupuesto_serie_mensual(inicio_serie, fecha_fin)
    for punto in serie:
        f = fnb_por_mes.get(punto["mes"], _FNB_VACIO)
        p = presupuesto_por_mes.get(punto["mes"], _PRESUPUESTO_VACIO)
        punto.update(_fnb_json(f, p))
    datos["serieMensual"] = serie
    datos["turnos"] = get_turnos_desayuno(fecha_inicio, fecha_fin)
    return datos


def get_hotel_info(hotel_id: int) -> dict | None:
    """Identidad básica de un hotel (para la cabecera de la ficha), sin
    métricas de ningún dominio (desayuno, bloqueos...)."""
    hoteles = {h["id"]: h for h in repository.fetch_hoteles()}
    h = hoteles.get(hotel_id)
    if h is None or es_hotel_excluido(h["id"], h["property_code"]):
        return None
    companies = repository.fetch_companies()
    submarcas = repository.fetch_submarcas()
    return {
        "id": h["id"],
        "name": h["name"],
        "codigo": h["property_code"] or "",
        "zona": zona_de(h["property_code"]),
        "sociedad": companies.get(h["company_id"], "—"),
        "submarca": submarcas.get(h["id"]) or "Sin submarca",
    }


def hotel_existe(hotel_id: int) -> bool:
    return get_hotel_info(hotel_id) is not None


def get_hotel_desayunos(hotel_id: int, fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict:
    """Datos de desayuno de un hotel: periodo [fecha_inicio, fecha_fin]
    elegido por el usuario + evolución mensual de contexto (últimos 12 meses
    terminando en fecha_fin, fija, no filtrable). No incluye identidad (ver
    get_hotel_info)."""
    alojados = repository.fetch_alojados(fecha_inicio, fecha_fin).get(hotel_id, 0)
    d = repository.fetch_desayunos(fecha_inicio, fecha_fin).get(hotel_id, _DESAYUNO_VACIO)
    fnb = repository.fetch_fnb_desayuno(fecha_inicio, fecha_fin).get(hotel_id, _FNB_VACIO)
    rango_valido = _rango_es_mes_natural(fecha_inicio, fecha_fin)
    presupuesto = (
        repository.fetch_presupuesto_desayuno(fecha_inicio, fecha_fin).get(hotel_id, _PRESUPUESTO_VACIO)
        if rango_valido
        else _PRESUPUESTO_VACIO
    )
    motivo_presupuesto = None if rango_valido else _MOTIVO_RANGO_PARCIAL
    penetracion = (d["cantidad"] / alojados) if alojados > 0 else 0.0
    precio_medio = _precio_medio(d)
    actual = {
        "alojados": alojados,
        "desayunos": round(d["cantidad_total"]),
        "penetracion": round(penetracion, 4),
        "produccion": round(d["produccion"], 2),
        "precioMedio": round(precio_medio, 2),
        **_facturacion_json(d),
        **_fnb_json(fnb, presupuesto, motivo_presupuesto),
    }

    inicio_serie = _hace_n_meses(fecha_fin, 11)
    alojados_mensual = repository.fetch_alojados_mensual_hotel(hotel_id, inicio_serie, fecha_fin)
    desayunos_mensual = repository.fetch_desayunos_mensual_hotel(hotel_id, inicio_serie, fecha_fin)
    fnb_por_mes = repository.fetch_fnb_serie_mensual_hotel(hotel_id, inicio_serie, fecha_fin)
    presupuesto_por_mes = repository.fetch_presupuesto_serie_mensual_hotel(hotel_id, inicio_serie, fecha_fin)

    meses = sorted(set(alojados_mensual) | set(desayunos_mensual))
    serie = []
    for mes in meses:
        a = alojados_mensual.get(mes, 0)
        dm = desayunos_mensual.get(mes, _DESAYUNO_VACIO)
        pen = (dm["cantidad"] / a) if a > 0 else 0.0
        precio = _precio_medio(dm)
        f = fnb_por_mes.get(mes, _FNB_VACIO)
        p = presupuesto_por_mes.get(mes, _PRESUPUESTO_VACIO)
        serie.append(
            {
                "mes": mes,
                "alojados": a,
                "desayunos": round(dm["cantidad_total"]),
                "penetracion": round(pen, 4),
                "produccion": round(dm["produccion"], 2),
                "precioMedio": round(precio, 2),
                **_facturacion_json(dm),
                **_fnb_json(f, p),
            }
        )

    turnos = repository.fetch_turnos_desayuno_hotel(hotel_id, fecha_inicio, fecha_fin)

    return {"actual": actual, "serieMensual": serie, "turnos": turnos}


# Ajustes editables de Desayunos (antes hardcodeados en el frontend,
# frontend/src/lib/mock-data.ts). Los valores por defecto son los mismos
# que ya estaban ahí — nadie pierde el criterio actual al desplegar esto,
# solo pasa a poder cambiarse desde la UI. Ninguno es un objetivo oficial
# confirmado por dirección/revenue (ver desayunos-origen-datos.tsx) — sigue
# sin serlo solo porque ahora sea editable.
AJUSTES_DESAYUNOS_DEFECTO = {
    "objetivoPenetracion": 0.55,
    "umbralPenetracion": 0.38,
    "objetivoOportunidad": 0.85,
}


def get_ajustes_desayunos() -> dict:
    from ..models import DashboardSetting

    guardados = dict(
        DashboardSetting.objects.filter(
            dashboard="desayunos", clave__in=AJUSTES_DESAYUNOS_DEFECTO
        ).values_list("clave", "valor")
    )
    return {**AJUSTES_DESAYUNOS_DEFECTO, **guardados}


def set_ajustes_desayunos(cambios: dict, usuario) -> dict:
    from ..models import DashboardSetting

    desconocidas = set(cambios) - set(AJUSTES_DESAYUNOS_DEFECTO)
    if desconocidas:
        raise ValueError(f"Ajuste desconocido: {', '.join(sorted(desconocidas))}")

    valores = {}
    for clave, bruto in cambios.items():
        try:
            valor = float(bruto)
        except (TypeError, ValueError):
            raise ValueError(f"'{clave}' debe ser un número")
        if not (0 < valor <= 1):
            raise ValueError(f"'{clave}' debe estar entre 0 y 100% (recibido {bruto})")
        valores[clave] = valor

    for clave, valor in valores.items():
        DashboardSetting.objects.update_or_create(
            dashboard="desayunos",
            clave=clave,
            defaults={
                "valor": valor,
                "actualizado_por": usuario if getattr(usuario, "is_authenticated", False) else None,
            },
        )
    return get_ajustes_desayunos()
