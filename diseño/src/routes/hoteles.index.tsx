import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/shell";
import { HotelsTable } from "@/components/dashboard/hotels-table";

export const Route = createFileRoute("/hoteles/")({
  head: () => ({
    meta: [
      { title: "Hoteles · Breakfast OS" },
      { name: "description", content: "Listado completo de hoteles con producción, penetración, precio, margen y oportunidad." },
    ],
  }),
  component: HotelesIndex,
});

function HotelesIndex() {
  return (
    <DashboardShell title="Hoteles" subtitle="100 hoteles · vista comparativa">
      <div className="p-6 max-w-[1600px] mx-auto">
        <HotelsTable />
      </div>
    </DashboardShell>
  );
}
