import { DashboardShell } from "@/components/dashboard/shell";
import { DesayunosFiltrosPanel } from "@/components/dashboard/desayunos-filtros-panel";
import { DataLoading, LoadingOverlay } from "@/components/dashboard/loading-screen";
import { HotelsTableReal } from "@/components/dashboard/hotels-table-real";
import { FacturacionTable } from "@/components/dashboard/facturacion-table";
import { ProduccionResumenCards } from "@/components/dashboard/produccion-resumen-cards";
import { FnbResumenCards } from "@/components/dashboard/fnb-resumen-cards";
import { FnbFinancieroTable } from "@/components/dashboard/fnb-financiero-table";
import { TurnosPanel } from "@/components/dashboard/turnos-panel";
import { DesayunosOrigenDatos } from "@/components/dashboard/desayunos-origen-datos";
import { CalidadCheckinTable } from "@/components/dashboard/calidad-checkin-table";
import { SectionTitle } from "@/components/dashboard/section-title";
import { useDesayunosFiltros } from "@/lib/desayunos-filtros-context";
import { fmtRangoFechas } from "@/lib/date-range";

// Los gráficos de evolución/tendencia viven en "Tendencias"
// (desayunos-tendencias.tsx), no aquí — esta página es solo la foto del
// periodo elegido, por hotel.
export default function DesayunosDetallePage() {
  const {
    hotelesFiltrados: hoteles, turnos, turnosFiltradosPorHotel,
    origenDatos, loading, error, rangeProps, filterProps, desde, hasta,
  } = useDesayunosFiltros();

  return (
    <DashboardShell
      title="Detalle completo"
      subtitle="Desayunos · producción, financiero F&B y turnos por hotel"
      origenDatos={origenDatos}
      periodo={fmtRangoFechas(desde, hasta)}
    >
      <DesayunosFiltrosPanel rangeProps={rangeProps} filterProps={filterProps} />

      <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}
        {loading && !hoteles && <DataLoading />}
        {loading && hoteles && <LoadingOverlay />}

        {hoteles && (
          <>
            <SectionTitle title="Rendimiento operativo" subtitle="PMS · producción y penetración por hotel (incluye colaborador, salvo penetración)" />
            <ProduccionResumenCards hoteles={hoteles} />
            <HotelsTableReal hoteles={hoteles} desde={desde} hasta={hasta} />
            <FacturacionTable hoteles={hoteles} desde={desde} hasta={hasta} />

            <SectionTitle title="Financiero F&B" subtitle="Contabilidad · ingresos, gastos, margen y presupuesto (excluye colaborador)" />
            <FnbResumenCards hoteles={hoteles} />
            <FnbFinancieroTable hoteles={hoteles} desde={desde} hasta={hasta} />

            <SectionTitle title="Turnos" />
            <TurnosPanel turnos={turnos} scope={turnosFiltradosPorHotel ? "hoteles filtrados" : "cadena completa"} />

            <SectionTitle title="Metodología" />
            <CalidadCheckinTable hoteles={hoteles} />
            <DesayunosOrigenDatos />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
