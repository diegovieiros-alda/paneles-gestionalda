import { useState } from "react";
import { rangeForPreset, type RangePreset } from "@/lib/date-range";

// Mismo patrón de preset+custom repetido tal cual en 4 sitios (bloqueos.tsx,
// hotel-bloqueos.tsx ×2, hotel-desayunos.tsx) antes de esta extracción —
// centralizado aquí para no seguir divergiendo (use-desayunos-data.ts tiene
// una variante ligeramente distinta con más estado propio, no se toca).
export function useRangePreset(inicial: RangePreset, customInicial?: { desde: string; hasta: string }) {
  const [preset, setPreset] = useState<RangePreset>(inicial);
  const [custom, setCustom] = useState(() => customInicial ?? rangeForPreset(inicial === "custom" ? "30d" : inicial));
  // "mes" también lee de `custom` (no de rangeForPreset directamente):
  // desde que es un desplegable con los 12 meses del año (2026-09-04), el
  // mes elegido es un valor que cambia, igual que "Personalizado" — solo
  // que con su propio control en vez de dos campos de fecha libres.
  const { desde, hasta } = preset === "custom" || preset === "mes" ? custom : rangeForPreset(preset);
  return {
    desde,
    hasta,
    preset,
    custom,
    onPreset: (p: RangePreset) => {
      setPreset(p);
      if (p !== "custom") setCustom(rangeForPreset(p));
    },
    onCustom: setCustom,
  };
}
