import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

export function ProtectedRoute({ dashboard, children }: { dashboard: string; children: ReactNode }) {
  const { usuario, cargando } = useAuth();

  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  if (!usuario.dashboards.includes(dashboard)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-foreground">Sin acceso</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu rol no tiene acceso a este dashboard. Pide a un administrador que te lo asigne.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function SuperuserRoute({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth();

  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  if (!usuario.esSuperusuario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-foreground">Sin acceso</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta sección es solo para administradores.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
