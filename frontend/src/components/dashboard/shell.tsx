import { useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { OrigenDatos } from "./data-source-badge";

export function DashboardShell({
  title, subtitle, origenDatos, periodo, children,
}: {
  title: string; subtitle?: string; origenDatos?: OrigenDatos; periodo?: string; children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar
          title={title} subtitle={subtitle} origenDatos={origenDatos} periodo={periodo}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 min-w-0 animate-in fade-in duration-300">{children}</main>
      </div>
    </div>
  );
}
