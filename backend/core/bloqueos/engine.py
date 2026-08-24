"""Motor de cálculo de bloqueos de habitaciones.

Port a Python del nodo "Consolidador y Motor Financiero" del workflow n8n
"Bloqueos Habitaciones", generalizado de un día fijo ("ayer") a un rango de
fechas [fecha_inicio, fecha_fin] arbitrario. Dado el inventario de
habitaciones y las líneas de reserva (roomnights) del rango, calcula por
hotel: inventario, ocupación, habitaciones-noche bloqueadas (fuera de
servicio), ADR real y coste de oportunidad estimado.

Para un rango de varios días, las métricas de ocupación/bloqueo se expresan
en habitaciones-noche (una habitación bloqueada 3 noches suma 3), mientras
que "habitacionesBloqueadas" cuenta reservas de bloqueo distintas (no
noches), para no inflar el número de incidencias reales.

Funciones puras: no acceden a base de datos ni a red (ver repository.py para
la carga de datos reales desde Odoo).
"""
from __future__ import annotations

import datetime
import re
from dataclasses import dataclass
from typing import Any

# Hotel(es) excluidos siempre, por id de pms.property (fuera de la cadena).
# 24 = [307] Hotel Alda Santa Trega.
HOTEL_IDS_EXCLUIDOS_FIJOS: set[int] = {24}

ZONAS_EXCLUIDAS_RE = re.compile(r"niuco|restauradores", re.IGNORECASE)

# Mapeo de código de hotel -> zona. Es el mismo diccionario de respaldo que
# usa el workflow n8n cuando no puede leer la hoja de Google Sheets de zonas;
# aquí es la única fuente (no tenemos acceso a esa hoja desde este proyecto).
MAPEO_ZONAS: dict[str, str] = {
    "101": "Galicia Centro", "106": "Galicia Centro", "109": "Galicia Centro", "111": "Galicia Centro",
    "112": "Galicia Centro", "114": "Galicia Centro", "115": "Galicia Centro", "116": "Galicia Centro", "118": "Galicia Centro",
    "102": "Castilla y Leon Centro", "103": "Castilla y Leon Centro", "113": "Castilla y Leon Centro", "117": "Castilla y Leon Centro",
    "119": "Castilla y Leon Centro", "202": "Castilla y Leon Centro", "205": "Castilla y Leon Centro", "224": "Castilla y Leon Centro",
    "229": "Castilla y Leon Centro", "237": "Castilla y Leon Centro",
    "108": "Rias Altas", "401": "Rias Altas", "402": "Rias Altas", "403": "Rias Altas", "404": "Rias Altas", "405": "Rias Altas",
    "408": "Rias Altas", "413": "Rias Altas", "414": "Rias Altas", "416": "Rias Altas", "418": "Rias Altas", "421": "Rias Altas", "422": "Rias Altas",
    "201": "Soria y Haro", "207": "Soria y Haro", "209": "Soria y Haro", "220": "Soria y Haro", "222": "Soria y Haro", "223": "Soria y Haro",
    "225": "Soria y Haro", "227": "Soria y Haro",
    "206": "Ponferrada", "213": "Ponferrada",
    "208": "Aragon y Navarra", "211": "Aragon y Navarra", "214": "Aragon y Navarra", "219": "Aragon y Navarra", "230": "Aragon y Navarra",
    "231": "Aragon y Navarra", "235": "Aragon y Navarra", "238": "Aragon y Navarra",
    "216": "Castilla y Leon Sur", "217": "Castilla y Leon Sur", "218": "Castilla y Leon Sur", "226": "Castilla y Leon Sur", "233": "Castilla y Leon Sur",
    "234": "Castilla y Leon Sur", "236": "Castilla y Leon Sur",
    "301": "Rias Baixas", "302": "Rias Baixas", "303": "Rias Baixas", "304": "Rias Baixas", "305": "Rias Baixas", "308": "Rias Baixas",
    "312": "Rias Baixas", "313": "Rias Baixas", "314": "Rias Baixas", "315": "Rias Baixas", "316": "Rias Baixas", "318": "Rias Baixas",
    "319": "Rias Baixas", "806": "Rias Baixas",
    "306": "Galicia Interior", "309": "Galicia Interior", "310": "Galicia Interior", "320": "Galicia Interior",
    "321": "Galicia Interior",
    "406": "Asturias", "407": "Asturias", "409": "Asturias", "410": "Asturias", "411": "Asturias", "412": "Asturias", "415": "Asturias",
    "417": "Asturias", "419": "Asturias",
    "423": "Costa da Morte", "424": "Costa da Morte", "425": "Costa da Morte",
    "901": "Niuco", "902": "Niuco", "903": "Niuco", "904": "Niuco", "905": "Niuco", "906": "Niuco", "907": "Niuco", "908": "Niuco",
    "909": "Niuco",
    "802": "Restauradores", "803": "Restauradores", "804": "Restauradores", "805": "Restauradores", "807": "Restauradores",
}

