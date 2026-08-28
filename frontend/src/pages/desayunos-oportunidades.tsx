import { DashboardShell } from "@/components/dashboard/shell";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { ObjetivoPenetracionCard } from "@/components/dashboard/objetivo-penetracion-card";
import { RankingListReal } from "@/components/dashboard/ranking-list-real";
import { OpportunityBlockReal } from "@/components/dashboard/opportunity-block-real";
import { useDesayunosData } from "@/lib/use-desayunos-data";

export default function DesayunosOportunidadesPage() {
  const { hoteles, origenDatos, loading, error, rangeProps } = useDesayunosData();

  return (
    <DashboardShell title="Oportunidades" subtitle="Desayunos · facturación potencial no capturada" origenDatos={origenDatos}>
      <RangeFilter {...rangeProps} />

      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}
        {loading && !hoteles && (
          <div className="space-y-6">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        )}

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
