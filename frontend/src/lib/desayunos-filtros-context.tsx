import { createContext, useContext, type ReactNode } from "react";
import { useDesayunosData } from "@/lib/use-desayunos-data";

// Antes cada página (Detalle/Oportunidades/Alertas/Tendencias) llamaba a
// useDesayunosData() por su cuenta — al navegar entre secciones, el hook
// se desmontaba y volvía a montar desde cero, así que Periodo/Hotel/
// Producto se reseteaban en cada cambio de pestaña (reportado: "los
// filtros se tienen que mantener seteados entre secciones"). Este
// Provider crea el hook UNA vez, en App.tsx, envolviendo las 4 rutas como
// hermanas de un mismo layout (<Outlet/>) — así el estado sobrevive a la
// navegación entre ellas, en vez de recrearse cada vez.
type DesayunosFiltrosState = ReturnType<typeof useDesayunosData>;

const DesayunosFiltrosContext = createContext<DesayunosFiltrosState | null>(null);

export function DesayunosFiltrosProvider({ children }: { children: ReactNode }) {
  const estado = useDesayunosData();
  return <DesayunosFiltrosContext.Provider value={estado}>{children}</DesayunosFiltrosContext.Provider>;
}

export function useDesayunosFiltros(): DesayunosFiltrosState {
  const ctx = useContext(DesayunosFiltrosContext);
  if (!ctx) throw new Error("useDesayunosFiltros() debe usarse dentro de <DesayunosFiltrosProvider>");
  return ctx;
}