def zona_de(codigo: str | None) -> str:
    return MAPEO_ZONAS.get(codigo, "Zona No Definida") if codigo else "Zona No Definida"


def es_hotel_excluido(hotel_id: int | None, codigo: str | None) -> bool:
    if hotel_id is not None and hotel_id in HOTEL_IDS_EXCLUIDOS_FIJOS:
        return True
    zona = MAPEO_ZONAS.get(codigo) if codigo else None
    if zona and ZONAS_EXCLUIDAS_RE.search(zona):
        return True
    return False


def _numero_ordenable(txt: str | None) -> int:
    if not txt:
        return 999_999
    m = re.search(r"\d+", str(txt))
    return int(m.group()) if m else 999_999


def _dias_entre(checkin, checkout) -> int:
    if not checkin or not checkout:
        return 1
    dias = (checkout - checkin).days
    return dias if dias > 0 else 1


@dataclass
class ReportLine:
    """Una línea de reserva (roomnight) del día analizado, con su reserva y
    folio ya resueltos. Es la unidad de entrada del motor."""

    line_id: int
    line_state: str
    price_day_total: float | None
    room_id: int | None
    room_name: str | None
    room_type_id: int | None  # room_type de la HABITACIÓN física (para ADR)
    property_id: int
    property_name: str
    property_code: str | None
    reservation_id: int
    reservation_name: str
    reservation_type: str  # normal | out | staff
    reservation_room_type_id: int | None  # room_type de la RESERVA (para bloqueos)
    checkin: Any
    checkout: Any
    rooms_text: str | None
    out_service_description: str | None
    folio_internal_comment: str | None
    closure_reason_name: str | None


