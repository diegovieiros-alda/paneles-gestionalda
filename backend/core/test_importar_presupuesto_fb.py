"""Comprobación del parseo de la hoja de presupuesto de desayuno — con
datos SINTÉTICOS, nunca las cifras reales de la hoja de Finanzas (son
confidenciales). Sin BD: parsear_filas/_parse_importe son funciones puras
sobre una rejilla de celdas."""
import datetime

from django.test import SimpleTestCase

from .management.commands.importar_presupuesto_fb import _parse_importe, parsear_filas


class ParseImporteTests(SimpleTestCase):
    def test_formato_espanol_con_simbolo_euro(self):
        self.assertEqual(_parse_importe("125,56 €"), 125.56)

    def test_con_separador_de_miles(self):
        self.assertEqual(_parse_importe("1.234,56 €"), 1234.56)

    def test_celda_vacia_da_none_no_cero(self):
        self.assertIsNone(_parse_importe(""))
        self.assertIsNone(_parse_importe("   "))

    def test_texto_no_numerico_da_none(self):
        self.assertIsNone(_parse_importe("[merged]"))


def _fila_hotel(codigo: str, nombre: str) -> list[str]:
    return [f"{codigo} - {nombre}", "[merged]", "[merged]"]


def _fila_meses(*fechas: str) -> list[str]:
    return ["DESCRIPCIÓN", *fechas]


class ParsearFilasTests(SimpleTestCase):
    def test_un_hotel_un_mes(self):
        filas = [
            _fila_hotel("999", "HOTEL DE PRUEBA"),
            _fila_meses("01/10/2026"),
            ["Alojados", "100"],  # fila irrelevante, debe ignorarse
            ["Ingresos (705.20)", "500,00 €"],
            ["Costes internos (601.1)", "200,00 €"],
        ]
        resultado = parsear_filas(filas)
        self.assertEqual(resultado, [
            {"property_code": "999", "mes": datetime.date(2026, 10, 1), "ingresos": 500.0, "gastos": 200.0},
        ])

    def test_varios_meses_mismo_hotel(self):
        filas = [
            _fila_hotel("999", "HOTEL DE PRUEBA"),
            _fila_meses("01/10/2026", "01/11/2026"),
            ["Ingresos (705.20)", "500,00 €", "300,00 €"],
            ["Costes internos (601.1)", "200,00 €", "100,00 €"],
        ]
        resultado = parsear_filas(filas)
        self.assertEqual(len(resultado), 2)
        self.assertEqual(resultado[0]["mes"], datetime.date(2026, 10, 1))
        self.assertEqual(resultado[1]["mes"], datetime.date(2026, 11, 1))

    def test_varios_hoteles_seguidos(self):
        filas = [
            *[_fila_hotel("101", "HOTEL UNO"), _fila_meses("01/10/2026"), ["Ingresos (705.20)", "100,00 €"]],
            *[_fila_hotel("102", "HOTEL DOS"), _fila_meses("01/10/2026"), ["Ingresos (705.20)", "200,00 €"]],
        ]
        resultado = parsear_filas(filas)
        self.assertEqual([r["property_code"] for r in resultado], ["101", "102"])
        self.assertEqual(resultado[0]["ingresos"], 100.0)
        self.assertEqual(resultado[1]["ingresos"], 200.0)

    def test_mes_sin_ningun_dato_no_genera_registro(self):
        filas = [
            _fila_hotel("999", "HOTEL DE PRUEBA"),
            _fila_meses("01/10/2026", "01/11/2026"),
            ["Ingresos (705.20)", "500,00 €", ""],  # noviembre sin dato
        ]
        resultado = parsear_filas(filas)
        self.assertEqual(len(resultado), 1)
        self.assertEqual(resultado[0]["mes"], datetime.date(2026, 10, 1))

    def test_hotel_sin_fila_de_meses_se_ignora_sin_error(self):
        filas = [
            _fila_hotel("999", "HOTEL SIN DATOS"),
            ["Ingresos (705.20)", "500,00 €"],  # sin "DESCRIPCIÓN" antes: no hay columnas que mapear
        ]
        resultado = parsear_filas(filas)
        self.assertEqual(resultado, [])

    def test_filas_antes_del_primer_hotel_se_ignoran(self):
        filas = [
            ["", "", ""],
            ["Algún título de la hoja"],
            _fila_hotel("999", "HOTEL DE PRUEBA"),
            _fila_meses("01/10/2026"),
            ["Ingresos (705.20)", "500,00 €"],
        ]
        resultado = parsear_filas(filas)
        self.assertEqual(len(resultado), 1)

    def test_solo_gastos_sin_ingresos_tambien_se_importa(self):
        filas = [
            _fila_hotel("999", "HOTEL DE PRUEBA"),
            _fila_meses("01/10/2026"),
            ["Costes internos (601.1)", "150,00 €"],
        ]
        resultado = parsear_filas(filas)
        self.assertEqual(resultado, [
            {"property_code": "999", "mes": datetime.date(2026, 10, 1), "ingresos": 0.0, "gastos": 150.0},
        ])
