"""Comprobación mínima de las reglas de negocio de service.py que ya han
causado bugs reales esta sesión (división por cero, redondeo, "0% engañoso"
vs "sin presupuesto", mes natural) — sin tocar la BD real de Odoo: las
funciones puras se prueban directamente, y get_hoteles() con
repository.fetch_* mockeado (unittest.mock), igual que bloqueos/tests.py usa
datos sintéticos en vez de conectar a Postgres.

Esto NO sustituye la validación de las consultas SQL contra datos reales
(ver kpis-definiciones.md, apéndice de auditoría) — cubre la lógica Python
de combinación/redondeo/exclusión, que es donde puede reintroducirse un bug
ya corregido sin que ninguna consulta SQL cambie."""
import datetime
from unittest import mock

from django.test import SimpleTestCase

from . import repository, service

_DESAYUNO_VACIO = service._DESAYUNO_VACIO
_FNB_VACIO = service._FNB_VACIO
_PRESUPUESTO_VACIO = service._PRESUPUESTO_VACIO


class PrecioMedioTests(SimpleTestCase):
    def test_sin_unidades_da_cero_no_error(self):
        d = {**_DESAYUNO_VACIO, "produccion": 0.0, "cantidad_total": 0}
        self.assertEqual(service._precio_medio(d), 0.0)

    def test_divide_produccion_entre_cantidad_total_no_directa(self):
        # A propósito "cantidad_total" (incluye colaborador), no "cantidad"
        # (directa) — dividir por la directa infla el precio medio.
        d = {**_DESAYUNO_VACIO, "produccion": 100.0, "cantidad": 5, "cantidad_total": 10}
        self.assertEqual(service._precio_medio(d), 10.0)


class FacturacionJsonTests(SimpleTestCase):
    def test_sin_produccion_da_cero_no_division_por_cero(self):
        d = {**_DESAYUNO_VACIO}
        resultado = service._facturacion_json(d)
        self.assertEqual(resultado["porcentajeFacturado"], 0.0)

    def test_produccion_facturada_mas_sin_facturar_es_consistente(self):
        d = {
            **_DESAYUNO_VACIO,
            "cantidad_facturada": 10,
            "cantidad_sin_facturar": 2,
            "produccion": 120.0,
            "produccion_facturada": 100.0,
            "produccion_sin_facturar": 20.0,
        }
        resultado = service._facturacion_json(d)
        self.assertEqual(resultado["desayunosFacturados"], 10)
        self.assertEqual(resultado["desayunosSinFacturar"], 2)
        self.assertAlmostEqual(resultado["porcentajeFacturado"], 100.0 / 120.0, places=4)


class RangoEsMesNaturalTests(SimpleTestCase):
    def test_mes_completo_es_valido(self):
        self.assertTrue(service._rango_es_mes_natural(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31)))

    def test_febrero_bisiesto(self):
        self.assertTrue(service._rango_es_mes_natural(datetime.date(2028, 2, 1), datetime.date(2028, 2, 29)))

    def test_rango_parcial_no_es_valido(self):
        self.assertFalse(service._rango_es_mes_natural(datetime.date(2026, 1, 5), datetime.date(2026, 1, 20)))

    def test_no_empieza_en_dia_1_no_es_valido(self):
        self.assertFalse(service._rango_es_mes_natural(datetime.date(2026, 1, 2), datetime.date(2026, 1, 31)))

    def test_varios_meses_completos_es_valido(self):
        self.assertTrue(service._rango_es_mes_natural(datetime.date(2026, 1, 1), datetime.date(2026, 2, 28)))


class FnbJsonTests(SimpleTestCase):
    def test_sin_ingresos_margen_es_cero_no_error(self):
        resultado = service._fnb_json({**_FNB_VACIO})
        self.assertEqual(resultado["margenBruto"], 0.0)
        self.assertEqual(resultado["precioMedioVenta"], 0.0)

    def test_sin_presupuesto_confirmado_cumplimiento_es_none_no_cero(self):
        # "0%" sería engañoso (parece que no se vendió nada, no que falta
        # presupuesto) — motivo_presupuesto es justo para distinguir esto.
        f = {"ingresos": 1000.0, "gastos": 500.0, "unidades": 100}
        resultado = service._fnb_json(f, _PRESUPUESTO_VACIO, "rango_no_es_mes_natural")
        self.assertIsNone(resultado["cumplimientoIngresos"])
        self.assertIsNone(resultado["cumplimientoGastos"])
        self.assertEqual(resultado["presupuestoMotivo"], "rango_no_es_mes_natural")

    def test_con_presupuesto_calcula_cumplimiento(self):
        f = {"ingresos": 900.0, "gastos": 450.0, "unidades": 100}
        presupuesto = {"presupuestoIngresos": 1000.0, "presupuestoGastos": 500.0}
        resultado = service._fnb_json(f, presupuesto)
        self.assertEqual(resultado["cumplimientoIngresos"], 0.9)
        self.assertEqual(resultado["cumplimientoGastos"], 0.9)
        self.assertEqual(resultado["resultadoFB"], 450.0)


