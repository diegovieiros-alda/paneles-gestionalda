import { Link, useLocation } from "@tanstack/react-router";
import {
  Target, Building2, TrendingUp, Bell, Settings, Coffee, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "¿Dónde actuar hoy?", icon: Target },
  { to: "/oportunidades", label: "Oportunidades", icon: Sparkles },
  { to: "/hoteles", label: "Hoteles", icon: Building2 },
  { to: "/tendencias", label: "Tendencias", icon: TrendingUp },
  { to: "/alertas", label: "Alertas", icon: Bell },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
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
          <div className="text-sm font-semibold text-sidebar-foreground">Breakfast OS</div>
          <div className="text-[11px] text-muted-foreground">Centro de decisiones</div>
        </div>
      </div>
      <nav className="p-3 flex-1 space-y-0.5">
        {nav.map((n) => {
          const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
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
          <div className="text-xs font-medium text-accent-foreground">100 hoteles activos</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Últ. sync 09:12</div>
        </div>
      </div>
    </aside>
  );
}
