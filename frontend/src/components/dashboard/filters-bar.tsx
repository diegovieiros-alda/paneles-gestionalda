import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const groups: Array<{ label: string; options: string[] }> = [
  { label: "Fecha", options: ["Hoy", "Semana", "Mes", "Trimestre", "Año"] },
  { label: "Sociedad", options: ["Ibérica", "Mediterránea", "Atlántica"] },
  { label: "Zona", options: ["Norte", "Sur", "Levante", "Centro", "Baleares", "Canarias", "Cataluña"] },
  { label: "Regional", options: ["A. García", "M. López", "J. Ruiz", "C. Fernández", "P. Sanz"] },
  { label: "Submarca", options: ["Signature", "Prime", "Select", "Urban", "Resorts"] },
  { label: "Tipo", options: ["Urbano", "Vacacional", "Business", "Resort"] },
  { label: "Segmento", options: ["Individual", "Grupo", "Fin de semana", "Laborable"] },
  { label: "Desayuno", options: ["Incluido", "Vendido"] },
];

export function FiltersBar() {
  const [active, setActive] = useState<Record<string, string>>({ Fecha: "Mes" });

  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border bg-surface-muted/50">
      {groups.map((g) => {
        const value = active[g.label];
        return (
          <div key={g.label} className="relative group">
            <button
              onClick={() => {
                const next = { ...active };
                const idx = value ? g.options.indexOf(value) : -1;
                next[g.label] = g.options[(idx + 1) % g.options.length];
                setActive(next);
              }}
              className={cn(
                "h-8 px-3 rounded-full text-xs inline-flex items-center gap-1.5 border transition-colors",
                value
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "bg-surface border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="font-medium">{g.label}</span>
              {value && <span className="opacity-80">· {value}</span>}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </div>
        );
      })}
      {Object.keys(active).length > 0 && (
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => setActive({})}>
          <X className="h-3 w-3" /> Limpiar
        </Button>
      )}
      <div className="ml-auto text-xs text-muted-foreground">
        Datos actualizados hace <span className="text-foreground font-medium">3 min</span>
      </div>
    </div>
  );
}
