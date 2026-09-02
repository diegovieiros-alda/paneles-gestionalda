"""Comprobación mínima del límite de intentos de login (core.views.iniciar_sesion).
Sin BD: se llama a la view directamente con RequestFactory (sin pasar por
Client, así que tampoco hace falta token CSRF) y se mockea authenticate()."""
import json
from unittest.mock import patch

from django.core.cache import cache
from django.test import RequestFactory, SimpleTestCase

from .views import RATE_LIMIT_INTENTOS_LOGIN, iniciar_sesion


def _post_login(factory, email="user@test.com", password="mal"):
    request = factory.post(
        "/api/auth/login/", data=json.dumps({"email": email, "password": password}), content_type="application/json"
    )
    return iniciar_sesion(request)


class RateLimitLoginTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.factory = RequestFactory()

    @patch("core.views.authenticate", return_value=None)
    def test_bloquea_tras_superar_el_limite_de_intentos_fallidos(self, _authenticate):
        for _ in range(RATE_LIMIT_INTENTOS_LOGIN):
            response = _post_login(self.factory)
            self.assertEqual(response.status_code, 401)

        response = _post_login(self.factory)
        self.assertEqual(response.status_code, 429)

    @patch("core.views.authenticate", return_value=None)
    def test_intentos_fallidos_no_bloquean_por_debajo_del_limite(self, _authenticate):
        for _ in range(RATE_LIMIT_INTENTOS_LOGIN - 1):
            response = _post_login(self.factory)
            self.assertEqual(response.status_code, 401)

    def test_login_correcto_resetea_el_contador(self):
        with patch("core.views.authenticate", return_value=None):
            for _ in range(RATE_LIMIT_INTENTOS_LOGIN - 1):
                _post_login(self.factory)

        usuario = type("Usuario", (), {
            "email": "user@test.com", "first_name": "Test", "is_superuser": False,
        })()
        with patch("core.views.authenticate", return_value=usuario), \
             patch("core.views.login"), \
             patch("core.views.empleado_activo", return_value=None), \
             patch("core.views.dashboards_visibles", return_value=[]):
            response = _post_login(self.factory)
        self.assertEqual(response.status_code, 200)

        # El contador se reseteó: un fallo justo después no debería bloquear.
        with patch("core.views.authenticate", return_value=None):
            response = _post_login(self.factory)
        self.assertEqual(response.status_code, 401)
