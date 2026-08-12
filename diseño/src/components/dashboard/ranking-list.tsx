import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { hotels, fmtEuro, fmtPct } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Trophy } from "lucide-react";

const modes = [
  { key: "produccion", label: "Producción", fmt: fmtEuro, dir: "desc" as const },
  { key: "penetracion", label: "Penetración", fmt: (n: number) => fmtPct(n), dir: "desc" as const },
  { key: "precioMedio", label: "Precio medio", fmt: (n: number) => `${n.toFixed(2)}€`, dir: "desc" as const },
  { key: "margen", label: "Margen", fmt: (n: number) => fmtPct(n), dir: "desc" as const },
  { key: "variacion", label: "Crecimiento", fmt: (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`, dir: "desc" as const },
  { key: "variacion_neg", label: "Caída", fmt: (n: number) => `${n.toFixed(1)}%`, dir: "asc" as const },
] as const;

export function RankingList() {
  const [mode, setMode] = useState<(typeof modes)[number]["key"]>("produccion");
  const active = modes.find((m) => m.key === mode)!;

  const rows = useMemo(() => {
    const key = mode === "variacion_neg" ? "variacion" : mode;
    const sorted = [...hotels].sort((a, b) => {
      const va = (a as any)[key];
      const vb = (b as any)[key];
      return active.dir === "desc" ? vb - va : va - vb;
    });
    return sorted.slice(0, 8);
  }, [mode, active.dir]);

  const max = Math.max(...rows.map((r) => Math.abs((r as any)[mode === "variacion_neg" ? "variacion" : mode])));

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
          const rawKey = mode === "variacion_neg" ? "variacion" : mode;
          const val = (r as any)[rawKey] as number;
          const w = max > 0 ? (Math.abs(val) / max) * 100 : 0;
          const positive = mode === "variacion_neg" ? val >= 0 : true;
          return (
            <li key={r.id}>
              <Link
                to="/hoteles/$hotelId"
                params={{ hotelId: r.id }}
                className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/40 transition-colors"
              >
                <div className="w-5 text-center text-[11px] font-semibold text-muted-foreground num">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground truncate">{r.name}</span>
                    <span className={cn("text-sm font-medium num", positive ? "text-foreground" : "text-danger")}>
                      {active.fmt(val)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-border/60 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", val >= 0 ? "bg-primary/70" : "bg-danger/70")}
                      style={{ width: `${w}%` }}
                    />
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
