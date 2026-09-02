import { type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIPOS_DESAYUNO } from "@/lib/hoteles-api";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { RANGE_PRESETS_DESAYUNOS, type RangePreset } from "@/lib/date-range";

const PILL =
  "h-8 px-3 rounded-full text-xs font-medium border transition-colors bg-surface border-border text-muted-foreground hover:text-foreground";

type RangeProps = {
  preset: RangePreset;
  custom: { desde: string; hasta: string };
  onPreset: (p: RangePreset) => void;
  onCustom: (c: { desde: string; hasta: string }) => void;
};

type FilterProps = {
  q: string;
  onQ: (v: string) => void;
  zona: string;
  onZona: (v: string) => void;
  zonas: string[];
  submarca: string;
  onSubmarca: (v: string) => void;
  submarcas: string[];
  tipos: string[];
  onTipos: (v: string[]) => void;
};

function Fila({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2 px-5 py-3">
      <span aria-hidden="true" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-24 shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{children}</div>
    </div>
  );
}

// Panel de filtros de Desayunos: 3 zonas separadas y con etiqueta, en vez
// de una única fila de píldoras donde tiempo/hotel/producto se mezclaban.
// "Hotel" y "Producto" solo afectan a Detalle/Oportunidades/Alertas
// (comparten useDesayunosData) — Tendencias sigue usando solo RangeFilter,
// su serie mensual es un agregado global no filtrable por hotel.
export function DesayunosFiltrosPanel({
  rangeProps, filterProps, mostrarHotel = true,
}: { rangeProps: RangeProps; filterProps: FilterProps; mostrarHotel?: boolean }) {
  const { q, onQ, zona, onZona, zonas, submarca, onSubmarca, submarcas, tipos, onTipos } = filterProps;
  const todosTipos = TIPOS_DESAYUNO.map((t) => t.value);
  const hayFiltrosActivos = !!q || !!zona || !!submarca || tipos.length < todosTipos.length;

  function toggleTipo(value: string) {
    onTipos(tipos.includes(value) ? tipos.filter((t) => t !== value) : [...tipos, value]);
  }

  return (
    <div className="border-b border-border bg-surface-muted/40 divide-y divide-border/70">
      <Fila label="Periodo">
        <RangeFilter {...rangeProps} compact presets={RANGE_PRESETS_DESAYUNOS} />
      </Fila>

      {mostrarHotel && (
        // Solo en Detalle completo: Oportunidades/Alertas son vistas para
        // descubrir qué hotel mirar en toda la cadena — prefiltrar por uno
        // concreto (o por zona/submarca) va en contra de ese propósito.
        // Para ver solo una zona/submarca, la tabla de Detalle completo ya
        // tiene su propio filtro.
        <Fila label="Hotel">
          <div className="flex items-center gap-2 h-8 rounded-md border border-border bg-surface px-2.5 text-xs w-56">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              aria-label="Buscar hotel por nombre o código"
              placeholder="Buscar hotel o código…"
              value={q}
              onChange={(e) => onQ(e.target.value)}
              className="bg-transparent outline-none flex-1 min-w-0"
            />
          </div>

          <select
            aria-label="Filtrar por zona"
            value={zona}
            onChange={(e) => onZona(e.target.value)}
            className={cn(PILL, "appearance-none cursor-pointer", zona && "bg-primary/10 border-primary/20 text-primary")}
          >
            <option value="">Todas las zonas</option>
            {zonas.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>

          <select
            aria-label="Filtrar por submarca"
            value={submarca}
            onChange={(e) => onSubmarca(e.target.value)}
            className={cn(PILL, "appearance-none cursor-pointer", submarca && "bg-primary/10 border-primary/20 text-primary")}
          >
            <option value="">Todas las submarcas</option>
            {submarcas.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Fila>
      )}

      <Fila label="Producto">
        <div className="flex items-center gap-1">
          {TIPOS_DESAYUNO.map((t) => (
            <button
              key={t.value}
              onClick={() => toggleTipo(t.value)}
              aria-pressed={tipos.includes(t.value)}
              className={cn(PILL, tipos.includes(t.value) && "bg-primary/10 border-primary/20 text-primary")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {hayFiltrosActivos && (
          <button
            onClick={() => {
              onQ("");
              onZona("");
              onSubmarca("");
              onTipos(todosTipos);
            }}
            className="ml-auto h-8 px-3 rounded-full text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Limpiar filtros
          </button>
        )}
      </Fila>
    </div>
  );
}
