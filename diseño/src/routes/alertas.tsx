import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/shell";
import { AlertsBlock } from "@/components/dashboard/alerts-block";

export const Route = createFileRoute("/alertas")({
  head: () => ({
    meta: [
      { title: "Alertas · Breakfast OS" },
      { name: "description", content: "Alertas priorizadas sobre hoteles que necesitan atención inmediata." },
    ],
  }),
  component: AlertasPage,
});

function AlertasPage() {
  return (
    <DashboardShell title="Alertas" subtitle="Hoteles que necesitan atención inmediata">
      <div className="p-6 max-w-[1600px] mx-auto">
        <AlertsBlock />
      </div>
    </DashboardShell>
  );
}
