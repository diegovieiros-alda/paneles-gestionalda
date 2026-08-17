import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AlertsBlockReal } from "@/components/dashboard/alerts-block-real";
import { EvolutionChartReal } from "@/components/dashboard/evolution-chart-real";
import { RankingListReal } from "@/components/dashboard/ranking-list-real";
import { HotelsTableReal } from "@/components/dashboard/hotels-table-real";
import { OpportunityBlockReal } from "@/components/dashboard/opportunity-block-real";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchResumen, type ResumenReport } from "@/lib/hoteles-api";
import { fmtEuro, fmtPct, TARGET_PENETRACION } from "@/lib/mock-data";
import { Target } from "lucide-react";

export default function DashboardHome() {
  const [report, setReport] = useState<ResumenReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchResumen()
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <DashboardShell title="¿Dónde actuar hoy?">
        <div className="p-6 max-w-[1600px] mx-auto">
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        </div>
      </DashboardShell>
    );
  }

  if (loading || !report) {
    return (
      <DashboardShell title="¿Dónde actuar hoy?">
        <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
          <Skeleton className="h-20 w-full rounded-xl" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
          <Skeleton className="h-40 rounded-xl" />
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </DashboardShell>
    );
  }

  const { hoteles, serieMensual } = report;
  const alojados = hoteles.reduce((a, h) => a + h.alojados, 0);
  const desayunos = hoteles.reduce((a, h) => a + h.desayunos, 0);
  const produccion = hoteles.reduce((a, h) => a + h.produccion, 0);
  const precio = desayunos > 0 ? produccion / desayunos : 0;
  const penetracion = alojados > 0 ? desayunos / alojados : 0;
  const gap = TARGET_PENETRACION - penetracion;
  const trendProduccion = serieMensual.map((s) => s.produccion);

  return (
    <DashboardShell
      title="¿Dónde actuar hoy?"
      subtitle={`Vista global · Este mes · ${hoteles.length} hoteles`}
      origenDatos={report.origenDatos}
    >
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <section className="rounded-xl border border-border bg-surface px-5 py-4 shadow-soft flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center h-10 w-10 rounded-lg bg-primary/10 text-primary">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Objetivo penetración</div>
              <div className="text-lg font-semibold num text-foreground">{fmtPct(TARGET_PENETRACION, 0)}</div>
            </div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Actual</div>
            <div className="text-lg font-semibold num text-foreground">{fmtPct(penetracion)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Faltan</div>
            <div className={`text-lg font-semibold num ${gap > 0 ? "text-warning" : "text-success"}`}>
              {gap > 0 ? `${(gap * 100).toFixed(1)} pp` : "Objetivo cumplido"}
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="h-2 rounded-full bg-border overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, (penetracion / TARGET_PENETRACION) * 100)}%` }} />
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <AlertsBlockReal hoteles={hoteles} />
          <RankingListReal hoteles={hoteles} />
        </div>

        <OpportunityBlockReal hoteles={hoteles} />

        <section className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <KpiCard label="Producción" value={fmtEuro(produccion)} tone="neutral" trend={trendProduccion} />
          <KpiCard label="Penetración" value={fmtPct(penetracion)} tone="neutral" />
          <KpiCard label="Precio medio" value={`${precio.toFixed(2)}€`} tone="neutral" />
        </section>

        <EvolutionChartReal serie={serieMensual} />

        <HotelsTableReal hoteles={hoteles} />

        <footer className="text-[11px] text-muted-foreground text-center py-4">
          Datos reales de Odoo · {hoteles.length} hoteles · Centro de decisiones, no un informe
        </footer>
      </div>
    </DashboardShell>
  );
}
