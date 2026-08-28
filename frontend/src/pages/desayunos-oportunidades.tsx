import { DashboardShell } from "@/components/dashboard/shell";
import { DesayunosFiltrosPanel } from "@/components/dashboard/desayunos-filtros-panel";
import { DataLoading } from "@/components/dashboard/loading-screen";
import { ObjetivoPenetracionCard } from "@/components/dashboard/objetivo-penetracion-card";
import { RankingListReal } from "@/components/dashboard/ranking-list-real";
import { OpportunityBlockReal } from "@/components/dashboard/opportunity-block-real";
import { useDesayunosData } from "@/lib/use-desayunos-data";
import { fmtRangoFechas } from "@/lib/date-range";

export default function DesayunosOportunidadesPage() {
  const { hotelesFiltrados: hoteles, origenDatos, loading, error, rangeProps, filterProps, desde, hasta } = useDesayunosData();

  return (
    <DashboardShell title="Oportunidades" subtitle="Desayunos · facturación potencial no capturada" origenDatos={origenDatos} periodo={fmtRangoFechas(desde, hasta)}>
      <DesayunosFiltrosPanel rangeProps={rangeProps} filterProps={filterProps} mostrarHotel={false} />

      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}
        {loading && !hoteles && <DataLoading />}

        {hoteles && (
          <>
            <ObjetivoPenetracionCard hoteles={hoteles} />
            <RankingListReal hoteles={hoteles} />
            <OpportunityBlockReal hoteles={hoteles} />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
