import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { fmtEuro } from "@/lib/mock-data";
import type { SerieMensual } from "@/lib/hoteles-api";

export function EvolutionChartReal({ serie }: { serie: SerieMensual[] }) {
  const data = serie.map((s) => ({
    mes: new Date(s.mes).toLocaleDateString("es-ES", { month: "short" }),
    produccion: s.produccion,
  }));

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Evolución · Facturación de desayuno</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Últimos 12 meses · datos reales de Odoo</p>
      </header>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => fmtEuro(v)}
              width={80}
            />
            <Tooltip
              cursor={{ fill: "var(--color-accent)", opacity: 0.4 }}
              contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12 }}
              formatter={(v: number) => [fmtEuro(v), "Producción"]}
            />
            <Bar dataKey="produccion" name="Producción" fill="var(--color-primary)" radius={[6, 6, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
