"""Gestión de usuarios y roles desde el frontend (solo superusuarios):
listar usuarios, cambiar su rol o desactivarlos, y mantener el mapeo
departamento de Odoo → rol que usa el registro automático (ver
accounts.asignar_rol_automatico). Reemplaza el flujo manual por /admin/.
"""
from __future__ import annotations

import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import connections
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from .accounts import requiere_superuser
from .cache import cache_result
from .models import MapeoRolDepartamento

User = get_user_model()


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
@require_http_methods(["PATCH"])
def usuario_detalle(request, user_id):
    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({"error": "Usuario no encontrado"}, status=404)

    if user.is_superuser:
        return JsonResponse({"error": "No se puede modificar a un superusuario desde aquí"}, status=403)

    if "activo" in data:
        user.is_active = bool(data["activo"])
        user.save(update_fields=["is_active"])

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
def roles(request):
    return JsonResponse({"roles": [{"id": g.id, "nombre": g.name} for g in Group.objects.order_by("name")]})


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
