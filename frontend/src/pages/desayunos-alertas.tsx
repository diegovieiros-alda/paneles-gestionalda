import { DashboardShell } from "@/components/dashboard/shell";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { HotelFiltersBar } from "@/components/dashboard/hotel-filters-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertsBlockReal } from "@/components/dashboard/alerts-block-real";
import { useDesayunosData } from "@/lib/use-desayunos-data";

export default function DesayunosAlertasPage() {
  const { hotelesFiltrados: hoteles, origenDatos, loading, error, rangeProps, filterProps } = useDesayunosData();

  return (
    <DashboardShell title="Alertas" subtitle="Desayunos · hoteles que necesitan atención" origenDatos={origenDatos}>
      <RangeFilter {...rangeProps} />
      <HotelFiltersBar {...filterProps} />

      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}
        {loading && !hoteles && <Skeleton className="h-64 rounded-xl" />}

        {hoteles && <AlertsBlockReal hoteles={hoteles} />}
      </div>
    </DashboardShell>
  );
}
