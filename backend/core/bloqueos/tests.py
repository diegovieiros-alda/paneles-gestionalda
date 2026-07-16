"""Comprobación mínima del motor de bloqueos con datos sintéticos (sin BD)."""
import datetime

from django.test import SimpleTestCase

from .engine import ReportLine, compute_report

DIA = datetime.date(2026, 1, 1)
DIA2 = datetime.date(2026, 1, 2)

ROOMS = [
    {"id": 1, "property_id": 10, "property_name": "Hotel Test", "property_code": "413", "room_type_id": 5, "name": "101"},
    {"id": 2, "property_id": 10, "property_name": "Hotel Test", "property_code": "413", "room_type_id": 5, "name": "102"},
    {"id": 3, "property_id": 10, "property_name": "Hotel Test", "property_code": "413", "room_type_id": 5, "name": "103"},
    # Parking: en la blacklist, no debe contar en el inventario.
    {"id": 4, "property_id": 10, "property_name": "Hotel Test", "property_code": "413", "room_type_id": 99, "name": "P1"},
    # Hotel fuera de la cadena (id fijo excluido).
    {"id": 5, "property_id": 24, "property_name": "Hotel Alda Santa Trega", "property_code": "307", "room_type_id": 5, "name": "101"},
]
ROOM_TYPES = [{"id": 5, "overnight_room": True}, {"id": 99, "overnight_room": False}]


def _line(**kw) -> ReportLine:
    base = dict(
        line_id=1, line_state="confirm", price_day_total=None,
        room_id=None, room_name=None, room_type_id=5,
        property_id=10, property_name="Hotel Test", property_code="413",
        reservation_id=1, reservation_name="R1", reservation_type="normal",
        reservation_room_type_id=5, checkin=None, checkout=None, rooms_text=None,
        out_service_description=None, folio_internal_comment=None, closure_reason_name=None,
    )
    base.update(kw)
    return ReportLine(**base)


class ComputeReportTests(SimpleTestCase):
    def test_inventario_excluye_blacklist_y_hoteles_fuera_de_cadena(self):
        report = compute_report(ROOMS, ROOM_TYPES, [], fecha_inicio=DIA, fecha_fin=DIA)
        # 3 habitaciones válidas del Hotel Test; el parking y Santa Trega no cuentan.
        self.assertEqual(report["resumen"]["inventarioTotalCadena"], 3)
        self.assertEqual(report["resumen"]["totalHotelesCadena"], 1)
        self.assertEqual(report["diasEnRango"], 1)

    def test_adr_solo_cuenta_reservas_normales_confirmadas(self):
        lines = [
            _line(line_id=1, room_id=1, room_name="101", price_day_total=100.0),
            _line(line_id=2, room_id=2, room_name="102", price_day_total=50.0),
            # Cancelada: no debe contar.
            _line(line_id=3, room_id=3, room_name="103", price_day_total=999.0, line_state="cancel"),
        ]
        report = compute_report(ROOMS, ROOM_TYPES, lines, fecha_inicio=DIA, fecha_fin=DIA)
        self.assertEqual(report["resumen"]["totalHabitacionesBloqueadas"], 0)
        self.assertEqual(report["resumen"]["adrMedioCadena"], 75.0)  # (100+50)/2

    def test_bloqueo_calcula_coste_de_oportunidad_con_adr_real(self):
        lines = [
            # Venta real -> fija el ADR del hotel en 80€.
            _line(line_id=1, room_id=1, room_name="101", price_day_total=80.0),
            # Habitación bloqueada un solo día.
            _line(
                line_id=2, room_id=2, room_name="102", price_day_total=None,
                reservation_id=2, reservation_name="OUT-1", reservation_type="out",
                reservation_room_type_id=5, checkin=DIA, checkout=DIA2,
                out_service_description="Avería", closure_reason_name="Mantenimiento",
            ),
        ]
        report = compute_report(ROOMS, ROOM_TYPES, lines, fecha_inicio=DIA, fecha_fin=DIA)
        self.assertEqual(report["resumen"]["totalHabitacionesBloqueadas"], 1)
        self.assertEqual(report["resumen"]["totalNochesBloqueadas"], 1)
        hotel = report["hoteles"][0]
        self.assertEqual(hotel["kpis"]["adrUtilizado"], 80.0)
        self.assertEqual(hotel["kpis"]["perdidaFinancieraEstimada"], 80.0)
        self.assertEqual(hotel["detalle"][0]["causaCierre"], "Mantenimiento")

    def test_bloqueo_de_varios_dias_suma_noches_en_rango_una_sola_fila(self):
        # La misma reserva de bloqueo (id=2) tiene una línea por noche dentro del rango.
        lines = [
            _line(
                line_id=10, room_id=2, room_name="102", price_day_total=None,
                reservation_id=2, reservation_name="OUT-1", reservation_type="out",
                reservation_room_type_id=5, checkin=DIA, checkout=DIA2,
                out_service_description="Avería",
            ),
            _line(
                line_id=11, room_id=2, room_name="102", price_day_total=None,
                reservation_id=2, reservation_name="OUT-1", reservation_type="out",
                reservation_room_type_id=5, checkin=DIA, checkout=DIA2,
                out_service_description="Avería",
            ),
        ]
        report = compute_report(ROOMS, ROOM_TYPES, lines, fecha_inicio=DIA, fecha_fin=DIA2)
        self.assertEqual(report["diasEnRango"], 2)
        # Una única incidencia (misma reserva), pero 2 noches bloqueadas.
        self.assertEqual(report["resumen"]["totalHabitacionesBloqueadas"], 1)
        self.assertEqual(report["resumen"]["totalNochesBloqueadas"], 2)
        self.assertEqual(len(report["hoteles"][0]["detalle"]), 1)
        self.assertEqual(report["hoteles"][0]["detalle"][0]["nochesEnRango"], 2)
