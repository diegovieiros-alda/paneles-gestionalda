"""Importa el presupuesto de desayuno (Ingresos 705.20 / Costes internos
601.1) desde la hoja de cálculo de Finanzas "PRESUPUESTOS F&B - REAL- 26/27"
(Google Sheets), sustituyendo a la consulta que antes se hacía contra Odoo
(account_move_budget_line) — decisión 2026-09-02, ver
core.models.PresupuestoDesayunoMensual.

Formato de la hoja (una tabla por hotel, apiladas verticalmente en la misma
pestaña):
    | 101 - FOGAR DE TEODOMIRO | [merged] | ... |          <- cabecera de hotel
    | DESCRIPCIÓN | 01/10/2026 | 01/11/2026 | ... |        <- fila de meses
    | Alojados | 648 | 321 | ... |
    | ...
    | Ingresos (705.20) | 125,56 € | 61,54 € | ... |
    | Costes internos (601.1) | 62,78 € | 30,77 € | ... |
    | ...
    | 102 - CASCO ANTIGUO | [merged] | ... |               <- siguiente hotel
    | ...

Solo se leen las dos filas que hacen falta (Ingresos/Costes internos) —
Alojados, % desayunos, precio interno, etc. son la memoria de cálculo de
Finanzas para llegar a esas dos cifras, no algo que el dashboard necesite
por separado. Costes externos (607.0) NO se importa: la cuenta de "gastos
reales" con la que se compara este presupuesto (repository._FNB_SQL,
_CUENTAS_GASTO_DESAYUNO) solo suma cuentas 601.x — importar 607.0 aquí
haría que "cumplimiento" comparara dos alcances distintos. Si Finanzas
quiere que el presupuesto de gastos incluya también costes externos, hay
que ampliar primero el alcance de _CUENTAS_GASTO_DESAYUNO (decisión
pendiente 5.4 en kpis-definiciones.md), no al revés.

Requiere una cuenta de servicio de Google con acceso de solo lectura a la
hoja (compartir la hoja con su email como "Lector"), y la ruta a su
credencial JSON en settings.GOOGLE_SHEETS_CREDENTIALS_FILE (variable de
entorno GOOGLE_SHEETS_CREDENTIALS_FILE) — ver README de despliegue.

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
# GID de la pestaña con los datos por hotel (URL compartida por el
# usuario) — si Finanzas mueve los datos a otra pestaña, actualizar aquí.
GID = 1141272899

_RE_HOTEL = re.compile(r"^\s*(\d{3,4})\s*-\s*\S.*")
_RE_MES = re.compile(r"^\s*(\d{2})/(\d{2})/(\d{4})\s*$")

_ETIQUETA_INGRESOS = "Ingresos (705.20)"
_ETIQUETA_GASTOS = "Costes internos (601.1)"


def _parse_importe(texto: str) -> float | None:
    """"125,56 €" -> 125.56; "" o solo espacio -> None (sin dato en la
    hoja, no un 0 engañoso). Formato español: coma decimal, punto de
    millar."""
    if not texto or not texto.strip():
        return None
    limpio = texto.replace("€", "").replace("\xa0", " ").strip().replace(".", "").replace(",", ".")
    try:
        return float(limpio)
    except ValueError:
        return None


def parsear_filas(filas: list[list[str]]) -> list[dict]:
    """Convierte la rejilla cruda de la hoja (una lista de filas, cada una
    una lista de celdas) en `[{"property_code", "mes", "ingresos",
    "gastos"}, ...]` — una entrada por hotel y mes con al menos un dato.
    Función pura, sin acceso a red ni a BD, para poder probarla con una
    rejilla sintética."""
    resultado: list[dict] = []
    property_code_actual: str | None = None
    meses_actuales: dict[int, datetime.date] = {}
    valores_hotel: dict[str, dict[int, float]] = {}

    def volcar_hotel():
        if property_code_actual is None or not meses_actuales:
            return
        ingresos_por_col = valores_hotel.get(_ETIQUETA_INGRESOS, {})
        gastos_por_col = valores_hotel.get(_ETIQUETA_GASTOS, {})
        for col, mes in meses_actuales.items():
            ingresos = ingresos_por_col.get(col)
            gastos = gastos_por_col.get(col)
            if ingresos is None and gastos is None:
                continue
            resultado.append(
                {"property_code": property_code_actual, "mes": mes, "ingresos": ingresos or 0.0, "gastos": gastos or 0.0}
            )

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

        if primera in (_ETIQUETA_INGRESOS, _ETIQUETA_GASTOS):
            fila_valores = valores_hotel.setdefault(primera, {})
            for col in meses_actuales:
                if col < len(fila):
                    valor = _parse_importe(fila[col])
                    if valor is not None:
                        fila_valores[col] = valor

    volcar_hotel()  # último hotel del fichero, sin cabecera siguiente que lo cierre
    return resultado


def _leer_filas(credenciales_path: str) -> list[list[str]]:
    import gspread

    gc = gspread.service_account(filename=credenciales_path)
    hoja = gc.open_by_key(SHEET_ID)
    worksheet = next(ws for ws in hoja.worksheets() if ws.id == GID)
    return worksheet.get_all_values()


class Command(BaseCommand):
    help = "Importa el presupuesto de desayuno (Ingresos/Costes internos) desde la hoja de Finanzas."

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
                defaults={"ingresos": r["ingresos"], "gastos": r["gastos"]},
            )

        self.stdout.write(self.style.SUCCESS(f"Importados/actualizados {len(registros)} registros de presupuesto."))
