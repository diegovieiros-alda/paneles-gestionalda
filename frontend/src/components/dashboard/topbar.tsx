import { Bell, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DataSourceBadge, type OrigenDatos } from "@/components/dashboard/data-source-badge";
import { cerrarSesion } from "@/lib/auth-api";
import { useAuth } from "@/lib/auth-context";

export function Topbar({
  title, subtitle, origenDatos,
}: { title: string; subtitle?: string; origenDatos?: OrigenDatos }) {
  const navigate = useNavigate();
  const { usuario, refrescar } = useAuth();

  async function onLogout() {
    await cerrarSesion();
    await refrescar();
    navigate("/login");
  }

  return (
    <header className="h-16 border-b border-border bg-surface/70 backdrop-blur sticky top-0 z-30">
      <div className="h-full flex items-center gap-4 px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold text-foreground truncate">{title}</h1>
            <DataSourceBadge origen={origenDatos} />
          </div>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-danger" />
          </Button>
          <div className="h-8 w-8 rounded-full bg-primary/90 text-primary-foreground grid place-items-center text-xs font-semibold">
            {iniciales(usuario?.nombre || usuario?.email)}
          </div>
          <Button variant="ghost" size="icon" onClick={onLogout} title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function iniciales(texto?: string): string {
  if (!texto) return "?";
  return texto.trim().slice(0, 2).toUpperCase();
}
