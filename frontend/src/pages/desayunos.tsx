import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { HotelsTableReal } from "@/components/dashboard/hotels-table-real";
import { FnbFinancieroTable } from "@/components/dashboard/fnb-financiero-table";
import { VendedoresPanel } from "@/components/dashboard/vendedores-panel";
import { DesayunosOrigenDatos } from "@/components/dashboard/desayunos-origen-datos";
import { EvolutionChartReal } from "@/components/dashboard/evolution-chart-real";
import { IngresosGastosChart } from "@/components/dashboard/ingresos-gastos-chart";
import { PrecioCosteChart } from "@/components/dashboard/precio-coste-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchDesayunos, type HotelReal, type SerieMensual, type Vendedor } from "@/lib/hoteles-api";
import { rangeForPreset, type RangePreset } from "@/lib/date-range";
import { RangeFilter } from "@/components/dashboard/range-filter";

export default function DesayunosPage() {
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

  return (
    <DashboardShell
      title="Desayunos"
      subtitle="Producción, penetración y precio medio de desayuno · datos reales de Odoo"
      origenDatos={origenDatos}
    >
      <RangeFilter
        preset={preset}
        custom={custom}
        onPreset={(p) => {
          setPreset(p);
          if (p !== "custom") setCustom(rangeForPreset(p));
        }}
        onCustom={setCustom}
      />

      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}
        {loading && !hoteles && (
          <div className="space-y-6">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        )}
        {serieMensual.length > 0 && <EvolutionChartReal serie={serieMensual} />}
        {hoteles && <HotelsTableReal hoteles={hoteles} />}
        {hoteles && <FnbFinancieroTable hoteles={hoteles} />}
        {serieMensual.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <IngresosGastosChart serie={serieMensual} />
            <PrecioCosteChart serie={serieMensual} />
          </div>
        )}
        <VendedoresPanel vendedores={vendedores} />
        <DesayunosOrigenDatos />
      </div>
    </DashboardShell>
  );
}
