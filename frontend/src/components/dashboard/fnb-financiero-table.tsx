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
import { hrefHotelDesayunos, type HotelReal } from "@/lib/hoteles-api";

type Key = "name" | "ingresos" | "presupuestoIngresos" | "gastos" | "precioMedioVenta" | "margenBruto" | "potencial";

function potencial(h: HotelReal, objetivoOportunidad: number) {
  return facturacionPotencial(h.alojados, h.penetracion, h.precioMedioVenta, objetivoOportunidad);
}

// Cada columna ancha se merece su propio espacio, pero 5 métricas sueltas
// (precio, coste, margen, resultado, cumplimiento) generaban scroll
// horizontal en cualquier pantalla — se agrupan aquí en pares que ya se
// leen juntos en la práctica (precio de venta y su coste; margen y el
// resultado que produce), en dos líneas dentro de la misma celda, en vez
// de una columna por cada número.
function buildCols(objetivoOportunidad: number): Array<{ key: Key; label: string; render: (h: HotelReal) => React.ReactNode }> {
  return [
    {
      key: "name",
      label: "Hotel",
      render: (h) => (
        <div className="flex flex-col">
          <span>{h.codigo ? `${h.codigo} - ${h.name}` : h.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{h.zona} · {h.submarca}</span>
        </div>
      ),
    },
    { key: "ingresos", label: "Ingresos", render: (h) => fmtEuro(h.ingresos) },
    {
      key: "presupuestoIngresos",
      label: "Presupuesto",
      render: (h) =>
        h.presupuestoMotivo === "rango_no_es_mes_natural" ? (
          <span className="text-muted-foreground/50" title="Elige un mes completo para ver el presupuesto">Elige mes completo</span>
        ) : h.presupuestoIngresos > 0 ? (
          <div className="flex flex-col gap-0.5 leading-tight items-end">
            <span className="text-foreground/90 inline-flex items-center gap-1.5">
              {fmtEuro(h.presupuestoIngresos)}
              {h.presupuestoOrigen && (
                <span
                  className="text-[10px] uppercase tracking-wide text-muted-foreground/60 border border-border rounded px-1"
                  title={`Presupuesto de ${ORIGEN_PRESUPUESTO_LABEL[h.presupuestoOrigen]}`}
                >
                  {ORIGEN_PRESUPUESTO_LABEL[h.presupuestoOrigen]}
                </span>
              )}
              {(() => {
                const e = etiquetaCumplimiento(h.cumplimientoIngresos);
                return e ? (
                  <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium", ETIQUETA_BADGE_CLASS[e])}>
                    {fmtPct(h.cumplimientoIngresos!, 0)}
                  </span>
                ) : null;
              })()}
            </span>
            {/* La fuente que NO ganó, para comparar — pedido explícito 2026-09-02 */}
            {h.presupuestoOrigen === "odoo" && h.presupuestoIngresosExcel !== null && (
              <span className="text-[10px] text-muted-foreground/50">Excel: {fmtEuro(h.presupuestoIngresosExcel)}</span>
            )}
            {h.presupuestoOrigen === "excel" && h.presupuestoIngresosOdoo !== null && (
              <span className="text-[10px] text-muted-foreground/50">Odoo: {fmtEuro(h.presupuestoIngresosOdoo)}</span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground/50">Sin presupuesto</span>
        ),
    },
    { key: "gastos", label: "Gastos", render: (h) => fmtEuro(h.gastos) },
    {
      key: "precioMedioVenta",
      label: "Precio / coste",
      render: (h) => (
        <div className="flex flex-col gap-0.5 leading-tight items-end">
          <span className="text-foreground/90">{h.precioMedioVenta.toFixed(2)}€</span>
          <span className="text-xs text-muted-foreground">{h.costeMedioGasto.toFixed(2)}€ coste</span>
        </div>
      ),
    },
    {
      key: "margenBruto",
      label: "Margen / resultado",
      render: (h) => (
        <div className="flex flex-col gap-0.5 leading-tight items-end">
          <SignedPct value={h.margenBruto} />
          <span className="text-xs text-muted-foreground"><SignedEuro value={h.resultadoFB} /></span>
        </div>
      ),
    },
    { key: "potencial", label: "Oportunidad", render: (h) => fmtEuro(potencial(h, objetivoOportunidad)) },
  ];
}

function exportar(hoteles: HotelReal[], objetivoOportunidad: number) {
  exportarCsv(
    `fnb-desayunos-${new Date().toISOString().slice(0, 10)}`,
    ["Hotel", "Código", "Zona", "Submarca", "Ingresos", "Presupuesto ingresos", "Origen presupuesto", "Presupuesto Odoo", "Presupuesto Excel", "Cumplimiento", "Gastos", "Margen bruto %", "Precio medio venta", "Coste medio", "Resultado F&B", "Facturación potencial"],
    hoteles.map((h) => [
      h.name,
      h.codigo,
      h.zona,
      h.submarca,
      h.ingresos.toFixed(2),
      h.presupuestoIngresos > 0 ? h.presupuestoIngresos.toFixed(2) : "",
      h.presupuestoOrigen ? ORIGEN_PRESUPUESTO_LABEL[h.presupuestoOrigen] : "",
      h.presupuestoIngresosOdoo !== null ? h.presupuestoIngresosOdoo.toFixed(2) : "",
      h.presupuestoIngresosExcel !== null ? h.presupuestoIngresosExcel.toFixed(2) : "",
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

export function FnbFinancieroTable({
  hoteles, desde, hasta, tipos,
}: { hoteles: HotelReal[]; desde: string; hasta: string; tipos: string[] }) {
  const { ajustes } = useAjustesDesayuno();
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "ingresos", dir: "desc" });
  const [q, setQ] = useState("");

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
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="bg-surface-muted/60">
            <tr>
              {cols.map((c) => (
                <th
                  key={c.label}
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}
                  className={cn(
                    "text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-5 py-3.5 cursor-pointer select-none whitespace-nowrap",
                    c.key === "name" ? "text-left sticky left-0 bg-surface-muted/95 z-10" : "text-right"
                  )}
                >
                  <span className={cn("inline-flex items-center gap-1", c.key !== "name" && "flex-row-reverse")}>
                    {c.label}
                    <ArrowUpDown className={cn("h-3 w-3 opacity-40", sort.key === c.key && "opacity-100 text-primary")} />
                  </span>
                </th>
              ))}
              <th className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-5 py-3.5 text-center whitespace-nowrap">
                Penetración
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const e = etiqueta(h.penetracion, ajustes.umbralPenetracion, ajustes.objetivoPenetracion);
              return (
                <tr key={h.id} className="border-t border-border hover:bg-accent/30 transition-colors group">
                  {cols.map((c) => (
                    <td
                      key={c.label}
                      className={cn(
                        "px-5 py-3.5 whitespace-nowrap num",
                        c.key === "name"
                          ? "text-left sticky left-0 bg-surface group-hover:bg-accent/30 font-medium text-foreground"
                          : "text-right text-foreground/90"
                      )}
                    >
                      {c.key === "name" ? (
                        <Link to={hrefHotelDesayunos(h.id, desde, hasta, tipos)} className="hover:text-primary">
                          {c.render(h)}
                        </Link>
                      ) : (
                        c.render(h)
                      )}
                    </td>
                  ))}
                  <td className="px-5 py-3.5 text-center">
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", ETIQUETA_BADGE_CLASS[e])}>
                      {ETIQUETA_LABEL[e]}
                    </span>
                  </td>
                  <td className="pr-4">
                    <Link to={hrefHotelDesayunos(h.id, desde, hasta, tipos)} className="text-muted-foreground hover:text-primary inline-flex">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
