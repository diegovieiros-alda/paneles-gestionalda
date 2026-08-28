import { DashboardShell } from "@/components/dashboard/shell";
import { SeccionPendiente } from "@/components/dashboard/seccion-pendiente";

export default function BloqueosOportunidadesPage() {
  return (
    <DashboardShell title="Oportunidades" subtitle="Bloqueos">
      <div className="p-6 max-w-[1600px] mx-auto">
        <SeccionPendiente que="Oportunidades" />
      </div>
    </DashboardShell>
  );
}
