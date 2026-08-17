"""Comprobación mínima de la asignación automática de rol por puesto de
trabajo. Sin BD: MapeoRolPuesto.objects se mockea (igual que
bloqueos/tests.py evita la BD probando el motor con datos sintéticos)."""
from unittest.mock import MagicMock, patch

from django.test import RequestFactory, SimpleTestCase

from .accounts import asignar_rol_automatico, requiere_superuser


def _usuario(con_grupos=False):
    user = MagicMock()
    user.groups.exists.return_value = con_grupos
    return user


class AsignarRolAutomaticoTests(SimpleTestCase):
    @patch("core.accounts.MapeoRolPuesto.objects")
    def test_asigna_el_grupo_mapeado_al_puesto(self, objects):
        grupo = MagicMock()
        objects.filter.return_value.first.return_value = MagicMock(grupo=grupo)
        user = _usuario()

        asignar_rol_automatico(user, "Revenue Manager")

        objects.filter.assert_called_once_with(puesto_trabajo__iexact="Revenue Manager")
        user.groups.add.assert_called_once_with(grupo)

    @patch("core.accounts.MapeoRolPuesto.objects")
    def test_no_asigna_nada_si_el_puesto_no_esta_mapeado(self, objects):
        objects.filter.return_value.first.return_value = None
        user = _usuario()

        asignar_rol_automatico(user, "Puesto inexistente")

        user.groups.add.assert_not_called()

    @patch("core.accounts.MapeoRolPuesto.objects")
    def test_no_pisa_un_rol_asignado_a_mano(self, objects):
        user = _usuario(con_grupos=True)

        asignar_rol_automatico(user, "Camarero")

        objects.filter.assert_not_called()
        user.groups.add.assert_not_called()

    @patch("core.accounts.MapeoRolPuesto.objects")
    def test_no_hace_nada_sin_puesto(self, objects):
        user = _usuario()

        asignar_rol_automatico(user, None)

        objects.filter.assert_not_called()
        user.groups.add.assert_not_called()


class RequiereSuperuserTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.vista = requiere_superuser(lambda request: MagicMock(status_code=200))

    def test_rechaza_sin_sesion(self):
        request = self.factory.get("/")
        request.user = MagicMock(is_authenticated=False)

        response = self.vista(request)

        self.assertEqual(response.status_code, 401)

    def test_rechaza_usuario_normal(self):
        request = self.factory.get("/")
        request.user = MagicMock(is_authenticated=True, is_superuser=False)

        response = self.vista(request)

        self.assertEqual(response.status_code, 403)

    def test_deja_pasar_a_superusuario(self):
        request = self.factory.get("/")
        request.user = MagicMock(is_authenticated=True, is_superuser=True)

        response = self.vista(request)

        self.assertEqual(response.status_code, 200)