class HaceNMesesTests(SimpleTestCase):
    def test_retrocede_manteniendo_el_mes_de_fecha_fin_dentro_de_la_ventana(self):
        # 11 meses atrás desde marzo -> abril del año anterior = 12 meses
        # en total (abr..mar), igual que el resto de "últimos 12 meses".
        self.assertEqual(service._hace_n_meses(datetime.date(2026, 3, 15), 11), datetime.date(2025, 4, 1))

    def test_cruza_el_cambio_de_anio(self):
        self.assertEqual(service._hace_n_meses(datetime.date(2026, 1, 1), 11), datetime.date(2025, 2, 1))


def _hotel(id, property_code="413", company_id=1, name="Hotel Test"):
    return {"id": id, "name": name, "property_code": property_code, "company_id": company_id}


class GetHotelesTests(SimpleTestCase):
    """get_hoteles() combina 6 fetch_* de repository.py en Python — se mockean
    todas para probar solo esa combinación (exclusión, fallback a "vacío",
    división por cero, redondeo), sin tocar la BD real de Odoo."""

    def _mock_repository(self, **overrides):
        defaults = dict(
            fetch_hoteles=[_hotel(1), _hotel(24, property_code="307"), _hotel(2, property_code=None)],
            fetch_companies={1: "Alda Hotels S.A."},
            fetch_submarcas={},
            fetch_alojados={1: 100},
            fetch_desayunos={1: {**_DESAYUNO_VACIO, "cantidad": 40, "cantidad_total": 45, "produccion": 450.0}},
            fetch_fnb_desayuno={},
            fetch_presupuesto_desayuno={},
            fetch_calidad_checkin={},
        )
        defaults.update(overrides)
        patchers = [mock.patch.object(repository, nombre, return_value=valor) for nombre, valor in defaults.items()]
        for p in patchers:
            p.start()
            self.addCleanup(p.stop)

    def test_excluye_hotel_fuera_de_cadena_por_id_fijo(self):
        self._mock_repository()
        resultado = service.get_hoteles(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
        ids = {h["id"] for h in resultado["hoteles"]}
        self.assertNotIn(24, ids)  # id fijo excluido (bloqueos.engine.HOTEL_IDS_EXCLUIDOS_FIJOS)

    def test_hotel_sin_reservas_sale_con_ceros_no_desaparece(self):
        self._mock_repository()
        resultado = service.get_hoteles(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
        hotel_2 = next(h for h in resultado["hoteles"] if h["id"] == 2)
        self.assertEqual(hotel_2["alojados"], 0)
        self.assertEqual(hotel_2["produccion"], 0.0)
        self.assertEqual(hotel_2["penetracion"], 0.0)  # no división por cero

    def test_property_code_nulo_da_codigo_vacio_no_none(self):
        self._mock_repository()
        resultado = service.get_hoteles(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
        hotel_2 = next(h for h in resultado["hoteles"] if h["id"] == 2)
        self.assertEqual(hotel_2["codigo"], "")

    def test_penetracion_es_desayunos_directos_entre_alojados(self):
        self._mock_repository()
        resultado = service.get_hoteles(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
        hotel_1 = next(h for h in resultado["hoteles"] if h["id"] == 1)
        self.assertEqual(hotel_1["penetracion"], 0.4)  # 40 / 100

    def test_rango_parcial_no_pide_presupuesto_y_marca_motivo(self):
        with mock.patch.object(repository, "fetch_presupuesto_desayuno") as fetch_presupuesto:
            self._mock_repository()
            resultado = service.get_hoteles(datetime.date(2026, 1, 5), datetime.date(2026, 1, 20))
            fetch_presupuesto.assert_not_called()
        hotel_1 = next(h for h in resultado["hoteles"] if h["id"] == 1)
        self.assertEqual(hotel_1["presupuestoMotivo"], "rango_no_es_mes_natural")
        self.assertIsNone(hotel_1["cumplimientoIngresos"])

    def test_ordena_por_produccion_descendente(self):
        self._mock_repository(
            fetch_hoteles=[_hotel(1), _hotel(2)],
            fetch_desayunos={
                1: {**_DESAYUNO_VACIO, "produccion": 100.0, "cantidad_total": 10},
                2: {**_DESAYUNO_VACIO, "produccion": 500.0, "cantidad_total": 50},
            },
        )
        resultado = service.get_hoteles(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
        self.assertEqual([h["id"] for h in resultado["hoteles"]], [2, 1])
