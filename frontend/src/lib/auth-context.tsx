import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { obtenerSesion, type Usuario } from "@/lib/auth-api";

type AuthState = {
  usuario: Usuario | null;
  cargando: boolean;
  refrescar: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({ usuario: null, cargando: true, refrescar: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    setUsuario(await obtenerSesion());
  }, []);

  useEffect(() => {
    refrescar().finally(() => setCargando(false));
  }, [refrescar]);

  return <AuthContext.Provider value={{ usuario, cargando, refrescar }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
