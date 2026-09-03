import { type ReactNode } from "react";
import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import type { KpiTone } from "@/components/dashboard/kpi-card";

// Medidor circular 360° para KPIs con un objetivo/presupuesto real que
// comparar — spec: "Añadir en cada recuadro un Gráfico de Medidor Circular
// de 360°... El dibujo actual sobra" (el dibujo de su maqueta era una
// mini-línea de tendencia decorativa sin dato de verdad detrás). Sin
// dependencia nueva: recharts (ya instalado) trae RadialBarChart.
//
// `target` es `null` cuando no hay objetivo con el que comparar para ese
// hotel/periodo (p.ej. sin presupuesto confirmado) — en ese caso el aro
// queda vacío y sin porcentaje, en vez de inventar un 0% o un 100% que no
// significan nada.
const TONE_COLOR: Record<KpiTone, string> = {
  positive: "var(--color-success)",
  neutral: "var(--color-primary)",
  warning: "var(--color-warning)",
  negative: "var(--color-danger)",
};

export function GaugeKpiCard({
  label, value, actual, target, targetLabel, tone = "neutral", footer,
}: {
  label: string;
  value: ReactNode;
  actual: number;
  target: number | null;
  targetLabel?: string;
  tone?: KpiTone;
  footer?: ReactNode;
}) {
  const ratio = target !== null && target > 0 ? actual / target : null;
  const color = TONE_COLOR[tone];

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <RadialBarChart
            width={64}
            height={64}
            innerRadius="72%"
            outerRadius="100%"
            barSize={6}
            data={[{ v: ratio !== null ? Math.min(ratio, 1) * 100 : 0 }]}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar dataKey="v" background={{ fill: "var(--color-border)" }} cornerRadius={999} fill={color} isAnimationActive={false} />
          </RadialBarChart>
          {ratio !== null && (
            <div className="absolute inset-0 grid place-items-center text-[11px] font-semibold num" style={{ color }}>
              {Math.round(ratio * 100)}%
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 text-xl font-semibold num text-foreground truncate">{value}</div>
          {targetLabel && <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{targetLabel}</div>}
        </div>
      </div>
      {footer && <div className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground">{footer}</div>}
    </div>
  );
}