def compute_report(
    rooms: list[dict],
    room_types: list[dict],
    lines: list[ReportLine] | list[dict],
    fecha_inicio: datetime.date,
    fecha_fin: datetime.date,
) -> dict:
    """Calcula el informe de bloqueos por hotel para [fecha_inicio, fecha_fin] (ambos incluidos).

    rooms: inventario activo (pms.room) -> {id, property_id, property_name, room_type_id, name}
    room_types: pms.room.type -> {id, overnight_room}
    lines: líneas de reserva (roomnights) del rango -> ver ReportLine
    """
    lines = [ln if isinstance(ln, ReportLine) else ReportLine(**ln) for ln in lines]
    dias_en_rango = (fecha_fin - fecha_inicio).days + 1

    overnight_type_ids = {rt["id"] for rt in room_types if rt.get("overnight_room")}

    def es_overnight_valido(room_type_id: int | None) -> bool:
        if room_type_id is None:
            return False
        if not overnight_type_ids:
            return True  # fallback si no hay catálogo de tipos
        return room_type_id in overnight_type_ids

    # ── Capacidad real por hotel (excluye no-overnight, hoteles excluidos) ──
    capacidad_por_hotel: dict[int, int] = {}
    for room in rooms:
        pid = room.get("property_id")
        if pid is None:
            continue
        if not es_overnight_valido(room.get("room_type_id")):
            continue
        if es_hotel_excluido(pid, room.get("property_code")):
            continue
        capacidad_por_hotel[pid] = capacidad_por_hotel.get(pid, 0) + 1

    # ── ADR real y ocupación (solo reservas de huésped real, líneas confirmadas) ──
    adr_ingresos: dict[int, float] = {}
    adr_noches: dict[int, int] = {}
    for ln in lines:
        if ln.line_state in ("draft", "cancel"):
            continue
        if ln.reservation_type != "normal":
            continue
        if ln.price_day_total is None:
            continue
        adr_ingresos[ln.property_id] = adr_ingresos.get(ln.property_id, 0.0) + float(ln.price_day_total)
        adr_noches[ln.property_id] = adr_noches.get(ln.property_id, 0) + 1

    adr_por_hotel: dict[int, float] = {
        pid: round(adr_ingresos[pid] / adr_noches[pid], 2) for pid in adr_noches if adr_noches[pid] > 0
    }
    ocupadas_por_hotel: dict[int, int] = dict(adr_noches)

    total_ingresos_cadena = sum(adr_ingresos.values())
    total_noches_cadena = sum(adr_noches.values())
    adr_medio_cadena = (
        round(total_ingresos_cadena / total_noches_cadena, 2) if total_noches_cadena > 0 else None
    )

    # ── Bloqueos (reservation_type == 'out'): una entrada por reserva de bloqueo,
    # con el nº de noches de esa reserva que caen dentro del rango seleccionado. ──
    report_by_hotel: dict[int, dict] = {}
    bloqueos_por_reserva: dict[int, dict] = {}
    for ln in lines:
        if ln.reservation_type != "out":
            continue
        if ln.line_state in ("draft", "cancel"):
            continue

        hotel_id = ln.property_id
        hotel_name = ln.property_name
        if es_hotel_excluido(hotel_id, ln.property_code):
            continue

        if hotel_id not in report_by_hotel:
            report_by_hotel[hotel_id] = {
                "hotelId": hotel_id,
                "hotelName": hotel_name,
                "zona": zona_de(ln.property_code),
                # None si el hotel tiene una reserva de bloqueo pero ninguna
                # habitación suya está en el inventario activo (caso raro:
                # habitación archivada/eliminada en Odoo) — antes se rellenaba
                # con un 45 inventado, que contaminaba los % de ocupación/
                # bloqueo con una capacidad ficticia. Sin capacidad conocida,
                # esos % no se pueden calcular (ver pct() más abajo).
                "capacidadTotal": capacidad_por_hotel.get(hotel_id),
                "adrCalculado": adr_por_hotel.get(hotel_id),
                "resumenMotivos": {},
            }

        if ln.reservation_id not in bloqueos_por_reserva:
            causa_cierre = ln.closure_reason_name or "—"
            motivo_cierre = (
                ln.out_service_description
                if ln.out_service_description and ln.out_service_description != "-"
                else "—"
            )
            motivo_categoria = (
                causa_cierre if causa_cierre != "—" else (motivo_cierre if motivo_cierre != "—" else "No especificado")
            )
            bloqueos_por_reserva[ln.reservation_id] = {
                "hotelId": hotel_id,
                "habitacionNum": ln.room_name or ln.rooms_text or "N/A",
                "codigoReserva": ln.reservation_name,
                "causaCierre": causa_cierre,
                "motivo": motivo_cierre,
                "motivoCategoria": motivo_categoria,
                "comentarioFolio": (ln.folio_internal_comment or "").strip(),
                "rangoReserva": {
                    "checkin": ln.checkin.isoformat() if ln.checkin else "N/A",
                    "checkout": ln.checkout.isoformat() if ln.checkout else "N/A",
                    "diasTotalesBloqueo": _dias_entre(ln.checkin, ln.checkout),
                },
                "nochesEnRango": 0,
            }
        bloqueos_por_reserva[ln.reservation_id]["nochesEnRango"] += 1

    for bloqueo in bloqueos_por_reserva.values():
        hotel = report_by_hotel[bloqueo["hotelId"]]
        hotel["resumenMotivos"][bloqueo["motivoCategoria"]] = hotel["resumenMotivos"].get(bloqueo["motivoCategoria"], 0) + 1

    # ── Agregados finales por hotel ──
    hoteles: list[dict] = []
    for hotel in report_by_hotel.values():
        hotel_id = hotel["hotelId"]
        capacidad_total = hotel["capacidadTotal"]
        bloqueos_hotel = [b for b in bloqueos_por_reserva.values() if b["hotelId"] == hotel_id]
        noches_bloqueadas = sum(b["nochesEnRango"] for b in bloqueos_hotel)
        noches_ocupadas = ocupadas_por_hotel.get(hotel_id, 0)
        noches_disponibles_total = capacidad_total * dias_en_rango if capacidad_total is not None else None
        noches_libres = (
            max(0, noches_disponibles_total - noches_ocupadas - noches_bloqueadas)
            if noches_disponibles_total is not None
            else None
        )
        adr = hotel["adrCalculado"]

        def pct(n: int | None) -> float | None:
            if n is None or not noches_disponibles_total:
                return None
            return round((n / noches_disponibles_total) * 100, 1)

        detalle_ordenado = sorted(
            (
                {k: v for k, v in b.items() if k not in ("hotelId", "motivoCategoria")}
                for b in bloqueos_hotel
            ),
            key=lambda d: (_numero_ordenable(d["habitacionNum"]), str(d["habitacionNum"])),
        )

        hoteles.append(
            {
                "hotelId": hotel_id,
                "hotelName": hotel["hotelName"],
                "zona": hotel["zona"],
                "kpis": {
                    "totalInventario": capacidad_total,
                    "diasEnRango": dias_en_rango,
                    "habitacionesBloqueadas": len(bloqueos_hotel),
                    "nochesBloqueadas": noches_bloqueadas,
                    "nochesOcupadas": noches_ocupadas,
                    "nochesLibres": noches_libres,
                    "porcentajeBloqueo": pct(noches_bloqueadas),
                    "porcentajeOcupacion": pct(noches_ocupadas),
                    "porcentajeLibre": pct(noches_libres),
                    "adrUtilizado": adr,
                    "perdidaFinancieraEstimada": round(noches_bloqueadas * adr, 2) if adr is not None else None,
                },
                "resumenMotivos": hotel["resumenMotivos"],
                "detalle": detalle_ordenado,
            }
        )

    hoteles.sort(key=lambda h: h["kpis"]["perdidaFinancieraEstimada"] or 0, reverse=True)

    inventario_total_cadena = sum(capacidad_por_hotel.values())
    total_hab_bloqueadas = sum(h["kpis"]["habitacionesBloqueadas"] for h in hoteles)
    total_noches_bloqueadas = sum(h["kpis"]["nochesBloqueadas"] for h in hoteles)
    total_perdida = sum(h["kpis"]["perdidaFinancieraEstimada"] or 0 for h in hoteles)
    noches_disponibles_cadena = inventario_total_cadena * dias_en_rango
    ratio_bloqueo_global = (
        round((total_noches_bloqueadas / noches_disponibles_cadena) * 100, 2) if noches_disponibles_cadena > 0 else 0.0
    )

    return {
        "fechaInicio": fecha_inicio.isoformat(),
        "fechaFin": fecha_fin.isoformat(),
        "diasEnRango": dias_en_rango,
        "resumen": {
            "totalHotelesCadena": len(capacidad_por_hotel),
            "totalHotelesAfectados": len(hoteles),
            "inventarioTotalCadena": inventario_total_cadena,
            "totalHabitacionesBloqueadas": total_hab_bloqueadas,
            "totalNochesBloqueadas": total_noches_bloqueadas,
            "totalPerdidaEstimada": round(total_perdida, 2),
            "ratioBloqueoGlobal": ratio_bloqueo_global,
            "adrMedioCadena": adr_medio_cadena,
        },
        "hoteles": hoteles,
    }
