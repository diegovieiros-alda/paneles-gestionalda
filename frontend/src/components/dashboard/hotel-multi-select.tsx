import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type HotelOpcion = { id: number; name: string; codigo: string };

// Selector real de uno o varios hoteles (spec: "seleccionar un hotel
// concreto o varios hoteles") — hasta ahora solo existía el buscador de
// texto de al lado, que filtra pero no deja "fijar" una selección concreta
// mientras se cambian otros filtros. Sin dependencia nueva: no hay ningún
// Popover/Combobox en el proyecto todavía, así que es un desplegable propio
// (botón + panel absoluto que se cierra al hacer clic fuera), el mismo
// patrón que ya usan los `<select>` nativos de Zona/Submarca, solo que con
// checkboxes porque aquí sí puede haber varios a la vez.
export function HotelMultiSelect({
  hoteles, selected, onChange,
}: { hoteles: HotelOpcion[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickFuera);
      document.removeEventListener("keydown", onEscape);
    };
  }, [abierto]);

  const filtrados = useMemo(() => {
    const s = busqueda.toLowerCase();
    return hoteles
      .filter((h) => !s || h.name.toLowerCase().includes(s) || (h.codigo ?? "").toLowerCase().includes(s))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [hoteles, busqueda]);

  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((i) => i !== id) : [...selected, id]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={cn(
          "h-8 px-3 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1.5",
          selected.length > 0
            ? "bg-primary/10 border-primary/20 text-primary"
            : "bg-surface border-border text-muted-foreground hover:text-foreground"
        )}
      >
        {selected.length === 0 ? "Seleccionar hoteles" : `${selected.length} hotel${selected.length !== 1 ? "es" : ""}`}
        <ChevronDown className="h-3 w-3" />
      </button>

      {abierto && (
        <div className="absolute z-20 mt-1.5 w-72 rounded-lg border border-border bg-surface shadow-soft overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-2.5 h-9">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              aria-label="Buscar hotel para seleccionar"
              placeholder="Buscar hotel o código…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="bg-transparent outline-none flex-1 min-w-0 text-xs"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtrados.length === 0 && (
              <li className="px-3 py-4 text-xs text-muted-foreground text-center">Sin resultados</li>
            )}
            {filtrados.map((h) => {
              const marcado = selected.includes(h.id);
              return (
                <li key={h.id}>
                  <button
                    onClick={() => toggle(h.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent/40 transition-colors"
                  >
                    <span
                      className={cn(
                        "h-3.5 w-3.5 rounded border shrink-0 grid place-items-center",
                        marcado ? "bg-primary border-primary" : "border-border"
                      )}
                    >
                      {marcado && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </span>
                    <span className="truncate text-foreground">{h.codigo ? `${h.codigo} - ${h.name}` : h.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full flex items-center justify-center gap-1 border-t border-border py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> Limpiar selección
            </button>
          )}
        </div>
      )}
    </div>
  );
}
