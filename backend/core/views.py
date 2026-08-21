import datetime
import json
import logging

from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from .accounts import (
    RegistroError,
    actualizar_perfil,
    asignar_rol_automatico,
    dashboards_visibles,
    empleado_activo,
    registrar_usuario,
    requiere_algun_dashboard,
    requiere_dashboard,
)
from .bloqueos.service import get_report
from .cache import origen_datos, tracking
from .hoteles.service import get_hotel_desayunos, get_hotel_info, get_resumen

logger = logging.getLogger(__name__)

MAX_RANGO_DIAS = 92  # ~3 meses, para no lanzar consultas enormes contra Odoo


def _sesion_json(user) -> dict:
    return {
        "email": user.email,
        "nombre": user.first_name,
        "esSuperusuario": user.is_superuser,
        "dashboards": dashboards_visibles(user),
    }


def health(request):
    return JsonResponse({"status": "ok"})


@ensure_csrf_cookie
def csrf(request):
    return JsonResponse({"ok": True})


@require_POST
def registro(request):
    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    try:
        user = registrar_usuario(
            email=data.get("email", ""),
            password=data.get("password", ""),
            nombre=data.get("nombre", ""),
        )
    except RegistroError as e:
        return JsonResponse({"error": e.mensaje}, status=e.status)

    login(request, user)
    return JsonResponse(_sesion_json(user), status=201)


@require_POST
def iniciar_sesion(request):
    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = authenticate(request, username=email, password=password)
    if user is None:
        return JsonResponse({"error": "Email o contraseña incorrectos"}, status=401)

    # El perfil (departamento/puesto) se cachea para cualquier cuenta con
    # email de Odoo, sea o no superusuario — es solo informativo. El rol
    # automático sí se salta para superusuarios: ya tienen acceso total.
    empleado = empleado_activo(user.email)
    if empleado is not None:
        actualizar_perfil(user, empleado["departamento"], empleado["puesto"])
        if not user.is_superuser:
            asignar_rol_automatico(user, empleado["puesto"])

    login(request, user)
    return JsonResponse(_sesion_json(user))


@require_POST
def cerrar_sesion(request):
    logout(request)
    return JsonResponse({"ok": True})


def me(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "No autenticado"}, status=401)
    return JsonResponse(_sesion_json(request.user))


def _parse_fecha(value: str | None) -> datetime.date | None:
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"Fecha inválida: {value!r} (formato esperado YYYY-MM-DD)")


@requiere_dashboard("bloqueos")
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
        with tracking() as t:
            data = get_report(fecha_inicio, fecha_fin)
        data["origenDatos"] = origen_datos(t)
        return JsonResponse(data)
    except Exception:
        logger.exception("Error al generar el informe de bloqueos")
        return JsonResponse({"error": "No se pudo obtener el informe de bloqueos"}, status=502)


@requiere_algun_dashboard("desayunos", "bloqueos")
def hotel_detalle(request, hotel_id):
    """Identidad de un hotel (nombre, zona, sociedad) — no tiene permiso
    propio, se llega desde el listado de desayunos o de bloqueos."""
    try:
        with tracking() as t:
            datos = get_hotel_info(hotel_id)
    except Exception:
        logger.exception("Error al generar la ficha del hotel %s", hotel_id)
        return JsonResponse({"error": "No se pudo obtener el hotel"}, status=502)

    if datos is None:
        return JsonResponse({"error": "Hotel no encontrado"}, status=404)
    return JsonResponse({**datos, "origenDatos": origen_datos(t)})


def _rango_mes_por_defecto(request):
    try:
        fecha_inicio = _parse_fecha(request.GET.get("desde"))
        fecha_fin = _parse_fecha(request.GET.get("hasta"))
    except ValueError as e:
        return None, None, JsonResponse({"error": str(e)}, status=400)

    hoy = datetime.date.today()
    fecha_fin = fecha_fin or hoy
    fecha_inicio = fecha_inicio or fecha_fin.replace(day=1)

    if fecha_fin < fecha_inicio:
        return None, None, JsonResponse({"error": "'hasta' no puede ser anterior a 'desde'"}, status=400)
    if (fecha_fin - fecha_inicio).days + 1 > MAX_RANGO_DIAS:
        return None, None, JsonResponse(
            {"error": f"El rango máximo permitido es de {MAX_RANGO_DIAS} días"}, status=400
        )
    return fecha_inicio, fecha_fin, None


@requiere_dashboard("desayunos")
def desayunos(request):
    fecha_inicio, fecha_fin, error_response = _rango_mes_por_defecto(request)
    if error_response is not None:
        return error_response

    try:
        with tracking() as t:
            data = get_resumen(fecha_inicio, fecha_fin)
        data["origenDatos"] = origen_datos(t)
        return JsonResponse(data)
    except Exception:
        logger.exception("Error al generar las métricas de desayuno")
        return JsonResponse({"error": "No se pudieron obtener las métricas de desayuno"}, status=502)


@requiere_dashboard("desayunos")
def hotel_desayunos(request, hotel_id):
    fecha_inicio, fecha_fin, error_response = _rango_mes_por_defecto(request)
    if error_response is not None:
        return error_response

    try:
        with tracking() as t:
            if get_hotel_info(hotel_id) is None:
                return JsonResponse({"error": "Hotel no encontrado"}, status=404)
            data = get_hotel_desayunos(hotel_id, fecha_inicio, fecha_fin)
        data["origenDatos"] = origen_datos(t)
        return JsonResponse(data)
    except Exception:
        logger.exception("Error al generar los desayunos del hotel %s", hotel_id)
        return JsonResponse({"error": "No se pudieron obtener los desayunos del hotel"}, status=502)


@requiere_dashboard("bloqueos")
def hotel_bloqueos(request, hotel_id):
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
        with tracking() as t:
            data = get_report(fecha_inicio, fecha_fin)
    except Exception:
        logger.exception("Error al generar los bloqueos del hotel %s", hotel_id)
        return JsonResponse({"error": "No se pudieron obtener los bloqueos del hotel"}, status=502)

    hotel = next((h for h in data["hoteles"] if h["hotelId"] == hotel_id), None)
    return JsonResponse(
        {
            "fechaInicio": data["fechaInicio"],
            "fechaFin": data["fechaFin"],
            "diasEnRango": data["diasEnRango"],
            "hotel": hotel,
            "origenDatos": origen_datos(t),
        }
    )


@requiere_dashboard("donde_actuar")
def resumen(request):
    hoy = datetime.date.today()
    fecha_inicio = hoy.replace(day=1)

    try:
        with tracking() as t:
            data = get_resumen(fecha_inicio, hoy)
        data["origenDatos"] = origen_datos(t)
        return JsonResponse(data)
    except Exception:
        logger.exception("Error al generar el resumen general")
        return JsonResponse({"error": "No se pudo obtener el resumen"}, status=502)
