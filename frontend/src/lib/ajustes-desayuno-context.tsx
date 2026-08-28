import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchAjustesDesayuno } from "@/lib/ajustes-api";

// Antes hardcodeados en mock-data.ts (TARGET_PENETRACION/UMBRAL_PENETRACION/
// TARGET_OPORTUNIDAD). Estos valores por defecto solo se usan mientras carga
// la petición real o si falla — la fuente de verdad es el backend
// (DashboardSetting, ver backend/core/hoteles/service.py::
// AJUSTES_DESAYUNOS_DEFECTO, mismos números).
const DEFECTO: AjustesDesayuno = {
  objetivoPenetracion: 0.55,
  umbralPenetracion: 0.38,
  objetivoOportunidad: 0.85,
};

export type AjustesDesayuno = {
  objetivoPenetracion: number;
  umbralPenetracion: number;
  objetivoOportunidad: number;
};

type AjustesState = { ajustes: AjustesDesayuno; loading: boolean; recargar: () => void };

const AjustesDesayunoContext = createContext<AjustesState>({ ajustes: DEFECTO, loading: false, recargar: () => {} });

export function AjustesDesayunoProvider({ children }: { children: ReactNode }) {
  const [ajustes, setAjustes] = useState<AjustesDesayuno>(DEFECTO);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    fetchAjustesDesayuno()
      .then((a) => { if (vivo) setAjustes(a); })
      .catch(() => { /* se queda con el valor por defecto/anterior */ })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [version]);

  return (
    <AjustesDesayunoContext.Provider value={{ ajustes, loading, recargar }}>
      {children}
    </AjustesDesayunoContext.Provider>
  );
}

export function useAjustesDesayuno() {
  return useContext(AjustesDesayunoContext);
}
