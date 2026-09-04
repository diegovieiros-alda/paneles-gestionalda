import datetime
import json
import logging

from django.contrib.auth import authenticate, login, logout
from django.core.cache import cache
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
from .hoteles.service import (
    get_ajustes_desayunos,
    get_ajustes_desayunos_hoteles_admin,
    get_hotel_desayunos,
    get_hotel_info,
    get_resumen,
    get_serie_mensual,
    get_turnos_desayuno,
    set_ajustes_desayunos,
)

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


RATE_LIMIT_INTENTOS_LOGIN = 10
RATE_LIMIT_VENTANA_LOGIN = 60 * 15  # 15 minutos


@require_POST
def iniciar_sesion(request):
    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    # Sin esto, nada impedía fuerza bruta contra este endpoint salvo el
    # coste del hash de contraseña. Contador por IP en la misma caché de
    # disco que ya usa cache_result (core/cache.py) — no hace falta una
    # librería aparte para esto.
    # ponytail: get+set, no incr atómico — suficiente para frenar fuerza
    # bruta; si el tráfico de login creciera mucho, pasar a un backend con
    # incr atómico (Redis) para evitar condiciones de carrera bajo concurrencia.
    ip = request.META.get("REMOTE_ADDR", "desconocida")
    intentos_key = f"login_intentos:{ip}"
    if cache.get(intentos_key, 0) >= RATE_LIMIT_INTENTOS_LOGIN:
        return JsonResponse({"error": "Demasiados intentos. Inténtalo de nuevo en unos minutos."}, status=429)

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = authenticate(request, username=email, password=password)
    if user is None:
        cache.set(intentos_key, cache.get(intentos_key, 0) + 1, RATE_LIMIT_VENTANA_LOGIN)
        return JsonResponse({"error": "Email o contraseña incorrectos"}, status=401)

    cache.delete(intentos_key)

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


_TIPOS_DESAYUNO_VALIDOS = {"buffet", "express", "colaborador", "otros"}


def _parse_tipos_desayuno(request) -> tuple[str, ...] | None:
    """?tipo=buffet,express — None si no se pasa (sin filtro, comportamiento
    de siempre)."""
    raw = request.GET.get("tipo")
    if not raw:
        return None
    tipos = tuple(t for t in raw.split(",") if t)
    invalidos = set(tipos) - _TIPOS_DESAYUNO_VALIDOS
    if invalidos:
        raise ValueError(f"Tipo de desayuno inválido: {', '.join(sorted(invalidos))}")
    return tipos


def _parse_hotel_ids(request) -> tuple[int, ...] | None:
    """?hoteles=12,45,78 — None si no se pasa (sin restricción de hotel).
    Usado por desayunos_turnos: Zona/Submarca/búsqueda de hotel se
    resuelven en el frontend (filtro client-side sobre la lista completa
    de hoteles) a una lista de IDs, no hay un parámetro de zona/submarca
    propio aquí."""
    raw = request.GET.get("hoteles")
    if not raw:
        return None
    try:
        return tuple(int(x) for x in raw.split(",") if x)
    except ValueError:
        raise ValueError(f"Lista de hoteles inválida: {raw!r}")


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


def _rango_mes_por_defecto(request, max_dias: int = MAX_RANGO_DIAS):
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
    if (fecha_fin - fecha_inicio).days + 1 > max_dias:
        return None, None, JsonResponse(
            {"error": f"El rango máximo permitido es de {max_dias} días"}, status=400
        )
    return fecha_inicio, fecha_fin, None


# Desayunos admite rangos de hasta un año fiscal (filtro "Año fiscal",
# 01/10-30/09) — más permisivo que MAX_RANGO_DIAS (92, usado por Bloqueos,
# que no cambia). get_resumen() ya consulta 12 meses de serieMensual sin
# problema, así que esta escala ya está probada.
MAX_RANGO_DIAS_DESAYUNOS = 370


@requiere_dashboard("desayunos")
def desayunos(request):
    fecha_inicio, fecha_fin, error_response = _rango_mes_por_defecto(request, MAX_RANGO_DIAS_DESAYUNOS)
    if error_response is not None:
        return error_response
    try:
        tipos_desayuno = _parse_tipos_desayuno(request)
    except ValueError as e:
        return JsonResponse({"error": str(e)}, status=400)

    try:
        with tracking() as t:
            data = get_resumen(fecha_inicio, fecha_fin, tipos_desayuno)
        data["origenDatos"] = origen_datos(t)
        return JsonResponse(data)
    except Exception:
        logger.exception("Error al generar las métricas de desayuno")
        return JsonResponse({"error": "No se pudieron obtener las métricas de desayuno"}, status=502)


