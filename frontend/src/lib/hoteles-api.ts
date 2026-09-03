// Enlace a la ficha de un hotel llevando el rango de fechas actual — la
// ficha vive fuera de DesayunosFiltrosProvider a propósito (no dispara el
// fetch pesado de la cadena completa solo por heredar el filtro), así que
// sin esto siempre arrancaba en "Día" sin importar qué periodo se estaba
// viendo en la tabla de origen (bug real reportado 2026-09-03: "al
// seleccionar un hotel se resetean los filtros"). Ver hotel-desayunos.tsx.
export function hrefHotelDesayunos(id: number, desde: string, hasta: string): string {
  return `/desayunos/${id}?desde=${desde}&hasta=${hasta}`;
}

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

// Caché en memoria de peticiones recientes, por URL exacta — vive solo
// mientras dure la pestaña. Pensado para la precarga predictiva de
// use-desayunos-data.ts (precarga "Mes actual" en segundo plano tras el
// filtro por defecto): si el usuario lo elige a los pocos segundos, no
// repite la misma petición de red. TTL corto a propósito — el origen real
// de verdad sigue siendo la caché de 2h del backend (core/cache.py), esto
// solo evita una ida y vuelta de red duplicada, no la sustituye.
const TTL_CACHE_PETICIONES_MS = 60_000;
const cachePeticiones = new Map<string, { en: number; promesa: Promise<unknown> }>();

async function fetchJsonCacheado<T>(url: string): Promise<T> {
  const ahora = Date.now();
  const entrada = cachePeticiones.get(url);
  if (entrada && ahora - entrada.en < TTL_CACHE_PETICIONES_MS) {
    return entrada.promesa as Promise<T>;
  }
  const promesa = fetch(url).then(async (res) => {
    if (!res.ok) {
      cachePeticiones.delete(url); // no cachear errores
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `No se pudo completar la petición (${res.status})`);
    }
    return res.json();
  });
  promesa.catch(() => cachePeticiones.delete(url)); // fallo async también limpia la entrada
  cachePeticiones.set(url, { en: ahora, promesa });
  return promesa as Promise<T>;
}

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
// presupuestoOrigen: de dónde sale el presupuesto mostrado ("elegido") —
// "odoo" (account.move.budget, confirmado, prioritario cuando existe) o
// "excel" (hoja de Finanzas "PRESUPUESTOS F&B", respaldo cuando Odoo
// todavía no tiene nada confirmado para ese hotel/mes). null si no hay
// presupuesto de ninguna de las dos fuentes. Pedido explícito: "sería
// bueno indicar de dónde viene el dato" — ver
// backend/core/hoteles/repository.py::fetch_presupuesto_desayuno.
// presupuesto{Ingresos,Gastos}{Odoo,Excel}: los dos valores por separado,
// null si esa fuente concreta no tiene dato — pedido explícito 2026-09-02:
// "vamos a poner los 2 presupuestos... para comparar" (p.ej. cuando Odoo
// "gana" pero se quiere ver qué decía el Excel de todas formas).
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
  presupuestoOrigen: "odoo" | "excel" | null;
  presupuestoIngresosOdoo: number | null;
  presupuestoGastosOdoo: number | null;
  presupuestoIngresosExcel: number | null;
  presupuestoGastosExcel: number | null;
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
  // Mismo desglose que produccionFacturada/produccionSinFacturar en
  // FacturacionFields, aplicado a turno/canal en vez de a hotel — la
  // suma de las dos reconcilia siempre con "Producción" (invariante
  // verificado contra producción 2026-08-28).
  produccionFacturada: number;
  produccionSinFacturar: number;
};

export type DesayunosReport = {
  fechaInicio: string;
  fechaFin: string;
  hoteles: HotelReal[];
  origenDatos?: "odoo" | "cache";
};

export type SerieMensual = FnbFields & { mes: string; desayunos: number; produccion: number };

export type ResumenReport = DesayunosReport & { serieMensual: SerieMensual[] };

export async function fetchDesayunos(desde: string, hasta: string, tipos?: string[]): Promise<ResumenReport> {
  const params = new URLSearchParams({ desde, hasta });
  if (tipos && tipos.length) params.set("tipo", tipos.join(","));
  return fetchJsonCacheado(`/api/desayunos/?${params}`);
}

export type TurnosReport = { turnos: TurnoDesayuno[]; origenDatos?: "odoo" | "cache" };

// Turnos ya no viaja embebido en fetchDesayunos (2026-09-02): antes
// bloqueaba la tabla de hoteles hasta que también terminara de calcularse
// en el backend, aunque el usuario no hubiera tocado ningún filtro de
// Hotel — ahora siempre se pide aparte, en paralelo, tanto en cadena
// completa (hotelIds omitido) como filtrado por Zona/Submarca/búsqueda de
// hotel (que son filtros client-side sobre la lista ya cargada, sin
// columna propia que unir en SQL — ver use-desayunos-data.ts).
export async function fetchTurnos(
  desde: string, hasta: string, tipos?: string[], hotelIds?: number[]
): Promise<TurnosReport> {
  const params = new URLSearchParams({ desde, hasta });
  if (tipos && tipos.length) params.set("tipo", tipos.join(","));
  if (hotelIds && hotelIds.length) params.set("hoteles", hotelIds.join(","));
  return fetchJsonCacheado(`/api/desayunos/turnos/?${params}`);
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
