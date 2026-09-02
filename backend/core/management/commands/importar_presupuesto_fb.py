"""Importa la previsión de desayuno (Alojados, % desayunos/alojados,
precio interno, coste interno) desde la hoja de cálculo de Finanzas
"PRESUPUESTOS F&B - REAL- 26/27" (Google Sheets) — una de las dos fuentes
que combina repository.fetch_presupuesto_desayuno (la otra es Odoo,
prioritaria cuando existe; ver ese módulo). Decisión 2026-09-02: primero
se planteó sustituir Odoo por esta hoja, pero se corrigió — "hay que traer
también el dato de Odoo, creo que sería bueno indicar de dónde viene el
dato" — así que ahora se combinan las dos, con origen visible en la API
("presupuestoOrigen").

La hoja tiene UNA PESTAÑA POR HOTEL (~89 en total, confirmado 2026-09-02
tras un primer intento fallido que asumía una sola pestaña con todos los
hoteles apilados — error de lectura inicial vía Drive, que renderizó varias
pestañas como si fueran una tabla continua). Cada pestaña se llama
"<código> - <nombre>" y dentro tiene, dentro de la misma cabecera:
    | 101 - FOGAR DE TEODOMIRO | [merged] | ... |          <- cabecera de hotel
    | DESCRIPCIÓN | 01/10/2026 | 01/11/2026 | ... |        <- fila de meses
    | Alojados | 648 | 321 | ... |
    | % desayunos X Alojados | 3,09% | 3,06% | ... |
    | Precio interno | 6,27 € | 6,27 € | ... |
    | Coste desayuno interno | 3,14 € | 3,14 € | ... |
    | ...
    | Ingresos (705.20) | 125,56 € | 61,54 € | ... |        <- YA NO SE LEE
    | ...
_leer_filas concatena las filas de todas las pestañas (una llamada
`values_batch_get` para las ~89 en vez de 89 peticiones sueltas — evita
las cuotas de la API de Sheets) y se las pasa tal cual a parsear_filas, que
ya sabía manejar varios hoteles seguidos en la misma rejilla.

Se guardan los 4 componentes, no "Ingresos (705.20)"/"Costes internos
(601.1)" ya calculados en la hoja — pedido explícito (ver arriba): que la
fórmula (unidades presupuestadas × precio/coste) sea visible en
repository.py, no una celda opaca de Finanzas. Ambas cifras coinciden en
la práctica (Ingresos ≈ Alojados × % × Precio, verificado a mano contra la
hoja real), así que esto no cambia el número, solo dónde vive el cálculo.

Requiere una cuenta de servicio de Google con acceso de solo lectura a la
hoja (compartir la hoja con su email como "Lector"), y la ruta a su
credencial JSON en settings.GOOGLE_SHEETS_CREDENTIALS_FILE (variable de
entorno GOOGLE_SHEETS_CREDENTIALS_FILE).

Uso en cron (usuario paneles, una vez al día — el ritmo con el que
Finanzas actualiza la hoja no justifica más frecuencia):
    0 6 * * * cd /home/paneles/paneles-backend && venv/bin/python manage.py importar_presupuesto_fb
"""
import datetime
import logging
import re

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.models import PresupuestoDesayunoMensual

logger = logging.getLogger(__name__)

SHEET_ID = "1f9w8RDMoZ8PcMp-M98Y4B44UyY7XqT0sE6UbUSsQ0NQ"
# Cada pestaña de la hoja es un hotel completo (ver docstring del módulo) —
# no hay una única pestaña con "los datos", se leen todas.
_FILAS_MAX_POR_PESTAÑA = 200  # margen amplio: cada hotel ocupa ~25 filas

_RE_HOTEL = re.compile(r"^\s*(\d{3,4})\s*-\s*\S.*")
_RE_MES = re.compile(r"^\s*(\d{2})/(\d{2})/(\d{4})\s*$")

_ETIQUETA_ALOJADOS = "Alojados"
_ETIQUETA_PENETRACION = "% desayunos X Alojados"
_ETIQUETA_PRECIO = "Precio interno"
_ETIQUETA_COSTE = "Coste desayuno interno"
_ETIQUETAS = (_ETIQUETA_ALOJADOS, _ETIQUETA_PENETRACION, _ETIQUETA_PRECIO, _ETIQUETA_COSTE)


def _parse_numero(texto: str) -> float | None:
    """"125,56 €" -> 125.56; "648" -> 648.0; "" o solo espacio -> None (sin
    dato en la hoja, no un 0 engañoso). Formato español: coma decimal,
    punto de millar — vale tanto para importes como para "Alojados"."""
    if not texto or not texto.strip():
        return None
    limpio = texto.replace("€", "").replace("\xa0", " ").strip().replace(".", "").replace(",", ".")
    try:
        return float(limpio)
    except ValueError:
        return None


def _parse_porcentaje(texto: str) -> float | None:
    """"45,08%" -> 0.4508 (fracción, no porcentaje) — None si no hay dato."""
    if not texto or not texto.strip():
        return None
    valor = _parse_numero(texto.replace("%", ""))
    return None if valor is None else valor / 100


