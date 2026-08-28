export type RangePreset = "hoy" | "ayer" | "7d" | "30d" | "mes" | "dia" | "trimestre" | "fiscal" | "custom";

// Bloqueos sigue con sus presets de siempre (ayer/hoy/7d/30d/mes) — no se
// ha tocado ese dashboard en esta revisión, ver RangeFilter.tsx (usa este
// array por defecto). Desayunos usa RANGE_PRESETS_DESAYUNOS, más abajo.
export const RANGE_PRESETS: Array<{ key: Exclude<RangePreset, "custom">; label: string }> = [
  { key: "ayer", label: "Ayer" },
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "mes", label: "Este mes" },
];

// Desayunos (2026-08-28): Día es el filtro por defecto al cargar la
// página — Mes/Trimestre/Año fiscal para vistas agregadas.
export const RANGE_PRESETS_DESAYUNOS: Array<{ key: Exclude<RangePreset, "custom">; label: string }> = [
  { key: "dia", label: "Día" },
  { key: "mes", label: "Mes" },
  { key: "trimestre", label: "Trimestre" },
  { key: "fiscal", label: "Año fiscal" },
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
      return { desde: iso(desde), hasta: iso(ayer < desde ? desde : ayer) };
    }
    // A partir de aquí, presets propios de Desayunos.
    case "dia":
      // A diferencia de "hoy" (Bloqueos): mismo cálculo, nombre distinto
      // porque es el filtro por defecto de Desayunos, pensado para ver el
      // día en curso, no ayer.
      return { desde: iso(hoy), hasta: iso(hoy) };
    case "trimestre": {
      // Trimestre natural de calendario (ene-mar/abr-jun/jul-sep/oct-dic),
      // no fiscal — decidido con el usuario 2026-08-28. Cierra en "ayer"
      // como "mes": el día en curso está incompleto y mezclarlo en un
      // agregado de meses daría un último punto engañosamente bajo.
      const inicioMes = Math.floor(hoy.getMonth() / 3) * 3;
      const desde = new Date(hoy.getFullYear(), inicioMes, 1);
      return { desde: iso(desde), hasta: iso(ayer < desde ? desde : ayer) };
    }
    case "fiscal": {
      // Año fiscal 1 de octubre - 30 de septiembre.
      const anioInicio = hoy.getMonth() >= 9 ? hoy.getFullYear() : hoy.getFullYear() - 1;
      const desde = new Date(anioInicio, 9, 1);
      return { desde: iso(desde), hasta: iso(ayer < desde ? desde : ayer) };
    }
  }
}
