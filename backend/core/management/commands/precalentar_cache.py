"""Precalienta la caché de disco (django_cache/, ver core/cache.py) para las
combinaciones de Periodo más probables de Desayunos (Día/Mes/Trimestre/Año
fiscal actuales) y Bloqueos (ayer) — pensado para ejecutarse cada hora vía
cron en producción, así el primer usuario que pide una de estas
combinaciones no paga el coste de la consulta en vivo contra Odoo.

Ampliado (2026-09-02, antes solo calentaba "hoy"): cambiar el filtro de
Periodo a Mes/Trimestre/Año fiscal caía siempre en una combinación fría —
"los filtros tardan mucho en cargar". El filtro de Producto ya NO necesita
su propia entrada de caché por combinación (ver
hoteles.repository.fetch_desayunos_por_tipo, 2026-09-02): el desglose
completo por tipo se cachea una vez por rango de fechas, y elegir qué
tipos sumar es una operación en Python, no una consulta nueva.

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
from core.hoteles.service import get_resumen, get_turnos_desayuno

logger = logging.getLogger(__name__)


def _fin_de_mes(d: datetime.date) -> datetime.date:
    return (d.replace(day=1) + datetime.timedelta(days=32)).replace(day=1) - datetime.timedelta(days=1)


def _hasta_de(desde: datetime.date, fin: datetime.date, hoy: datetime.date) -> datetime.date:
    """Mismo criterio que frontend/src/lib/date-range.ts::rangeForPreset:
    un periodo ya terminado usa su fin real; uno en curso se corta en
    "ayer" (hoy está incompleto). Al ejecutarse el cron, el periodo que
    contiene a "hoy" siempre está en curso, así que esto da "ayer" en la
    práctica — se deja explícito en vez de asumirlo, por si el cron
    alguna vez se ejecuta pensando en otro "hoy"."""
    ayer = hoy - datetime.timedelta(days=1)
    return fin if fin < hoy else max(ayer, desde)


def _rango_mes_actual(hoy: datetime.date) -> tuple[datetime.date, datetime.date]:
    desde = hoy.replace(day=1)
    return desde, _hasta_de(desde, _fin_de_mes(hoy), hoy)


def _rango_trimestre_actual(hoy: datetime.date) -> tuple[datetime.date, datetime.date]:
    trimestre = (hoy.month - 1) // 3  # 0..3
    desde = datetime.date(hoy.year, trimestre * 3 + 1, 1)
    fin = _fin_de_mes(datetime.date(hoy.year, trimestre * 3 + 3, 1))
    return desde, _hasta_de(desde, fin, hoy)


def _rango_anio_fiscal_actual(hoy: datetime.date) -> tuple[datetime.date, datetime.date]:
    # 1 oct - 30 sep, sin recortar en "ayer" aunque esté en curso — igual
    # que RangeFilter "Año fiscal" en el frontend.
    anio_inicio = hoy.year if hoy.month >= 10 else hoy.year - 1
    return datetime.date(anio_inicio, 10, 1), datetime.date(anio_inicio + 1, 9, 30)


class Command(BaseCommand):
    help = "Precalienta la caché de Desayunos (Día/Mes/Trimestre/Año fiscal actuales) y Bloqueos (ayer)."

    def handle(self, *args, **options):
        hoy = datetime.date.today()
        rangos_desayunos = [
            ("día", hoy, hoy),
            ("mes", *_rango_mes_actual(hoy)),
            ("trimestre", *_rango_trimestre_actual(hoy)),
            ("año fiscal", *_rango_anio_fiscal_actual(hoy)),
        ]

        for nombre, desde, hasta in rangos_desayunos:
            try:
                get_resumen(desde, hasta)
                get_turnos_desayuno(desde, hasta)
                self.stdout.write(self.style.SUCCESS(f"Desayunos ({nombre}, {desde}–{hasta}): caché precalentada"))
            except Exception:
                logger.exception("Error precalentando la caché de Desayunos (%s)", nombre)
                self.stderr.write(self.style.ERROR(f"Desayunos ({nombre}): fallo al precalentar la caché"))

        try:
            get_report()  # sin fechas: usa "ayer" por defecto, igual que el frontend
            self.stdout.write(self.style.SUCCESS("Bloqueos (ayer): caché precalentada"))
        except Exception:
            logger.exception("Error precalentando la caché de Bloqueos")
            self.stderr.write(self.style.ERROR("Bloqueos: fallo al precalentar la caché"))
