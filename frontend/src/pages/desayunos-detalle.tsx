import { DashboardShell } from "@/components/dashboard/shell";
import { DesayunosFiltrosPanel } from "@/components/dashboard/desayunos-filtros-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { HotelsTableReal } from "@/components/dashboard/hotels-table-real";
import { FacturacionTable } from "@/components/dashboard/facturacion-table";
import { ProduccionResumenCards } from "@/components/dashboard/produccion-resumen-cards";
import { FnbResumenCards } from "@/components/dashboard/fnb-resumen-cards";
import { FnbFinancieroTable } from "@/components/dashboard/fnb-financiero-table";
import { TurnosPanel } from "@/components/dashboard/turnos-panel";
import { DesayunosOrigenDatos } from "@/components/dashboard/desayunos-origen-datos";
import { CalidadCheckinTable } from "@/components/dashboard/calidad-checkin-table";
import { SectionTitle } from "@/components/dashboard/section-title";
import { useDesayunosData } from "@/lib/use-desayunos-data";

// Los gráficos de evolución/tendencia viven en "Tendencias"
// (desayunos-tendencias.tsx), no aquí — esta página es solo la foto del
// periodo elegido, por hotel.
export default function DesayunosDetallePage() {
  const { hotelesFiltrados: hoteles, turnos, origenDatos, loading, error, rangeProps, filterProps, desde, hasta } = useDesayunosData();

  return (
    <DashboardShell
      title="Detalle completo"
      subtitle="Desayunos · producción, financiero F&B y turnos por hotel"
      origenDatos={origenDatos}
    >
      <DesayunosFiltrosPanel rangeProps={rangeProps} filterProps={filterProps} desde={desde} hasta={hasta} />

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

        {hoteles && (
          <>
            <SectionTitle title="Rendimiento operativo" subtitle="PMS · producción y penetración por hotel (incluye colaborador, salvo penetración)" />
            <ProduccionResumenCards hoteles={hoteles} />
            <HotelsTableReal hoteles={hoteles} />
            <FacturacionTable hoteles={hoteles} />

            <SectionTitle title="Financiero F&B" subtitle="Contabilidad · ingresos, gastos, margen y presupuesto (excluye colaborador)" />
            <FnbResumenCards hoteles={hoteles} />
            <FnbFinancieroTable hoteles={hoteles} />

            <SectionTitle title="Turnos" />
            <TurnosPanel turnos={turnos} />

            <SectionTitle title="Metodología" />
            <CalidadCheckinTable hoteles={hoteles} />
            <DesayunosOrigenDatos />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
