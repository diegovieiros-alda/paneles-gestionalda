export type HotelDirectorio = {
  id: number;
  name: string;
  zona: string;
  sociedad: string;
  origenDatos?: "odoo" | "cache";
};

export async function fetchHoteles(): Promise<{ hoteles: HotelDirectorio[]; origenDatos?: "odoo" | "cache" }> {
  const res = await fetch(`/api/hoteles/`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `No se pudo cargar el listado de hoteles (${res.status})`);
  }
  return res.json();
}

export async function fetchHotelInfo(id: string | number): Promise<HotelDirectorio> {
  const res = await fetch(`/api/hoteles/${id}/`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `No se pudo cargar el hotel (${res.status})`);
  }
  return res.json();
}

export type HotelReal = HotelDirectorio & {
  alojados: number;
  desayunos: number;
  penetracion: number;
  produccion: number;
  precioMedio: number;
};

export type DesayunosReport = {
  fechaInicio: string;
  fechaFin: string;
  hoteles: HotelReal[];
  origenDatos?: "odoo" | "cache";
};

export type SerieMensual = { mes: string; desayunos: number; produccion: number };

export type ResumenReport = DesayunosReport & { serieMensual: SerieMensual[] };

export async function fetchDesayunos(desde: string, hasta: string): Promise<ResumenReport> {
  const params = new URLSearchParams({ desde, hasta });
  const res = await fetch(`/api/desayunos/?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `No se pudieron cargar los datos de desayuno (${res.status})`);
  }
  return res.json();
}

export async function fetchResumen(): Promise<ResumenReport> {
  const res = await fetch(`/api/resumen/`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `No se pudo cargar el resumen (${res.status})`);
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
  actual: MesHotel;
  serieMensual: MesHotel[];
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
