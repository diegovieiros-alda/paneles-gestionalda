import { Link, useLocation } from "react-router-dom";
import {
  Target, Building2, TrendingUp, Bell, Settings, Coffee, Sparkles, Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navLive = [
  { to: "/bloqueos", label: "Bloqueos", icon: Ban },
] as const;

// Todavía sobre datos de ejemplo, se conectarán más adelante.
const navProximamente = [
  { label: "¿Dónde actuar hoy?", icon: Target },
  { label: "Oportunidades", icon: Sparkles },
  { label: "Hoteles", icon: Building2 },
  { label: "Tendencias", icon: TrendingUp },
  { label: "Alertas", icon: Bell },
  { label: "Ajustes", icon: Settings },
] as const;

export function Sidebar() {
  const { pathname } = useLocation();
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
        {navLive.map((n) => {
          const active = pathname === "/" || pathname.startsWith(n.to);
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

        <div className="pt-4 pb-1 px-3 text-[10px] uppercase tracking-wide text-muted-foreground/70">Próximamente</div>
        {navProximamente.map((n) => {
          const Icon = n.icon;
          return (
            <div
              key={n.label}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/35 cursor-not-allowed select-none"
            >
              <Icon className="h-4 w-4" />
              {n.label}
            </div>
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
