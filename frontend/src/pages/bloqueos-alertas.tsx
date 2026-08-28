import { DashboardShell } from "@/components/dashboard/shell";
import { SeccionPendiente } from "@/components/dashboard/seccion-pendiente";

export default function BloqueosAlertasPage() {
  return (
    <DashboardShell title="Alertas" subtitle="Bloqueos">
      <div className="p-6 max-w-[1600px] mx-auto">
        <SeccionPendiente que="Alertas" />
      </div>
    </DashboardShell>
  );
}