def parsear_filas(filas: list[list[str]]) -> list[dict]:
    """Convierte la rejilla cruda de la hoja (una lista de filas, cada una
    una lista de celdas) en `[{"property_code", "mes", "alojados_previstos",
    "penetracion_prevista", "precio_interno", "coste_interno"}, ...]` — una
    entrada por hotel y mes con al menos un dato. Función pura, sin acceso
    a red ni a BD, para poder probarla con una rejilla sintética."""
    resultado: list[dict] = []
    property_code_actual: str | None = None
    meses_actuales: dict[int, datetime.date] = {}
    valores_hotel: dict[str, dict[int, float]] = {}

    def volcar_hotel():
        if property_code_actual is None or not meses_actuales:
            return
        por_col = {etiqueta: valores_hotel.get(etiqueta, {}) for etiqueta in _ETIQUETAS}
        for col, mes in meses_actuales.items():
            valores = {etiqueta: por_col[etiqueta].get(col) for etiqueta in _ETIQUETAS}
            if all(v is None for v in valores.values()):
                continue
            resultado.append({
                "property_code": property_code_actual,
                "mes": mes,
                "alojados_previstos": valores[_ETIQUETA_ALOJADOS] or 0.0,
                "penetracion_prevista": valores[_ETIQUETA_PENETRACION] or 0.0,
                "precio_interno": valores[_ETIQUETA_PRECIO] or 0.0,
                "coste_interno": valores[_ETIQUETA_COSTE] or 0.0,
            })

    for fila in filas:
        if not fila:
            continue
        primera = (fila[0] or "").strip()

        m_hotel = _RE_HOTEL.match(primera)
        if m_hotel:
            volcar_hotel()
            property_code_actual = m_hotel.group(1)
            meses_actuales = {}
            valores_hotel = {}
            continue

        if property_code_actual is None:
            continue  # cabecera/título antes del primer hotel — se ignora

        if primera.upper().startswith("DESCRIPCI"):
            meses_actuales = {}
            for col, celda in enumerate(fila[1:], start=1):
                m_mes = _RE_MES.match(celda or "")
                if m_mes:
                    dia, mes_num, anio = m_mes.groups()
                    meses_actuales[col] = datetime.date(int(anio), int(mes_num), 1)
            continue

        if primera in _ETIQUETAS:
            parse = _parse_porcentaje if primera == _ETIQUETA_PENETRACION else _parse_numero
            fila_valores = valores_hotel.setdefault(primera, {})
            for col in meses_actuales:
                if col < len(fila):
                    valor = parse(fila[col])
                    if valor is not None:
                        fila_valores[col] = valor

    volcar_hotel()  # último hotel del fichero, sin cabecera siguiente que lo cierre
    return resultado


def _leer_filas(credenciales_path: str) -> list[list[str]]:
    import gspread

    gc = gspread.service_account(filename=credenciales_path)
    hoja = gc.open_by_key(SHEET_ID)
    pestañas = hoja.worksheets()
    rangos = [f"'{ws.title}'!A1:Z{_FILAS_MAX_POR_PESTAÑA}" for ws in pestañas]
    respuesta = hoja.values_batch_get(rangos)
    resultado: list[list[str]] = []
    for rango in respuesta.get("valueRanges", []):
        resultado.extend(rango.get("values", []))
    return resultado


class Command(BaseCommand):
    help = "Importa la previsión de desayuno (Alojados/%/precio/coste) desde la hoja de Finanzas."

    def handle(self, *args, **options):
        credenciales_path = getattr(settings, "GOOGLE_SHEETS_CREDENTIALS_FILE", None)
        if not credenciales_path:
            raise CommandError(
                "Falta GOOGLE_SHEETS_CREDENTIALS_FILE en la configuración — "
                "crea una cuenta de servicio de Google, compártele la hoja como Lector, "
                "y apunta la variable de entorno a la ruta de su credencial JSON."
            )

        try:
            filas = _leer_filas(credenciales_path)
        except Exception:
            logger.exception("Error leyendo la hoja de presupuesto de desayuno")
            raise CommandError("No se pudo leer la hoja de Google Sheets — ver log para el detalle.")

        registros = parsear_filas(filas)
        if not registros:
            raise CommandError(
                "La hoja se leyó pero no se encontró ningún registro reconocible — "
                "¿ha cambiado el formato de la pestaña?"
            )

        for r in registros:
            PresupuestoDesayunoMensual.objects.update_or_create(
                property_code=r["property_code"],
                mes=r["mes"],
                defaults={
                    "alojados_previstos": r["alojados_previstos"],
                    "penetracion_prevista": r["penetracion_prevista"],
                    "precio_interno": r["precio_interno"],
                    "coste_interno": r["coste_interno"],
                },
            )

        self.stdout.write(self.style.SUCCESS(f"Importados/actualizados {len(registros)} registros de previsión."))
