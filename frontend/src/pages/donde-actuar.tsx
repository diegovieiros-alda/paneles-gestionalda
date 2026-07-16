import { DashboardShell } from "@/components/dashboard/shell";
import { FiltersBar } from "@/components/dashboard/filters-bar";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AlertsBlock } from "@/components/dashboard/alerts-block";
import { EvolutionChart } from "@/components/dashboard/evolution-chart";
import { RankingList } from "@/components/dashboard/ranking-list";
import { HotelsTable } from "@/components/dashboard/hotels-table";
import { OpportunityBlock } from "@/components/dashboard/opportunity-block";
import { aggregate, hotels, monthlySeries, fmtEuro, fmtPct, TARGET_PENETRACION } from "@/lib/mock-data";
import { Target } from "lucide-react";

export default function DashboardHome() {
  const a = aggregate();
  const series = monthlySeries();
  const trend = series.map((s) => s.actual);
  const gap = TARGET_PENETRACION - a.penetracion;

  return (
    <DashboardShell
      title="¿Dónde actuar hoy?"
      subtitle="Vista global · Últimos 30 días · 100 hoteles"
    >
      <FiltersBar />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Penetration objective banner */}
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
            <div className="text-lg font-semibold num text-foreground">{fmtPct(a.penetracion)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Faltan</div>
            <div className={`text-lg font-semibold num ${gap > 0 ? "text-warning" : "text-success"}`}>
              {gap > 0 ? `${(gap * 100).toFixed(1)} pp` : "Objetivo cumplido"}
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="h-2 rounded-full bg-border overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, (a.penetracion / TARGET_PENETRACION) * 100)}%` }} />
            </div>
          </div>
        </section>

        {/* 1. Alertas + 2. Oportunidad */}
        <div className="grid gap-6 lg:grid-cols-2">
          <AlertsBlock />
          <RankingList />
        </div>

        <OpportunityBlock />

        {/* 3. KPIs (6, no red) */}
        <section className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Producción"
            value={fmtEuro(a.produccion)}
            delta={a.vsPresupuesto}
            deltaLabel="vs presupuesto"
            tone="neutral"
            trend={trend}
          />
          <KpiCard
            label="Penetración"
            value={fmtPct(a.penetracion)}
            delta={((a.penetracion - TARGET_PENETRACION) / TARGET_PENETRACION) * 100}
            deltaLabel="vs objetivo"
            tone="neutral"
            trend={trend.map((v, i) => v * (1 + i * 0.01))}
          />
          <KpiCard
            label="Precio medio"
            value={`${a.precio.toFixed(2)}€`}
            delta={2.3}
            deltaLabel="vs LY"
            tone="neutral"
            trend={trend.map((_, i) => 10 + Math.sin(i) * 2)}
          />
          <KpiCard
            label="Coste medio"
            value={`${a.costeMedio.toFixed(2)}€`}
            delta={-1.4}
            deltaLabel="vs LY"
            tone="neutral"
            trend={trend.map((_, i) => 4 + Math.cos(i) * 0.6)}
          />
          <KpiCard
            label="Margen bruto"
            value={fmtPct(a.margen)}
            delta={1.8}
            deltaLabel="vs LY"
            tone="neutral"
            trend={trend.map((_, i) => 55 + Math.sin(i) * 3)}
          />
          <KpiCard
            label="Producción vs LY"
            value={`${a.vsLy >= 0 ? "+" : ""}${a.vsLy.toFixed(1)}%`}
            tone="neutral"
            footer={`Actual ${fmtEuro(a.produccion)} · LY ${fmtEuro(a.ly)}`}
          />
        </section>

        {/* 5. Evolution */}
        <EvolutionChart />

        {/* 6. Full table */}
        <HotelsTable />

        <footer className="text-[11px] text-muted-foreground text-center py-4">
          Datos demo · {hotels.length} hoteles simulados · Centro de decisiones, no un informe
        </footer>
      </div>
    </DashboardShell>
  );
}
