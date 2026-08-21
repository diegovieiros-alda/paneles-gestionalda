import { Link } from "react-router-dom";
import { ChevronRight, Sparkles, Target, TrendingUp } from "lucide-react";
import { fmtEuro, fmtNum, fmtPct, TARGET_OPORTUNIDAD } from "@/lib/mock-data";
import type { HotelReal } from "@/lib/hoteles-api";

export function OpportunityBlockReal({ hoteles }: { hoteles: HotelReal[] }) {
  const alojados = hoteles.reduce((a, h) => a + h.alojados, 0);
  const desayunos = hoteles.reduce((a, h) => a + h.desayunos, 0);
  const produccion = hoteles.reduce((a, h) => a + h.produccion, 0);
  const precio = desayunos > 0 ? produccion / desayunos : 0;
  const penetracion = alojados > 0 ? desayunos / alojados : 0;

  const potenciales = Math.max(0, Math.round(alojados * TARGET_OPORTUNIDAD - desayunos));
  const facturacionPotencial = Math.round(potenciales * precio);

  const topHoteles = hoteles
    .map((h) => {
      const pot = Math.max(0, Math.round(h.alojados * TARGET_OPORTUNIDAD - h.desayunos));
      return { h, potenciales: pot, valor: Math.round(pot * h.precioMedio) };
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

  return (
    <section className="relative rounded-xl border border-border overflow-hidden bg-gradient-to-br from-primary/8 via-surface to-surface p-6 shadow-soft">
      <div className="absolute inset-0 pointer-events-none opacity-40 [background:radial-gradient(circle_at_top_right,var(--color-primary)/0.08,transparent_60%)]" />
      <div className="relative grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            <Sparkles className="h-3.5 w-3.5" /> Oportunidad detectada
          </div>
          <h2 className="mt-3 text-xl font-semibold text-foreground">Facturación potencial no capturada</h2>

          <div className="mt-4 text-5xl font-semibold text-foreground num tracking-tight">{fmtEuro(facturacionPotencial)}</div>
          {produccion > 0 && (
            <div className="mt-2 inline-flex items-center gap-1 text-xs text-primary font-medium">
              <TrendingUp className="h-3.5 w-3.5" />
              +{((facturacionPotencial / produccion) * 100).toFixed(1)}% sobre producción actual
            </div>
          )}

          <p className="mt-4 text-sm text-muted-foreground max-w-lg">
            Si elevamos la penetración al <b className="text-foreground">{fmtPct(TARGET_OPORTUNIDAD, 0)}</b>, convertiríamos{" "}
            <b className="num text-foreground">{fmtNum(potenciales)}</b> alojados en desayunos.
          </p>

          <div className="mt-4 h-2 rounded-full bg-border overflow-hidden max-w-md">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, (penetracion / TARGET_OPORTUNIDAD) * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground max-w-md">
            <span>Actual {fmtPct(penetracion)}</span>
            <span>Objetivo {fmtPct(TARGET_OPORTUNIDAD, 0)}</span>
          </div>
        </div>

        <div className="rounded-xl bg-surface border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> ¿Dónde está la oportunidad?
            </div>
          </div>
          <ol className="space-y-1">
            {topHoteles.map(({ h, potenciales, valor }, i) => (
              <li key={h.id}>
                <Link
                  to={`/desayunos/${h.id}`}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/40 transition-colors"
                >
                  <div className="w-5 text-center text-[11px] font-semibold text-muted-foreground num">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground truncate">{h.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {fmtNum(potenciales)} desayunos · penetración {fmtPct(h.penetracion)}
                    </div>
                  </div>
                  <div className="text-sm font-semibold num text-primary">+{fmtEuro(valor)}</div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
