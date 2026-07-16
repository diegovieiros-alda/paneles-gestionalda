import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/dashboard/shell";
import { hotels, hotelOportunidad, suggestAction, fmtEuro, fmtNum, fmtPct, aggregate } from "@/lib/mock-data";
import { Sparkles, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OportunidadesPage() {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    return hotels
      .map((h) => ({ h, o: hotelOportunidad(h), accion: suggestAction(h) }))
      .filter((r) => !q || r.h.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.o.valor - a.o.valor);
  }, [q]);

  const total = rows.reduce((a, r) => a + r.o.valor, 0);
  const a = aggregate();

  return (
    <DashboardShell title="Oportunidades" subtitle="Facturación potencial no capturada · ordenado por impacto">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <section className="rounded-xl border border-border bg-gradient-to-br from-primary/8 via-surface to-surface p-6 shadow-soft">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                <Sparkles className="h-3.5 w-3.5" /> Total detectado
              </div>
              <div className="mt-3 text-4xl font-semibold num text-foreground tracking-tight">{fmtEuro(total)}</div>
              <p className="mt-2 text-sm text-muted-foreground max-w-lg">
                Si {rows.length} hoteles alcanzasen una penetración del 85%, capturaríamos esta facturación adicional.
              </p>
            </div>
            <div className="rounded-lg bg-surface border border-border p-4">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Objetivo penetración</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold num text-foreground">85%</span>
                <span className="text-xs text-muted-foreground">actual {fmtPct(a.penetracion)}</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-border overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (a.penetracion / 0.85) * 100)}%` }} />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
          <header className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Ranking de oportunidades</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{rows.length} hoteles · ordenados por € potenciales</p>
            </div>
            <div className="ml-auto flex items-center gap-2 h-8 rounded-md border border-border bg-surface px-2.5 text-xs w-56">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input placeholder="Buscar hotel…" value={q} onChange={(e) => setQ(e.target.value)} className="bg-transparent outline-none flex-1" />
            </div>
          </header>
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/60">
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Hotel</th>
                <th className="px-4 py-3 text-right font-medium">Alojados</th>
                <th className="px-4 py-3 text-right font-medium">Desayunos</th>
                <th className="px-4 py-3 text-right font-medium">Penetración</th>
                <th className="px-4 py-3 text-right font-medium">Oportunidades</th>
                <th className="px-4 py-3 text-right font-medium">€ potenciales</th>
                <th className="px-4 py-3 text-left font-medium">Acción sugerida</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 40).map(({ h, o, accion }, i) => (
                <tr key={h.id} className="border-t border-border hover:bg-accent/30 transition-colors group">
                  <td className="px-4 py-3">
                    <Link to={`/hoteles/${h.id}`} className="font-medium text-foreground hover:text-primary">
                      <span className="inline-block w-6 text-muted-foreground num">{i + 1}</span>
                      {h.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right num text-muted-foreground">{fmtNum(h.alojados)}</td>
                  <td className="px-4 py-3 text-right num text-muted-foreground">{fmtNum(h.desayunos)}</td>
                  <td className="px-4 py-3 text-right num">
                    <span className={cn(h.penetracion < 0.4 ? "text-danger" : "text-foreground/80")}>{fmtPct(h.penetracion)}</span>
                  </td>
                  <td className="px-4 py-3 text-right num text-foreground/80">{fmtNum(o.potenciales)}</td>
                  <td className="px-4 py-3 text-right num font-semibold text-primary">{fmtEuro(o.valor)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{accion}</td>
                  <td className="pr-3">
                    <Link to={`/hoteles/${h.id}`} className="text-muted-foreground hover:text-primary inline-flex">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </DashboardShell>
  );
}
