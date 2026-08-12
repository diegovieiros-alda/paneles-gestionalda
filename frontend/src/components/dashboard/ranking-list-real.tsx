import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import { fmtEuro, fmtPct } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { HotelReal } from "@/lib/hoteles-api";

const modes = [
  { key: "produccion", label: "Producción", fmt: fmtEuro },
  { key: "penetracion", label: "Penetración", fmt: (n: number) => fmtPct(n) },
  { key: "precioMedio", label: "Precio medio", fmt: (n: number) => `${n.toFixed(2)}€` },
] as const;

export function RankingListReal({ hoteles }: { hoteles: HotelReal[] }) {
  const [mode, setMode] = useState<(typeof modes)[number]["key"]>("produccion");
  const active = modes.find((m) => m.key === mode)!;

  const rows = useMemo(
    () => [...hoteles].sort((a, b) => b[mode] - a[mode]).slice(0, 8),
    [hoteles, mode]
  );
  const max = Math.max(1, ...rows.map((r) => r[mode]));

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" />
            Ranking de hoteles
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Top 8 por {active.label.toLowerCase()}</p>
        </div>
      </header>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs border transition-colors",
              mode === m.key
                ? "bg-primary/10 border-primary/20 text-primary font-medium"
                : "bg-surface border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <ol className="space-y-1.5">
        {rows.map((r, i) => {
          const val = r[mode];
          const w = max > 0 ? (val / max) * 100 : 0;
          return (
            <li key={r.id}>
              <Link to={`/hoteles/${r.id}`} className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/40 transition-colors">
                <div className="w-5 text-center text-[11px] font-semibold text-muted-foreground num">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground truncate">{r.name}</span>
                    <span className="text-sm font-medium num text-foreground">{active.fmt(val)}</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-border/60 overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${w}%` }} />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
