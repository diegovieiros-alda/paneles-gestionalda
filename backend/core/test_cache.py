"""Comprobación mínima de que cache_result evita llamadas repetidas."""
from django.test import SimpleTestCase

from .cache import cache_result


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
