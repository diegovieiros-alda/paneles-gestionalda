from django.contrib import admin

from .models import MapeoRolPuesto


@admin.register(MapeoRolPuesto)
class MapeoRolPuestoAdmin(admin.ModelAdmin):
    list_display = ("puesto_trabajo", "grupo")
    autocomplete_fields = ("grupo",)
