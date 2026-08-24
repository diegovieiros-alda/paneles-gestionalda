import { DashboardShell } from "@/components/dashboard/shell";
import { EvolutionChart } from "@/components/dashboard/evolution-chart";
import { monthlySeries, hotels, fmtEuro, fmtPct } from "@/lib/mock-data";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export default function TendenciasPage() {
  const series = monthlySeries();
  const pen = series.map((s, i) => ({ mes: s.mes, penetracion: 0.45 + Math.sin(i / 2) * 0.05 + i * 0.005 }));

  const zoneAgg = Array.from(new Set(hotels.map((h) => h.zone))).map((z) => {
    const list = hotels.filter((h) => h.zone === z);
    const prod = list.reduce((a, h) => a + h.produccion, 0);
    const ly = list.reduce((a, h) => a + h.ly, 0);
    return { zona: z, produccion: prod, variacion: ((prod - ly) / ly) * 100 };
  }).sort((a, b) => b.produccion - a.produccion);

  return (
    <DashboardShell title="Tendencias" subtitle="Evolución del servicio · últimos 12 meses" origenDatos="ejemplo">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <EvolutionChart />

        <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-foreground">Penetración media mensual</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Objetivo 55%</p>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pen} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => fmtPct(v)}
                />
                <Line dataKey="penetracion" name="Penetración" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-foreground">Ranking por zona</h2>
          <div className="mt-4 divide-y divide-border">
            {zoneAgg.map((z) => (
              <div key={z.zona} className="flex items-center gap-4 py-3">
                <div className="w-32 text-sm text-foreground">{z.zona}</div>
                <div className="flex-1 h-2 rounded-full bg-border/60 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(z.produccion / zoneAgg[0].produccion) * 100}%` }} />
                </div>
                <div className="w-28 text-right text-sm num font-medium">{fmtEuro(z.produccion)}</div>
                <div className={`w-20 text-right text-xs num ${z.variacion >= 0 ? "text-success" : "text-danger"}`}>
                  {z.variacion >= 0 ? "+" : ""}{z.variacion.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
