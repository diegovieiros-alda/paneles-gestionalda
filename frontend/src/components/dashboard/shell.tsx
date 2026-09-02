import { type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { OrigenDatos } from "./data-source-badge";

export function DashboardShell({
  title, subtitle, origenDatos, periodo, cargando, children,
}: {
  title: string; subtitle?: string; origenDatos?: OrigenDatos; periodo?: string; cargando?: boolean; children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar title={title} subtitle={subtitle} origenDatos={origenDatos} periodo={periodo} cargando={cargando} />
        <main className="flex-1 min-w-0 animate-in fade-in duration-300">{children}</main>
      </div>
    </div>
  );
}
