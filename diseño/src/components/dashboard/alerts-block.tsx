import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, TrendingDown, Euro, Percent, Activity, ChevronRight } from "lucide-react";
import { hotels, fmtPct, fmtEuro } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type Alert = {
  hotelId: string;
  hotel: string;
  zona: string;
  kind: "penetracion" | "precio" | "caida" | "coste" | "tendencia";
  severity: 1 | 2 | 3;
  title: string;
  detail: string;
};

const meta = {
  penetracion: { icon: Percent, tone: "warning" as const, label: "Penetración baja" },
  precio: { icon: Euro, tone: "warning" as const, label: "Precio bajo objetivo" },
  caida: { icon: TrendingDown, tone: "danger" as const, label: "Caída vs LY" },
  coste: { icon: Activity, tone: "warning" as const, label: "Coste elevado" },
  tendencia: { icon: TrendingDown, tone: "danger" as const, label: "Tendencia negativa" },
};

function buildAlerts(): Alert[] {
  const out: Alert[] = [];
  for (const h of hotels) {
    if (h.penetracion < 0.38)
      out.push({ hotelId: h.id, hotel: h.name, zona: h.zone, kind: "penetracion", severity: 3,
        title: meta.penetracion.label, detail: `${fmtPct(h.penetracion)} · objetivo 55%` });
    if (h.precioMedio < 10)
      out.push({ hotelId: h.id, hotel: h.name, zona: h.zone, kind: "precio", severity: 2,
        title: meta.precio.label, detail: `${h.precioMedio.toFixed(2)}€ · obj. 12€` });
    if (h.variacion < -10)
      out.push({ hotelId: h.id, hotel: h.name, zona: h.zone, kind: "caida", severity: 3,
        title: meta.caida.label, detail: `${h.variacion.toFixed(1)}% vs LY` });
    if (h.margen < 0.48)
      out.push({ hotelId: h.id, hotel: h.name, zona: h.zone, kind: "coste", severity: 2,
        title: meta.coste.label, detail: `Margen ${fmtPct(h.margen)}` });
  }
  return out.sort((a, b) => b.severity - a.severity).slice(0, 8);
}

export function AlertsBlock() {
  const alerts = useMemo(buildAlerts, []);
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Hoteles que necesitan atención
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Ordenados por prioridad · {alerts.length} alertas activas</p>
        </div>
        <Link to="/" className="text-xs text-primary hover:underline">Ver todas</Link>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {alerts.map((a, i) => {
          const M = meta[a.kind];
          const Icon = M.icon;
          const dotColor = M.tone === "danger" ? "bg-danger" : "bg-warning";
          return (
            <Link
              key={i}
              to="/hoteles/$hotelId"
              params={{ hotelId: a.hotelId }}
              className="group flex items-center gap-3 rounded-lg border border-border bg-surface-muted/40 hover:bg-accent/50 transition-colors p-3"
            >
              <div className={cn("grid place-items-center h-9 w-9 rounded-md bg-surface border border-border")}>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
                  <div className="text-sm font-medium text-foreground truncate">{a.hotel}</div>
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {a.zona} · {a.title} · <span className="text-foreground/70 num">{a.detail}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
