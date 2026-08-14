from django.contrib import admin

from .models import MapeoRolDepartamento


@admin.register(MapeoRolDepartamento)
class MapeoRolDepartamentoAdmin(admin.ModelAdmin):
    list_display = ("departamento_odoo", "grupo")
    autocomplete_fields = ("grupo",)
