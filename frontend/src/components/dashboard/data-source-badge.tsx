import { Database, FlaskConical, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export type OrigenDatos = "odoo" | "cache" | "ejemplo";

export function DataSourceBadge({ origen }: { origen?: OrigenDatos }) {
  if (!origen) return null;

  if (origen === "ejemplo") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
          "animate-in fade-in duration-500 border-warning/30 bg-warning/10 text-warning"
        )}
        title="Esta sección todavía no está conectada a Odoo: los datos son de ejemplo (generados al azar), no reales."
      >
        <FlaskConical className="h-3 w-3" />
        Datos de ejemplo
      </span>
    );
  }

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
