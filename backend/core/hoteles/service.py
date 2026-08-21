"""Listado de Hoteles con datos reales de Odoo: ocupación y producción de
desayunos. No incluye coste/margen/presupuesto (no existen en Odoo) ni
regional/submarca/tipo (no existen en el PMS, solo zona y sociedad).

"desayunos" (cantidad) y "penetracion" excluyen colaborador (no son huéspedes
alojados contados en "alojados"); "produccion" y "precioMedio" lo incluyen
(es dinero real) — ver repository._REGIMENES_COLABORADOR y
.claude/alda-precios-desayuno/SKILL.md."""
from __future__ import annotations

import datetime

from ..bloqueos.engine import es_hotel_excluido, zona_de
from . import repository

_DESAYUNO_VACIO = {"cantidad": 0.0, "cantidad_total": 0.0, "produccion": 0.0}
_FNB_VACIO = {"ingresos": 0.0, "unidades": 0.0, "gastos": 0.0}


def _precio_medio(d: dict) -> float:
    """produccion / cantidad_total (incluye colaborador en ambos lados, ver
    repository._REGIMENES_COLABORADOR) — no dividir por "cantidad" (directa,
    sin colaborador), o el precio medio sale inflado."""
    return (d["produccion"] / d["cantidad_total"]) if d["cantidad_total"] > 0 else 0.0


def _fnb_json(f: dict) -> dict:
    """KPIs financieros F&B (ver repository._CUENTA_INGRESO_DESAYUNO): fuente
    contable, no PMS — deliberadamente distinta de produccion/precioMedio de
    arriba (que sí incluyen colaborador). No confundir "precioMedioVenta"
    (esta sección, contable) con "precioMedio" (producción, PMS)."""
    ingresos, gastos = f["ingresos"], f["gastos"]
    unidades = f["unidades"]
    return {
        "ingresos": round(ingresos, 2),
        "gastos": round(gastos, 2),
        "resultadoFB": round(ingresos - gastos, 2),
        "margenBruto": round((ingresos - gastos) / ingresos, 4) if ingresos > 0 else 0.0,
        "precioMedioVenta": round(ingresos / unidades, 2) if unidades > 0 else 0.0,
        "costeMedioGasto": round(gastos / unidades, 2) if unidades > 0 else 0.0,
    }


def get_hoteles(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict:
    hoteles = repository.fetch_hoteles()
    companies = repository.fetch_companies()
    alojados = repository.fetch_alojados(fecha_inicio, fecha_fin)
    desayunos = repository.fetch_desayunos(fecha_inicio, fecha_fin)
    fnb = repository.fetch_fnb_desayuno(fecha_inicio, fecha_fin)

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
                "desayunos": round(d["cantidad"]),
                "penetracion": round(penetracion, 4),
                "produccion": round(d["produccion"], 2),
                "precioMedio": round(precio_medio, 2),
                **_fnb_json(fnb.get(h["id"], _FNB_VACIO)),
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
    oportunidad) + serie mensual de los últimos 12 meses (para el gráfico de
    evolución) + top vendedores de desayuno del periodo, en una sola llamada."""
    datos = get_hoteles(fecha_inicio, fecha_fin)
    inicio_serie = _hace_n_meses(fecha_fin, 11)
    datos["serieMensual"] = repository.fetch_serie_mensual(inicio_serie, fecha_fin)
    datos["vendedores"] = get_vendedores_desayuno(fecha_inicio, fecha_fin)
    return datos


def get_hoteles_directorio() -> list[dict]:
    """Directorio simple de hoteles (identidad, sin métricas): nombre, zona,
    sociedad. Las métricas de desayuno viven en su propia sección/permiso."""
    hoteles = repository.fetch_hoteles()
    companies = repository.fetch_companies()
    resultado = []
    for h in hoteles:
        if es_hotel_excluido(h["id"], h["property_code"]):
            continue
        resultado.append(
            {
                "id": h["id"],
                "name": h["name"],
                "zona": zona_de(h["property_code"]),
                "sociedad": companies.get(h["company_id"], "—"),
            }
        )
    resultado.sort(key=lambda h: h["name"])
    return resultado


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
    penetracion = (d["cantidad"] / alojados) if alojados > 0 else 0.0
    precio_medio = _precio_medio(d)
    actual = {
        "alojados": alojados,
        "desayunos": round(d["cantidad"]),
        "penetracion": round(penetracion, 4),
        "produccion": round(d["produccion"], 2),
        "precioMedio": round(precio_medio, 2),
        **_fnb_json(fnb),
    }

    inicio_serie = _hace_n_meses(fecha_fin, 11)
    alojados_mensual = repository.fetch_alojados_mensual_hotel(hotel_id, inicio_serie, fecha_fin)
    desayunos_mensual = repository.fetch_desayunos_mensual_hotel(hotel_id, inicio_serie, fecha_fin)

    meses = sorted(set(alojados_mensual) | set(desayunos_mensual))
    serie = []
    for mes in meses:
        a = alojados_mensual.get(mes, 0)
        dm = desayunos_mensual.get(mes, _DESAYUNO_VACIO)
        pen = (dm["cantidad"] / a) if a > 0 else 0.0
        precio = _precio_medio(dm)
        serie.append(
            {
                "mes": mes,
                "alojados": a,
                "desayunos": round(dm["cantidad"]),
                "penetracion": round(pen, 4),
                "produccion": round(dm["produccion"], 2),
                "precioMedio": round(precio, 2),
            }
        )

    return {"actual": actual, "serieMensual": serie}
