import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, ChevronRight, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtEuro, fmtNum, fmtPct } from "@/lib/mock-data";
import { exportarCsv } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import type { HotelReal } from "@/lib/hoteles-api";

type Key = "name" | "desayunosFacturados" | "desayunosSinFacturar" | "produccionFacturada" | "produccionSinFacturar" | "porcentajeFacturado";

// Desglose de Producción (PMS) según la línea de folio tenga ya una factura
// posted vinculada o no — ver hoteles-api.ts::FacturacionFields. Tabla
// dedicada, separada de la de Producción: son la misma fuente pero dos
// preguntas distintas ("cuánto se vendió" vs. "cuánto de eso ya está
// facturado").
const cols: Array<{ key: Key; label: string; align?: "right"; render: (h: HotelReal) => string; sticky?: boolean }> = [
  { key: "name", label: "Hotel", render: (h) => h.name, sticky: true },
  { key: "desayunosFacturados", label: "Desayunos facturados", align: "right", render: (h) => fmtNum(h.desayunosFacturados) },
  { key: "desayunosSinFacturar", label: "Sin facturar", align: "right", render: (h) => fmtNum(h.desayunosSinFacturar) },
  { key: "produccionFacturada", label: "Producción facturada", align: "right", render: (h) => fmtEuro(h.produccionFacturada) },
  { key: "produccionSinFacturar", label: "Sin facturar", align: "right", render: (h) => fmtEuro(h.produccionSinFacturar) },
  { key: "porcentajeFacturado", label: "% Facturado", align: "right", render: (h) => fmtPct(h.porcentajeFacturado, 0) },
];

function exportar(hoteles: HotelReal[]) {
  exportarCsv(
    `desayunos-facturados-${new Date().toISOString().slice(0, 10)}`,
    ["Hotel", "Desayunos facturados", "Desayunos sin facturar", "Producción facturada", "Producción sin facturar", "% Facturado"],
    hoteles.map((h) => [
      h.name, h.desayunosFacturados, h.desayunosSinFacturar,
      h.produccionFacturada.toFixed(2), h.produccionSinFacturar.toFixed(2), (h.porcentajeFacturado * 100).toFixed(1),
    ])
  );
}

export function FacturacionTable({ hoteles }: { hoteles: HotelReal[] }) {
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "produccionFacturada", dir: "desc" });
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(15);

  const rows = useMemo(() => {
    const filtered = hoteles.filter((h) => !q || h.name.toLowerCase().includes(q.toLowerCase()));
    return filtered.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === "string") return sort.dir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sort.dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [hoteles, sort, q]);

  return (
    <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Desayunos facturados</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Qué parte de la producción ya tiene factura, por hotel</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 h-8 rounded-md border border-border bg-surface px-2.5 text-xs w-56">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Buscar hotel…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-transparent outline-none flex-1"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => exportar(rows)}>
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
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-4 py-3 whitespace-nowrap num",
                      c.align === "right" ? "text-right" : "text-left",
                      c.sticky
                        ? "sticky left-0 bg-surface group-hover:bg-accent/30 font-medium text-foreground"
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
          <button onClick={() => setLimit((l) => l + 25)} className="text-xs text-muted-foreground hover:text-foreground">
            Mostrar más ({rows.length - limit} restantes)
          </button>
        </div>
      )}
    </section>
  );
}
