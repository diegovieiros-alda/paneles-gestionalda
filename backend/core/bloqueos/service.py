from __future__ import annotations

import datetime

from . import repository
from .engine import compute_report


def get_report(
    fecha_inicio: datetime.date | None = None,
    fecha_fin: datetime.date | None = None,
) -> dict:
    ayer = repository.fecha_ayer()
    fecha_inicio = fecha_inicio or ayer
    fecha_fin = fecha_fin or fecha_inicio
    rooms = repository.fetch_rooms()
    room_types = repository.fetch_room_types()
    lines = repository.fetch_lines(fecha_inicio, fecha_fin)
    return compute_report(rooms, room_types, lines, fecha_inicio=fecha_inicio, fecha_fin=fecha_fin)