@requiere_dashboard("desayunos")
def desayunos_turnos(request):
    """Turnos/canal de Desayunos, cadena completa o restringido a una lista
    de hoteles — endpoint aparte de /api/desayunos/ (2026-08-28) porque el
    filtro de Hotel/Zona/Submarca es puramente client-side ahí (se aplica
    sobre la lista de hoteles ya cargada) y no dispara un refetch de ese
    resumen completo; aquí sí hace falta un fetch nuevo porque Turnos no
    tiene desglose por hotel que se pueda filtrar en el navegador."""
    fecha_inicio, fecha_fin, error_response = _rango_mes_por_defecto(request, MAX_RANGO_DIAS_DESAYUNOS)
    if error_response is not None:
        return error_response
    try:
        tipos_desayuno = _parse_tipos_desayuno(request)
        hotel_ids = _parse_hotel_ids(request)
    except ValueError as e:
        return JsonResponse({"error": str(e)}, status=400)

    try:
        with tracking() as t:
            turnos = get_turnos_desayuno(fecha_inicio, fecha_fin, tipos_desayuno, hotel_ids)
        return JsonResponse({"turnos": turnos, "origenDatos": origen_datos(t)})
    except Exception:
        logger.exception("Error al generar los turnos de desayuno")
        return JsonResponse({"error": "No se pudieron obtener los turnos de desayuno"}, status=502)


@requiere_dashboard("desayunos")
def desayunos_serie_mensual(request):
    """Serie mensual (12 meses) de Desayunos, cadena completa o restringida
    a una lista de hoteles — endpoint aparte de /api/desayunos/ (2026-09-03),
    mismo motivo que desayunos_turnos: Zona/Submarca/Hotel es un filtro
    client-side sobre la tabla de hoteles ya cargada, así que necesita su
    propia llamada para no arrastrar el recálculo de esa tabla. Usado por
    Tendencias, la única vista que consume esta serie."""
    fecha_inicio, fecha_fin, error_response = _rango_mes_por_defecto(request, MAX_RANGO_DIAS_DESAYUNOS)
    if error_response is not None:
        return error_response
    try:
        tipos_desayuno = _parse_tipos_desayuno(request)
        hotel_ids = _parse_hotel_ids(request)
    except ValueError as e:
        return JsonResponse({"error": str(e)}, status=400)

    try:
        with tracking() as t:
            serie = get_serie_mensual(fecha_inicio, fecha_fin, tipos_desayuno, hotel_ids)
        return JsonResponse({"serieMensual": serie, "origenDatos": origen_datos(t)})
    except Exception:
        logger.exception("Error al generar la serie mensual de desayuno")
        return JsonResponse({"error": "No se pudo obtener la serie mensual de desayuno"}, status=502)


@requiere_dashboard("desayunos")
def hotel_desayunos(request, hotel_id):
    fecha_inicio, fecha_fin, error_response = _rango_mes_por_defecto(request, MAX_RANGO_DIAS_DESAYUNOS)
    if error_response is not None:
        return error_response
    try:
        tipos_desayuno = _parse_tipos_desayuno(request)
    except ValueError as e:
        return JsonResponse({"error": str(e)}, status=400)

    try:
        with tracking() as t:
            if get_hotel_info(hotel_id) is None:
                return JsonResponse({"error": "Hotel no encontrado"}, status=404)
            data = get_hotel_desayunos(hotel_id, fecha_inicio, fecha_fin, tipos_desayuno)
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


@requiere_dashboard("desayunos")
def desayunos_ajustes(request):
    """Ajustes editables del dashboard de Desayunos (objetivos/umbrales) —
    ver hoteles.service.AJUSTES_DESAYUNOS_DEFECTO. Editar exige el mismo
    permiso que ver el dashboard, no hay un nivel de permiso "editar"
    propio todavía."""
    if request.method == "GET":
        return JsonResponse(get_ajustes_desayunos())

    if request.method in ("PATCH", "POST"):
        try:
            cambios = json.loads(request.body or b"{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "JSON inválido"}, status=400)
        try:
            return JsonResponse(set_ajustes_desayunos(cambios, request.user))
        except ValueError as e:
            return JsonResponse({"error": str(e)}, status=400)

    return JsonResponse({"error": "Método no permitido"}, status=405)


@requiere_dashboard("desayunos")
def desayunos_ajustes_hoteles(request):
    """Para el panel de administración de Ajustes (2026-09-04, "Objetivos
    por hotel"): valor global + cada hotel con su valor ya resuelto y qué
    claves tiene personalizadas."""
    if request.method != "GET":
        return JsonResponse({"error": "Método no permitido"}, status=405)
    return JsonResponse(get_ajustes_desayunos_hoteles_admin())


@requiere_dashboard("desayunos")
def desayunos_ajustes_hotel(request, hotel_id):
    """Ajustes de un hotel concreto — GET el valor resuelto (propio o
    heredado del global), PATCH para fijar un override o borrarlo (valor
    null/vacío en el cambio vuelve a heredar el global)."""
    if request.method == "GET":
        return JsonResponse(get_ajustes_desayunos(hotel_id))

    if request.method in ("PATCH", "POST"):
        try:
            cambios = json.loads(request.body or b"{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "JSON inválido"}, status=400)
        try:
            return JsonResponse(set_ajustes_desayunos(cambios, request.user, hotel_id))
        except ValueError as e:
            return JsonResponse({"error": str(e)}, status=400)

    return JsonResponse({"error": "Método no permitido"}, status=405)
