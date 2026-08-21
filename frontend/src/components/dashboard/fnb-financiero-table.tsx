import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { etiqueta, facturacionPotencial, fmtEuro, fmtPct, UMBRAL_PENETRACION, TARGET_PENETRACION } from "@/lib/mock-data";
import type { HotelReal } from "@/lib/hoteles-api";

type Key = "name" | "ingresos" | "gastos" | "margenBruto" | "precioMedioVenta" | "costeMedioGasto" | "resultadoFB" | "potencial";

function potencial(h: HotelReal) {
  return facturacionPotencial(h.desayunos, h.penetracion, h.precioMedioVenta);
}

const ETIQUETA_CLASS = {
  verde: "bg-success/15 text-success",
  naranja: "bg-warning/15 text-warning",
  rojo: "bg-danger/15 text-danger",
};

const ETIQUETA_LABEL = {
  verde: "En objetivo",
  naranja: "Requiere seguimiento",
  rojo: "Requiere atención",
};

const cols: Array<{ key: Key; label: string; render: (h: HotelReal) => string }> = [
  { key: "name", label: "Hotel", render: (h) => h.name },
  { key: "ingresos", label: "Ingresos", render: (h) => fmtEuro(h.ingresos) },
  { key: "gastos", label: "Gastos", render: (h) => fmtEuro(h.gastos) },
  { key: "margenBruto", label: "Margen bruto", render: (h) => fmtPct(h.margenBruto, 0) },
  { key: "precioMedioVenta", label: "Precio medio venta", render: (h) => `${h.precioMedioVenta.toFixed(2)}€` },
  { key: "costeMedioGasto", label: "Coste medio", render: (h) => `${h.costeMedioGasto.toFixed(2)}€` },
  { key: "resultadoFB", label: "Resultado F&B", render: (h) => fmtEuro(h.resultadoFB) },
  { key: "potencial", label: "Facturación potencial", render: (h) => fmtEuro(potencial(h)) },
];

export function FnbFinancieroTable({ hoteles }: { hoteles: HotelReal[] }) {
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "ingresos", dir: "desc" });
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(15);

  const rows = useMemo(() => {
    const filtered = hoteles.filter((h) => !q || h.name.toLowerCase().includes(q.toLowerCase()));
    return filtered.sort((a, b) => {
      const get = (h: HotelReal) => (sort.key === "potencial" ? potencial(h) : sort.key === "name" ? h.name : h[sort.key]);
      const av = get(a);
      const bv = get(b);
      if (typeof av === "string") return sort.dir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sort.dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [hoteles, sort, q]);

  return (
    <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">F&amp;B · Ingresos, gastos y margen</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fuente contable (cuenta 70500000020 y compras de materia prima) · excluye colaborador
          </p>
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
                    c.key === "name" ? "text-left sticky left-0 bg-surface-muted/95 z-10" : "text-right"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    <ArrowUpDown className={cn("h-3 w-3 opacity-40", sort.key === c.key && "opacity-100 text-primary")} />
                  </span>
                </th>
              ))}
              <th className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-4 py-3 text-left whitespace-nowrap">
                Estado
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((h) => {
              const e = etiqueta(h.penetracion, UMBRAL_PENETRACION, TARGET_PENETRACION);
              return (
                <tr key={h.id} className="border-t border-border hover:bg-accent/30 transition-colors group">
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-4 py-3 whitespace-nowrap num",
                        c.key === "name"
                          ? "text-left sticky left-0 bg-surface group-hover:bg-accent/30 font-medium text-foreground"
                          : "text-right text-foreground/90"
                      )}
                    >
                      {c.key === "name" ? (
                        <Link to={`/hoteles/${h.id}`} className="hover:text-primary">
                          {c.render(h)}
                        </Link>
                      ) : (
                        c.render(h)
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", ETIQUETA_CLASS[e])}>
                      {ETIQUETA_LABEL[e]}
                    </span>
                  </td>
                  <td className="pr-3">
                    <Link to={`/hoteles/${h.id}`} className="text-muted-foreground hover:text-primary inline-flex">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
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
