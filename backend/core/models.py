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
