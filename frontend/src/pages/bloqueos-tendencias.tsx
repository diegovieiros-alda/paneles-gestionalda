import { DashboardShell } from "@/components/dashboard/shell";
import { SeccionPendiente } from "@/components/dashboard/seccion-pendiente";

export default function BloqueosTendenciasPage() {
  return (
    <DashboardShell title="Tendencias" subtitle="Bloqueos">
      <div className="p-6 max-w-[1600px] mx-auto">
        <SeccionPendiente que="Tendencias" />
      </div>
    </DashboardShell>
  );
}
