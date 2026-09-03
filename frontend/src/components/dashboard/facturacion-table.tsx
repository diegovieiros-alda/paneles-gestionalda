import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, ChevronRight, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtEuro, fmtNum, fmtPct } from "@/lib/mock-data";
import { exportarCsv } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { hrefHotelDesayunos, type HotelReal } from "@/lib/hoteles-api";

type Key = "name" | "desayunosFacturados" | "produccionFacturada" | "porcentajeFacturado";

// Desglose de Producción (PMS) según la línea de folio tenga ya una factura
// posted vinculada o no — ver hoteles-api.ts::FacturacionFields. Tabla
// dedicada, separada de la de Producción: son la misma fuente pero dos
// preguntas distintas ("cuánto se vendió" vs. "cuánto de eso ya está
// facturado"). Facturado/sin facturar comparten celda (unidades y €, cada
// par en dos líneas) en vez de una columna por número — mismo criterio que
// las otras tablas, para no forzar scroll horizontal por 4 columnas que en
// la práctica siempre se leen juntas de dos en dos.
const cols: Array<{ key: Key; label: string; render: (h: HotelReal) => React.ReactNode; sticky?: boolean }> = [
  {
    key: "name",
    label: "Hotel",
    sticky: true,
    render: (h) => (
      <div className="flex flex-col">
        <span>{h.codigo ? `${h.codigo} - ${h.name}` : h.name}</span>
        <span className="text-xs font-normal text-muted-foreground">{h.zona} · {h.submarca}</span>
      </div>
    ),
  },
  {
    key: "desayunosFacturados",
    label: "Desayunos (fact. / sin fact.)",
    render: (h) => (
      <div className="flex flex-col gap-0.5 leading-tight items-end">
        <span className="text-foreground/90">{fmtNum(h.desayunosFacturados)}</span>
        <span className="text-xs text-muted-foreground">{fmtNum(h.desayunosSinFacturar)} sin fact.</span>
      </div>
    ),
  },
  {
    key: "produccionFacturada",
    label: "Producción (fact. / sin fact.)",
    render: (h) => (
      <div className="flex flex-col gap-0.5 leading-tight items-end">
        <span className="text-foreground/90">{fmtEuro(h.produccionFacturada)}</span>
        <span className="text-xs text-muted-foreground">{fmtEuro(h.produccionSinFacturar)} sin fact.</span>
      </div>
    ),
  },
  { key: "porcentajeFacturado", label: "% Facturado", render: (h) => fmtPct(h.porcentajeFacturado, 0) },
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

export function FacturacionTable({
  hoteles, desde, hasta, tipos,
}: { hoteles: HotelReal[]; desde: string; hasta: string; tipos: string[] }) {
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "produccionFacturada", dir: "desc" });
  const [q, setQ] = useState("");

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
              aria-label="Buscar hotel"
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
                    "text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-5 py-3.5 cursor-pointer select-none whitespace-nowrap",
                    c.sticky ? "text-left sticky left-0 bg-surface-muted/95 z-10" : "text-right"
                  )}
                >
                  <span className={cn("inline-flex items-center gap-1", !c.sticky && "flex-row-reverse")}>
                    {c.label}
                    <ArrowUpDown className={cn("h-3 w-3 opacity-40", sort.key === c.key && "opacity-100 text-primary")} />
                  </span>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id} className="border-t border-border hover:bg-accent/30 transition-colors group">
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-5 py-3.5 whitespace-nowrap num",
                      c.sticky
                        ? "text-left sticky left-0 bg-surface group-hover:bg-accent/30 font-medium text-foreground"
                        : "text-right text-foreground/90"
                    )}
                  >
                    {c.sticky ? (
                      <Link to={hrefHotelDesayunos(h.id, desde, hasta, tipos)} className="hover:text-primary">
                        {c.render(h)}
                      </Link>
                    ) : c.render(h)}
                  </td>
                ))}
                <td className="pr-4">
                  <Link to={hrefHotelDesayunos(h.id, desde, hasta, tipos)} className="text-muted-foreground hover:text-primary inline-flex">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
