import { Target } from "lucide-react";
import { fmtPct } from "@/lib/mock-data";
import { useAjustesDesayuno } from "@/lib/ajustes-desayuno-context";
import type { HotelReal } from "@/lib/hoteles-api";

export function ObjetivoPenetracionCard({ hoteles }: { hoteles: HotelReal[] }) {
  const { ajustes } = useAjustesDesayuno();
  const alojados = hoteles.reduce((a, h) => a + h.alojados, 0);
  const desayunosDirectos = hoteles.reduce((a, h) => a + h.alojados * h.penetracion, 0);
  const penetracion = alojados > 0 ? desayunosDirectos / alojados : 0;
  const gap = ajustes.objetivoPenetracion - penetracion;

  return (
    <section className="rounded-xl border border-border bg-surface px-5 py-4 shadow-soft flex flex-wrap items-center gap-6">
      <div className="flex items-center gap-3">
        <div className="grid place-items-center h-10 w-10 rounded-lg bg-primary/10 text-primary">
          <Target className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Objetivo penetración</div>
          <div className="text-lg font-semibold num text-foreground">{fmtPct(ajustes.objetivoPenetracion, 0)}</div>
        </div>
      </div>
      <div className="h-10 w-px bg-border" />
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Actual</div>
        <div className="text-lg font-semibold num text-foreground">{fmtPct(penetracion)}</div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Faltan</div>
        <div className={`text-lg font-semibold num ${gap > 0 ? "text-warning" : "text-success"}`}>
          {gap > 0 ? `${(gap * 100).toFixed(1)} pp` : "Objetivo cumplido"}
        </div>
      </div>
      <div className="flex-1 min-w-[200px]">
        <div className="h-2 rounded-full bg-border overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, (penetracion / ajustes.objetivoPenetracion) * 100)}%` }} />
        </div>
      </div>
    </section>
  );
}
