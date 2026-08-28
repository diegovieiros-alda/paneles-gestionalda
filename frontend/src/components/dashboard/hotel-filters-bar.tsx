import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIPOS_DESAYUNO } from "@/lib/hoteles-api";

const PILL = "h-8 px-3 rounded-full text-xs font-medium border transition-colors bg-surface border-border text-muted-foreground hover:text-foreground";

export function HotelFiltersBar({
  q, onQ, zona, onZona, zonas, submarca, onSubmarca, submarcas, tipos, onTipos,
}: {
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
}) {
  const todosTipos = TIPOS_DESAYUNO.map((t) => t.value);
  const activo = !!q || !!zona || !!submarca || tipos.length < todosTipos.length;

  function toggleTipo(value: string) {
    onTipos(tipos.includes(value) ? tipos.filter((t) => t !== value) : [...tipos, value]);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border bg-surface-muted/50">
      <div className="flex items-center gap-2 h-8 rounded-md border border-border bg-surface px-2.5 text-xs w-52">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          placeholder="Hotel o código…"
          value={q}
          onChange={(e) => onQ(e.target.value)}
          className="bg-transparent outline-none flex-1 min-w-0"
        />
      </div>

      <select
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
        value={submarca}
        onChange={(e) => onSubmarca(e.target.value)}
        className={cn(PILL, "appearance-none cursor-pointer", submarca && "bg-primary/10 border-primary/20 text-primary")}
      >
        <option value="">Todas las submarcas</option>
        {submarcas.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <div className="flex items-center gap-1">
        {TIPOS_DESAYUNO.map((t) => (
          <button
            key={t.value}
            onClick={() => toggleTipo(t.value)}
            className={cn(PILL, tipos.includes(t.value) && "bg-primary/10 border-primary/20 text-primary")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activo && (
        <button
          onClick={() => { onQ(""); onZona(""); onSubmarca(""); onTipos(todosTipos); }}
          className="h-8 px-3 rounded-full text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" /> Limpiar
        </button>
      )}
    </div>
  );
}
