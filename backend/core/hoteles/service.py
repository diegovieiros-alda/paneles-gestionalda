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
_PRESUPUESTO_VACIO = {
    "presupuestoIngresos": 0.0,
    "presupuestoGastos": 0.0,
    "presupuestoOrigen": None,
    "presupuestoIngresosOdoo": None,
    "presupuestoGastosOdoo": None,
    "presupuestoIngresosExcel": None,
    "presupuestoGastosExcel": None,
    "alojadosPrevistos": None,
    "desayunosPrevistos": None,
}


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
    el frontend sepa por qué está vacío.

    presupuestoOrigen ("odoo"/"excel"/None): de dónde sale el presupuesto
    mostrado — repository.fetch_presupuesto_desayuno combina Odoo
    (confirmado, prioritario) y la hoja de Finanzas (respaldo) y ya decide
    cuál de los dos se usa por hotel/mes; aquí solo se propaga ese dato
    para que el frontend lo muestre (pedido explícito: "sería bueno
    indicar de dónde viene el dato").

    presupuestoIngresos/GastosOdoo/Excel: los dos valores por separado
    (None si esa fuente no tiene dato para el hotel/periodo), además del
    elegido — pedido explícito 2026-09-02: "vamos a poner los 2
    presupuestos... para comparar".

    alojadosPrevistos/desayunosPrevistos: presupuesto en UNIDADES (no €),
    solo disponible en la serie mensual por hotel del Excel — None en el
    resto de llamadas. Para el gráfico "Alojados vs ud desayunos" de la
    ficha de hotel."""
    ingresos, gastos = f["ingresos"], f["gastos"]
    unidades = f["unidades"]
    presupuesto_ingresos = presupuesto["presupuestoIngresos"]
    presupuesto_gastos = presupuesto["presupuestoGastos"]

    def _o(valor):
        return round(valor, 2) if valor is not None else None

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
        "presupuestoOrigen": presupuesto.get("presupuestoOrigen"),
        "presupuestoIngresosOdoo": _o(presupuesto.get("presupuestoIngresosOdoo")),
        "presupuestoGastosOdoo": _o(presupuesto.get("presupuestoGastosOdoo")),
        "presupuestoIngresosExcel": _o(presupuesto.get("presupuestoIngresosExcel")),
        "presupuestoGastosExcel": _o(presupuesto.get("presupuestoGastosExcel")),
        "alojadosPrevistos": presupuesto.get("alojadosPrevistos"),
        "desayunosPrevistos": presupuesto.get("desayunosPrevistos"),
    }


_CALIDAD_CHECKIN_VACIO = {"declarado": 0, "checkin": 0, "reservasTotal": 0, "reservasSinCheckin": 0}


def _hace_un_ano(fecha: datetime.date) -> datetime.date:
    """Mismo día del año anterior — 29 de febrero cae en 28 si el año
    anterior no es bisiesto (no existe un 29/02 al que volver)."""
    try:
        return fecha.replace(year=fecha.year - 1)
    except ValueError:
        return fecha.replace(year=fecha.year - 1, day=28)


def _variacion(actual: float, ly: float) -> float | None:
    """(actual - LY) / LY — None si LY es 0 (sin línea base con la que
    comparar; un "0%" o un "+inf%" serían ambos engañosos)."""
    return round((actual - ly) / ly, 4) if ly else None


# Campos con comparativa LY en las tablas de hoteles y en la ficha —
# mismo nombre que ya usa "actual" en cada caso. "desayunos"/"produccion"
# son PMS (incluyen colaborador); ingresos/gastos/margenBruto/
# costeMedioGasto son contables (los devuelve _fnb_json, no se recalculan
# aquí para no tener la fórmula del margen/coste medio duplicada en dos
# sitios).
_CAMPOS_LY = (
    "alojados", "desayunos", "penetracion", "precioMedio", "produccion",
    "ingresos", "gastos", "margenBruto", "costeMedioGasto", "precioMedioVenta", "resultadoFB",
)


def _ly_json(actual: dict, ly: dict) -> dict:
    """`actual`/`ly` llevan ya calculadas las claves de _CAMPOS_LY para el
    periodo correspondiente (el de LY, desplazado un año con
    _hace_un_ano) — solo empaqueta el valor LY y la variación con signo
    junto a cada campo (ej. "ingresosLY", "ingresosVarLY")."""
    salida = {}
    for campo in _CAMPOS_LY:
        salida[f"{campo}LY"] = round(ly[campo], 4)
        salida[f"{campo}VarLY"] = _variacion(actual[campo], ly[campo])
    return salida


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

    # LY (año anterior): mismo periodo desplazado un año, mismas fetch_*
    # que "actual" — sin presupuesto ni calidad de checkin, fuera del
    # alcance de esta comparativa. Duplica 3 consultas contra Odoo por
    # petición; verificado 2026-09-03 contra producción que el coste
    # extra es asumible tras el fix de la CTE "facturado" (2026-09-02) que
    # ya bajó cada una de estas de ~11s a <1s.
    desde_ly, hasta_ly = _hace_un_ano(fecha_inicio), _hace_un_ano(fecha_fin)
    alojados_ly = repository.fetch_alojados(desde_ly, hasta_ly)
    desayunos_ly = repository.fetch_desayunos(desde_ly, hasta_ly, tipos_desayuno)
    fnb_ly = repository.fetch_fnb_desayuno(desde_ly, hasta_ly)

    # Objetivos/umbrales por hotel (2026-09-04, "Objetivos configurarlo por
    # hotel") — resueltos aquí y devueltos como parte de cada hotel, para
    # que las tablas/tarjetas los usen directamente sin un contexto global
    # aparte que había que mantener sincronizado.
    ids_incluidos = [h["id"] for h in hoteles if not es_hotel_excluido(h["id"], h["property_code"])]
    ajustes_por_hotel = get_ajustes_desayunos_por_hoteles(ids_incluidos)

    resultado = []
    for h in hoteles:
        if es_hotel_excluido(h["id"], h["property_code"]):
            continue
        d = desayunos.get(h["id"], _DESAYUNO_VACIO)
        a = alojados.get(h["id"], 0)
        penetracion = (d["cantidad"] / a) if a > 0 else 0.0
        precio_medio = _precio_medio(d)
        fnb_json = _fnb_json(fnb.get(h["id"], _FNB_VACIO), presupuesto.get(h["id"], _PRESUPUESTO_VACIO), motivo_presupuesto)

        d_ly = desayunos_ly.get(h["id"], _DESAYUNO_VACIO)
        a_ly = alojados_ly.get(h["id"], 0)
        penetracion_ly = (d_ly["cantidad"] / a_ly) if a_ly > 0 else 0.0
        precio_medio_ly = _precio_medio(d_ly)
        fnb_json_ly = _fnb_json(fnb_ly.get(h["id"], _FNB_VACIO))

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
                **fnb_json,
                **_ly_json(
                    {"alojados": a, "desayunos": d["cantidad_total"], "penetracion": penetracion, "precioMedio": precio_medio, "produccion": d["produccion"], **fnb_json},
                    {"alojados": a_ly, "desayunos": d_ly["cantidad_total"], "penetracion": penetracion_ly, "precioMedio": precio_medio_ly, "produccion": d_ly["produccion"], **fnb_json_ly},
                ),
                "calidadCheckin": calidad_checkin.get(h["id"], _CALIDAD_CHECKIN_VACIO),
                **ajustes_por_hotel.get(h["id"], AJUSTES_DESAYUNOS_DEFECTO),
            }
        )

    resultado.sort(key=lambda h: h["produccion"], reverse=True)
    return {
        "fechaInicio": fecha_inicio.isoformat(),
        "fechaFin": fecha_fin.isoformat(),
        "hoteles": resultado,
    }


def get_turnos_desayuno(
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
    tipos_desayuno: tuple[str, ...] | None = None,
    hotel_ids: tuple[int, ...] | None = None,
) -> list[dict]:
    return repository.fetch_turnos_desayuno(fecha_inicio, fecha_fin, tipos_desayuno, hotel_ids)


def _hace_n_meses(fecha: datetime.date, n: int) -> datetime.date:
    mes = fecha.month - n
    anio = fecha.year
    while mes <= 0:
        mes += 12
        anio -= 1
    return fecha.replace(year=anio, month=mes, day=1)


def get_serie_mensual(
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
    tipos_desayuno: tuple[str, ...] | None = None,
    hotel_ids: tuple[int, ...] | None = None,
) -> list[dict]:
    """Serie mensual de los últimos 12 meses hasta fecha_fin, con los mismos
    filtros de Producto y Hotel que el resto de Desayunos — junta PMS
    (desayunos/producción) y contable (ingresos/gastos/margen) por mes, dos
    fuentes distintas (ver _fnb_json). Extraída de get_resumen (2026-09-03,
    petición: extender a Tendencias los filtros de Zona/Submarca/Hotel/
    Producto que ya tenían Detalle/Oportunidades/Alertas) para que
    Tendencias pueda pedirla filtrada sin arrastrar también el recálculo de
    la tabla de hoteles — mismo motivo que llevó a separar Turnos de este
    resumen el 2026-09-02."""
    inicio_serie = _hace_n_meses(fecha_fin, 11)
    serie = repository.fetch_serie_mensual(inicio_serie, fecha_fin, tipos_desayuno, hotel_ids)
    fnb_por_mes = repository.fetch_fnb_serie_mensual(inicio_serie, fecha_fin, hotel_ids)
    presupuesto_por_mes = repository.fetch_presupuesto_serie_mensual(inicio_serie, fecha_fin, hotel_ids)
    for punto in serie:
        f = fnb_por_mes.get(punto["mes"], _FNB_VACIO)
        p = presupuesto_por_mes.get(punto["mes"], _PRESUPUESTO_VACIO)
        punto.update(_fnb_json(f, p))
    return serie


def get_resumen(
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
    tipos_desayuno: tuple[str, ...] | None = None,
) -> dict:
    """Resumen para la portada: hoteles del periodo (para alertas/ranking/
    oportunidad) + serie mensual de los últimos 12 meses sin filtro de
    Hotel (para los gráficos de evolución cuando no hay ninguno activo), en
    una sola llamada.

    Turnos ya NO viaja embebido aquí (2026-09-02): antes, cambiar solo el
    filtro de Producto obligaba a recalcular Turnos dentro de esta misma
    llamada (mismo tipos_desayuno en la caché), aunque el usuario no
    hubiera tocado ningún filtro de Hotel — este resumen pagaba ese coste
    aunque a nadie le hiciera falta todavía. El frontend pide Turnos
    siempre por separado (views.desayunos_turnos/fetchTurnos, con o sin
    filtro de Hotel/Zona/Submarca) — así la tabla de hoteles puede
    mostrarse en cuanto esté lista sin esperar a Turnos. La serie mensual
    filtrada por Hotel (Tendencias) sigue el mismo patrón, ver
    get_serie_mensual/views.desayunos_serie_mensual."""
    datos = get_hoteles(fecha_inicio, fecha_fin, tipos_desayuno)
    datos["serieMensual"] = get_serie_mensual(fecha_inicio, fecha_fin, tipos_desayuno)
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


def get_hotel_desayunos(
    hotel_id: int,
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
    tipos_desayuno: tuple[str, ...] | None = None,
) -> dict:
    """Datos de desayuno de un hotel: periodo [fecha_inicio, fecha_fin]
    elegido por el usuario + evolución mensual de contexto (últimos 12 meses
    terminando en fecha_fin, fija, no filtrable). No incluye identidad (ver
    get_hotel_info).

    tipos_desayuno filtra "actual" igual que get_hoteles (mismo filtro de
    Producto que la tabla de la que se viene) — bug real reportado
    2026-09-03 ("las fichas individuales no muestran los mismos datos que
    en la lista"): antes esta función ignoraba el filtro de tipo por
    completo, así que la ficha mostraba siempre todos los tipos aunque la
    tabla de origen estuviera filtrada. La serie mensual de contexto SÍ
    sigue sin filtrar por tipo (fetch_desayunos_mensual_hotel no tiene esa
    variante) — mismo comportamiento que la serie mensual de la cadena en
    get_resumen, no es una inconsistencia nueva de este fix."""
    alojados = repository.fetch_alojados(fecha_inicio, fecha_fin).get(hotel_id, 0)
    d = repository.fetch_desayunos(fecha_inicio, fecha_fin, tipos_desayuno).get(hotel_id, _DESAYUNO_VACIO)
    # Qué tipos de desayuno vende de verdad este hotel en el periodo (no cuál
    # filtro está activo) — para el chip "Tipo desayuno" de la cabecera de la
    # ficha, que debe mostrar los que mezcla el hotel, no el filtro elegido.
    desglose_tipo = repository.fetch_desayunos_por_tipo(fecha_inicio, fecha_fin).get(hotel_id, {})
    tipos_activos = sorted(tipo for tipo, valores in desglose_tipo.items() if valores["cantidad_total"] > 0)
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
    fnb_json = _fnb_json(fnb, presupuesto, motivo_presupuesto)

    # LY (año anterior) — mismo criterio que get_hoteles: mismo periodo
    # desplazado un año, sin presupuesto ni calidad de checkin.
    desde_ly, hasta_ly = _hace_un_ano(fecha_inicio), _hace_un_ano(fecha_fin)
    alojados_ly = repository.fetch_alojados(desde_ly, hasta_ly).get(hotel_id, 0)
    d_ly = repository.fetch_desayunos(desde_ly, hasta_ly, tipos_desayuno).get(hotel_id, _DESAYUNO_VACIO)
    penetracion_ly = (d_ly["cantidad"] / alojados_ly) if alojados_ly > 0 else 0.0
    precio_medio_ly = _precio_medio(d_ly)
    fnb_json_ly = _fnb_json(repository.fetch_fnb_desayuno(desde_ly, hasta_ly).get(hotel_id, _FNB_VACIO))

    actual = {
        "alojados": alojados,
        "desayunos": round(d["cantidad_total"]),
        "penetracion": round(penetracion, 4),
        "produccion": round(d["produccion"], 2),
        "precioMedio": round(precio_medio, 2),
        **_facturacion_json(d),
        **fnb_json,
        **_ly_json(
            {"alojados": alojados, "desayunos": d["cantidad_total"], "penetracion": penetracion, "precioMedio": precio_medio, "produccion": d["produccion"], **fnb_json},
            {"alojados": alojados_ly, "desayunos": d_ly["cantidad_total"], "penetracion": penetracion_ly, "precioMedio": precio_medio_ly, "produccion": d_ly["produccion"], **fnb_json_ly},
        ),
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

    desglose_producto = repository.fetch_desayunos_por_producto_hotel(hotel_id, fecha_inicio, fecha_fin, tipos_desayuno)
    desglose_producto_json = [
        {
            "producto": p["producto"],
            "unidades": round(p["unidades"]),
            "ventas": round(p["ventas"], 2),
            "precioMedio": round(p["ventas"] / p["unidades"], 2) if p["unidades"] > 0 else 0.0,
        }
        for p in desglose_producto
    ]

    return {
        "actual": actual,
        "serieMensual": serie,
        "turnos": turnos,
        "tiposDesayuno": tipos_activos,
        "desglosePorProducto": desglose_producto_json,
        "ajustes": get_ajustes_desayunos(hotel_id),
    }


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


def get_ajustes_desayunos(hotel_id: int | None = None) -> dict:
    """Ajustes resueltos: valor propio del hotel si existe, si no el global
    (fila con hotel_id NULL en DashboardSetting), si no el valor por
    defecto de arriba. hotel_id=None (comportamiento de siempre, todas las
    llamadas anteriores a 2026-09-04 "Objetivos por hotel") devuelve solo
    el global — el override por hotel es una capa que se añade encima."""
    from ..models import DashboardSetting

    global_vals = dict(
        DashboardSetting.objects.filter(
            dashboard="desayunos", clave__in=AJUSTES_DESAYUNOS_DEFECTO, hotel_id__isnull=True
        ).values_list("clave", "valor")
    )
    resultado = {**AJUSTES_DESAYUNOS_DEFECTO, **global_vals}
    if hotel_id is not None:
        propios = dict(
            DashboardSetting.objects.filter(
                dashboard="desayunos", clave__in=AJUSTES_DESAYUNOS_DEFECTO, hotel_id=hotel_id
            ).values_list("clave", "valor")
        )
        resultado.update(propios)
    return resultado


def get_ajustes_desayunos_por_hoteles(hotel_ids: list[int]) -> dict[int, dict]:
    """Igual que llamar a get_ajustes_desayunos(hotel_id) para cada hotel de
    la lista, pero en 2 consultas en vez de N — para las vistas que
    necesitan los ajustes de muchos hoteles a la vez (tablas de Detalle/
    Financiero, Oportunidades, Alertas, panel de administración)."""
    from ..models import DashboardSetting

    if not hotel_ids:
        return {}
    base = get_ajustes_desayunos()
    resultado = {hotel_id: dict(base) for hotel_id in hotel_ids}
    filas = DashboardSetting.objects.filter(
        dashboard="desayunos", clave__in=AJUSTES_DESAYUNOS_DEFECTO, hotel_id__in=hotel_ids
    ).values_list("hotel_id", "clave", "valor")
    for hotel_id, clave, valor in filas:
        resultado[hotel_id][clave] = valor
    return resultado


_RANGOS_AJUSTES_DESAYUNOS = {  # (mínimo excluido, máximo incluido) — todos fracción 0-1 por ahora
    "objetivoPenetracion": (0, 1),
    "umbralPenetracion": (0, 1),
    "objetivoOportunidad": (0, 1),
}


def set_ajustes_desayunos(cambios: dict, usuario, hotel_id: int | None = None) -> dict:
    """hotel_id=None edita el valor global (comportamiento de siempre); un
    hotel_id concreto edita el override de ese hotel — o lo borra (vuelve a
    heredar el global) si el valor recibido es None/vacío, solo válido
    cuando hotel_id no es None (el global siempre tiene que tener un valor)."""
    from ..models import DashboardSetting

    desconocidas = set(cambios) - set(AJUSTES_DESAYUNOS_DEFECTO)
    if desconocidas:
        raise ValueError(f"Ajuste desconocido: {', '.join(sorted(desconocidas))}")

    valores: dict[str, float | None] = {}
    for clave, bruto in cambios.items():
        if hotel_id is not None and (bruto is None or bruto == ""):
            valores[clave] = None
            continue
        try:
            valor = float(bruto)
        except (TypeError, ValueError):
            raise ValueError(f"'{clave}' debe ser un número")
        minimo, maximo = _RANGOS_AJUSTES_DESAYUNOS[clave]
        if not (minimo < valor <= maximo):
            raise ValueError(f"'{clave}' debe estar entre 0 y 100% (recibido {bruto})")
        valores[clave] = valor

    for clave, valor in valores.items():
        if valor is None:
            DashboardSetting.objects.filter(dashboard="desayunos", clave=clave, hotel_id=hotel_id).delete()
            continue
        DashboardSetting.objects.update_or_create(
            dashboard="desayunos",
            clave=clave,
            hotel_id=hotel_id,
            defaults={
                "valor": valor,
                "actualizado_por": usuario if getattr(usuario, "is_authenticated", False) else None,
            },
        )
    return get_ajustes_desayunos(hotel_id)


def get_hoteles_directorio() -> list[dict]:
    """Identidad de todos los hoteles (id/nombre/código/zona/submarca), sin
    ninguna métrica dependiente de fecha — para el panel de administración
    de Ajustes por hotel, que necesita listar los ~89 hoteles pero no
    calcular producción/ingresos para poder mostrarlos."""
    hoteles = repository.fetch_hoteles()
    companies = repository.fetch_companies()
    submarcas = repository.fetch_submarcas()
    return [
        {
            "id": h["id"],
            "name": h["name"],
            "codigo": h["property_code"] or "",
            "zona": zona_de(h["property_code"]),
            "sociedad": companies.get(h["company_id"], "—"),
            "submarca": submarcas.get(h["id"]) or "Sin submarca",
        }
        for h in hoteles
        if not es_hotel_excluido(h["id"], h["property_code"])
    ]


def get_ajustes_desayunos_hoteles_admin() -> dict:
    """Para la página de administración de Ajustes: el valor global de
    cadena + cada hotel con su valor ya resuelto y qué claves tiene
    personalizadas (para poder mostrar "usa el valor por defecto" vs. un
    override propio, y permitir borrarlo)."""
    from ..models import DashboardSetting

    directorio = get_hoteles_directorio()
    hotel_ids = [h["id"] for h in directorio]
    resueltos = get_ajustes_desayunos_por_hoteles(hotel_ids)
    overrides_por_hotel: dict[int, list[str]] = {}
    for hotel_id, clave in DashboardSetting.objects.filter(
        dashboard="desayunos", clave__in=AJUSTES_DESAYUNOS_DEFECTO, hotel_id__in=hotel_ids
    ).values_list("hotel_id", "clave"):
        overrides_por_hotel.setdefault(hotel_id, []).append(clave)

    hoteles = [
        {
            **h,
            "valores": resueltos.get(h["id"], AJUSTES_DESAYUNOS_DEFECTO),
            "overrides": overrides_por_hotel.get(h["id"], []),
        }
        for h in directorio
    ]
    return {"global": get_ajustes_desayunos(), "hoteles": hoteles}
