import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { fmtEuro, fmtPct } from "@/lib/mock-data";
import type { SerieMensual } from "@/lib/hoteles-api";

export function IngresosGastosChart({ serie }: { serie: SerieMensual[] }) {
  const data = serie.map((s) => ({
    mes: new Date(s.mes).toLocaleDateString("es-ES", { month: "short" }),
    ingresos: s.ingresos,
    presupuestoIngresos: s.presupuestoIngresos > 0 ? s.presupuestoIngresos : null,
    gastos: s.gastos,
    margenBruto: s.margenBruto,
  }));

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Evolución · Ingresos, gastos y margen bruto</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Últimos 12 meses · fuente contable · Gastos = compras registradas ese mes, no consumo real del periodo
          (puede dar margen negativo algún mes)
        </p>
      </header>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="euros"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => fmtEuro(v)}
              width={80}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              width={48}
            />
            <Tooltip
              cursor={{ fill: "var(--color-accent)", opacity: 0.3 }}
              contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12 }}
              formatter={(v: number, name: string) => (name === "Margen bruto" ? [fmtPct(v, 1), name] : [fmtEuro(v), name])}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="euros" dataKey="ingresos" name="Ingresos" fill="var(--color-primary)" radius={[6, 6, 0, 0]} maxBarSize={28} />
            <Bar yAxisId="euros" dataKey="gastos" name="Gastos" fill="var(--color-danger)" radius={[6, 6, 0, 0]} maxBarSize={28} />
            <Line
              yAxisId="euros" dataKey="presupuestoIngresos" name="Presupuesto ingresos"
              stroke="var(--color-muted-foreground)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls
            />
            <Line yAxisId="pct" dataKey="margenBruto" name="Margen bruto" stroke="var(--color-success)" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
