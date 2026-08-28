import { Link } from "react-router-dom";
import { ArrowRight, Coffee, LayoutList, Target, TrendingUp, Bell, Settings, type LucideIcon } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { cn } from "@/lib/utils";

type Destino = {
  to: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  items: string[];
  accent: "primary" | "neutral";
};

const DESTINOS: Destino[] = [
  {
    to: "/desayunos/detalle",
    icon: LayoutList,
    title: "Detalle completo",
    desc: "El desglose operativo y financiero, hotel por hotel.",
    items: [
      "Producción y penetración (PMS)",
      "Ingresos, gastos y margen (F&B contable)",
      "Turnos y metodología",
    ],
    accent: "primary",
  },
  {
    to: "/desayunos/oportunidades",
    icon: Target,
    title: "Oportunidades",
    desc: "Qué hoteles priorizar ahora mismo, con enlace directo a cada uno.",
    items: [
      "Objetivo de penetración y cuánto falta",
      "Ranking y facturación potencial no capturada",
    ],
    accent: "neutral",
  },
  {
    to: "/desayunos/tendencias",
    icon: TrendingUp,
    title: "Tendencias",
    desc: "Evolución mensual de producción, ingresos, gastos y precio/coste.",
    items: ["Series mensuales por hotel y globales"],
    accent: "neutral",
  },
  {
    to: "/desayunos/alertas",
    icon: Bell,
    title: "Alertas",
    desc: "Hoteles con penetración por debajo del umbral configurado.",
    items: ["Umbral editable desde Ajustes"],
    accent: "neutral",
  },
  {
    to: "/desayunos/ajustes",
    icon: Settings,
    title: "Ajustes",
    desc: "Objetivos y umbrales usados en Oportunidades y Alertas.",
    items: ["Editable, se aplica a todo el dashboard"],
    accent: "neutral",
  },
];

export default function DesayunosPage() {
  return (
    <DashboardShell title="Desayunos" subtitle="Producción, penetración y financiero F&B de desayuno · datos reales de Odoo">
      <div className="p-6 max-w-[1000px] mx-auto space-y-8">
        <section className="flex gap-4">
          <div className="grid place-items-center h-11 w-11 rounded-xl bg-primary/10 text-primary shrink-0">
            <Coffee className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Qué es este panel</h2>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed max-w-2xl">
              Reúne los datos reales de desayuno de todos los hoteles: lo vendido en recepción/folio (PMS) y lo ya
              facturado en contabilidad — en vivo desde Odoo. Elige por dónde entrar:
            </p>
          </div>
        </section>

        <div className="grid gap-5 sm:grid-cols-2">
          {DESTINOS.map((d) => {
            const Icon = d.icon;
            const primary = d.accent === "primary";
            return (
              <Link
                key={d.to}
                to={d.to}
                className={cn(
                  "group relative flex flex-col rounded-2xl border p-6 shadow-soft transition-all duration-200",
                  "hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  primary
                    ? "border-primary/20 bg-gradient-to-br from-primary/[0.07] via-surface to-surface hover:border-primary/40"
                    : "border-border bg-surface hover:border-foreground/25"
                )}
              >
                <div
                  className={cn(
                    "grid place-items-center h-10 w-10 rounded-lg mb-4",
                    primary ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{d.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d.desc}</p>
                <ul className="mt-4 space-y-1.5">
                  {d.items.map((it) => (
                    <li key={it} className="text-xs text-muted-foreground/90 flex gap-2">
                      <span className={cn("mt-0.5", primary ? "text-primary/70" : "text-foreground/40")}>•</span>
                      {it}
                    </li>
                  ))}
                </ul>
                <div className={cn("mt-5 inline-flex items-center gap-1 text-sm font-medium", primary ? "text-primary" : "text-foreground")}>
                  Entrar
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
