import { useEffect, useState } from "react";
import { fetchDesayunos, type HotelReal, type SerieMensual, type Vendedor } from "@/lib/hoteles-api";
import { rangeForPreset, type RangePreset } from "@/lib/date-range";

/** Carga de datos de Desayunos compartida por las páginas "¿Dónde actuar
 * hoy?" y "Detalle completo" — cada una es su propia ruta, pero ambas
 * necesitan el mismo fetch por rango de fechas. */
export function useDesayunosData() {
  const [preset, setPreset] = useState<RangePreset>("mes");
  const [custom, setCustom] = useState(() => rangeForPreset("mes"));
  const [hoteles, setHoteles] = useState<HotelReal[] | null>(null);
  const [serieMensual, setSerieMensual] = useState<SerieMensual[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [origenDatos, setOrigenDatos] = useState<"odoo" | "cache" | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { desde, hasta } = preset === "custom" ? custom : rangeForPreset(preset);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDesayunos(desde, hasta)
      .then((data) => {
        setHoteles(data.hoteles);
        setSerieMensual(data.serieMensual);
        setVendedores(data.vendedores ?? []);
        setOrigenDatos(data.origenDatos);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [desde, hasta]);

  return {
    hoteles,
    serieMensual,
    vendedores,
    origenDatos,
    loading,
    error,
    rangeProps: {
      preset,
      custom,
      onPreset: (p: RangePreset) => {
        setPreset(p);
        if (p !== "custom") setCustom(rangeForPreset(p));
      },
      onCustom: setCustom,
    },
  };
}
