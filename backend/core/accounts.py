"""Registro de usuarios: solo empleados activos de Alda pueden crear cuenta,
y su rol (Group) se asigna automáticamente según su puesto de trabajo en Odoo.

La comprobación de "es empleado" se hace contra hr_employee en Odoo (solo
lectura, ver core/bloqueos/repository.py para el patrón), no filtramos por
company_id porque el grupo tiene varias sociedades y cualquier empleado
activo de cualquiera de ellas cuenta como empleado de la compañía.
"""
from __future__ import annotations

from functools import wraps

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import connections
from django.http import JsonResponse

from .models import DASHBOARDS, MapeoRolPuesto, PerfilUsuario

User = get_user_model()

DASHBOARD_KEYS = [key for key, _ in DASHBOARDS]


def dashboards_visibles(user) -> list[str]:
    """Dashboards que el usuario puede ver: todos si es superuser, si no
    los que le dé su(s) Group(s) (rol) vía el permiso "core.ver_<key>"."""
    if user.is_superuser:
        return DASHBOARD_KEYS
    perms = user.get_all_permissions()
    return [key for key in DASHBOARD_KEYS if f"core.ver_{key}" in perms]


def requiere_dashboard(key: str):
    """Decorador para vistas: exige sesión iniciada y acceso al dashboard `key`."""

    def decorator(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return JsonResponse({"error": "No autenticado"}, status=401)
            if not (request.user.is_superuser or request.user.has_perm(f"core.ver_{key}")):
                return JsonResponse({"error": "Sin acceso a este dashboard"}, status=403)
            return view(request, *args, **kwargs)

        return wrapped

    return decorator


def requiere_algun_dashboard(*keys: str):
    """Como requiere_dashboard, pero exige acceso a al menos uno de varios
    dashboards — usado por la identidad de hotel (/api/hoteles/<id>/), que ya
    no tiene permiso propio: se llega desde el listado de cualquier
    dashboard que muestre hoteles (hoy desayunos y bloqueos)."""

    def decorator(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return JsonResponse({"error": "No autenticado"}, status=401)
            if not (request.user.is_superuser or any(request.user.has_perm(f"core.ver_{k}") for k in keys)):
                return JsonResponse({"error": "Sin acceso a este dashboard"}, status=403)
            return view(request, *args, **kwargs)

        return wrapped

    return decorator


def requiere_superuser(view):
    """Decorador para vistas: exige sesión iniciada y superusuario (usado
    por la pantalla de administración de usuarios)."""

    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "No autenticado"}, status=401)
        if not request.user.is_superuser:
            return JsonResponse({"error": "Requiere permisos de administrador"}, status=403)
        return view(request, *args, **kwargs)

    return wrapped


class RegistroError(Exception):
    def __init__(self, mensaje: str, status: int = 400):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status = status


def empleado_activo(email: str) -> dict | None:
    """Datos del empleado activo con ese email (para validar el registro y
    decidir su rol), o None si no es un empleado activo de la compañía.
    job_title es un varchar plano en hr_employee (no hace falta el join a
    hr_job, que además tiene el nombre en jsonb multi-idioma)."""
    with connections["odoo"].cursor() as cur:
        cur.execute(
            """
            SELECT hd.name::text, he.job_title
            FROM hr_employee he
            LEFT JOIN hr_department hd ON hd.id = he.department_id
            WHERE he.active = true AND lower(he.work_email) = lower(%s)
            LIMIT 1
            """,
            [email],
        )
        row = cur.fetchone()
    if row is None:
        return None
    return {"departamento": row[0], "puesto": row[1]}


def actualizar_perfil(user, departamento: str | None, puesto: str | None = None) -> None:
    """Cachea el departamento y puesto de trabajo actuales del usuario para
    la pantalla de administración (evita consultar Odoo al listar usuarios)."""
    PerfilUsuario.objects.update_or_create(
        user=user, defaults={"departamento_odoo": departamento or "", "puesto_trabajo": puesto or ""}
    )


def asignar_rol_automatico(user, puesto: str | None) -> None:
    """Asigna el Group mapeado a `puesto` (ver MapeoRolPuesto). Solo si el
    usuario no tiene ya un rol asignado, para no pisar una asignación
    manual hecha por un administrador."""
    if not puesto or user.groups.exists():
        return
    mapeo = MapeoRolPuesto.objects.filter(puesto_trabajo__iexact=puesto).first()
    if mapeo is not None:
        user.groups.add(mapeo.grupo)


def registrar_usuario(email: str, password: str, nombre: str = ""):
    email = (email or "").strip().lower()

    try:
        validate_email(email)
    except ValidationError:
        raise RegistroError("Email inválido")

    if User.objects.filter(email=email).exists():
        raise RegistroError("Ya existe una cuenta con ese email", status=409)

    try:
        validate_password(password)
    except ValidationError as e:
        raise RegistroError(" ".join(e.messages))

    empleado = empleado_activo(email)
    if empleado is None:
        raise RegistroError("Ese email no corresponde a un empleado activo de la compañía", status=403)

    user = User(username=email, email=email, first_name=nombre.strip()[:150])
    user.set_password(password)
    user.save()
    actualizar_perfil(user, empleado["departamento"], empleado["puesto"])
    asignar_rol_automatico(user, empleado["puesto"])
    return user
