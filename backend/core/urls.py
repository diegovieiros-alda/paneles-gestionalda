from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.health, name='health'),
    path('bloqueos/', views.bloqueos, name='bloqueos'),
    path('hoteles/', views.hoteles, name='hoteles'),
    path('hoteles/<int:hotel_id>/', views.hotel_detalle, name='hotel_detalle'),
    path('hoteles/<int:hotel_id>/desayunos/', views.hotel_desayunos, name='hotel_desayunos'),
    path('hoteles/<int:hotel_id>/bloqueos/', views.hotel_bloqueos, name='hotel_bloqueos'),
    path('desayunos/', views.desayunos, name='desayunos'),
    path('resumen/', views.resumen, name='resumen'),
    path('auth/csrf/', views.csrf, name='csrf'),
    path('auth/registro/', views.registro, name='registro'),
    path('auth/login/', views.iniciar_sesion, name='login'),
    path('auth/logout/', views.cerrar_sesion, name='logout'),
    path('auth/me/', views.me, name='me'),
]
