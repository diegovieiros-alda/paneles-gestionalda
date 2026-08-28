from django.urls import path
from . import admin_views, views

urlpatterns = [
    path('health/', views.health, name='health'),
    path('bloqueos/', views.bloqueos, name='bloqueos'),
    path('hoteles/<int:hotel_id>/', views.hotel_detalle, name='hotel_detalle'),
    path('hoteles/<int:hotel_id>/desayunos/', views.hotel_desayunos, name='hotel_desayunos'),
    path('hoteles/<int:hotel_id>/bloqueos/', views.hotel_bloqueos, name='hotel_bloqueos'),
    path('desayunos/', views.desayunos, name='desayunos'),
    path('desayunos/ajustes/', views.desayunos_ajustes, name='desayunos_ajustes'),
    path('auth/csrf/', views.csrf, name='csrf'),
    path('auth/registro/', views.registro, name='registro'),
    path('auth/login/', views.iniciar_sesion, name='login'),
    path('auth/logout/', views.cerrar_sesion, name='logout'),
    path('auth/me/', views.me, name='me'),
    path('admin/usuarios/', admin_views.usuarios, name='admin_usuarios'),
    path('admin/usuarios/<int:user_id>/', admin_views.usuario_detalle, name='admin_usuario_detalle'),
    path('admin/roles/', admin_views.roles, name='admin_roles'),
    path('admin/roles/<int:grupo_id>/', admin_views.rol_detalle, name='admin_rol_detalle'),
    path('admin/dashboards/', admin_views.dashboards_disponibles, name='admin_dashboards'),
    path('admin/puestos/', admin_views.puestos, name='admin_puestos'),
    path('admin/mapeos/', admin_views.mapeos, name='admin_mapeos'),
    path('admin/mapeos/<int:mapeo_id>/', admin_views.mapeo_detalle, name='admin_mapeo_detalle'),
]
