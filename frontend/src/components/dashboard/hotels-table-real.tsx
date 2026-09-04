import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, ChevronRight, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { facturacionPotencial, fmtEuro, fmtNum, fmtPct } from "@/lib/mock-data";
import { exportarCsv } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { hrefHotelDesayunos, type HotelReal } from "@/lib/hoteles-api";
import { LyComparison } from "@/components/dashboard/ly-comparison";

type Key = "name" | "alojados" | "desayunos" | "penetracion" | "produccion" | "precioMedio" | "oportunidad";

// Misma base que la columna "Penetración" (directa, sin colaborador — ver
// backend/core/hoteles/service.py): calcular el hueco sobre "desayunos"
// (incluye colaborador) mezclaría dos cifras con numerador distinto y daría
// una oportunidad artificialmente baja en hoteles con fuerte venta a
// colaborador, aunque su penetración directa sea crítica.
//
// h.objetivoOportunidad (no un valor global): desde 2026-09-04 cada hotel
// puede tener su propio objetivo — el backend ya resuelve cuál usar
// (propio, si no el global de la cadena) antes de que llegue aquí.
function oportunidad(h: HotelReal) {
  return facturacionPotencial(h.alojados, h.penetracion, h.precioMedioVenta, h.objetivoOportunidad);
}

// Zona/Sociedad/Submarca eran 3 columnas propias — bastante para forzar
// scroll horizontal por sí solas. Se leen igual de bien como segunda línea
// bajo el nombre del hotel, y liberan sitio para las métricas.
const COLS: Array<{ key: Key; label: string; render: (h: HotelReal) => React.ReactNode; sticky?: boolean }> = [
    {
      key: "name",
      label: "Hotel",
      sticky: true,
      render: (h) => (
        <div className="flex flex-col">
          <span>{h.codigo ? `${h.codigo} - ${h.name}` : h.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{h.zona} · {h.sociedad} · {h.submarca}</span>
        </div>
      ),
    },
    {
      key: "alojados",
      label: "Alojados",
      render: (h) => (
        <div className="flex flex-col items-end gap-0.5 leading-tight">
          <span>{fmtNum(h.alojados)}</span>
          <LyComparison valorLY={h.alojadosLY} variacion={h.alojadosVarLY} formatear={fmtNum} />
        </div>
      ),
    },
    {
      key: "desayunos",
      label: "Desayunos",
      render: (h) => (
        <div className="flex flex-col items-end gap-0.5 leading-tight">
          <span>{fmtNum(h.desayunos)}</span>
          <LyComparison valorLY={h.desayunosLY} variacion={h.desayunosVarLY} formatear={fmtNum} />
        </div>
      ),
    },
    {
      key: "penetracion",
      label: "Penetración",
      render: (h) => (
        <div className="flex flex-col items-end gap-0.5 leading-tight">
          <span>{fmtPct(h.penetracion)}</span>
          <LyComparison valorLY={h.penetracionLY} variacion={h.penetracionVarLY} formatear={(n) => fmtPct(n)} />
        </div>
      ),
    },
    {
      key: "produccion",
      label: "Producción",
      render: (h) => (
        <div className="flex flex-col items-end gap-0.5 leading-tight">
          <span>{fmtEuro(h.produccion)}</span>
          <LyComparison valorLY={h.produccionLY} variacion={h.produccionVarLY} formatear={fmtEuro} />
        </div>
      ),
    },
    {
      key: "precioMedio",
      label: "Precio med.",
      render: (h) => (
        <div className="flex flex-col items-end gap-0.5 leading-tight">
          <span>{h.precioMedio.toFixed(2)}€</span>
          <LyComparison valorLY={h.precioMedioLY} variacion={h.precioMedioVarLY} formatear={(n) => `${n.toFixed(2)}€`} />
        </div>
      ),
    },
    { key: "oportunidad", label: "Oportunidad", render: (h) => fmtEuro(oportunidad(h)) },
];

function exportar(hoteles: HotelReal[]) {
  exportarCsv(
    `desayunos-hoteles-${new Date().toISOString().slice(0, 10)}`,
    [
      "Hotel", "Código", "Zona", "Sociedad", "Submarca",
      "Alojados", "Alojados LY", "Desayunos", "Desayunos LY",
      "Penetración %", "Penetración LY %", "Producción", "Producción LY",
      "Precio medio", "Precio medio LY", "Oportunidad",
    ],
    hoteles.map((h) => [
      h.name, h.codigo, h.zona, h.sociedad, h.submarca,
      h.alojados, h.alojadosLY, h.desayunos, h.desayunosLY,
      (h.penetracion * 100).toFixed(1), (h.penetracionLY * 100).toFixed(1),
      h.produccion.toFixed(2), h.produccionLY.toFixed(2),
      h.precioMedio.toFixed(2), h.precioMedioLY.toFixed(2),
      oportunidad(h).toFixed(2),
    ])
  );
}

export function HotelsTableReal({
  hoteles, desde, hasta, tipos,
}: { hoteles: HotelReal[]; desde: string; hasta: string; tipos: string[] }) {
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "produccion", dir: "desc" });
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const filtered = hoteles.filter((h) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return h.name.toLowerCase().includes(s) || h.zona.toLowerCase().includes(s) || h.sociedad.toLowerCase().includes(s);
    });
    return filtered.sort((a, b) => {
      const get = (h: HotelReal) => (sort.key === "oportunidad" ? oportunidad(h) : h[sort.key]);
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
          <h2 className="text-sm font-semibold text-foreground">Todos los hoteles</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{rows.length} de {hoteles.length} hoteles</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 h-8 rounded-md border border-border bg-surface px-2.5 text-xs w-56">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              aria-label="Buscar hotel, zona o sociedad"
              placeholder="Buscar hotel, zona, sociedad…"
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

      {/* max-h + overflow-auto (no solo overflow-x-auto): la tabla gana su
          propio scroll, acotado, para que la cabecera pueda quedarse fija
          (sticky top-0) mientras se baja por hasta ~89 filas — antes la
          página entera hacía scroll y la cabecera desaparecía, "se pierde
          lo que es cada columna" (reportado 2026-09-04). */}
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted/60">
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}
                  className={cn(
                    "text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-5 py-3.5 cursor-pointer select-none whitespace-nowrap sticky top-0 bg-surface-muted/95 z-10",
                    c.sticky ? "text-left left-0 z-20" : "text-right"
                  )}
                >
                  <span className={cn("inline-flex items-center gap-1", !c.sticky && "flex-row-reverse")}>
                    {c.label}
                    <ArrowUpDown className={cn("h-3 w-3 opacity-40", sort.key === c.key && "opacity-100 text-primary")} />
                  </span>
                </th>
              ))}
              <th className="w-8 sticky top-0 bg-surface-muted/95 z-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id} className="border-t border-border hover:bg-accent/30 transition-colors group">
                {COLS.map((c) => (
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
