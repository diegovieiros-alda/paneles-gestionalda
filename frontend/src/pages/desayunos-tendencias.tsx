import { DashboardShell } from "@/components/dashboard/shell";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { RANGE_PRESETS_DESAYUNOS, fmtRangoFechas } from "@/lib/date-range";
import { DataLoading } from "@/components/dashboard/loading-screen";
import { EvolutionChartReal } from "@/components/dashboard/evolution-chart-real";
import { IngresosGastosChart } from "@/components/dashboard/ingresos-gastos-chart";
import { PrecioCosteChart } from "@/components/dashboard/precio-coste-chart";
import { useDesayunosData } from "@/lib/use-desayunos-data";

export default function DesayunosTendenciasPage() {
  const { serieMensual, origenDatos, loading, error, rangeProps, desde, hasta } = useDesayunosData();

  return (
    <DashboardShell title="Tendencias" subtitle="Desayunos · evolución de los últimos 12 meses" origenDatos={origenDatos} periodo={fmtRangoFechas(desde, hasta)}>
      <RangeFilter {...rangeProps} presets={RANGE_PRESETS_DESAYUNOS} />

      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}
        {loading && serieMensual.length === 0 && <DataLoading />}

        {serieMensual.length > 0 && (
          <>
            <EvolutionChartReal serie={serieMensual} />
            <div className="grid gap-6 lg:grid-cols-2">
              <IngresosGastosChart serie={serieMensual} />
              <PrecioCosteChart serie={serieMensual} />
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
