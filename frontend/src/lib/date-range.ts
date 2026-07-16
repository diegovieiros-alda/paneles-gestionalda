export type RangePreset = "hoy" | "ayer" | "7d" | "30d" | "mes" | "custom";

export const RANGE_PRESETS: Array<{ key: Exclude<RangePreset, "custom">; label: string }> = [
  { key: "ayer", label: "Ayer" },
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "mes", label: "Este mes" },
];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

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
  }
}
