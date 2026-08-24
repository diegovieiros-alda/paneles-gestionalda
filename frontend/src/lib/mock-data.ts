// Mock data for the breakfast dashboard
export type Hotel = {
  id: string;
  name: string;
  zone: string;
  regional: string;
  sociedad: string;
  submarca: string;
  ciudad: string;
  provincia: string;
  tipo: string;
  alojados: number;
  desayunos: number;
  penetracion: number; // 0-1
  produccion: number; // €
  precioMedio: number;
  coste: number;
  margen: number; // 0-1
  ly: number; // produccion LY
  presupuesto: number;
  variacion: number; // % vs LY
  trend: number[]; // 12 months
  status: "ok" | "warn" | "alert";
};

const zonas = ["Norte", "Sur", "Levante", "Centro", "Baleares", "Canarias", "Cataluña"];
const regionales = ["A. García", "M. López", "J. Ruiz", "C. Fernández", "P. Sanz"];
const sociedades = ["Sociedad Ibérica", "Sociedad Mediterránea", "Sociedad Atlántica"];
const submarcas = ["Signature", "Prime", "Select", "Urban", "Resorts"];
const tipos = ["Urbano", "Vacacional", "Business", "Resort"];
const ciudades: Array<[string, string]> = [
  ["Madrid", "Madrid"], ["Barcelona", "Barcelona"], ["Valencia", "Valencia"],
  ["Sevilla", "Sevilla"], ["Málaga", "Málaga"], ["Bilbao", "Vizcaya"],
  ["Palma", "Baleares"], ["Las Palmas", "Las Palmas"], ["Alicante", "Alicante"],
  ["Zaragoza", "Zaragoza"], ["San Sebastián", "Gipuzkoa"], ["Marbella", "Málaga"],
  ["Tenerife Sur", "Tenerife"], ["Ibiza", "Baleares"], ["Girona", "Girona"],
];
const nombreBases = [
  "Meliá", "Palace", "Grand", "Mar", "Sol", "Luna", "Real", "Puerto",
  "Costa", "Plaza", "Vista", "Alba", "Aurora", "Mirador", "Jardín",
];

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function makeTrend(base: number, r: () => number) {
  return Array.from({ length: 12 }, (_, i) => {
    const seasonal = 1 + 0.15 * Math.sin((i / 12) * Math.PI * 2);
    return Math.round(base * seasonal * (0.85 + r() * 0.3));
  });
}

export const hotels: Hotel[] = Array.from({ length: 100 }, (_, i) => {
  const r = rand(i + 1);
  const [ciudad, provincia] = ciudades[i % ciudades.length];
  const nombre = `Hotel ${nombreBases[i % nombreBases.length]} ${ciudad}${i > 14 ? " " + (Math.floor(i / 15) + 1) : ""}`;
  const alojados = Math.round(2000 + r() * 8000);
  const penetracion = 0.25 + r() * 0.55;
  const desayunos = Math.round(alojados * penetracion);
  const precioMedio = Math.round((8 + r() * 14) * 100) / 100;
  const coste = Math.round(precioMedio * (0.28 + r() * 0.22) * 100) / 100;
  const produccion = Math.round(desayunos * precioMedio);
  const ly = Math.round(produccion * (0.82 + r() * 0.35));
  const presupuesto = Math.round(produccion * (0.9 + r() * 0.25));
  const margen = 1 - coste / precioMedio;
  const variacion = ((produccion - ly) / ly) * 100;
  const status: Hotel["status"] =
    penetracion < 0.4 || variacion < -10 ? "alert" : variacion < 0 || margen < 0.5 ? "warn" : "ok";
  return {
    id: `H${String(i + 1).padStart(3, "0")}`,
    name: nombre,
    zone: zonas[i % zonas.length],
    regional: regionales[i % regionales.length],
    sociedad: sociedades[i % sociedades.length],
    submarca: submarcas[i % submarcas.length],
    ciudad,
    provincia,
    tipo: tipos[i % tipos.length],
    alojados,
    desayunos,
    penetracion,
    produccion,
    precioMedio,
    coste,
    margen,
    ly,
    presupuesto,
    variacion,
    trend: makeTrend(produccion / 12, r),
    status,
  };
});

export function getHotel(id: string) {
  return hotels.find((h) => h.id === id);
}

// ponytail: sin fuente documentada (no vienen de Odoo ni de un documento de
// dirección/revenue) — son valores de referencia usados internamente para
// calcular oportunidad y alertas, no un objetivo oficial confirmado. Antes
// de comunicarlos como objetivo de la empresa, confirmarlos con el
// departamento correspondiente.
export const TARGET_PENETRACION = 0.55;
export const TARGET_OPORTUNIDAD = 0.85;
export const UMBRAL_PENETRACION = 0.38;

export type Etiqueta = "verde" | "naranja" | "rojo";

