import { RANGE_PRESETS, type RangePreset } from "@/lib/date-range";
import { cn } from "@/lib/utils";

export function RangeFilter({
  preset, custom, onPreset, onCustom, compact = false,
}: {
  preset: RangePreset;
  custom: { desde: string; hasta: string };
  onPreset: (p: RangePreset) => void;
  onCustom: (c: { desde: string; hasta: string }) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn(
      "flex flex-wrap items-center gap-2",
      compact ? "" : "px-6 py-3 border-b border-border bg-surface-muted/50"
    )}>
      {RANGE_PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => onPreset(p.key)}
          className={cn(
            "h-8 px-3 rounded-full text-xs font-medium border transition-colors",
            preset === p.key
              ? "bg-primary/10 border-primary/20 text-primary"
              : "bg-surface border-border text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => onPreset("custom")}
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
          <input
            type="date"
            value={custom.desde}
            max={custom.hasta}
            onChange={(e) => onCustom({ ...custom, desde: e.target.value })}
            className="h-8 rounded-md border border-border bg-surface px-2 text-foreground"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            value={custom.hasta}
            min={custom.desde}
            onChange={(e) => onCustom({ ...custom, hasta: e.target.value })}
            className="h-8 rounded-md border border-border bg-surface px-2 text-foreground"
          />
        </div>
      )}
    </div>
  );
}
