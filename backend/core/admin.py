from django.contrib import admin

from .models import MapeoRolPuesto, PresupuestoDesayunoMensual


@admin.register(MapeoRolPuesto)
class MapeoRolPuestoAdmin(admin.ModelAdmin):
    list_display = ("puesto_trabajo", "grupo")
    autocomplete_fields = ("grupo",)


@admin.register(PresupuestoDesayunoMensual)
class PresupuestoDesayunoMensualAdmin(admin.ModelAdmin):
    # Editable a mano por si hace falta corregir un valor puntual entre dos
    # importaciones, pero el origen normal es
    # management/commands/importar_presupuesto_fb.py, no esta pantalla.
    list_display = ("property_code", "mes", "ingresos", "gastos", "actualizado_en")
    list_filter = ("mes",)
    search_fields = ("property_code",)
    ordering = ("-mes", "property_code")
