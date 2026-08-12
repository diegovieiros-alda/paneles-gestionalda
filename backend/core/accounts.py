"""Registro de usuarios: solo empleados activos de Alda pueden crear cuenta.

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

from .models import DASHBOARDS

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


class RegistroError(Exception):
    def __init__(self, mensaje: str, status: int = 400):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status = status


def es_empleado_activo(email: str) -> bool:
    with connections["odoo"].cursor() as cur:
        cur.execute(
            "SELECT 1 FROM hr_employee WHERE active = true AND lower(work_email) = lower(%s) LIMIT 1",
            [email],
        )
        return cur.fetchone() is not None


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

    if not es_empleado_activo(email):
        raise RegistroError("Ese email no corresponde a un empleado activo de la compañía", status=403)

    user = User(username=email, email=email, first_name=nombre.strip()[:150])
    user.set_password(password)
    user.save()
    return user
