import { type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cerrarSesion } from "@/lib/auth-api";
import { useAuth } from "@/lib/auth-context";

function SinAcceso({ mensaje }: { mensaje: string }) {
  const navigate = useNavigate();
  const { refrescar } = useAuth();

  async function onLogout() {
    await cerrarSesion();
    await refrescar();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Sin acceso</h1>
        <p className="mt-2 text-sm text-muted-foreground">{mensaje}</p>
        <Button variant="outline" size="sm" className="mt-6" onClick={onLogout}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}

export function ProtectedRoute({ dashboard, children }: { dashboard: string; children: ReactNode }) {
  const { usuario, cargando } = useAuth();

  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  if (!usuario.dashboards.includes(dashboard)) {
    return <SinAcceso mensaje="Tu rol no tiene acceso a este dashboard. Pide a un administrador que te lo asigne." />;
  }
  return <>{children}</>;
}

export function SuperuserRoute({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth();

  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  if (!usuario.esSuperusuario) {
    return <SinAcceso mensaje="Esta sección es solo para administradores." />;
  }
  return <>{children}</>;
}
