"""Comprobación mínima de los rangos de fecha que precalentar_cache calcula
para "Mes/Trimestre/Año fiscal actuales" — mismo criterio de límites que
frontend/src/lib/date-range.ts::rangeForPreset, reimplementado en Python
porque el cron corre en el backend. Sin BD: son funciones puras de fecha."""
import datetime

from django.test import SimpleTestCase

from .management.commands.precalentar_cache import (
    _fin_de_mes,
    _rango_anio_fiscal_actual,
    _rango_mes_actual,
    _rango_trimestre_actual,
)


class FinDeMesTests(SimpleTestCase):
    def test_mes_de_31_dias(self):
        self.assertEqual(_fin_de_mes(datetime.date(2026, 1, 15)), datetime.date(2026, 1, 31))

    def test_febrero_bisiesto(self):
        self.assertEqual(_fin_de_mes(datetime.date(2028, 2, 10)), datetime.date(2028, 2, 29))

    def test_diciembre_no_rompe_el_cambio_de_anio(self):
        self.assertEqual(_fin_de_mes(datetime.date(2026, 12, 5)), datetime.date(2026, 12, 31))


class RangoMesActualTests(SimpleTestCase):
    def test_recorta_en_ayer_si_el_mes_esta_en_curso(self):
        desde, hasta = _rango_mes_actual(datetime.date(2026, 3, 15))
        self.assertEqual(desde, datetime.date(2026, 3, 1))
        self.assertEqual(hasta, datetime.date(2026, 3, 14))

    def test_no_baja_de_desde_el_primer_dia_del_mes(self):
        desde, hasta = _rango_mes_actual(datetime.date(2026, 3, 1))
        self.assertEqual(desde, datetime.date(2026, 3, 1))
        self.assertEqual(hasta, datetime.date(2026, 3, 1))  # ayer sería feb, no baja de "desde"


class RangoTrimestreActualTests(SimpleTestCase):
    def test_identifica_el_trimestre_que_contiene_hoy(self):
        desde, hasta = _rango_trimestre_actual(datetime.date(2026, 8, 10))  # Q3: jul-sep
        self.assertEqual(desde, datetime.date(2026, 7, 1))
        self.assertEqual(hasta, datetime.date(2026, 8, 9))

    def test_primer_trimestre_del_anio(self):
        desde, _ = _rango_trimestre_actual(datetime.date(2026, 1, 20))
        self.assertEqual(desde, datetime.date(2026, 1, 1))

    def test_ultimo_trimestre_del_anio(self):
        desde, _ = _rango_trimestre_actual(datetime.date(2026, 11, 5))
        self.assertEqual(desde, datetime.date(2026, 10, 1))


class RangoAnioFiscalActualTests(SimpleTestCase):
    def test_hoy_en_la_segunda_mitad_del_anio_fiscal(self):
        # 2026-03-01 cae en el año fiscal que empezó el 1 oct 2025.
        desde, hasta = _rango_anio_fiscal_actual(datetime.date(2026, 3, 1))
        self.assertEqual(desde, datetime.date(2025, 10, 1))
        self.assertEqual(hasta, datetime.date(2026, 9, 30))

    def test_hoy_ya_dentro_del_nuevo_anio_fiscal_en_octubre(self):
        desde, hasta = _rango_anio_fiscal_actual(datetime.date(2026, 10, 15))
        self.assertEqual(desde, datetime.date(2026, 10, 1))
        self.assertEqual(hasta, datetime.date(2027, 9, 30))

    def test_no_se_recorta_en_ayer_aunque_este_en_curso(self):
        # A diferencia de Mes/Trimestre, el año fiscal usa siempre su fin
        # real (30 de septiembre), nunca "ayer" — igual que el frontend.
        _, hasta = _rango_anio_fiscal_actual(datetime.date(2026, 1, 1))
        self.assertEqual(hasta, datetime.date(2026, 9, 30))
