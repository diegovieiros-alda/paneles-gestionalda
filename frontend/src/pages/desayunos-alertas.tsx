import { DashboardShell } from "@/components/dashboard/shell";
import { DesayunosFiltrosPanel } from "@/components/dashboard/desayunos-filtros-panel";
import { DataLoading, LoadingOverlay } from "@/components/dashboard/loading-screen";
import { AlertsBlockReal } from "@/components/dashboard/alerts-block-real";
import { useDesayunosFiltros } from "@/lib/desayunos-filtros-context";
import { fmtRangoFechas } from "@/lib/date-range";

export default function DesayunosAlertasPage() {
  const { hotelesFiltrados: hoteles, origenDatos, loading, error, rangeProps, filterProps, desde, hasta } = useDesayunosFiltros();

  return (
    <DashboardShell
      title="Alertas"
      subtitle="Desayunos · hoteles que necesitan atención"
      origenDatos={origenDatos}
      periodo={fmtRangoFechas(desde, hasta)}
    >
      <DesayunosFiltrosPanel rangeProps={rangeProps} filterProps={filterProps} mostrarHotel={false} />

      <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}
        {loading && !hoteles && <DataLoading />}
        {loading && hoteles && <LoadingOverlay />}

        {hoteles && <AlertsBlockReal hoteles={hoteles} desde={desde} hasta={hasta} />}
      </div>
    </DashboardShell>
  );
}
