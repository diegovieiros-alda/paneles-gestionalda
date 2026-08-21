import { Wallet, ShoppingCart, Scale, TrendingUp, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ETIQUETA_BADGE_CLASS, ETIQUETA_LABEL, etiquetaCumplimiento, fmtEuro, fmtPct } from "@/lib/mock-data";
import { SignedEuro, SignedPct } from "@/components/dashboard/signed-value";
import type { HotelReal } from "@/lib/hoteles-api";

function Card({
  icon: Icon, label, sub, children,
}: { icon: typeof Wallet; label: string; sub?: React.ReactNode; children: React.ReactNode }) {
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

export function FnbResumenCards({ hoteles }: { hoteles: HotelReal[] }) {
  const ingresos = hoteles.reduce((a, h) => a + h.ingresos, 0);
  const gastos = hoteles.reduce((a, h) => a + h.gastos, 0);
  const presupuestoIngresos = hoteles.reduce((a, h) => a + h.presupuestoIngresos, 0);
  const resultadoFB = ingresos - gastos;
  const margenBruto = ingresos > 0 ? resultadoFB / ingresos : 0;
  const cumplimiento = presupuestoIngresos > 0 ? ingresos / presupuestoIngresos : null;
  const e = etiquetaCumplimiento(cumplimiento);

  return (
    <section className="grid gap-4 grid-cols-2 lg:grid-cols-5">
      <Card icon={Wallet} label="Ingresos" sub="Cuenta 70500000020, excl. colaborador">
        {fmtEuro(ingresos)}
      </Card>
      <Card icon={ShoppingCart} label="Gastos" sub="Compras de materia prima F&B">
        {fmtEuro(gastos)}
      </Card>
      <Card icon={TrendingUp} label="Resultado F&B" sub="Ingresos − gastos">
        <SignedEuro value={resultadoFB} className="text-2xl" />
      </Card>
      <Card icon={Scale} label="Margen bruto" sub="(Ingresos − gastos) / ingresos">
        <SignedPct value={margenBruto} className="text-2xl" />
      </Card>
      <Card
        icon={Target}
        label="Presupuesto (ingresos)"
        sub={
          e && cumplimiento !== null ? (
            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", ETIQUETA_BADGE_CLASS[e])}>
              {fmtPct(cumplimiento, 0)} · {ETIQUETA_LABEL[e]}
            </span>
          ) : (
            "Sin presupuesto confirmado"
          )
        }
      >
        {presupuestoIngresos > 0 ? fmtEuro(presupuestoIngresos) : "—"}
      </Card>
    </section>
  );
}
