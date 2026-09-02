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
#
# 2026-08-27: "oportunidades"/"tendencias"/"alertas"/"ajustes" dejan de ser
# dashboards propios — pasan a ser secciones dentro de cada dashboard
# (rutas /desayunos/oportunidades, /bloqueos/alertas, etc.), gateadas por el
# permiso del dashboard que las contiene, no por un permiso propio. Los
# permisos "ver_oportunidades"/"ver_tendencias"/"ver_alertas"/"ver_ajustes"
# quedan huérfanos en la base de datos (Django no los borra solo) pero no
# los comprueba ya ningún código — verificado antes de este cambio que
# ningún usuario activo dependía de ellos (grupos "F&B" y "tmz" los tenían,
# ambos sin miembros).
DASHBOARDS = [
    ("bloqueos", "Bloqueos"),
    ("desayunos", "Desayunos"),
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


class DashboardSetting(models.Model):
    """Ajustes editables de cada dashboard (objetivos/umbrales), antes
    hardcodeados en el frontend (frontend/src/lib/mock-data.ts:
    TARGET_PENETRACION, UMBRAL_PENETRACION, TARGET_OPORTUNIDAD). Clave-valor
    simple: no hace falta más estructura mientras solo Desayunos tenga
    ajustes reales — ver hoteles/service.py::get_ajustes_desayunos.
    Editar requiere el mismo permiso que ver el dashboard (no hay un nivel
    de permiso "editar" propio todavía)."""

    dashboard = models.CharField(max_length=50)
    clave = models.CharField(max_length=100)
    valor = models.FloatField()
    actualizado_en = models.DateTimeField(auto_now=True)
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        constraints = [models.UniqueConstraint(fields=["dashboard", "clave"], name="unico_ajuste_por_dashboard")]

    def __str__(self):
        return f"{self.dashboard}.{self.clave} = {self.valor}"


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


class PresupuestoDesayunoMensual(models.Model):
    """Presupuesto de desayuno (Ingresos cuenta 705.20 / Costes internos
    cuenta 601.1) por hotel y mes, importado periódicamente desde la hoja
    de cálculo de Finanzas "PRESUPUESTOS F&B" (Google Sheets) — decisión
    2026-09-02: sustituye a la consulta contra Odoo
    (account_move_budget_line), que solo tenía presupuesto confirmado para
    algunos hoteles a partir de octubre 2026 (ver kpis-definiciones.md).
    Ver management/commands/importar_presupuesto_fb.py.

    property_code, no pms_property_id: la hoja identifica el hotel por su
    código de propiedad (el mismo que usa bloqueos.engine.MAPEO_ZONAS), no
    por el id interno de Odoo — se resuelve a pms_property_id en el
    momento de leer (hoteles.repository, vía fetch_hoteles), no al
    guardar, así que un cambio de id en Odoo no invalida lo ya importado."""

    property_code = models.CharField(max_length=20)
    mes = models.DateField(help_text="Día 1 del mes presupuestado")
    ingresos = models.FloatField(default=0.0)
    gastos = models.FloatField(default=0.0)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["property_code", "mes"], name="unico_presupuesto_fb_por_hotel_mes")
        ]
        verbose_name = "Presupuesto de desayuno (mensual)"
        verbose_name_plural = "Presupuestos de desayuno (mensuales)"

    def __str__(self):
        return f"{self.property_code} {self.mes.isoformat()}: ingresos={self.ingresos} gastos={self.gastos}"


class PerfilUsuario(models.Model):
    """Departamento y puesto de trabajo de Odoo del usuario, cacheados en
    cada login para mostrarlos en la pantalla de administración sin
    consultar Odoo por cada usuario listado. Ver accounts.actualizar_perfil()."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="perfil")
    departamento_odoo = models.CharField(max_length=200, blank=True, default="")
    puesto_trabajo = models.CharField(max_length=200, blank=True, default="")
