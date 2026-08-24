import { Link, useLocation } from "react-router-dom";
import {
  TrendingUp, Bell, Settings, Coffee, Sparkles, Ban, Users, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

type NavItem = { to: string; label: string; icon: LucideIcon; dashboard: string };

export const NAV: readonly NavItem[] = [
  { to: "/bloqueos", label: "Bloqueos", icon: Ban, dashboard: "bloqueos" },
  { to: "/desayunos", label: "Desayunos", icon: Coffee, dashboard: "desayunos" },
  { to: "/oportunidades", label: "Oportunidades", icon: Sparkles, dashboard: "oportunidades" },
  { to: "/tendencias", label: "Tendencias", icon: TrendingUp, dashboard: "tendencias" },
  { to: "/alertas", label: "Alertas", icon: Bell, dashboard: "alertas" },
  { to: "/ajustes", label: "Ajustes", icon: Settings, dashboard: "ajustes" },
];

export function Sidebar() {
  const { pathname } = useLocation();
  const { usuario } = useAuth();
  const nav = NAV.filter((n) => usuario?.dashboards.includes(n.dashboard));
  if (usuario?.esSuperusuario) {
    nav.push({ to: "/usuarios", label: "Usuarios", icon: Users, dashboard: "usuarios" });
  }

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
        <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary text-primary-foreground">
          <Coffee className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-sidebar-foreground">Dashboard Alda</div>
        </div>
      </div>
      <nav className="p-3 flex-1 space-y-0.5">
        {nav.map((n) => {
          const active = pathname.startsWith(n.to);
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              )}
            >
              <Icon className="h-4 w-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-sidebar-border">
        <div className="rounded-lg bg-accent/60 p-3">
          <div className="text-xs font-medium text-accent-foreground">Conectado a Odoo (solo lectura)</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Datos en vivo</div>
        </div>
      </div>
    </aside>
  );
}
