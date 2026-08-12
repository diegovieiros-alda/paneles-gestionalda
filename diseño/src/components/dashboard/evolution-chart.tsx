import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  Bar, Line, Legend,
} from "recharts";
import { monthlySeries, fmtEuro, fmtPct } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const granularity = ["Día", "Semana", "Mes", "Trimestre", "Año"] as const;

type Metric = "facturacion" | "penetracion" | "precio" | "margen" | "coste";
const metricas: Array<{ key: Metric; label: string; fmt: (v: number) => string }> = [
  { key: "facturacion", label: "Facturación", fmt: fmtEuro },
  { key: "penetracion", label: "Penetración", fmt: (v) => fmtPct(v) },
  { key: "precio", label: "Precio medio", fmt: (v) => `${v.toFixed(2)}€` },
  { key: "margen", label: "Margen", fmt: (v) => fmtPct(v) },
  { key: "coste", label: "Coste medio", fmt: (v) => `${v.toFixed(2)}€` },
];

export function EvolutionChart() {
  const [g, setG] = useState<(typeof granularity)[number]>("Mes");
  const [metric, setMetric] = useState<Metric>("facturacion");
  const base = monthlySeries();

  const data = useMemo(() => base.map((s, i) => {
    switch (metric) {
      case "facturacion":
        return { mes: s.mes, actual: s.actual, ly: s.ly, presupuesto: s.presupuesto };
      case "penetracion": {
        const actual = 0.48 + Math.sin(i / 2) * 0.05 + i * 0.004;
        return { mes: s.mes, actual, ly: actual * 0.92, presupuesto: 0.55 };
      }
      case "precio": {
        const actual = 11.5 + Math.sin(i / 3) * 0.6 + i * 0.05;
        return { mes: s.mes, actual, ly: actual - 0.4, presupuesto: 12 };
      }
      case "margen": {
        const actual = 0.55 + Math.cos(i / 2) * 0.03;
        return { mes: s.mes, actual, ly: actual - 0.02, presupuesto: 0.58 };
      }
      case "coste": {
        const actual = 4.2 + Math.sin(i / 4) * 0.3;
        return { mes: s.mes, actual, ly: actual + 0.15, presupuesto: 4 };
      }
    }
  }), [base, metric]);

  const active = metricas.find((m) => m.key === metric)!;

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Evolución · {active.label}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Actual vs año anterior vs presupuesto
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
            {metricas.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md transition-colors",
                  metric === m.key ? "bg-surface text-foreground shadow-soft font-medium" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
            {granularity.map((it) => (
              <button
                key={it}
                onClick={() => setG(it)}
                className={cn(
                  "px-3 py-1 text-xs rounded-md transition-colors",
                  g === it ? "bg-surface text-foreground shadow-soft font-medium" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {it}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="barActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => active.fmt(v)}
              width={80}
            />
            <Tooltip
              cursor={{ fill: "var(--color-accent)", opacity: 0.4 }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                fontSize: 12,
              }}
              formatter={(v: number, n) => [active.fmt(v), n === "actual" ? "Actual" : n === "ly" ? "Año anterior" : "Presupuesto"]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
            <Bar dataKey="actual" name="Actual" fill="url(#barActual)" radius={[6, 6, 0, 0]} maxBarSize={28} />
            <Line dataKey="ly" name="Año anterior" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />
            <Line dataKey="presupuesto" name="Presupuesto" stroke="var(--color-chart-4)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