/** Semáforo: por debajo de alerta = rojo, entre alerta y objetivo = naranja, por encima de objetivo = verde. */
export function etiqueta(valor: number, alerta: number, objetivo: number): Etiqueta {
  if (valor < alerta) return "rojo";
  if (valor < objetivo) return "naranja";
  return "verde";
}

export const ETIQUETA_BADGE_CLASS: Record<Etiqueta, string> = {
  verde: "bg-success/15 text-success",
  naranja: "bg-warning/15 text-warning",
  rojo: "bg-danger/15 text-danger",
};

export const ETIQUETA_LABEL: Record<Etiqueta, string> = {
  verde: "En objetivo",
  naranja: "Requiere seguimiento",
  rojo: "Requiere atención",
};

export const ETIQUETA_TEXT_CLASS: Record<Etiqueta, string> = {
  verde: "text-success",
  naranja: "text-warning",
  rojo: "text-danger",
};

/** Cumplimiento de presupuesto (real/presupuesto, 1.0 = 100%) como semáforo: <90% rojo, 90-100% naranja, ≥100% verde. */
export function etiquetaCumplimiento(cumplimiento: number | null): Etiqueta | null {
  if (cumplimiento === null) return null;
  return etiqueta(cumplimiento, 0.9, 1);
}

/** Signo (+/-) explícito para una cifra que puede ser negativa — fmtEuro/fmtPct ya
 * incluyen el "-" pero nunca el "+", así que un resultado positivo se confunde con
 * uno neutro a simple vista. Combinar con ETIQUETA_TEXT_CLASS o un color manual. */
export function conSigno(n: number, texto: string): string {
  return n > 0 ? `+${texto}` : texto;
}

/**
 * Facturación potencial: huecos de penetración (alojados × (objetivo − actual)) al precio
 * medio de venta — no unidades actuales escaladas por división, que se dispara a valores
 * absurdos cuando la penetración actual es casi cero (bug real encontrado 2026-08-21: un
 * hotel con penetración directa ~0% pero desayunos totales >0 por colaborador daba una
 * "facturación potencial" de millones). Mismo patrón que hotelOportunidad() de arriba.
 */
export function facturacionPotencial(
  alojados: number,
  penetracion: number,
  precioMedioVenta: number,
  objetivo: number = TARGET_PENETRACION
): number {
  const unidadesPotenciales = Math.max(0, alojados * (objetivo - penetracion));
  return unidadesPotenciales * precioMedioVenta;
}

export function hotelOportunidad(h: Hotel) {
  const potenciales = Math.max(0, Math.round(h.alojados * TARGET_OPORTUNIDAD - h.desayunos));
  return { potenciales, valor: Math.round(potenciales * h.precioMedio) };
}

export function suggestAction(h: Hotel): string {
  if (h.penetracion < 0.4) return "Mejorar venta recepción";
  if (h.precioMedio < 10) return "Revisar precio";
  if (h.margen < 0.5) return "Revisar coste materia prima";
  if (h.variacion < -5) return "Diferenciar oferta grupos";
  return "Optimizar mix producto";
}

export const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function aggregate(list: Hotel[] = hotels) {
  const alojados = list.reduce((a, h) => a + h.alojados, 0);
  const desayunos = list.reduce((a, h) => a + h.desayunos, 0);
  const produccion = list.reduce((a, h) => a + h.produccion, 0);
  const ly = list.reduce((a, h) => a + h.ly, 0);
  const presupuesto = list.reduce((a, h) => a + h.presupuesto, 0);
  const coste = list.reduce((a, h) => a + h.coste * h.desayunos, 0);
  const precio = produccion / desayunos;
  const costeMedio = coste / desayunos;
  const margen = 1 - costeMedio / precio;
  const penetracion = desayunos / alojados;
  const oportunidad = Math.round((alojados * 0.85 - desayunos) * precio); // target 85%
  return {
    alojados, desayunos, produccion, ly, presupuesto,
    precio, costeMedio, margen, penetracion, oportunidad,
    vsLy: ((produccion - ly) / ly) * 100,
    vsPresupuesto: ((produccion - presupuesto) / presupuesto) * 100,
  };
}

export function monthlySeries(list: Hotel[] = hotels) {
  return meses.map((m, i) => {
    const actual = list.reduce((a, h) => a + h.trend[i], 0);
    const ly = Math.round(actual * (0.88 + (i % 3) * 0.03));
    const pres = Math.round(actual * (0.95 + (i % 4) * 0.02));
    return { mes: m, actual, ly, presupuesto: pres };
  });
}

export function fmtEuro(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M €`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toFixed(0)} €`;
}
export function fmtNum(n: number) {
  return new Intl.NumberFormat("es-ES").format(Math.round(n));
}
export function fmtPct(n: number, digits = 1) {
  return `${(n * 100).toFixed(digits)}%`;
}
