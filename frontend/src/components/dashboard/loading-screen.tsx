import { cn } from "@/lib/utils";

// Logo con un anillo girando alrededor — para la sesión (pantalla
// completa) y para la primera carga de datos de una página (inline).
function BrandLoader({ small = false }: { small?: boolean }) {
  return (
    <div className={cn("relative grid place-items-center shrink-0", small ? "h-14 w-14" : "h-20 w-20")}>
      <div className="absolute inset-0 rounded-full border-[3px] border-border border-t-primary animate-spin" />
      <img src="/alda-logo.svg" alt="" className={cn(small ? "h-6 w-6" : "h-9 w-9")} />
    </div>
  );
}

// Pantalla completa mientras se resuelve la sesión (AuthProvider.cargando)
// — antes se devolvía null ahí, un parpadeo en blanco en cada carga o
// cambio de ruta protegida.
export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <BrandLoader />
    </div>
  );
}

// Primera carga de datos dentro de una página (antes: bloques grises
// "Skeleton" sin marca — sustituye a esos bloques en el hueco "loading y
// aún no hay datos", no a los estados ya cargados.
export function DataLoading({ label = "Cargando datos…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <BrandLoader small />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// Refetch con datos ya en pantalla (cambio de filtro/fecha): antes un
// punto de 14px casi invisible en la topbar ("mini spinner") — reportado
// como poco fiable/inconsistente ("necesito que sea el mismo spinner en
// todos los casos"). Mismo BrandLoader que DataLoading, como overlay sobre
// el contenido ya cargado (que se queda montado debajo, sin perder scroll
// ni parpadear) en vez de sustituirlo — a diferencia de DataLoading, que
// ocupa el hueco cuando todavía no hay nada que enseñar. El contenedor
// padre necesita `relative`.
export function LoadingOverlay({ label = "Actualizando…" }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-[1px] rounded-xl">
      <BrandLoader small />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
