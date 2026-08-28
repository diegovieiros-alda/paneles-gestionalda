import { DashboardShell } from "@/components/dashboard/shell";
import { DesayunosFiltrosPanel } from "@/components/dashboard/desayunos-filtros-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertsBlockReal } from "@/components/dashboard/alerts-block-real";
import { useDesayunosData } from "@/lib/use-desayunos-data";
import { fmtRangoFechas } from "@/lib/date-range";

export default function DesayunosAlertasPage() {
  const { hotelesFiltrados: hoteles, origenDatos, loading, error, rangeProps, filterProps, desde, hasta } = useDesayunosData();

  return (
    <DashboardShell title="Alertas" subtitle="Desayunos · hoteles que necesitan atención" origenDatos={origenDatos} periodo={fmtRangoFechas(desde, hasta)}>
      <DesayunosFiltrosPanel rangeProps={rangeProps} filterProps={filterProps} mostrarHotel={false} />

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
