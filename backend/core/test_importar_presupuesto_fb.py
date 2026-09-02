"""Comprobación del parseo de la hoja de previsión de desayuno — con datos
SINTÉTICOS, nunca las cifras reales de la hoja de Finanzas (son
confidenciales). Sin BD: parsear_filas/_parse_numero/_parse_porcentaje son
funciones puras sobre una rejilla de celdas."""
import datetime

from django.test import SimpleTestCase

from .management.commands.importar_presupuesto_fb import _parse_numero, _parse_porcentaje, parsear_filas


class ParseNumeroTests(SimpleTestCase):
    def test_formato_espanol_con_simbolo_euro(self):
        self.assertEqual(_parse_numero("125,56 €"), 125.56)

    def test_con_separador_de_miles(self):
        self.assertEqual(_parse_numero("1.234,56 €"), 1234.56)

    def test_entero_sin_simbolo(self):
        self.assertEqual(_parse_numero("648"), 648.0)

    def test_celda_vacia_da_none_no_cero(self):
        self.assertIsNone(_parse_numero(""))
        self.assertIsNone(_parse_numero("   "))

    def test_texto_no_numerico_da_none(self):
        self.assertIsNone(_parse_numero("[merged]"))


class ParsePorcentajeTests(SimpleTestCase):
    def test_convierte_a_fraccion_no_porcentaje(self):
        self.assertAlmostEqual(_parse_porcentaje("45,08%"), 0.4508)

    def test_celda_vacia_da_none(self):
        self.assertIsNone(_parse_porcentaje(""))


def _fila_hotel(codigo: str, nombre: str) -> list[str]:
    return [f"{codigo} - {nombre}", "[merged]", "[merged]"]


def _fila_meses(*fechas: str) -> list[str]:
    return ["DESCRIPCIÓN", *fechas]


class ParsearFilasTests(SimpleTestCase):
    def test_un_hotel_un_mes(self):
        filas = [
            _fila_hotel("999", "HOTEL DE PRUEBA"),
            _fila_meses("01/10/2026"),
            ["Alojados", "648"],
            ["% desayunos X Alojados", "45,08%"],
            ["Precio interno", "6,27 €"],
            ["Coste desayuno interno", "3,45 €"],
            ["Ingresos (705.20)", "999,99 €"],  # ya no se lee — no debe aparecer en el resultado
        ]
        resultado = parsear_filas(filas)
        self.assertEqual(resultado, [
            {
                "property_code": "999", "mes": datetime.date(2026, 10, 1),
                "alojados_previstos": 648.0, "penetracion_prevista": 0.4508,
                "precio_interno": 6.27, "coste_interno": 3.45,
            },
        ])

    def test_varios_meses_mismo_hotel(self):
        filas = [
            _fila_hotel("999", "HOTEL DE PRUEBA"),
            _fila_meses("01/10/2026", "01/11/2026"),
            ["Alojados", "740", "434"],
            ["% desayunos X Alojados", "45,08%", "28,50%"],
            ["Precio interno", "6,27 €", "6,27 €"],
            ["Coste desayuno interno", "3,45 €", "3,45 €"],
        ]
        resultado = parsear_filas(filas)
        self.assertEqual(len(resultado), 2)
        self.assertEqual(resultado[0]["alojados_previstos"], 740.0)
        self.assertEqual(resultado[1]["alojados_previstos"], 434.0)
        self.assertAlmostEqual(resultado[1]["penetracion_prevista"], 0.285)

    def test_varios_hoteles_seguidos(self):
        filas = [
            *[_fila_hotel("101", "HOTEL UNO"), _fila_meses("01/10/2026"), ["Alojados", "100"]],
            *[_fila_hotel("102", "HOTEL DOS"), _fila_meses("01/10/2026"), ["Alojados", "200"]],
        ]
        resultado = parsear_filas(filas)
        self.assertEqual([r["property_code"] for r in resultado], ["101", "102"])
        self.assertEqual(resultado[0]["alojados_previstos"], 100.0)
        self.assertEqual(resultado[1]["alojados_previstos"], 200.0)

    def test_mes_sin_ningun_dato_no_genera_registro(self):
        filas = [
            _fila_hotel("999", "HOTEL DE PRUEBA"),
            _fila_meses("01/10/2026", "01/11/2026"),
            ["Alojados", "648", ""],  # noviembre sin dato
        ]
        resultado = parsear_filas(filas)
        self.assertEqual(len(resultado), 1)
        self.assertEqual(resultado[0]["mes"], datetime.date(2026, 10, 1))

    def test_hotel_sin_fila_de_meses_se_ignora_sin_error(self):
        filas = [
            _fila_hotel("999", "HOTEL SIN DATOS"),
            ["Alojados", "648"],  # sin "DESCRIPCIÓN" antes: no hay columnas que mapear
        ]
        resultado = parsear_filas(filas)
        self.assertEqual(resultado, [])

    def test_filas_antes_del_primer_hotel_se_ignoran(self):
        filas = [
            ["", "", ""],
            ["Algún título de la hoja"],
            _fila_hotel("999", "HOTEL DE PRUEBA"),
            _fila_meses("01/10/2026"),
            ["Alojados", "648"],
        ]
        resultado = parsear_filas(filas)
        self.assertEqual(len(resultado), 1)

    def test_solo_una_fila_rellena_tambien_se_importa(self):
        filas = [
            _fila_hotel("999", "HOTEL DE PRUEBA"),
            _fila_meses("01/10/2026"),
            ["Precio interno", "6,27 €"],
        ]
        resultado = parsear_filas(filas)
        self.assertEqual(resultado, [
            {
                "property_code": "999", "mes": datetime.date(2026, 10, 1),
                "alojados_previstos": 0.0, "penetracion_prevista": 0.0,
                "precio_interno": 6.27, "coste_interno": 0.0,
            },
        ])
