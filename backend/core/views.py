import datetime
import logging

from django.http import JsonResponse

from .bloqueos.service import get_report

logger = logging.getLogger(__name__)

MAX_RANGO_DIAS = 92  # ~3 meses, para no lanzar consultas enormes contra Odoo


def health(request):
    return JsonResponse({"status": "ok"})


def _parse_fecha(value: str | None) -> datetime.date | None:
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"Fecha inválida: {value!r} (formato esperado YYYY-MM-DD)")


def bloqueos(request):
    try:
        fecha_inicio = _parse_fecha(request.GET.get("desde"))
        fecha_fin = _parse_fecha(request.GET.get("hasta"))
    except ValueError as e:
        return JsonResponse({"error": str(e)}, status=400)

    if fecha_inicio and fecha_fin and fecha_fin < fecha_inicio:
        return JsonResponse({"error": "'hasta' no puede ser anterior a 'desde'"}, status=400)
    if fecha_inicio and fecha_fin and (fecha_fin - fecha_inicio).days + 1 > MAX_RANGO_DIAS:
        return JsonResponse({"error": f"El rango máximo permitido es de {MAX_RANGO_DIAS} días"}, status=400)

    try:
        return JsonResponse(get_report(fecha_inicio, fecha_fin))
    except Exception:
        logger.exception("Error al generar el informe de bloqueos")
        return JsonResponse({"error": "No se pudo obtener el informe de bloqueos"}, status=502)
