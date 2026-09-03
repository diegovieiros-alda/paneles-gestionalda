import { cn } from "@/lib/utils";

// Barra de progreso de 0 a 100% (no relativa al objetivo) con dos colores:
// lo ya conseguido (actual) y, si no se ha llegado, el hueco hasta el
// objetivo — pedido explícito del spec para Oportunidades ("se pueden
// poner dos colores en la barra, con el % de diferencia entre uno y otro").
export function TargetProgressBar({
  actual, objetivo, className,
}: { actual: number; objetivo: number; className?: string }) {
  const pctActual = Math.min(100, Math.max(0, actual * 100));
  const pctObjetivo = Math.min(100, Math.max(0, objetivo * 100));

  return (
    <div className={cn("h-2 rounded-full bg-border overflow-hidden relative", className)}>
      <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${pctActual}%` }} />
      {pctObjetivo > pctActual && (
        <div
          className="absolute inset-y-0 bg-warning/50"
          style={{ left: `${pctActual}%`, width: `${pctObjetivo - pctActual}%` }}
        />
      )}
    </div>
  );
}
