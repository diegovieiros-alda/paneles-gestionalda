export type HotelDirectorio = {
  id: number;
  name: string;
  zona: string;
  sociedad: string;
  origenDatos?: "odoo" | "cache";
};

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

export type HotelReal = HotelDirectorio & FnbFields & {
  alojados: number;
  desayunos: number;
  penetracion: number;
  produccion: number;
  precioMedio: number;
  calidadCheckin: CalidadCheckin;
};

export type Vendedor = { vendedor: string; importe: number; lineas: number };

export type DesayunosReport = {
  fechaInicio: string;
  fechaFin: string;
  hoteles: HotelReal[];
  origenDatos?: "odoo" | "cache";
};

export type SerieMensual = FnbFields & { mes: string; desayunos: number; produccion: number };

export type ResumenReport = DesayunosReport & { serieMensual: SerieMensual[]; vendedores?: Vendedor[] };

export async function fetchDesayunos(desde: string, hasta: string): Promise<ResumenReport> {
  const params = new URLSearchParams({ desde, hasta });
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
  actual: MesHotel & FnbFields;
  serieMensual: (MesHotel & FnbFields)[];
  vendedores?: Vendedor[];
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
