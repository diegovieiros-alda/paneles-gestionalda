"""Listado de Hoteles con datos reales de Odoo: ocupación, producción de
desayunos y financiero F&B (ingresos/gastos/presupuesto contable). No
incluye regional/submarca/tipo (no existen en el PMS, solo zona y sociedad).

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

_DESAYUNO_VACIO = {"cantidad": 0.0, "cantidad_total": 0.0, "produccion": 0.0}
_FNB_VACIO = {"ingresos": 0.0, "unidades": 0.0, "gastos": 0.0}
_PRESUPUESTO_VACIO = {"presupuestoIngresos": 0.0, "presupuestoGastos": 0.0}


def _precio_medio(d: dict) -> float:
    """produccion / cantidad_total (incluye colaborador en ambos lados, ver
    repository._REGIMENES_COLABORADOR) — no dividir por "cantidad" (directa,
    sin colaborador), o el precio medio sale inflado."""
    return (d["produccion"] / d["cantidad_total"]) if d["cantidad_total"] > 0 else 0.0


def _fnb_json(f: dict, presupuesto: dict = _PRESUPUESTO_VACIO) -> dict:
    """KPIs financieros F&B (ver repository._CUENTA_INGRESO_DESAYUNO): fuente
    contable, no PMS — deliberadamente distinta de produccion/precioMedio de
    arriba (que sí incluyen colaborador). No confundir "precioMedioVenta"
    (esta sección, contable) con "precioMedio" (producción, PMS).

    cumplimientoIngresos/Gastos: real/presupuesto (1.0 = 100% del
    presupuesto). None si no hay presupuesto confirmado para ese periodo —
    "0%" sería engañoso (parece que no se vendió nada, no que falta
    presupuesto)."""
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
    }


_CALIDAD_CHECKIN_VACIO = {"declarado": 0, "checkin": 0, "reservasTotal": 0, "reservasSinCheckin": 0}


def get_hoteles(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict:
    hoteles = repository.fetch_hoteles()
    companies = repository.fetch_companies()
    alojados = repository.fetch_alojados(fecha_inicio, fecha_fin)
    desayunos = repository.fetch_desayunos(fecha_inicio, fecha_fin)
    fnb = repository.fetch_fnb_desayuno(fecha_inicio, fecha_fin)
    presupuesto = repository.fetch_presupuesto_desayuno(fecha_inicio, fecha_fin)
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
                "zona": zona_de(h["property_code"]),
                "sociedad": companies.get(h["company_id"], "—"),
                "alojados": a,
                "desayunos": round(d["cantidad_total"]),
                "penetracion": round(penetracion, 4),
                "produccion": round(d["produccion"], 2),
                "precioMedio": round(precio_medio, 2),
                **_fnb_json(fnb.get(h["id"], _FNB_VACIO), presupuesto.get(h["id"], _PRESUPUESTO_VACIO)),
                "calidadCheckin": calidad_checkin.get(h["id"], _CALIDAD_CHECKIN_VACIO),
            }
        )

    resultado.sort(key=lambda h: h["produccion"], reverse=True)
    return {
        "fechaInicio": fecha_inicio.isoformat(),
        "fechaFin": fecha_fin.isoformat(),
        "hoteles": resultado,
    }


def get_vendedores_desayuno(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> list[dict]:
    return repository.fetch_vendedores_desayuno(fecha_inicio, fecha_fin)


def _hace_n_meses(fecha: datetime.date, n: int) -> datetime.date:
    mes = fecha.month - n
    anio = fecha.year
    while mes <= 0:
        mes += 12
        anio -= 1
    return fecha.replace(year=anio, month=mes, day=1)


def get_resumen(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict:
    """Resumen para la portada: hoteles del periodo (para alertas/ranking/
    oportunidad) + serie mensual de los últimos 12 meses (para los gráficos
    de evolución) + top vendedores de desayuno del periodo, en una sola
    llamada. La serie mensual junta PMS (desayunos/producción) y contable
    (ingresos/gastos/margen) por mes — dos fuentes distintas, ver _fnb_json."""
    datos = get_hoteles(fecha_inicio, fecha_fin)
    inicio_serie = _hace_n_meses(fecha_fin, 11)
    serie = repository.fetch_serie_mensual(inicio_serie, fecha_fin)
    fnb_por_mes = repository.fetch_fnb_serie_mensual(inicio_serie, fecha_fin)
    presupuesto_por_mes = repository.fetch_presupuesto_serie_mensual(inicio_serie, fecha_fin)
    for punto in serie:
        f = fnb_por_mes.get(punto["mes"], _FNB_VACIO)
        p = presupuesto_por_mes.get(punto["mes"], _PRESUPUESTO_VACIO)
        punto.update(_fnb_json(f, p))
    datos["serieMensual"] = serie
    datos["vendedores"] = get_vendedores_desayuno(fecha_inicio, fecha_fin)
    return datos


def get_hotel_info(hotel_id: int) -> dict | None:
    """Identidad básica de un hotel (para la cabecera de la ficha), sin
    métricas de ningún dominio (desayuno, bloqueos...)."""
    hoteles = {h["id"]: h for h in repository.fetch_hoteles()}
    h = hoteles.get(hotel_id)
    if h is None or es_hotel_excluido(h["id"], h["property_code"]):
        return None
    companies = repository.fetch_companies()
    return {
        "id": h["id"],
        "name": h["name"],
        "zona": zona_de(h["property_code"]),
        "sociedad": companies.get(h["company_id"], "—"),
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
    presupuesto = repository.fetch_presupuesto_desayuno(fecha_inicio, fecha_fin).get(hotel_id, _PRESUPUESTO_VACIO)
    penetracion = (d["cantidad"] / alojados) if alojados > 0 else 0.0
    precio_medio = _precio_medio(d)
    actual = {
        "alojados": alojados,
        "desayunos": round(d["cantidad_total"]),
        "penetracion": round(penetracion, 4),
        "produccion": round(d["produccion"], 2),
        "precioMedio": round(precio_medio, 2),
        **_fnb_json(fnb, presupuesto),
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
                **_fnb_json(f, p),
            }
        )

    vendedores = repository.fetch_vendedores_desayuno_hotel(hotel_id, fecha_inicio, fecha_fin)

    return {"actual": actual, "serieMensual": serie, "vendedores": vendedores}
