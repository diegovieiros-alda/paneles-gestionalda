import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, ChevronRight, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { facturacionPotencial, fmtEuro, fmtNum, fmtPct } from "@/lib/mock-data";
import { useAjustesDesayuno } from "@/lib/ajustes-desayuno-context";
import { exportarCsv } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import type { HotelReal } from "@/lib/hoteles-api";

type Key = "name" | "zona" | "sociedad" | "alojados" | "desayunos" | "penetracion" | "produccion" | "precioMedio" | "oportunidad";

// Misma base que la columna "Penetración" (directa, sin colaborador — ver
// backend/core/hoteles/service.py): calcular el hueco sobre "desayunos"
// (incluye colaborador) mezclaría dos cifras con numerador distinto y daría
// una oportunidad artificialmente baja en hoteles con fuerte venta a
// colaborador, aunque su penetración directa sea crítica.
function oportunidad(h: HotelReal, objetivoOportunidad: number) {
  return facturacionPotencial(h.alojados, h.penetracion, h.precioMedioVenta, objetivoOportunidad);
}

function buildCols(objetivoOportunidad: number): Array<{ key: Key; label: string; align?: "center"; render: (h: HotelReal) => string; sticky?: boolean }> {
  return [
    { key: "name", label: "Hotel", render: (h) => h.name, sticky: true },
    { key: "zona", label: "Zona", render: (h) => h.zona },
    { key: "sociedad", label: "Sociedad", render: (h) => h.sociedad },
    { key: "alojados", label: "Alojados", align: "center", render: (h) => fmtNum(h.alojados) },
    { key: "desayunos", label: "Desayunos", align: "center", render: (h) => fmtNum(h.desayunos) },
    { key: "penetracion", label: "Penetración", align: "center", render: (h) => fmtPct(h.penetracion) },
    { key: "produccion", label: "Producción", align: "center", render: (h) => fmtEuro(h.produccion) },
    { key: "precioMedio", label: "Precio med.", align: "center", render: (h) => `${h.precioMedio.toFixed(2)}€` },
    { key: "oportunidad", label: "Oportunidad", align: "center", render: (h) => fmtEuro(oportunidad(h, objetivoOportunidad)) },
  ];
}

function exportar(hoteles: HotelReal[], objetivoOportunidad: number) {
  exportarCsv(
    `desayunos-hoteles-${new Date().toISOString().slice(0, 10)}`,
    ["Hotel", "Zona", "Sociedad", "Alojados", "Desayunos", "Penetración %", "Producción", "Precio medio", "Oportunidad"],
    hoteles.map((h) => [
      h.name, h.zona, h.sociedad, h.alojados, h.desayunos,
      (h.penetracion * 100).toFixed(1), h.produccion.toFixed(2), h.precioMedio.toFixed(2), oportunidad(h, objetivoOportunidad).toFixed(2),
    ])
  );
}

export function HotelsTableReal({ hoteles }: { hoteles: HotelReal[] }) {
  const { ajustes } = useAjustesDesayuno();
  const cols = useMemo(() => buildCols(ajustes.objetivoOportunidad), [ajustes.objetivoOportunidad]);
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "produccion", dir: "desc" });
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(15);

  const rows = useMemo(() => {
    const filtered = hoteles.filter((h) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return h.name.toLowerCase().includes(s) || h.zona.toLowerCase().includes(s) || h.sociedad.toLowerCase().includes(s);
    });
    return filtered.sort((a, b) => {
      const get = (h: HotelReal) => (sort.key === "oportunidad" ? oportunidad(h, ajustes.objetivoOportunidad) : h[sort.key]);
      const av = get(a);
      const bv = get(b);
      if (typeof av === "string") return sort.dir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sort.dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [hoteles, sort, q, ajustes.objetivoOportunidad]);

  return (
    <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Todos los hoteles</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{rows.length} de {hoteles.length} hoteles</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 h-8 rounded-md border border-border bg-surface px-2.5 text-xs w-56">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Buscar hotel, zona, sociedad…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-transparent outline-none flex-1"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => exportar(rows, ajustes.objetivoOportunidad)}>
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
                    c.align === "center" ? "text-center" : "text-left",
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
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-4 py-3 whitespace-nowrap num",
                      c.align === "center" ? "text-center" : "text-left",
                      c.sticky
                        ? "sticky left-0 bg-surface group-hover:bg-accent/30 font-medium text-foreground"
                        : c.key === "zona" || c.key === "sociedad"
                          ? "text-muted-foreground"
                          : "text-foreground/90"
                    )}
                  >
                    {c.sticky ? (
                      <Link to={`/desayunos/${h.id}`} className="hover:text-primary">
                        {c.render(h)}
                      </Link>
                    ) : c.render(h)}
                  </td>
                ))}
                <td className="pr-3">
                  <Link to={`/desayunos/${h.id}`} className="text-muted-foreground hover:text-primary inline-flex">
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
          <button
            onClick={() => setLimit((l) => l + 25)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Mostrar más ({rows.length - limit} restantes)
          </button>
        </div>
      )}
    </section>
  );
}
