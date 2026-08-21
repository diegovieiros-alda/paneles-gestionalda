import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { SerieMensual } from "@/lib/hoteles-api";

export function PrecioCosteChart({ serie }: { serie: SerieMensual[] }) {
  const data = serie.map((s) => ({
    mes: new Date(s.mes).toLocaleDateString("es-ES", { month: "short" }),
    precioMedioVenta: s.precioMedioVenta,
    costeMedioGasto: s.costeMedioGasto,
  }));

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Evolución · Precio medio venta vs coste medio</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Últimos 12 meses · fuente contable, por unidad</p>
      </header>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => `${v.toFixed(1)}€`}
              width={50}
            />
            <Tooltip
              contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12 }}
              formatter={(v: number, name: string) => [`${v.toFixed(2)}€`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="precioMedioVenta" name="Precio medio venta" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
            <Line dataKey="costeMedioGasto" name="Coste medio" stroke="var(--color-danger)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
