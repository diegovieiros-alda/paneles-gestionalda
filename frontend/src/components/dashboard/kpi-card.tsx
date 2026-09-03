import { type ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

export type KpiTone = "positive" | "neutral" | "warning" | "negative";

export function KpiCard({
  label, value, delta, deltaLabel, positivoEsBueno = true, tone = "neutral", trend, footer,
}: {
  label: string;
  value: ReactNode;
  delta?: number;
  deltaLabel?: string;
  /** Para métricas donde bajar es lo bueno (ej. un coste) — invierte qué
   * signo se pinta en verde. Ver el mismo patrón en SignedPct/SignedEuro. */
  positivoEsBueno?: boolean;
  tone?: KpiTone;
  trend?: number[];
  footer?: ReactNode;
}) {
  // "sube" gobierna la flecha y el signo +/- (lo que pasó de verdad);
  // "esFavorable" gobierna solo el color — para una métrica donde bajar es
  // lo bueno (costeMedioGasto, gastos), un delta positivo sigue mostrando
  // flecha arriba y "+", pero en rojo, no en verde.
  const sube = (delta ?? 0) >= 0;
  const esFavorable = positivoEsBueno ? sube : !sube;
  const toneRing = {
    positive: "before:bg-success",
    neutral: "before:bg-primary/60",
    warning: "before:bg-warning",
    negative: "before:bg-danger",
  }[tone];

  const data = (trend ?? []).map((v, i) => ({ i, v }));
  return (
    <div className={cn(
      "relative rounded-xl border border-border bg-surface p-5 shadow-soft",
      "before:absolute before:left-0 before:top-4 before:bottom-4 before:w-[3px] before:rounded-full",
      toneRing
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold num text-foreground">{value}</div>
          {typeof delta === "number" && (
            <div className={cn(
              "mt-1 inline-flex items-center gap-1 text-xs font-medium num",
              esFavorable ? "text-success" : "text-danger"
            )}>
              {sube ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {sube ? "+" : ""}{delta.toFixed(1)}%
              {deltaLabel && <span className="text-muted-foreground font-normal">· {deltaLabel}</span>}
            </div>
          )}
        </div>
        {data.length > 0 && (
          <div className="h-12 w-24 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
                <defs>
                  <linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone" dataKey="v"
                  stroke="var(--color-primary)"
                  strokeWidth={1.6}
                  fill={`url(#g-${label})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {footer && <div className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground">{footer}</div>}
    </div>
  );
}
