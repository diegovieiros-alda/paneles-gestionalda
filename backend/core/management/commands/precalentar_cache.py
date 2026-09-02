"""Precalienta la caché de disco (django_cache/, ver core/cache.py) para las
vistas por defecto de Desayunos (hoy) y Bloqueos (ayer) — pensado para
ejecutarse cada hora vía cron en producción, así el primer usuario que
entra en la web no paga el coste de la consulta en vivo contra Odoo.

No se puede acelerar la consulta en sí: esta app solo tiene lectura contra
la base de producción de Odoo, sin permiso para tocar su esquema ni
añadir índices (algunas columnas de fecha relevantes no los tienen, ver
aviso en kpis-definiciones.md) — la única palanca disponible es que la
caché ya esté caliente cuando alguien la pide, no una consulta más rápida.

Uso en cron (usuario paneles, cada hora):
    0 * * * * cd /home/paneles/paneles-backend && venv/bin/python manage.py precalentar_cache
"""
import datetime
import logging

from django.core.management.base import BaseCommand

from core.bloqueos.service import get_report
from core.hoteles.service import get_resumen

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Precalienta la caché de Desayunos (hoy) y Bloqueos (ayer). Pensado para cron cada hora."

    def handle(self, *args, **options):
        hoy = datetime.date.today()

        try:
            get_resumen(hoy, hoy)
            self.stdout.write(self.style.SUCCESS(f"Desayunos ({hoy}): caché precalentada"))
        except Exception:
            logger.exception("Error precalentando la caché de Desayunos")
            self.stderr.write(self.style.ERROR("Desayunos: fallo al precalentar la caché"))

        try:
            get_report()  # sin fechas: usa "ayer" por defecto, igual que el frontend
            self.stdout.write(self.style.SUCCESS("Bloqueos (ayer): caché precalentada"))
        except Exception:
            logger.exception("Error precalentando la caché de Bloqueos")
            self.stderr.write(self.style.ERROR("Bloqueos: fallo al precalentar la caché"))
