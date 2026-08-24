import { DashboardShell } from "@/components/dashboard/shell";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { HotelsTableReal } from "@/components/dashboard/hotels-table-real";
import { FnbResumenCards } from "@/components/dashboard/fnb-resumen-cards";
import { FnbFinancieroTable } from "@/components/dashboard/fnb-financiero-table";
import { VendedoresPanel } from "@/components/dashboard/vendedores-panel";
import { DesayunosOrigenDatos } from "@/components/dashboard/desayunos-origen-datos";
import { CalidadCheckinTable } from "@/components/dashboard/calidad-checkin-table";
import { EvolutionChartReal } from "@/components/dashboard/evolution-chart-real";
import { IngresosGastosChart } from "@/components/dashboard/ingresos-gastos-chart";
import { PrecioCosteChart } from "@/components/dashboard/precio-coste-chart";
import { SectionTitle } from "@/components/dashboard/section-title";
import { useDesayunosData } from "@/lib/use-desayunos-data";

export default function DesayunosDetallePage() {
  const { hoteles, serieMensual, vendedores, origenDatos, loading, error, rangeProps } = useDesayunosData();

  return (
    <DashboardShell
      title="Detalle completo"
      subtitle="Desayunos · producción, financiero F&B y vendedores por hotel"
      origenDatos={origenDatos}
    >
      <RangeFilter {...rangeProps} />

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
            {serieMensual.length > 0 && <EvolutionChartReal serie={serieMensual} />}
            <HotelsTableReal hoteles={hoteles} />

            <SectionTitle title="Financiero F&B" subtitle="Contabilidad · ingresos, gastos, margen y presupuesto (excluye colaborador)" />
            <FnbResumenCards hoteles={hoteles} />
            {serieMensual.length > 0 && (
              <div className="grid gap-6 lg:grid-cols-2">
                <IngresosGastosChart serie={serieMensual} />
                <PrecioCosteChart serie={serieMensual} />
              </div>
            )}
            <FnbFinancieroTable hoteles={hoteles} />

            <SectionTitle title="Vendedores" />
            <VendedoresPanel vendedores={vendedores} />

            <SectionTitle title="Metodología" />
            <CalidadCheckinTable hoteles={hoteles} />
            <DesayunosOrigenDatos />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
