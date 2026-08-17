import { Database, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export type OrigenDatos = "odoo" | "cache";

export function DataSourceBadge({ origen }: { origen?: OrigenDatos }) {
  if (!origen) return null;

  const enVivo = origen === "odoo";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        "animate-in fade-in duration-500",
        enVivo
          ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-surface-muted text-muted-foreground"
      )}
      title={enVivo ? "Estos datos se acaban de consultar en Odoo" : "Datos servidos desde cache (Odoo consultado hace poco)"}
    >
      {enVivo ? (
        <Radio className="h-3 w-3 animate-pulse" />
      ) : (
        <Database className="h-3 w-3" />
      )}
      {enVivo ? "En vivo desde Odoo" : "Datos en caché"}
    </span>
  );
}
