"""Carga de datos reales desde la base de datos de Odoo (solo lectura).

Consulta directa por SQL (no hay modelos Django para el esquema de Odoo,
serían cientos de tablas) contra el alias de base de datos 'odoo' — ver
DATABASES/DATABASE_ROUTERS en config/settings.py. Nunca escribe.
"""
from __future__ import annotations

import datetime

from django.db import connections

from ..cache import cache_result
from .engine import ReportLine

_ROOMS_SQL = """
    SELECT room.id, room.pms_property_id, partner.name, prop.pms_property_code, room.room_type_id, room.name
    FROM pms_room room
    JOIN pms_property prop ON prop.id = room.pms_property_id
    JOIN res_partner partner ON partner.id = prop.partner_id
    WHERE room.active = true
"""

_ROOM_TYPES_SQL = "SELECT id, overnight_room FROM pms_room_type"

# Una fila por línea de reserva (roomnight) del día solicitado, con la
# reserva, el hotel y el motivo de cierre (si aplica) ya resueltos.
_LINES_SQL = """
    SELECT
        rl.id, rl.state, rl.price_day_total,
        rl.room_id, room.name, room.room_type_id,
        rl.pms_property_id, partner.name, prop.pms_property_code,
        r.id, r.name, r.reservation_type, r.room_type_id,
        r.checkin, r.checkout, r.rooms,
        r.out_service_description, r.folio_internal_comment,
        cr.name ->> 'es_ES'
    FROM pms_reservation_line rl
    JOIN pms_reservation r ON r.id = rl.reservation_id
    LEFT JOIN pms_room room ON room.id = rl.room_id
    LEFT JOIN pms_property prop ON prop.id = rl.pms_property_id
    LEFT JOIN res_partner partner ON partner.id = prop.partner_id
    LEFT JOIN pms_folio f ON f.id = r.folio_id
    LEFT JOIN room_closure_reason cr ON cr.id = f.closure_reason_id
    WHERE rl.date BETWEEN %s AND %s AND rl.overnight_room = true
"""


def fecha_ayer() -> datetime.date:
    return datetime.date.today() - datetime.timedelta(days=1)


@cache_result
def fetch_rooms() -> list[dict]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_ROOMS_SQL)
        rows = cur.fetchall()
    return [
        {
            "id": r[0],
            "property_id": r[1],
            "property_name": r[2],
            "property_code": r[3],
            "room_type_id": r[4],
            "name": r[5],
        }
        for r in rows
    ]


@cache_result
def fetch_room_types() -> list[dict]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_ROOM_TYPES_SQL)
        rows = cur.fetchall()
    return [{"id": r[0], "overnight_room": bool(r[1])} for r in rows]


@cache_result
def fetch_lines(fecha_inicio: datetime.date, fecha_fin: datetime.date) -> list[ReportLine]:
    with connections["odoo"].cursor() as cur:
        cur.execute(_LINES_SQL, [fecha_inicio, fecha_fin])
        rows = cur.fetchall()
    return [
        ReportLine(
            line_id=r[0],
            line_state=r[1],
            price_day_total=float(r[2]) if r[2] is not None else None,
            room_id=r[3],
            room_name=r[4],
            room_type_id=r[5],
            property_id=r[6],
            property_name=r[7] or "",
            property_code=r[8],
            reservation_id=r[9],
            reservation_name=r[10],
            reservation_type=r[11],
            reservation_room_type_id=r[12],
            checkin=r[13],
            checkout=r[14],
            rooms_text=r[15],
            out_service_description=r[16],
            folio_internal_comment=r[17],
            closure_reason_name=r[18],
        )
        for r in rows
    ]
