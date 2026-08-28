import { Link, useLocation } from "react-router-dom";
import { Coffee, Ban, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

type NavChild = { to: string; label: string };
type NavItem = { to: string; label: string; icon: LucideIcon; dashboard: string; children?: NavChild[] };

// Oportunidades/Tendencias/Alertas/Ajustes ya no son dashboards propios
// (2026-08-27) — son secciones dentro de cada dashboard, gateadas por el
// permiso de ese dashboard (no por un permiso propio). Ver
// backend/core/models.py::DASHBOARDS.
//
// Orden del array: App.tsx::Inicio() navega al primero de esta lista al
// que el usuario tenga acceso al entrar en "/" — Desayunos va primero a
// propósito (2026-08-28, pedido explícitamente) para que sea la sección
// por defecto al cargar la página, no solo el orden del menú.
export const NAV: readonly NavItem[] = [
  {
    to: "/desayunos",
    label: "Desayunos",
    icon: Coffee,
    dashboard: "desayunos",
    children: [
      { to: "/desayunos/detalle", label: "Detalle completo" },
      { to: "/desayunos/oportunidades", label: "Oportunidades" },
      { to: "/desayunos/tendencias", label: "Tendencias" },
      { to: "/desayunos/alertas", label: "Alertas" },
      { to: "/desayunos/ajustes", label: "Ajustes" },
    ],
  },
  {
    to: "/bloqueos",
    label: "Bloqueos",
    icon: Ban,
    dashboard: "bloqueos",
    children: [
      { to: "/bloqueos/oportunidades", label: "Oportunidades" },
      { to: "/bloqueos/tendencias", label: "Tendencias" },
      { to: "/bloqueos/alertas", label: "Alertas" },
      { to: "/bloqueos/ajustes", label: "Ajustes" },
    ],
  },
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
            <div key={n.to}>
              <Link
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
              {n.children && active && (
                <div className="ml-[1.125rem] mt-0.5 mb-1 space-y-0.5 border-l border-sidebar-border pl-3">
                  {n.children.map((c) => {
                    const childActive = pathname === c.to;
                    return (
                      <Link
                        key={c.to}
                        to={c.to}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/70 transition-colors",
                          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          childActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        )}
                      >
                        {c.label}
                      </Link>
                    );
                  })}
                </div>
              )}
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
