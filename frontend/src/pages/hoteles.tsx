import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHoteles, type HotelDirectorio } from "@/lib/hoteles-api";

export default function HotelesIndex() {
  const [hoteles, setHoteles] = useState<HotelDirectorio[] | null>(null);
  const [origenDatos, setOrigenDatos] = useState<"odoo" | "cache" | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetchHoteles()
      .then((r) => {
        setHoteles(r.hoteles);
        setOrigenDatos(r.origenDatos);
      })
      .catch((e) => setError(e.message));
  }, []);

  const rows = useMemo(() => {
    if (!hoteles) return [];
    if (!q) return hoteles;
    const s = q.toLowerCase();
    return hoteles.filter(
      (h) => h.name.toLowerCase().includes(s) || h.zona.toLowerCase().includes(s) || h.sociedad.toLowerCase().includes(s)
    );
  }, [hoteles, q]);

  return (
    <DashboardShell title="Hoteles" subtitle="Directorio de hoteles de la cadena" origenDatos={origenDatos}>
      <div className="p-6 max-w-[1200px] mx-auto space-y-4">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}

        <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
          <header className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Todos los hoteles</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {hoteles ? `${rows.length} de ${hoteles.length} hoteles` : "Cargando…"}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 h-8 rounded-md border border-border bg-surface px-2.5 text-xs w-64">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Buscar hotel, zona, sociedad…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="bg-transparent outline-none flex-1"
              />
            </div>
          </header>

          {hoteles ? (
            <div className="divide-y divide-border">
              {rows.map((h, i) => (
                <Link
                  key={h.id}
                  to={`/hoteles/${h.id}`}
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-accent/30 transition-colors animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-backwards"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{h.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{h.zona} · {h.sociedad}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
