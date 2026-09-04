import { fechaLocal, MESES_DEL_ANIO, RANGE_PRESETS, rangoDelMes, type RangePreset } from "@/lib/date-range";
import { cn } from "@/lib/utils";

// El mes activo del desplegable de "Mes": mientras ese preset esté
// seleccionado, refleja el mes de `custom.desde` (que es donde vive el
// rango elegido, ver useRangePreset/use-desayunos-data.ts); si no,
// simplemente el mes en curso, sin que importe demasiado — no es el
// control activo.
function mesDeCustom(custom: { desde: string }): number {
  return fechaLocal(custom.desde).getMonth();
}

export function RangeFilter({
  preset, custom, onPreset, onCustom, compact = false, presets = RANGE_PRESETS,
}: {
  preset: RangePreset;
  custom: { desde: string; hasta: string };
  onPreset: (p: RangePreset) => void;
  onCustom: (c: { desde: string; hasta: string }) => void;
  compact?: boolean;
  presets?: typeof RANGE_PRESETS;
}) {
  return (
    <div className={cn(
      "flex flex-wrap items-center gap-2",
      compact ? "" : "px-6 py-3 border-b border-border bg-surface-muted/50"
    )}>
      {presets.map((p) =>
        p.key === "mes" ? (
          // Desplegable con los 12 meses del año en curso (2026-09-04:
          // antes era un único botón, siempre "el mes en curso" — no se
          // podía elegir un mes distinto sin pasar por "Personalizado").
          <select
            key={p.key}
            aria-label="Elegir mes"
            value={mesDeCustom(custom)}
            onChange={(e) => {
              onPreset("mes");
              onCustom(rangoDelMes(new Date().getFullYear(), Number(e.target.value)));
            }}
            className={cn(
              "h-8 pl-3 pr-2 rounded-full text-xs font-medium border transition-colors appearance-none cursor-pointer",
              preset === "mes"
                ? "bg-primary/10 border-primary/20 text-primary"
                : "bg-surface border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {MESES_DEL_ANIO.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        ) : (
          <button
            key={p.key}
            onClick={() => onPreset(p.key)}
            title={p.title}
            aria-pressed={preset === p.key}
            className={cn(
              "h-8 px-3 rounded-full text-xs font-medium border transition-colors",
              preset === p.key
                ? "bg-primary/10 border-primary/20 text-primary"
                : "bg-surface border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {p.label}
          </button>
        )
      )}
      <button
        onClick={() => onPreset("custom")}
        aria-pressed={preset === "custom"}
        className={cn(
          "h-8 px-3 rounded-full text-xs font-medium border transition-colors",
          preset === "custom"
            ? "bg-primary/10 border-primary/20 text-primary"
            : "bg-surface border-border text-muted-foreground hover:text-foreground"
        )}
      >
        Personalizado
      </button>
      {preset === "custom" && (
        <div className="flex items-center gap-1.5 text-xs">
          {/* Sin max/min cruzados entre los dos campos: con ellos, el
              selector nativo bloqueaba directamente elegir una fecha futura
              en "Desde" mientras "Hasta" siguiera en el pasado (p.ej. no
              se podía escribir oct-2026 en Desde si Hasta seguía en
              sept-2026) — bug real reportado 2026-09-02: "no puedo
              seleccionar la fecha en el selector". Ahora cualquier fecha es
              seleccionable en cualquier orden; si queda desde > hasta, se
              ajusta el otro extremo en vez de impedir la selección. */}
          <input
            type="date"
            aria-label="Fecha desde"
            value={custom.desde}
            onChange={(e) => {
              const desde = e.target.value;
              onCustom({ desde, hasta: desde > custom.hasta ? desde : custom.hasta });
            }}
            className="h-8 rounded-md border border-border bg-surface px-2 text-foreground"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            aria-label="Fecha hasta"
            value={custom.hasta}
            onChange={(e) => {
              const hasta = e.target.value;
              onCustom({ desde: hasta < custom.desde ? hasta : custom.desde, hasta });
            }}
            className="h-8 rounded-md border border-border bg-surface px-2 text-foreground"
          />
        </div>
      )}
    </div>
  );
}
