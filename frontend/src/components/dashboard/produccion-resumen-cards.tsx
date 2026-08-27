import { TrendingUp, FileCheck2, FileClock } from "lucide-react";
import { fmtEuro, fmtPct } from "@/lib/mock-data";
import type { HotelReal } from "@/lib/hoteles-api";

function Card({
  icon: Icon, label, sub, children,
}: { icon: typeof TrendingUp; label: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold num text-foreground">{children}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

// Desglose de Producción (PMS, incluye colaborador) según ya tenga factura
// posted vinculada o no — ver hoteles-api.ts::FacturacionFields. Suma por
// hotel, no un porcentaje medio de porcentajes (evita el sesgo de tratar
// igual a un hotel pequeño que a uno grande).
export function ProduccionResumenCards({ hoteles }: { hoteles: HotelReal[] }) {
  const produccion = hoteles.reduce((a, h) => a + h.produccion, 0);
  const facturada = hoteles.reduce((a, h) => a + h.produccionFacturada, 0);
  const sinFacturar = hoteles.reduce((a, h) => a + h.produccionSinFacturar, 0);
  const porcentaje = produccion > 0 ? facturada / produccion : 0;

  return (
    <section className="grid gap-4 grid-cols-1 sm:grid-cols-3">
      <Card icon={TrendingUp} label="Producción" sub="PMS, incluye colaborador">
        {fmtEuro(produccion)}
      </Card>
      <Card icon={FileCheck2} label="Facturado" sub={`${fmtPct(porcentaje, 0)} de la producción`}>
        {fmtEuro(facturada)}
      </Card>
      <Card icon={FileClock} label="Sin facturar todavía" sub="Estimado al precio del folio">
        {fmtEuro(sinFacturar)}
      </Card>
    </section>
  );
}
