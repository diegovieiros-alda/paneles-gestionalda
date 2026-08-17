"""Comprobación mínima de que cache_result evita llamadas repetidas."""
from django.test import SimpleTestCase

from .cache import cache_result, origen_datos, tracking


class CacheResultTests(SimpleTestCase):
    def test_evita_llamadas_repetidas_con_mismos_argumentos(self):
        llamadas = []

        @cache_result
        def consulta(fecha_inicio, fecha_fin):
            llamadas.append((fecha_inicio, fecha_fin))
            return f"{fecha_inicio}:{fecha_fin}"

        self.assertEqual(consulta("2026-01-01", "2026-01-31"), "2026-01-01:2026-01-31")
        self.assertEqual(consulta("2026-01-01", "2026-01-31"), "2026-01-01:2026-01-31")
        self.assertEqual(len(llamadas), 1)

    def test_distingue_por_argumentos(self):
        @cache_result
        def consulta(hotel_id):
            return hotel_id * 2

        self.assertEqual(consulta(1), 2)
        self.assertEqual(consulta(2), 4)


class TrackingTests(SimpleTestCase):
    def test_odoo_si_hubo_al_menos_un_miss(self):
        @cache_result
        def consulta(x):
            return x

        with tracking() as t:
            consulta("a-nueva")
            consulta("a-nueva")  # hit, no cambia el origen

        self.assertEqual(origen_datos(t), "odoo")

    def test_cache_si_todo_fueron_hits(self):
        @cache_result
        def consulta(x):
            return x

        consulta("b-precalentada")  # miss, fuera del tracking

        with tracking() as t:
            consulta("b-precalentada")

        self.assertEqual(origen_datos(t), "cache")

    def test_sin_tracking_activo_no_falla(self):
        @cache_result
        def consulta(x):
            return x

        self.assertEqual(consulta("c-sin-tracking"), "c-sin-tracking")
