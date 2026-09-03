import { AlertTriangle, ChevronRight, Percent } from "lucide-react";
import { Link } from "react-router-dom";
import { fmtPct } from "@/lib/mock-data";
import { useAjustesDesayuno } from "@/lib/ajustes-desayuno-context";
import { hrefHotelDesayunos, type HotelReal } from "@/lib/hoteles-api";

export function AlertsBlockReal({
  hoteles, desde, hasta, tipos,
}: { hoteles: HotelReal[]; desde: string; hasta: string; tipos: string[] }) {
  const { ajustes } = useAjustesDesayuno();
  const alerts = hoteles
    .filter((h) => h.alojados > 0 && h.penetracion < ajustes.umbralPenetracion)
    .sort((a, b) => a.penetracion - b.penetracion)
    .slice(0, 8);

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Hoteles que necesitan atención
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Penetración de desayuno baja · {alerts.length} alertas activas</p>
        </div>
      </header>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Sin alertas en el periodo actual.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {alerts.map((h) => (
            <Link
              key={h.id}
              to={hrefHotelDesayunos(h.id, desde, hasta, tipos)}
              className="group flex items-center gap-3 rounded-lg border border-border bg-surface-muted/40 hover:bg-accent/50 transition-colors p-3"
            >
              <div className="grid place-items-center h-9 w-9 rounded-md bg-surface border border-border">
                <Percent className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  <div className="text-sm font-medium text-foreground truncate">{h.name}</div>
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {h.zona} · Penetración baja ·{" "}
                  <span className="text-foreground/70 num">
                    {fmtPct(h.penetracion)} · objetivo {fmtPct(ajustes.objetivoPenetracion, 0)}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
