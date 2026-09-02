import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, ChevronRight, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ETIQUETA_BADGE_CLASS, ETIQUETA_LABEL, ORIGEN_PRESUPUESTO_LABEL, etiqueta, etiquetaCumplimiento,
  facturacionPotencial, fmtEuro, fmtPct,
} from "@/lib/mock-data";
import { exportarCsv } from "@/lib/export-csv";
import { SignedEuro, SignedPct } from "@/components/dashboard/signed-value";
import { Button } from "@/components/ui/button";
import { useAjustesDesayuno } from "@/lib/ajustes-desayuno-context";
import type { HotelReal } from "@/lib/hoteles-api";

type Key = "name" | "ingresos" | "cumplimientoIngresos" | "gastos" | "margenBruto" | "precioMedioVenta" | "costeMedioGasto" | "resultadoFB" | "potencial";

function potencial(h: HotelReal, objetivoOportunidad: number) {
  return facturacionPotencial(h.alojados, h.penetracion, h.precioMedioVenta, objetivoOportunidad);
}

function buildCols(objetivoOportunidad: number): Array<{ key: Key; label: string; render: (h: HotelReal) => React.ReactNode }> {
  return [
    { key: "name", label: "Hotel", render: (h) => h.name },
    { key: "ingresos", label: "Ingresos", render: (h) => fmtEuro(h.ingresos) },
    {
      key: "cumplimientoIngresos",
      label: "Presupuesto",
      render: (h) =>
        h.presupuestoMotivo === "rango_no_es_mes_natural" ? (
          <span className="text-muted-foreground/50" title="Elige un mes completo para ver el presupuesto">Elige mes completo</span>
        ) : h.presupuestoIngresos > 0 ? (
          <span className="text-muted-foreground inline-flex items-center gap-1">
            {fmtEuro(h.presupuestoIngresos)}
            {h.presupuestoOrigen && (
              <span
                className="text-[10px] uppercase tracking-wide text-muted-foreground/60 border border-border rounded px-1"
                title={`Presupuesto de ${ORIGEN_PRESUPUESTO_LABEL[h.presupuestoOrigen]}`}
              >
                {ORIGEN_PRESUPUESTO_LABEL[h.presupuestoOrigen]}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground/50">Sin presupuesto</span>
        ),
    },
    {
      key: "cumplimientoIngresos",
      label: "Cumplimiento",
      render: (h) => {
        if (h.presupuestoMotivo === "rango_no_es_mes_natural") return <span className="text-muted-foreground/50">—</span>;
        const e = etiquetaCumplimiento(h.cumplimientoIngresos);
        if (!e || h.cumplimientoIngresos === null) return <span className="text-muted-foreground/50">—</span>;
        return (
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", ETIQUETA_BADGE_CLASS[e])}>
            {fmtPct(h.cumplimientoIngresos, 0)}
          </span>
        );
      },
    },
    { key: "gastos", label: "Gastos", render: (h) => fmtEuro(h.gastos) },
    { key: "margenBruto", label: "Margen bruto", render: (h) => <SignedPct value={h.margenBruto} /> },
    { key: "precioMedioVenta", label: "Precio medio venta", render: (h) => `${h.precioMedioVenta.toFixed(2)}€` },
    { key: "costeMedioGasto", label: "Coste medio", render: (h) => `${h.costeMedioGasto.toFixed(2)}€` },
    { key: "resultadoFB", label: "Resultado F&B", render: (h) => <SignedEuro value={h.resultadoFB} /> },
    { key: "potencial", label: "Facturación potencial", render: (h) => fmtEuro(potencial(h, objetivoOportunidad)) },
  ];
}

function exportar(hoteles: HotelReal[], objetivoOportunidad: number) {
  exportarCsv(
    `fnb-desayunos-${new Date().toISOString().slice(0, 10)}`,
    ["Hotel", "Ingresos", "Presupuesto ingresos", "Cumplimiento", "Gastos", "Margen bruto %", "Precio medio venta", "Coste medio", "Resultado F&B", "Facturación potencial"],
    hoteles.map((h) => [
      h.name,
      h.ingresos.toFixed(2),
      h.presupuestoIngresos > 0 ? h.presupuestoIngresos.toFixed(2) : "",
      h.cumplimientoIngresos !== null ? (h.cumplimientoIngresos * 100).toFixed(1) : "",
      h.gastos.toFixed(2),
      (h.margenBruto * 100).toFixed(1),
      h.precioMedioVenta.toFixed(2),
      h.costeMedioGasto.toFixed(2),
      h.resultadoFB.toFixed(2),
      potencial(h, objetivoOportunidad).toFixed(2),
    ])
  );
}

export function FnbFinancieroTable({ hoteles }: { hoteles: HotelReal[] }) {
  const { ajustes } = useAjustesDesayuno();
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "ingresos", dir: "desc" });
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(15);

  const cols = useMemo(() => buildCols(ajustes.objetivoOportunidad), [ajustes.objetivoOportunidad]);

  const rows = useMemo(() => {
    const filtered = hoteles.filter((h) => !q || h.name.toLowerCase().includes(q.toLowerCase()));
    return filtered.sort((a, b) => {
      const get = (h: HotelReal) => (sort.key === "potencial" ? potencial(h, ajustes.objetivoOportunidad) : sort.key === "name" ? h.name : h[sort.key] ?? 0);
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
          <h2 className="text-sm font-semibold text-foreground">F&amp;B · Ingresos, gastos y margen</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fuente contable (cuenta 70500000020 y compras de materia prima) · excluye colaborador
          </p>
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
                  key={c.label}
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}
                  className={cn(
                    "text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-4 py-3 cursor-pointer select-none whitespace-nowrap",
                    c.key === "name" ? "text-left sticky left-0 bg-surface-muted/95 z-10" : "text-center"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    <ArrowUpDown className={cn("h-3 w-3 opacity-40", sort.key === c.key && "opacity-100 text-primary")} />
                  </span>
                </th>
              ))}
              <th className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-4 py-3 text-center whitespace-nowrap">
                Penetración
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((h) => {
              const e = etiqueta(h.penetracion, ajustes.umbralPenetracion, ajustes.objetivoPenetracion);
              return (
                <tr key={h.id} className="border-t border-border hover:bg-accent/30 transition-colors group">
                  {cols.map((c) => (
                    <td
                      key={c.label}
                      className={cn(
                        "px-4 py-3 whitespace-nowrap num",
                        c.key === "name"
                          ? "text-left sticky left-0 bg-surface group-hover:bg-accent/30 font-medium text-foreground"
                          : "text-center text-foreground/90"
                      )}
                    >
                      {c.key === "name" ? (
                        <Link to={`/desayunos/${h.id}`} className="hover:text-primary">
                          {c.render(h)}
                        </Link>
                      ) : (
                        c.render(h)
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", ETIQUETA_BADGE_CLASS[e])}>
                      {ETIQUETA_LABEL[e]}
                    </span>
                  </td>
                  <td className="pr-3">
                    <Link to={`/desayunos/${h.id}`} className="text-muted-foreground hover:text-primary inline-flex">
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
