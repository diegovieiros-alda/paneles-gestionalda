export type RangePreset =
  | "hoy" | "ayer" | "7d" | "30d" | "mes"
  | "dia" | "q1" | "q2" | "q3" | "q4" | "fiscal"
  | "custom";

type PresetDescriptor = { key: Exclude<RangePreset, "custom">; label: string; title?: string };

// Bloqueos sigue con sus presets de siempre (ayer/hoy/7d/30d/mes) — no se
// ha tocado ese dashboard en esta revisión, ver RangeFilter.tsx (usa este
// array por defecto). Desayunos usa RANGE_PRESETS_DESAYUNOS, más abajo.
export const RANGE_PRESETS: PresetDescriptor[] = [
  { key: "ayer", label: "Ayer" },
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "mes", label: "Este mes" },
];

// Desayunos (2026-08-28): Día es el filtro por defecto al cargar la
// página. Trimestres como Q1-Q4 (natural de calendario, no fiscal —
// confirmado con el usuario) en vez de un único botón "trimestre en
// curso", para poder elegir cualquiera de los 4 del año actual.
export const RANGE_PRESETS_DESAYUNOS: PresetDescriptor[] = [
  { key: "dia", label: "Día" },
  { key: "mes", label: "Mes" },
  { key: "q1", label: "Q1", title: "Enero - Marzo" },
  { key: "q2", label: "Q2", title: "Abril - Junio" },
  { key: "q3", label: "Q3", title: "Julio - Septiembre" },
  { key: "q4", label: "Q4", title: "Octubre - Diciembre" },
  { key: "fiscal", label: "Año fiscal", title: "1 de octubre - 30 de septiembre" },
];

// OJO: NO usar d.toISOString() aquí. Convierte a UTC, y con
// new Date(año, mes, día) construyendo medianoche en hora LOCAL, en
// cualquier huso horario adelantado a UTC (España, UTC+1/+2) eso cae en
// el día UTC anterior — el año fiscal salía mostrando "30 sept" en vez
// de "1 oct" (bug real reportado, verificado 2026-08-28: con la fecha de
// hoy en CEST, medianoche local del 1 de octubre es las 22:00 UTC del 30
// de septiembre). Se leen los componentes en hora local y punto, sin
// pasar por UTC en ningún momento.
function iso(d: Date) {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

const FMT_FECHA = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

// "T00:00:00" (sin "Z"): que Date la interprete en hora local, no UTC —
// si no, en UTC+1/+2 el formateo puede saltar al día siguiente.
function fechaLocal(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function fmtRangoFechas(desde: string, hasta: string): string {
  const fDesde = FMT_FECHA.format(fechaLocal(desde));
  if (desde === hasta) return fDesde;
  return `${fDesde} – ${FMT_FECHA.format(fechaLocal(hasta))}`;
}

const FMT_MES_ANIO = new Intl.DateTimeFormat("es-ES", { month: "short", year: "numeric" });

// La serie mensual de Tendencias es siempre una ventana móvil de 12 meses
// que termina en el "hasta" del filtro (ver get_resumen en service.py) —
// nunca el rango exacto del filtro. Los subtítulos de los gráficos decían
// "Últimos 12 meses" a fuego, sin decir CUÁLES, así que no reflejaban el
// filtro elegido (reportado: "siempre aparece últimos 12 meses"). Se
// calcula el rango real a partir de la propia serie devuelta.
export function fmtRangoSerieMensual(serie: { mes: string }[]): string {
  if (serie.length === 0) return "";
  const desde = FMT_MES_ANIO.format(fechaLocal(serie[0].mes));
  const hasta = FMT_MES_ANIO.format(fechaLocal(serie[serie.length - 1].mes));
  return desde === hasta ? desde : `${desde} – ${hasta}`;
}

// Backend ya admite rangos de hasta 370 días para Desayunos (ver
// MAX_RANGO_DIAS_DESAYUNOS en backend/core/views.py, dimensionado a
// propósito para el filtro "Año fiscal").
export function rangeForPreset(preset: Exclude<RangePreset, "custom">): { desde: string; hasta: string } {
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);

  // Para un periodo con fecha de fin conocida (fin de mes/trimestre/año
  // fiscal): si ya terminó (fin < hoy), se usa esa fecha real; si está en
  // curso o es futuro, se corta en "ayer" (hoy está incompleto) sin
  // bajar de "desde". Q1-Q4 permiten elegir un trimestre ya cerrado del
  // año en curso, a diferencia del antiguo botón único "trimestre".
  function hastaDe(desde: Date, fin: Date): string {
    if (fin < hoy) return iso(fin);
    return iso(ayer < desde ? desde : ayer);
  }

  switch (preset) {
    case "hoy":
      return { desde: iso(hoy), hasta: iso(hoy) };
    case "ayer":
      return { desde: iso(ayer), hasta: iso(ayer) };
    case "7d": {
      const desde = new Date(ayer);
      desde.setDate(desde.getDate() - 6);
      return { desde: iso(desde), hasta: iso(ayer) };
    }
    case "30d": {
      const desde = new Date(ayer);
      desde.setDate(desde.getDate() - 29);
      return { desde: iso(desde), hasta: iso(ayer) };
    }
    case "mes": {
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
      return { desde: iso(desde), hasta: hastaDe(desde, fin) };
    }
    // A partir de aquí, presets propios de Desayunos.
    case "dia":
      // A diferencia de "hoy" (Bloqueos): mismo cálculo, nombre distinto
      // porque es el filtro por defecto de Desayunos, pensado para ver el
      // día en curso, no ayer.
      return { desde: iso(hoy), hasta: iso(hoy) };
    case "q1":
    case "q2":
    case "q3":
    case "q4": {
      const trimestre = { q1: 0, q2: 1, q3: 2, q4: 3 }[preset];
      const desde = new Date(hoy.getFullYear(), trimestre * 3, 1);
      const fin = new Date(hoy.getFullYear(), trimestre * 3 + 3, 0);
      return { desde: iso(desde), hasta: hastaDe(desde, fin) };
    }
    case "fiscal": {
      // Año fiscal 1 de octubre - 30 de septiembre: a diferencia de Mes/
      // Q1-Q4, NO se recorta en "ayer" aunque el año en curso no haya
      // terminado — son los límites oficiales del año fiscal de la
      // empresa (pedido explícitamente, 2026-08-28: "el año fiscal... es
      // desde el 1 de octubre al 30 de septiembre", sin más matices). Una
      // fecha de fin en el futuro no rompe nada: Odoo simplemente no
      // tiene filas más allá de hoy, así que el resultado real coincide
      // con lo que ya se mostraba, pero ahora la etiqueta no miente sobre
      // cuáles son los límites del año fiscal.
      const anioInicio = hoy.getMonth() >= 9 ? hoy.getFullYear() : hoy.getFullYear() - 1;
      const desde = new Date(anioInicio, 9, 1);
      const fin = new Date(anioInicio + 1, 8, 30);
      return { desde: iso(desde), hasta: iso(fin) };
    }
  }
}
