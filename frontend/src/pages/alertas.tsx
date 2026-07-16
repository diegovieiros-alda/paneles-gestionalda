import { DashboardShell } from "@/components/dashboard/shell";
import { AlertsBlock } from "@/components/dashboard/alerts-block";

export default function AlertasPage() {
  return (
    <DashboardShell title="Alertas" subtitle="Hoteles que necesitan atención inmediata">
      <div className="p-6 max-w-[1600px] mx-auto">
        <AlertsBlock />
      </div>
    </DashboardShell>
  );
}
