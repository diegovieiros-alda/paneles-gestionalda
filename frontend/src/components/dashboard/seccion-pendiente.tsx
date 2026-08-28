import { Construction } from "lucide-react";

// Placeholder para secciones ya creadas en la navegación pero sin criterio
// de negocio definido todavía (2026-08-27: Bloqueos no tenía Oportunidades/
// Tendencias/Alertas propias — a diferencia de Desayunos, no hay umbrales ni
// serie temporal que reutilizar, así que no se inventan aquí. Sustituir por
// contenido real cuando se defina el criterio).
export function SeccionPendiente({ que }: { que: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-muted/30 p-10 text-center">
      <Construction className="h-6 w-6 text-muted-foreground mx-auto" />
      <p className="mt-3 text-sm font-medium text-foreground">{que} de Bloqueos aún sin definir</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
        Todavía no hay un criterio de negocio (umbrales, objetivo, serie temporal) acordado para esta sección.
        Se implementará con datos reales en cuanto se defina.
      </p>
    </div>
  );
}
