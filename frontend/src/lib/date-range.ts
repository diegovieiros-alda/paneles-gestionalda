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

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
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
      // Año fiscal 1 de octubre - 30 de septiembre.
      const anioInicio = hoy.getMonth() >= 9 ? hoy.getFullYear() : hoy.getFullYear() - 1;
      const desde = new Date(anioInicio, 9, 1);
      const fin = new Date(anioInicio + 1, 8, 30);
      return { desde: iso(desde), hasta: hastaDe(desde, fin) };
    }
  }
}
