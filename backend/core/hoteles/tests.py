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


class HaceUnAnoTests(SimpleTestCase):
    def test_mismo_dia_del_ano_anterior(self):
        self.assertEqual(service._hace_un_ano(datetime.date(2026, 7, 15)), datetime.date(2025, 7, 15))

    def test_29_febrero_bisiesto_a_no_bisiesto_cae_en_28(self):
        # 2028 es bisiesto, 2027 no — no existe un 29/02/2027 al que volver.
        self.assertEqual(service._hace_un_ano(datetime.date(2028, 2, 29)), datetime.date(2027, 2, 28))

    def test_29_febrero_bisiesto_a_bisiesto_se_mantiene(self):
        self.assertEqual(service._hace_un_ano(datetime.date(2032, 2, 29)), datetime.date(2031, 2, 28))


class VariacionTests(SimpleTestCase):
    def test_variacion_positiva(self):
        self.assertAlmostEqual(service._variacion(120.0, 100.0), 0.2)

    def test_variacion_negativa(self):
        self.assertAlmostEqual(service._variacion(80.0, 100.0), -0.2)

    def test_ly_cero_da_none_no_division_por_cero(self):
        self.assertIsNone(service._variacion(50.0, 0.0))


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
        mocks = {}
        for nombre, valor in defaults.items():
            p = mock.patch.object(repository, nombre, return_value=valor)
            mocks[nombre] = p.start()
            self.addCleanup(p.stop)
        return mocks

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
        # Un solo nivel de patch (el que ya hace _mock_repository) — apilar
        # un "with mock.patch.object(...)" propio encima del mismo nombre
        # aquí dejaba, al terminar el test, un MagicMock permanente en
        # repository.fetch_presupuesto_desayuno en vez de restaurar la
        # función real (el cleanup del patch interior pisaba el resultado
        # del exterior) — verificado: rompía en silencio cualquier test
        # posterior en el módulo que dependiera de la función real.
        mocks = self._mock_repository()
        resultado = service.get_hoteles(datetime.date(2026, 1, 5), datetime.date(2026, 1, 20))
        mocks["fetch_presupuesto_desayuno"].assert_not_called()
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

    def test_ly_pide_el_mismo_periodo_del_ano_anterior(self):
        # fetch_alojados/fetch_desayunos/fetch_fnb_desayuno se llaman DOS
        # veces: una con las fechas pedidas, otra con las mismas
        # desplazadas un año (_hace_un_ano) — sin mockear con side_effect
        # por fecha, las dos llamadas devolverían el mismo mock y no se
        # podría distinguir "actual" de "LY" en el resultado.
        def alojados_por_fecha(desde, hasta):
            return {1: 100} if desde.year == 2026 else {1: 80}

        def desayunos_por_fecha(desde, hasta, tipos=None):
            if desde.year == 2026:
                return {1: {**_DESAYUNO_VACIO, "cantidad": 40, "cantidad_total": 40, "produccion": 400.0}}
            return {1: {**_DESAYUNO_VACIO, "cantidad": 20, "cantidad_total": 20, "produccion": 200.0}}

        mocks = self._mock_repository()
        mocks["fetch_alojados"].side_effect = alojados_por_fecha
        mocks["fetch_alojados"].return_value = None
        mocks["fetch_desayunos"].side_effect = desayunos_por_fecha
        mocks["fetch_desayunos"].return_value = None

        resultado = service.get_hoteles(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
        hotel_1 = next(h for h in resultado["hoteles"] if h["id"] == 1)

        self.assertEqual(hotel_1["alojados"], 100)
        self.assertEqual(hotel_1["alojadosLY"], 80.0)
        self.assertAlmostEqual(hotel_1["alojadosVarLY"], 0.25)  # (100-80)/80
        self.assertEqual(hotel_1["produccion"], 400.0)
        self.assertEqual(hotel_1["produccionLY"], 200.0)
        self.assertAlmostEqual(hotel_1["produccionVarLY"], 1.0)  # se dobló

        # Las llamadas de LY usan fechas de 2025, no de 2026.
        fechas_llamadas = {c.args[:2] for c in mocks["fetch_alojados"].call_args_list}
        self.assertIn((datetime.date(2025, 1, 1), datetime.date(2025, 1, 31)), fechas_llamadas)

    def test_ly_sin_datos_no_rompe_por_division_por_cero(self):
        mocks = self._mock_repository()
        mocks["fetch_alojados"].side_effect = lambda desde, hasta: {} if desde.year == 2025 else {1: 100}
        mocks["fetch_alojados"].return_value = None
        resultado = service.get_hoteles(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
        hotel_1 = next(h for h in resultado["hoteles"] if h["id"] == 1)
        self.assertEqual(hotel_1["alojadosLY"], 0.0)
        self.assertIsNone(hotel_1["alojadosVarLY"])  # sin línea base, no "+inf%"


class GetHotelDesayunosTests(SimpleTestCase):
    """get_hotel_desayunos (ficha individual) debe filtrar por tipo igual
    que get_hoteles (listado) — bug real reportado 2026-09-03: "las fichas
    individuales no muestran los mismos datos que en la lista", porque
    esta función ignoraba `tipos_desayuno` por completo y siempre pedía
    todos los tipos, aunque la tabla de origen estuviera filtrada."""

    def _mock_repository(self, **overrides):
        defaults = dict(
            fetch_alojados={1: 100},
            fetch_desayunos={1: {**_DESAYUNO_VACIO, "cantidad": 40, "cantidad_total": 45, "produccion": 450.0}},
            fetch_desayunos_por_tipo={},
            fetch_fnb_desayuno={},
            fetch_presupuesto_desayuno={},
            fetch_alojados_mensual_hotel={},
            fetch_desayunos_mensual_hotel={},
            fetch_fnb_serie_mensual_hotel={},
            fetch_presupuesto_serie_mensual_hotel={},
            fetch_turnos_desayuno_hotel=[],
            fetch_desayunos_por_producto_hotel=[],
        )
        defaults.update(overrides)
        mocks = {}
        for nombre, valor in defaults.items():
            p = mock.patch.object(repository, nombre, return_value=valor)
            mocks[nombre] = p.start()
            self.addCleanup(p.stop)
        return mocks

    def test_reenvia_tipos_desayuno_a_fetch_desayunos(self):
        # fetch_desayunos se llama dos veces (actual + LY, ver
        # test_incluye_comparativa_ly abajo) — assert_any_call en vez de
        # assert_called_once_with, que ya no aplica desde que existe LY.
        mocks = self._mock_repository()
        service.get_hotel_desayunos(
            1, datetime.date(2026, 1, 1), datetime.date(2026, 1, 31), tipos_desayuno=("buffet", "express")
        )
        mocks["fetch_desayunos"].assert_any_call(
            datetime.date(2026, 1, 1), datetime.date(2026, 1, 31), ("buffet", "express")
        )

    def test_sin_tipos_pide_todos_igual_que_antes(self):
        mocks = self._mock_repository()
        service.get_hotel_desayunos(1, datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
        mocks["fetch_desayunos"].assert_any_call(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31), None)

    def test_incluye_comparativa_ly(self):
        def desayunos_por_fecha(desde, hasta, tipos=None):
            if desde.year == 2026:
                return {1: {**_DESAYUNO_VACIO, "cantidad": 40, "cantidad_total": 40, "produccion": 400.0}}
            return {1: {**_DESAYUNO_VACIO, "cantidad": 20, "cantidad_total": 20, "produccion": 200.0}}

        mocks = self._mock_repository()
        mocks["fetch_desayunos"].side_effect = desayunos_por_fecha
        mocks["fetch_desayunos"].return_value = None

        resultado = service.get_hotel_desayunos(1, datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
        self.assertEqual(resultado["actual"]["produccion"], 400.0)
        self.assertEqual(resultado["actual"]["produccionLY"], 200.0)
        self.assertAlmostEqual(resultado["actual"]["produccionVarLY"], 1.0)
        mocks["fetch_desayunos"].assert_any_call(datetime.date(2025, 1, 1), datetime.date(2025, 1, 31), None)

    def test_tipos_desayuno_lista_solo_los_que_tienen_unidades(self):
        # "Tipo desayuno (en caso de mezclar varios mostrar)" en la cabecera
        # de la ficha — lista los tipos que el hotel vende de verdad en el
        # periodo, no el filtro de Producto que esté activo.
        self._mock_repository(
            fetch_desayunos_por_tipo={
                1: {
                    "buffet": {**_DESAYUNO_VACIO, "cantidad_total": 10},
                    "express": {**_DESAYUNO_VACIO, "cantidad_total": 0},
                    "colaborador": {**_DESAYUNO_VACIO, "cantidad_total": 3},
                    "otros": {**_DESAYUNO_VACIO, "cantidad_total": 0},
                }
            }
        )
        resultado = service.get_hotel_desayunos(1, datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
        self.assertEqual(resultado["tiposDesayuno"], ["buffet", "colaborador"])

    def test_desglose_por_producto_reenvia_tipos_y_calcula_precio_medio(self):
        mocks = self._mock_repository(
            fetch_desayunos_por_producto_hotel=[
                {"producto": "Desayuno Buffet Adulto", "unidades": 100.0, "ventas": 627.0},
                {"producto": "Desayuno Niño", "unidades": 0.0, "ventas": 0.0},
            ]
        )
        resultado = service.get_hotel_desayunos(
            1, datetime.date(2026, 1, 1), datetime.date(2026, 1, 31), tipos_desayuno=("buffet",)
        )
        mocks["fetch_desayunos_por_producto_hotel"].assert_called_once_with(
            1, datetime.date(2026, 1, 1), datetime.date(2026, 1, 31), ("buffet",)
        )
        self.assertEqual(resultado["desglosePorProducto"], [
            {"producto": "Desayuno Buffet Adulto", "unidades": 100, "ventas": 627.0, "precioMedio": 6.27},
            {"producto": "Desayuno Niño", "unidades": 0, "ventas": 0.0, "precioMedio": 0.0},  # sin dividir por cero
        ])


class FetchDesayunosPorTipoTests(SimpleTestCase):
    """fetch_desayunos (repository.py) es un compuesto que suma
    fetch_desayunos_por_tipo en Python (2026-09-02) — antes cada combinación
    de Producto disparaba su propia consulta SQL contra Odoo, sin cachear
    entre combinaciones ("los filtros tardan mucho en cargar"). Se mockea
    fetch_desayunos_por_tipo (no el cursor) para probar solo la suma."""

    _DESGLOSE = {
        1: {
            "buffet": {**_DESAYUNO_VACIO, "cantidad_total": 10, "produccion": 100.0},
            "express": {**_DESAYUNO_VACIO, "cantidad_total": 5, "produccion": 50.0},
            "colaborador": {**_DESAYUNO_VACIO, "cantidad_total": 3, "produccion": 30.0},
            "otros": {**_DESAYUNO_VACIO, "cantidad_total": 2, "produccion": 20.0},
        },
    }

    def test_sin_filtro_suma_los_4_tipos(self):
        with mock.patch.object(repository, "fetch_desayunos_por_tipo", return_value=self._DESGLOSE):
            resultado = repository.fetch_desayunos(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
        self.assertEqual(resultado[1]["cantidad_total"], 20)
        self.assertEqual(resultado[1]["produccion"], 200.0)

    def test_con_filtro_solo_suma_los_tipos_pedidos(self):
        with mock.patch.object(repository, "fetch_desayunos_por_tipo", return_value=self._DESGLOSE):
            resultado = repository.fetch_desayunos(
                datetime.date(2026, 1, 1), datetime.date(2026, 1, 31), tipos_desayuno=("buffet", "express")
            )
        self.assertEqual(resultado[1]["cantidad_total"], 15)
        self.assertEqual(resultado[1]["produccion"], 150.0)

    def test_todos_los_tipos_explicitos_da_lo_mismo_que_sin_filtro(self):
        with mock.patch.object(repository, "fetch_desayunos_por_tipo", return_value=self._DESGLOSE):
            sin_filtro = repository.fetch_desayunos(datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
            con_los_4 = repository.fetch_desayunos(
                datetime.date(2026, 1, 1), datetime.date(2026, 1, 31),
                tipos_desayuno=("buffet", "express", "colaborador", "otros"),
            )
        self.assertEqual(sin_filtro, con_los_4)

    def test_hotel_sin_ningun_tipo_seleccionado_sale_en_ceros_no_desaparece(self):
        with mock.patch.object(repository, "fetch_desayunos_por_tipo", return_value=self._DESGLOSE):
            resultado = repository.fetch_desayunos(
                datetime.date(2026, 1, 1), datetime.date(2026, 1, 31), tipos_desayuno=("colaborador",)
            )
        self.assertEqual(resultado[1]["cantidad_total"], 3)
        self.assertEqual(resultado[1]["produccion"], 30.0)


class CtesDesayunoFacturadoFiltradoTests(SimpleTestCase):
    """Guardia de regresión (2026-09-02): la CTE "facturado" de
    _CTES_DESAYUNO agregaba TODO el histórico de facturación sin filtro de
    fecha — medido contra producción: 14,7s escaneando 12,3M filas de
    account_move_line en cada consulta, aunque el resto de la query solo
    pidiera un hotel y un día ("cargar un hotel individual tarda
    muchísimo"). El fix (join a folio_sale_line filtrado por el mismo
    desde/hasta que ya usa el resto de la query) bajó ese caso de ~11s a
    ~0,4s sin cambiar ningún resultado (verificado contra los 3 hoteles de
    referencia). No hay forma de probar el tiempo de consulta sin BD real
    aquí — esto solo evita que alguien copie el patrón antiguo (CTE sin
    filtro) en una consulta nueva sin darse cuenta del coste."""

    def test_facturado_filtra_por_fecha_no_agrega_todo_el_historico(self):
        self.assertIn("fsl_fact.date_order BETWEEN %(desde)s AND %(hasta)s", repository._CTES_DESAYUNO)
        self.assertIn("JOIN folio_sale_line fsl_fact ON fsl_fact.id = ir.sale_line_id", repository._CTES_DESAYUNO)


class PresupuestoDesayunoOdooVsExcelTests(SimpleTestCase):
    """fetch_presupuesto_desayuno combina Odoo (confirmado, prioritario) y
    la hoja de Finanzas (respaldo) — 2026-09-02, corregido sobre la marcha
    ("hay que traer también el dato de Odoo... indicar de dónde viene el
    dato") tras haber planteado sustituir Odoo por completo. Se prueba la
    combinación mockeando las dos fuentes por separado, sin BD ni Odoo."""

    def test_hotel_solo_en_odoo(self):
        with mock.patch.object(repository, "fetch_presupuesto_desayuno_odoo",
                                return_value={1: {"presupuestoIngresos": 100.0, "presupuestoGastos": 40.0}}), \
             mock.patch.object(repository, "fetch_presupuesto_desayuno_excel", return_value={}):
            resultado = repository.fetch_presupuesto_desayuno(datetime.date(2026, 7, 1), datetime.date(2026, 7, 31))
        self.assertEqual(resultado[1]["presupuestoOrigen"], "odoo")
        self.assertEqual(resultado[1]["presupuestoIngresos"], 100.0)

    def test_hotel_solo_en_excel(self):
        with mock.patch.object(repository, "fetch_presupuesto_desayuno_odoo", return_value={}), \
             mock.patch.object(repository, "fetch_presupuesto_desayuno_excel",
                                return_value={1: {"presupuestoIngresos": 50.0, "presupuestoGastos": 20.0}}):
            resultado = repository.fetch_presupuesto_desayuno(datetime.date(2026, 7, 1), datetime.date(2026, 7, 31))
        self.assertEqual(resultado[1]["presupuestoOrigen"], "excel")
        self.assertEqual(resultado[1]["presupuestoIngresos"], 50.0)

    def test_odoo_gana_cuando_hay_los_dos_para_el_mismo_hotel(self):
        with mock.patch.object(repository, "fetch_presupuesto_desayuno_odoo",
                                return_value={1: {"presupuestoIngresos": 100.0, "presupuestoGastos": 40.0}}), \
             mock.patch.object(repository, "fetch_presupuesto_desayuno_excel",
                                return_value={1: {"presupuestoIngresos": 999.0, "presupuestoGastos": 999.0}}):
            resultado = repository.fetch_presupuesto_desayuno(datetime.date(2026, 7, 1), datetime.date(2026, 7, 31))
        self.assertEqual(resultado[1]["presupuestoOrigen"], "odoo")
        self.assertEqual(resultado[1]["presupuestoIngresos"], 100.0)  # no la de Excel

    def test_se_conservan_los_dos_valores_por_separado_para_comparar(self):
        with mock.patch.object(repository, "fetch_presupuesto_desayuno_odoo",
                                return_value={1: {"presupuestoIngresos": 100.0, "presupuestoGastos": 40.0}}), \
             mock.patch.object(repository, "fetch_presupuesto_desayuno_excel",
                                return_value={1: {"presupuestoIngresos": 999.0, "presupuestoGastos": 555.0}}):
            resultado = repository.fetch_presupuesto_desayuno(datetime.date(2026, 7, 1), datetime.date(2026, 7, 31))
        # aunque "gane" Odoo, Excel no desaparece — se puede comparar en el frontend
        self.assertEqual(resultado[1]["presupuestoIngresosOdoo"], 100.0)
        self.assertEqual(resultado[1]["presupuestoGastosOdoo"], 40.0)
        self.assertEqual(resultado[1]["presupuestoIngresosExcel"], 999.0)
        self.assertEqual(resultado[1]["presupuestoGastosExcel"], 555.0)

    def test_valor_de_la_fuente_ausente_es_none_no_cero(self):
        with mock.patch.object(repository, "fetch_presupuesto_desayuno_odoo",
                                return_value={1: {"presupuestoIngresos": 100.0, "presupuestoGastos": 40.0}}), \
             mock.patch.object(repository, "fetch_presupuesto_desayuno_excel", return_value={}):
            resultado = repository.fetch_presupuesto_desayuno(datetime.date(2026, 7, 1), datetime.date(2026, 7, 31))
        self.assertIsNone(resultado[1]["presupuestoIngresosExcel"])
        self.assertIsNone(resultado[1]["presupuestoGastosExcel"])

    def test_hoteles_distintos_no_se_mezclan(self):
        with mock.patch.object(repository, "fetch_presupuesto_desayuno_odoo",
                                return_value={1: {"presupuestoIngresos": 100.0, "presupuestoGastos": 40.0}}), \
             mock.patch.object(repository, "fetch_presupuesto_desayuno_excel",
                                return_value={2: {"presupuestoIngresos": 50.0, "presupuestoGastos": 20.0}}):
            resultado = repository.fetch_presupuesto_desayuno(datetime.date(2026, 7, 1), datetime.date(2026, 7, 31))
        self.assertEqual(resultado[1]["presupuestoOrigen"], "odoo")
        self.assertEqual(resultado[2]["presupuestoOrigen"], "excel")

    def test_unidades_previstas_solo_vienen_de_excel_ganen_o_no_en_euros(self):
        # Para el gráfico "Alojados vs ud desayunos" (unidades, no €): las
        # unidades presupuestadas solo existen en la hoja de Finanzas, así
        # que deben verse aunque Odoo "gane" la cifra en € para ese hotel/mes.
        with mock.patch.object(repository, "fetch_presupuesto_desayuno_odoo",
                                return_value={1: {"presupuestoIngresos": 100.0, "presupuestoGastos": 40.0}}), \
             mock.patch.object(repository, "fetch_presupuesto_desayuno_excel",
                                return_value={1: {
                                    "presupuestoIngresos": 999.0, "presupuestoGastos": 999.0,
                                    "alojadosPrevistos": 700.0, "desayunosPrevistos": 315.7,
                                }}):
            resultado = repository.fetch_presupuesto_desayuno(datetime.date(2026, 7, 1), datetime.date(2026, 7, 31))
        self.assertEqual(resultado[1]["presupuestoOrigen"], "odoo")  # Odoo gana en €
        self.assertEqual(resultado[1]["alojadosPrevistos"], 700.0)  # pero las unidades siguen viéndose
        self.assertEqual(resultado[1]["desayunosPrevistos"], 315.7)

    def test_sin_datos_de_excel_las_unidades_previstas_son_none(self):
        with mock.patch.object(repository, "fetch_presupuesto_desayuno_odoo",
                                return_value={1: {"presupuestoIngresos": 100.0, "presupuestoGastos": 40.0}}), \
             mock.patch.object(repository, "fetch_presupuesto_desayuno_excel", return_value={}):
            resultado = repository.fetch_presupuesto_desayuno(datetime.date(2026, 7, 1), datetime.date(2026, 7, 31))
        self.assertIsNone(resultado[1]["alojadosPrevistos"])
        self.assertIsNone(resultado[1]["desayunosPrevistos"])


class PresupuestoDesayunoExcelFormulaTests(SimpleTestCase):
    """fetch_presupuesto_desayuno_excel calcula ingresos/gastos a partir
    de los 4 componentes de la hoja (Alojados × % × precio/coste) — la
    fórmula vive en repository.py a propósito, no en la hoja ni en el
    importador (pedido: que sea visible y auditable)."""

    def setUp(self):
        # @cache_result persiste en disco entre ejecuciones (ver
        # test_cache.py) — sin esto, una fecha_inicio/fecha_fin ya usada en
        # otra ejecución devolvería el resultado cacheado en vez de pasar
        # por el mock de este test.
        from django.core.cache import cache

        cache.clear()

    def test_calcula_ingresos_y_gastos_desde_los_componentes(self):
        with mock.patch.object(repository, "fetch_hoteles", return_value=[{"id": 1, "property_code": "999"}]), \
             mock.patch("core.models.PresupuestoDesayunoMensual.objects") as objects:
            objects.filter.return_value.values.return_value = [
                {
                    "property_code": "999",
                    "alojados_previstos": 740.0,
                    "penetracion_prevista": 0.4508,
                    "precio_interno": 6.27,
                    "coste_interno": 3.45,
                }
            ]
            resultado = repository.fetch_presupuesto_desayuno_excel(
                datetime.date(2026, 10, 1), datetime.date(2026, 10, 31)
            )
        unidades = 740.0 * 0.4508
        self.assertAlmostEqual(resultado[1]["presupuestoIngresos"], unidades * 6.27)
        self.assertAlmostEqual(resultado[1]["presupuestoGastos"], unidades * 3.45)

    def test_serie_mensual_hotel_expone_unidades_previstas_no_solo_euros(self):
        # Para el gráfico "Alojados vs ud desayunos" de la ficha de hotel
        # (2026-09-03) — antes se calculaban las unidades y se descartaban.
        with mock.patch.object(repository, "fetch_hoteles", return_value=[{"id": 1, "property_code": "999"}]), \
             mock.patch("core.models.PresupuestoDesayunoMensual.objects") as objects:
            objects.filter.return_value.values.return_value = [
                {
                    "mes": datetime.date(2026, 10, 1),
                    "alojados_previstos": 740.0,
                    "penetracion_prevista": 0.4508,
                    "precio_interno": 6.27,
                    "coste_interno": 3.45,
                }
            ]
            resultado = repository.fetch_presupuesto_serie_mensual_hotel_excel(
                1, datetime.date(2026, 10, 1), datetime.date(2026, 10, 31)
            )
        mes = resultado["2026-10-01"]
        self.assertEqual(mes["alojadosPrevistos"], 740.0)
        self.assertAlmostEqual(mes["desayunosPrevistos"], 740.0 * 0.4508)

    def _filas_dos_hoteles(self):
        return [
            {
                "mes": datetime.date(2026, 10, 1), "property_code": "999",
                "alojados_previstos": 100.0, "penetracion_prevista": 0.5,
                "precio_interno": 6.0, "coste_interno": 3.0,
            },
            {
                "mes": datetime.date(2026, 10, 1), "property_code": "888",
                "alojados_previstos": 200.0, "penetracion_prevista": 0.5,
                "precio_interno": 6.0, "coste_interno": 3.0,
            },
        ]

    def test_serie_mensual_excel_sin_filtro_suma_todos_los_hoteles(self):
        # 2026-09-03: fetch_presupuesto_serie_mensual_excel gana un
        # hotel_ids opcional (para Tendencias) — sin filtro debe seguir
        # sumando la cadena completa, igual que antes de este cambio.
        with mock.patch("core.models.PresupuestoDesayunoMensual.objects") as objects:
            objects.filter.return_value.values.return_value = self._filas_dos_hoteles()
            resultado = repository.fetch_presupuesto_serie_mensual_excel(
                datetime.date(2026, 10, 1), datetime.date(2026, 10, 31)
            )
        # (100+200) alojados_previstos × 0.5 penetración × 6€ = 900€
        self.assertAlmostEqual(resultado["2026-10-01"]["presupuestoIngresos"], 900.0)

    def test_serie_mensual_excel_con_hotel_ids_solo_cuenta_ese_hotel(self):
        with mock.patch.object(
            repository, "fetch_hoteles", return_value=[{"id": 1, "property_code": "999"}, {"id": 2, "property_code": "888"}]
        ), mock.patch("core.models.PresupuestoDesayunoMensual.objects") as objects:
            objects.filter.return_value.values.return_value = self._filas_dos_hoteles()
            resultado = repository.fetch_presupuesto_serie_mensual_excel(
                datetime.date(2026, 10, 1), datetime.date(2026, 10, 31), (1,)
            )
        # Solo el hotel 1 (property_code "999"): 100 × 0.5 × 6€ = 300€
        self.assertAlmostEqual(resultado["2026-10-01"]["presupuestoIngresos"], 300.0)
