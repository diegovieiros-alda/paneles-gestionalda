from django.conf import settings
from django.contrib.auth.models import Group
from django.db import models

# Claves de dashboard = rutas del frontend (frontend/src/App.tsx). Un rol es
# un django.contrib.auth.Group al que se le asignan permisos "ver_<key>"
# desde /admin/ — no hace falta un modelo de "Rol" propio.
#
# No existe "hoteles" como dashboard propio: no hay una sección de hoteles
# independiente, cada dashboard con datos por hotel (desayunos, bloqueos)
# trae su propio listado y su propia ficha de detalle, gateados por el
# permiso de ese dashboard — ver accounts.requiere_algun_dashboard.
DASHBOARDS = [
    ("bloqueos", "Bloqueos"),
    ("oportunidades", "Oportunidades"),
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


class MapeoRolPuesto(models.Model):
    """Puesto de trabajo de Odoo (hr_employee.job_title) → rol (Group) que
    se le asigna automáticamente al usuario al registrarse. Se gestiona
    desde la pantalla de administración del frontend (core/admin_views.py),
    no desde /admin/: si el puesto de un empleado no tiene fila aquí, se
    registra sin rol y un administrador se lo asigna a mano."""

    puesto_trabajo = models.CharField(max_length=200, unique=True)
    grupo = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="+")

    class Meta:
        verbose_name = "Mapeo puesto → rol"
        verbose_name_plural = "Mapeos puesto → rol"

    def __str__(self):
        return f"{self.puesto_trabajo} → {self.grupo.name}"


class PerfilUsuario(models.Model):
    """Departamento y puesto de trabajo de Odoo del usuario, cacheados en
    cada login para mostrarlos en la pantalla de administración sin
    consultar Odoo por cada usuario listado. Ver accounts.actualizar_perfil()."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="perfil")
    departamento_odoo = models.CharField(max_length=200, blank=True, default="")
    puesto_trabajo = models.CharField(max_length=200, blank=True, default="")
