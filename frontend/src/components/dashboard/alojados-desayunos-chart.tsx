import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { fmtRangoSerieMensual } from "@/lib/date-range";
import { fmtNum } from "@/lib/mock-data";
import type { FnbFields, MesHotel } from "@/lib/hoteles-api";

// Presupuesto en unidades (alojadosPrevistos/desayunosPrevistos) solo existe
// cuando el Excel de Finanzas tiene datos ese mes (Odoo no presupuesta en
// unidades, solo en €) — connectNulls salta los meses sin dato en vez de
// cortar la línea, para no dar la falsa impresión de que el presupuesto se
// interrumpe.
export function AlojadosDesayunosChart({ serie }: { serie: (MesHotel & FnbFields)[] }) {
  const data = serie.map((s) => ({
    mes: new Date(s.mes).toLocaleDateString("es-ES", { month: "short" }),
    alojados: s.alojados,
    alojadosPrevistos: s.alojadosPrevistos,
    desayunos: s.desayunos,
    desayunosPrevistos: s.desayunosPrevistos,
  }));

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Evolución · Alojados vs desayunos vendidos</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{fmtRangoSerieMensual(serie)} · unidades, actual vs presupuesto (Excel)</p>
      </header>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false} tickLine={false}
              tickFormatter={fmtNum}
              width={50}
            />
            <Tooltip
              contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12 }}
              formatter={(v: number, name: string) => [fmtNum(v), name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="alojados" name="Alojados" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
            <Line dataKey="alojadosPrevistos" name="Alojados (presupuesto)" stroke="var(--color-primary)" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
            <Line dataKey="desayunos" name="Desayunos" stroke="var(--color-success)" strokeWidth={2} dot={false} />
            <Line dataKey="desayunosPrevistos" name="Desayunos (presupuesto)" stroke="var(--color-success)" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
