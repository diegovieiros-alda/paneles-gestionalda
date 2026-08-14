from django.conf import settings
from django.contrib.auth.models import Group
from django.db import models

# Claves de dashboard = rutas del frontend (frontend/src/App.tsx). Un rol es
# un django.contrib.auth.Group al que se le asignan permisos "ver_<key>"
# desde /admin/ — no hace falta un modelo de "Rol" propio.
DASHBOARDS = [
    ("bloqueos", "Bloqueos"),
    ("donde_actuar", "¿Dónde actuar hoy?"),
    ("oportunidades", "Oportunidades"),
    ("hoteles", "Hoteles"),
    ("desayunos", "Desayunos"),
    ("tendencias", "Tendencias"),
    ("alertas", "Alertas"),
    ("ajustes", "Ajustes"),
]


class DashboardAccess(models.Model):
    """Sin tabla ni filas: existe solo para registrar los permisos
    "core.ver_<dashboard>" que luego se asignan a Groups (roles) desde el
    admin. Los superusuarios ven todos los dashboards sin necesidad de
    permisos explícitos (comportamiento estándar de Django)."""

    class Meta:
        managed = False
        default_permissions = ()
        permissions = [(f"ver_{key}", f"Puede ver el dashboard: {label}") for key, label in DASHBOARDS]


class MapeoRolDepartamento(models.Model):
    """Departamento de Odoo (hr_department.name) → rol (Group) que se le
    asigna automáticamente al usuario al registrarse. Se gestiona desde la
    pantalla de administración del frontend (core/admin_views.py), no
    desde /admin/: si el departamento de un empleado no tiene fila aquí,
    se registra sin rol y un administrador se lo asigna a mano."""

    departamento_odoo = models.CharField(max_length=200, unique=True)
    grupo = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="+")

    class Meta:
        verbose_name = "Mapeo departamento → rol"
        verbose_name_plural = "Mapeos departamento → rol"

    def __str__(self):
        return f"{self.departamento_odoo} → {self.grupo.name}"


class PerfilUsuario(models.Model):
    """Departamento de Odoo del usuario, cacheado en cada login para
    mostrarlo en la pantalla de administración sin consultar Odoo por
    cada usuario listado. Ver accounts.actualizar_perfil()."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="perfil")
    departamento_odoo = models.CharField(max_length=200, blank=True, default="")
