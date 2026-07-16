import { DashboardShell } from "@/components/dashboard/shell";
import { HotelsTable } from "@/components/dashboard/hotels-table";

export default function HotelesIndex() {
  return (
    <DashboardShell title="Hoteles" subtitle="100 hoteles · vista comparativa">
      <div className="p-6 max-w-[1600px] mx-auto">
        <HotelsTable />
      </div>
    </DashboardShell>
  );
}
