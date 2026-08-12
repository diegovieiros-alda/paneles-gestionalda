export type BloqueoDetalle = {
  habitacionNum: string;
  codigoReserva: string;
  causaCierre: string;
  motivo: string;
  comentarioFolio: string;
  nochesEnRango: number;
  rangoReserva: {
    checkin: string;
    checkout: string;
    diasTotalesBloqueo: number;
  };
};

export type BloqueoHotel = {
  hotelId: number;
  hotelName: string;
  zona: string;
  kpis: {
    totalInventario: number;
    diasEnRango: number;
    habitacionesBloqueadas: number;
    nochesBloqueadas: number;
    nochesOcupadas: number;
    nochesLibres: number;
    porcentajeBloqueo: number;
    porcentajeOcupacion: number;
    porcentajeLibre: number;
    adrUtilizado: number | null;
    perdidaFinancieraEstimada: number | null;
  };
  resumenMotivos: Record<string, number>;
  detalle: BloqueoDetalle[];
};

export type BloqueosReport = {
  fechaInicio: string;
  fechaFin: string;
  diasEnRango: number;
  resumen: {
    totalHotelesCadena: number;
    totalHotelesAfectados: number;
    inventarioTotalCadena: number;
    totalHabitacionesBloqueadas: number;
    totalNochesBloqueadas: number;
    totalPerdidaEstimada: number;
    ratioBloqueoGlobal: number;
    adrMedioCadena: number | null;
  };
  hoteles: BloqueoHotel[];
};

export async function fetchBloqueos(desde: string, hasta: string): Promise<BloqueosReport> {
  const params = new URLSearchParams({ desde, hasta });
  const res = await fetch(`/api/bloqueos/?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `No se pudo cargar el informe de bloqueos (${res.status})`);
  }
  return res.json();
}

export type HotelBloqueosReport = {
  fechaInicio: string;
  fechaFin: string;
  diasEnRango: number;
  hotel: BloqueoHotel | null;
};

export async function fetchHotelBloqueos(hotelId: number | string, desde: string, hasta: string): Promise<HotelBloqueosReport> {
  const params = new URLSearchParams({ desde, hasta });
  const res = await fetch(`/api/hoteles/${hotelId}/bloqueos/?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `No se pudo cargar los bloqueos del hotel (${res.status})`);
  }
  return res.json();
}
