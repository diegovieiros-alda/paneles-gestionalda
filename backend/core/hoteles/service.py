"""Listado de Hoteles con datos reales de Odoo: ocupación y producción de
desayunos. No incluye coste/margen/presupuesto (no existen en Odoo) ni
regional/submarca/tipo (no existen en el PMS, solo zona y sociedad)."""
from __future__ import annotations

import datetime

from ..bloqueos.engine import es_hotel_excluido, zona_de
from . import repository


def get_hoteles(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> dict:
    hoteles = repository.fetch_hoteles()
    companies = repository.fetch_companies()
    alojados = repository.fetch_alojados(fecha_inicio, fecha_fin)
    desayunos = repository.fetch_desayunos(fecha_inicio, fecha_fin)

    resultado = []
    for h in hoteles:
        if es_hotel_excluido(h["id"], h["property_code"]):
            continue
        d = desayunos.get(h["id"], {"cantidad": 0.0, "produccion": 0.0})
        a = alojados.get(h["id"], 0)
        penetracion = (d["cantidad"] / a) if a > 0 else 0.0
        precio_medio = (d["produccion"] / d["cantidad"]) if d["cantidad"] > 0 else 0.0
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
            }
        )

    resultado.sort(key=lambda h: h["produccion"], reverse=True)
    return {
        "fechaInicio": fecha_inicio.isoformat(),
        "fechaFin": fecha_fin.isoformat(),
        "hoteles": resultado,
    }


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
    evolución), en una sola llamada."""
    datos = get_hoteles(fecha_inicio, fecha_fin)
    inicio_serie = _hace_n_meses(fecha_fin, 11)
    datos["serieMensual"] = repository.fetch_serie_mensual(inicio_serie, fecha_fin)
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
    d = repository.fetch_desayunos(fecha_inicio, fecha_fin).get(hotel_id, {"cantidad": 0.0, "produccion": 0.0})
    penetracion = (d["cantidad"] / alojados) if alojados > 0 else 0.0
    precio_medio = (d["produccion"] / d["cantidad"]) if d["cantidad"] > 0 else 0.0
    actual = {
        "alojados": alojados,
        "desayunos": round(d["cantidad"]),
        "penetracion": round(penetracion, 4),
        "produccion": round(d["produccion"], 2),
        "precioMedio": round(precio_medio, 2),
    }

    inicio_serie = _hace_n_meses(fecha_fin, 11)
    alojados_mensual = repository.fetch_alojados_mensual_hotel(hotel_id, inicio_serie, fecha_fin)
    desayunos_mensual = repository.fetch_desayunos_mensual_hotel(hotel_id, inicio_serie, fecha_fin)

    meses = sorted(set(alojados_mensual) | set(desayunos_mensual))
    serie = []
    for mes in meses:
        a = alojados_mensual.get(mes, 0)
        dm = desayunos_mensual.get(mes, {"cantidad": 0.0, "produccion": 0.0})
        pen = (dm["cantidad"] / a) if a > 0 else 0.0
        precio = (dm["produccion"] / dm["cantidad"]) if dm["cantidad"] > 0 else 0.0
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
