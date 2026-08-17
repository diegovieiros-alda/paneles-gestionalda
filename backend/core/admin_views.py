"""Gestión de usuarios y roles desde el frontend (solo superusuarios):
listar usuarios, cambiar su rol o desactivarlos, y mantener el mapeo
departamento de Odoo → rol que usa el registro automático (ver
accounts.asignar_rol_automatico). Reemplaza el flujo manual por /admin/.
"""
from __future__ import annotations

import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.db import connections
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from .accounts import requiere_superuser
from .cache import cache_result
from .models import DASHBOARDS, MapeoRolDepartamento

User = get_user_model()
DASHBOARD_KEYS = [key for key, _ in DASHBOARDS]


def _usuario_json(user) -> dict:
    grupo = user.groups.first()
    perfil = getattr(user, "perfil", None)
    return {
        "id": user.id,
        "email": user.email,
        "nombre": user.first_name,
        "activo": user.is_active,
        "esSuperusuario": user.is_superuser,
        "departamento": perfil.departamento_odoo if perfil else "",
        "grupoId": grupo.id if grupo else None,
        "grupoNombre": grupo.name if grupo else None,
    }


@requiere_superuser
@require_http_methods(["GET"])
def usuarios(request):
    qs = User.objects.select_related("perfil").prefetch_related("groups").order_by("email")
    return JsonResponse({"usuarios": [_usuario_json(u) for u in qs]})


@requiere_superuser
@require_http_methods(["PATCH", "DELETE"])
def usuario_detalle(request, user_id):
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({"error": "Usuario no encontrado"}, status=404)

    if user.is_superuser:
        return JsonResponse({"error": "No se puede modificar a un superusuario desde aquí"}, status=403)

    if request.method == "DELETE":
        user.delete()
        return JsonResponse({"ok": True})

    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    if "activo" in data:
        user.is_active = bool(data["activo"])
        user.save(update_fields=["is_active"])

    if "esSuperusuario" in data and data["esSuperusuario"]:
        user.is_superuser = True
        user.is_staff = True
        user.save(update_fields=["is_superuser", "is_staff"])

    if "grupoId" in data:
        grupo_id = data["grupoId"]
        if grupo_id is None:
            user.groups.clear()
        else:
            try:
                grupo = Group.objects.get(id=grupo_id)
            except Group.DoesNotExist:
                return JsonResponse({"error": "Rol no encontrado"}, status=404)
            user.groups.set([grupo])

    return JsonResponse(_usuario_json(user))


@requiere_superuser
@require_http_methods(["GET"])
def dashboards_disponibles(request):
    return JsonResponse({"dashboards": [{"key": key, "nombre": label} for key, label in DASHBOARDS]})


def _permisos_dashboards(keys) -> list:
    codenames = [f"ver_{k}" for k in keys if k in DASHBOARD_KEYS]
    return list(Permission.objects.filter(content_type__app_label="core", codename__in=codenames))


def _rol_json(grupo: Group) -> dict:
    codenames = set(
        grupo.permissions.filter(content_type__app_label="core").values_list("codename", flat=True)
    )
    dashboards = [key for key in DASHBOARD_KEYS if f"ver_{key}" in codenames]
    return {"id": grupo.id, "nombre": grupo.name, "dashboards": dashboards}


@requiere_superuser
@require_http_methods(["GET", "POST"])
def roles(request):
    if request.method == "GET":
        return JsonResponse({"roles": [_rol_json(g) for g in Group.objects.order_by("name")]})

    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    nombre = (data.get("nombre") or "").strip()
    if not nombre:
        return JsonResponse({"error": "Falta nombre"}, status=400)
    if Group.objects.filter(name__iexact=nombre).exists():
        return JsonResponse({"error": "Ya existe un rol con ese nombre"}, status=409)

    grupo = Group.objects.create(name=nombre)
    grupo.permissions.set(_permisos_dashboards(data.get("dashboards") or []))
    return JsonResponse(_rol_json(grupo), status=201)


@requiere_superuser
@require_http_methods(["PATCH", "DELETE"])
def rol_detalle(request, grupo_id):
    try:
        grupo = Group.objects.get(id=grupo_id)
    except Group.DoesNotExist:
        return JsonResponse({"error": "Rol no encontrado"}, status=404)

    if request.method == "DELETE":
        grupo.delete()
        return JsonResponse({"ok": True})

    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    if "nombre" in data:
        nuevo = (data["nombre"] or "").strip()
        if not nuevo:
            return JsonResponse({"error": "nombre no puede estar vacío"}, status=400)
        grupo.name = nuevo
        grupo.save(update_fields=["name"])
    if "dashboards" in data:
        grupo.permissions.set(_permisos_dashboards(data["dashboards"]))

    return JsonResponse(_rol_json(grupo))


@cache_result
def _departamentos_odoo() -> list[str]:
    with connections["odoo"].cursor() as cur:
        cur.execute("SELECT DISTINCT name::text FROM hr_department WHERE name IS NOT NULL ORDER BY 1")
        return [r[0] for r in cur.fetchall()]


@requiere_superuser
@require_http_methods(["GET"])
def departamentos(request):
    return JsonResponse({"departamentos": _departamentos_odoo()})


def _mapeo_json(m: MapeoRolDepartamento) -> dict:
    return {"id": m.id, "departamentoOdoo": m.departamento_odoo, "grupoId": m.grupo_id, "grupoNombre": m.grupo.name}


@requiere_superuser
@require_http_methods(["GET", "POST"])
def mapeos(request):
    if request.method == "GET":
        qs = MapeoRolDepartamento.objects.select_related("grupo").order_by("departamento_odoo")
        return JsonResponse({"mapeos": [_mapeo_json(m) for m in qs]})

    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    departamento = (data.get("departamentoOdoo") or "").strip()
    grupo_id = data.get("grupoId")
    if not departamento or not grupo_id:
        return JsonResponse({"error": "Faltan departamentoOdoo o grupoId"}, status=400)

    try:
        grupo = Group.objects.get(id=grupo_id)
    except Group.DoesNotExist:
        return JsonResponse({"error": "Rol no encontrado"}, status=404)

    if MapeoRolDepartamento.objects.filter(departamento_odoo__iexact=departamento).exists():
        return JsonResponse({"error": "Ese departamento ya tiene un mapeo"}, status=409)

    mapeo = MapeoRolDepartamento.objects.create(departamento_odoo=departamento, grupo=grupo)
    return JsonResponse(_mapeo_json(mapeo), status=201)


@requiere_superuser
@require_http_methods(["PATCH", "DELETE"])
def mapeo_detalle(request, mapeo_id):
    try:
        mapeo = MapeoRolDepartamento.objects.get(id=mapeo_id)
    except MapeoRolDepartamento.DoesNotExist:
        return JsonResponse({"error": "Mapeo no encontrado"}, status=404)

    if request.method == "DELETE":
        mapeo.delete()
        return JsonResponse({"ok": True})

    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    if "grupoId" in data:
        try:
            mapeo.grupo = Group.objects.get(id=data["grupoId"])
        except Group.DoesNotExist:
            return JsonResponse({"error": "Rol no encontrado"}, status=404)
    if "departamentoOdoo" in data:
        nuevo = (data["departamentoOdoo"] or "").strip()
        if not nuevo:
            return JsonResponse({"error": "departamentoOdoo no puede estar vacío"}, status=400)
        mapeo.departamento_odoo = nuevo
    mapeo.save()
    return JsonResponse(_mapeo_json(mapeo))
