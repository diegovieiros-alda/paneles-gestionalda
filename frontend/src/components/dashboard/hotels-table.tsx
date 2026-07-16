import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { hotels, hotelOportunidad, fmtEuro, fmtNum, fmtPct } from "@/lib/mock-data";
import { ArrowUpDown, Search, Download, Filter, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Key =
  | "name" | "zone" | "regional" | "sociedad" | "submarca"
  | "alojados" | "desayunos" | "penetracion" | "produccion"
  | "precioMedio" | "coste" | "margen" | "ly" | "presupuesto" | "variacion" | "oportunidad";

const cols: Array<{ key: Key; label: string; align?: "right"; render: (h: any) => string; sticky?: boolean }> = [
  { key: "name", label: "Hotel", render: (h) => h.name, sticky: true },
  { key: "zone", label: "Zona", render: (h) => h.zone },
  { key: "regional", label: "Regional", render: (h) => h.regional },
  { key: "sociedad", label: "Sociedad", render: (h) => h.sociedad },
  { key: "submarca", label: "Submarca", render: (h) => h.submarca },
  { key: "alojados", label: "Alojados", align: "right", render: (h) => fmtNum(h.alojados) },
  { key: "desayunos", label: "Desayunos", align: "right", render: (h) => fmtNum(h.desayunos) },
  { key: "penetracion", label: "Penetración", align: "right", render: (h) => fmtPct(h.penetracion) },
  { key: "produccion", label: "Producción", align: "right", render: (h) => fmtEuro(h.produccion) },
  { key: "precioMedio", label: "Precio med.", align: "right", render: (h) => `${h.precioMedio.toFixed(2)}€` },
  { key: "coste", label: "Coste", align: "right", render: (h) => `${h.coste.toFixed(2)}€` },
  { key: "margen", label: "Margen", align: "right", render: (h) => fmtPct(h.margen) },
  { key: "ly", label: "LY", align: "right", render: (h) => fmtEuro(h.ly) },
  { key: "presupuesto", label: "Presup.", align: "right", render: (h) => fmtEuro(h.presupuesto) },
  { key: "variacion", label: "Var.", align: "right", render: (h) => `${h.variacion >= 0 ? "+" : ""}${h.variacion.toFixed(1)}%` },
  { key: "oportunidad", label: "Oportunidad", align: "right", render: (h) => fmtEuro(hotelOportunidad(h).valor) },
];

export function HotelsTable() {
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "produccion", dir: "desc" });
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(15);

  const rows = useMemo(() => {
    const filtered = hotels.filter((h) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return h.name.toLowerCase().includes(s) || h.zone.toLowerCase().includes(s) || h.ciudad.toLowerCase().includes(s);
    });
    return filtered.sort((a, b) => {
      const get = (h: any) => sort.key === "oportunidad" ? hotelOportunidad(h).valor : h[sort.key];
      const av = get(a);
      const bv = get(b);
      if (typeof av === "string") return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sort.dir === "asc" ? av - bv : bv - av;
    });
  }, [sort, q]);

  return (
    <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Todos los hoteles</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{rows.length} de {hotels.length} hoteles</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 h-8 rounded-md border border-border bg-surface px-2.5 text-xs w-56">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Buscar hotel, zona, ciudad…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-transparent outline-none flex-1"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Filter className="h-3.5 w-3.5" /> Filtrar
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted/60">
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}
                  className={cn(
                    "text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-4 py-3 cursor-pointer select-none whitespace-nowrap",
                    c.align === "right" ? "text-right" : "text-left",
                    c.sticky && "sticky left-0 bg-surface-muted/95 z-10"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    <ArrowUpDown className={cn("h-3 w-3 opacity-40", sort.key === c.key && "opacity-100 text-primary")} />
                  </span>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((h) => (
              <tr key={h.id} className="border-t border-border hover:bg-accent/30 transition-colors group">
                {cols.map((c) => {
                  const isVar = c.key === "variacion";
                  const varColor = isVar ? (h.variacion >= 0 ? "text-success" : "text-danger") : "";
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        "px-4 py-3 whitespace-nowrap num",
                        c.align === "right" ? "text-right" : "text-left",
                        c.sticky && "sticky left-0 bg-surface group-hover:bg-accent/30 font-medium text-foreground",
                        !c.sticky && c.key !== "zone" && c.key !== "regional" && c.key !== "sociedad" && c.key !== "submarca"
                          ? "text-foreground/90"
                          : "text-muted-foreground",
                        varColor
                      )}
                    >
                      {c.sticky ? (
                        <Link to={`/hoteles/${h.id}`} className="hover:text-primary">
                          {c.render(h)}
                        </Link>
                      ) : c.render(h)}
                    </td>
                  );
                })}
                <td className="pr-3">
                  <Link to={`/hoteles/${h.id}`} className="text-muted-foreground hover:text-primary inline-flex">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {limit < rows.length && (
        <div className="p-3 border-t border-border text-center">
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setLimit((l) => l + 25)}>
            Mostrar más ({rows.length - limit} restantes)
          </Button>
        </div>
      )}
    </section>
  );
}
