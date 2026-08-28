import { DashboardShell } from "@/components/dashboard/shell";
import { SeccionPendiente } from "@/components/dashboard/seccion-pendiente";

export default function BloqueosAjustesPage() {
  return (
    <DashboardShell title="Ajustes" subtitle="Bloqueos">
      <div className="p-6 max-w-[1600px] mx-auto">
        <SeccionPendiente que="Ajustes" />
      </div>
    </DashboardShell>
  );
}
