export type HotelDirectorio = {
  id: number;
  name: string;
  codigo: string;
  zona: string;
  sociedad: string;
  submarca: string;
  origenDatos?: "odoo" | "cache";
};

// Ver backend/core/hoteles/repository.py::_TODOS_TIPOS_DESAYUNO — mismos 4
// valores, backend ya filtra por ellos vía ?tipo=buffet,express (views.py::
// _parse_tipos_desayuno). "Tipo de Hotel" (Urbano/Mix/Vacacional) y
// "Segmento de Hotel" no existen aquí a propósito: no existen en Odoo (ni
// está previsto añadirlos, ver hoteles/service.py cabecera).
export const TIPOS_DESAYUNO = [
  { value: "buffet", label: "Buffet" },
  { value: "express", label: "Express" },
  { value: "colaborador", label: "Colaborador" },
  { value: "otros", label: "Otros" },
] as const;

export async function fetchHotelInfo(id: string | number): Promise<HotelDirectorio> {
  const res = await fetch(`/api/hoteles/${id}/`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `No se pudo cargar el hotel (${res.status})`);
  }
  return res.json();
}

// ingresos/gastos/margenBruto/precioMedioVenta/costeMedioGasto/resultadoFB
// vienen de contabilidad (cuenta 70500000020 + cuentas de compra F&B), no
// de PMS — a diferencia de produccion/precioMedio, excluyen colaborador por
// completo. presupuesto*/cumplimiento* vienen de account.move.budget
// (solo presupuestos confirmados); cumplimiento* es null (no 0) cuando no
// hay presupuesto confirmado para ese hotel/periodo — 0% sugeriría que no
// se vendió nada, no que falta presupuesto. Ver
// backend/core/hoteles/service.py::_fnb_json.
// presupuestoMotivo: "rango_no_es_mes_natural" cuando el rango elegido no es
// un mes (o varios meses) completo — presupuestoIngresos/Gastos vienen a 0 y
// cumplimiento* a null en ese caso, porque comparar un rango parcial contra
// el presupuesto del mes entero da una cifra engañosa (ver
// backend/core/hoteles/service.py::_rango_es_mes_natural). Distinto de
// cumplimiento*=null sin motivo, que significa "sin presupuesto confirmado".
export type FnbFields = {
  ingresos: number;
  gastos: number;
  margenBruto: number;
  precioMedioVenta: number;
  costeMedioGasto: number;
  resultadoFB: number;
  presupuestoIngresos: number;
  presupuestoGastos: number;
  cumplimientoIngresos: number | null;
  cumplimientoGastos: number | null;
  presupuestoMotivo: "rango_no_es_mes_natural" | null;
};

// Comparación declarado (reserva) vs. check-in confirmado, SOLO fechas
// pasadas del rango — auditoría de calidad de dato, no se usa para
// "alojados"/penetración (ver backend/core/hoteles/repository.py::
// _CALIDAD_CHECKIN_SQL: usar el check-in en vez del declarado da SIEMPRE
// menos personas, porque el check-in es un registro de viajeros, no un
// censo de ocupación).
export type CalidadCheckin = {
  declarado: number;
  checkin: number;
  reservasTotal: number;
  reservasSinCheckin: number;
};

// Desglose de "produccion"/"desayunos" (PMS) según ya tengan factura posted
// vinculada o no — producciónFacturada + producciónSinFacturar == producción
// siempre (ver backend/core/hoteles/service.py::_facturacion_json).
// "SinFacturar" usa el precio del folio como estimación (aún no hay importe
// de factura real) — no confundir con "Financiero F&B" (FnbFields), que es
// la cuenta contable completa (todas las líneas ya facturadas, sin producto
// ni colaborador) y tiene su propio alcance y fecha (contable, no de venta).
export type FacturacionFields = {
  desayunosFacturados: number;
  desayunosSinFacturar: number;
  produccionFacturada: number;
  produccionSinFacturar: number;
  porcentajeFacturado: number;
};

export type HotelReal = HotelDirectorio & FnbFields & FacturacionFields & {
  alojados: number;
  desayunos: number;
  penetracion: number;
  produccion: number;
  precioMedio: number;
  calidadCheckin: CalidadCheckin;
};

// Reemplaza el antiguo ranking "Vendedores" (nombre de la persona que
// registró la venta — dato personal/laboral) por un desglose sin nombres:
// unidades de desayuno por turno y canal de venta. Ver
// backend/core/hoteles/repository.py::_TURNOS_DESAYUNO_SQL — "turno" es una
// convención de franjas horarias (07-15/15-23/23-7), no el horario real de
// cada hotel; "canal" es una heurística sobre el login que creó la línea,
// no un dato fiable al 100%.
export type TurnoDesayuno = {
  turno: "manana_07_15" | "tarde_15_23" | "noche_23_07";
  canal: "recepcion_hotel" | "automatico" | "central_reservas" | "sin_usuario";
  unidades: number;
};

export type DesayunosReport = {
  fechaInicio: string;
  fechaFin: string;
  hoteles: HotelReal[];
  origenDatos?: "odoo" | "cache";
};

export type SerieMensual = FnbFields & { mes: string; desayunos: number; produccion: number };

export type ResumenReport = DesayunosReport & { serieMensual: SerieMensual[]; turnos?: TurnoDesayuno[] };

export async function fetchDesayunos(desde: string, hasta: string, tipos?: string[]): Promise<ResumenReport> {
  const params = new URLSearchParams({ desde, hasta });
  if (tipos && tipos.length) params.set("tipo", tipos.join(","));
  const res = await fetch(`/api/desayunos/?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `No se pudieron cargar los datos de desayuno (${res.status})`);
  }
  return res.json();
}

export type MesHotel = {
  mes: string;
  alojados: number;
  desayunos: number;
  penetracion: number;
  produccion: number;
  precioMedio: number;
};

export type HotelDesayunos = {
  actual: MesHotel & FnbFields & FacturacionFields;
  serieMensual: (MesHotel & FnbFields & FacturacionFields)[];
  turnos?: TurnoDesayuno[];
  origenDatos?: "odoo" | "cache";
};

export async function fetchHotelDesayunos(id: string | number, desde: string, hasta: string): Promise<HotelDesayunos> {
  const params = new URLSearchParams({ desde, hasta });
  const res = await fetch(`/api/hoteles/${id}/desayunos/?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `No se pudieron cargar los desayunos del hotel (${res.status})`);
  }
  return res.json();
}
