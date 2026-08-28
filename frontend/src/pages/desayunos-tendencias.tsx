import { DashboardShell } from "@/components/dashboard/shell";
import { CalendarDays } from "lucide-react";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { RANGE_PRESETS_DESAYUNOS, fmtRangoFechas } from "@/lib/date-range";
import { Skeleton } from "@/components/ui/skeleton";
import { EvolutionChartReal } from "@/components/dashboard/evolution-chart-real";
import { IngresosGastosChart } from "@/components/dashboard/ingresos-gastos-chart";
import { PrecioCosteChart } from "@/components/dashboard/precio-coste-chart";
import { useDesayunosData } from "@/lib/use-desayunos-data";

export default function DesayunosTendenciasPage() {
  const { serieMensual, origenDatos, loading, error, rangeProps, desde, hasta } = useDesayunosData();

  return (
    <DashboardShell title="Tendencias" subtitle="Desayunos · evolución de los últimos 12 meses" origenDatos={origenDatos}>
      <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border bg-surface shadow-sm">
        <RangeFilter {...rangeProps} compact presets={RANGE_PRESETS_DESAYUNOS} />
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/90 bg-primary/5 border border-primary/15 rounded-full px-3 h-8">
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          {fmtRangoFechas(desde, hasta)}
        </span>
      </div>

      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}
        {loading && serieMensual.length === 0 && (
          <div className="space-y-6">
            <Skeleton className="h-72 rounded-xl" />
            <div className="grid gap-6 lg:grid-cols-2">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          </div>
        )}

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
