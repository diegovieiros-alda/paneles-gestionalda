// Utilidades de formato y semáforo compartidas por los dashboards reales
// (Bloqueos, Desayunos). Antes también vivían aquí los datos de ejemplo y
// los objetivos hardcodeados (TARGET_PENETRACION/UMBRAL_PENETRACION/
// TARGET_OPORTUNIDAD) de las páginas globales "Oportunidades"/"Tendencias"/
// "Alertas" — esas páginas y sus datos de ejemplo se eliminaron (2026-08-27,
// cada dashboard tiene ahora sus propias secciones con datos reales); los
// objetivos de Desayunos pasaron a ser ajustes editables de verdad, ver
// @/lib/ajustes-desayuno-context.

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
 * "facturación potencial" de millones). `objetivo` ya no tiene un valor por defecto
 * hardcodeado — viene de los ajustes editables del dashboard (ver
 * @/lib/ajustes-desayuno-context).
 */
export function facturacionPotencial(
  alojados: number,
  penetracion: number,
  precioMedioVenta: number,
  objetivo: number
): number {
  const unidadesPotenciales = Math.max(0, alojados * (objetivo - penetracion));
  return unidadesPotenciales * precioMedioVenta;
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
