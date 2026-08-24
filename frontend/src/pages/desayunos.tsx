import { useEffect, useState } from "react";
import { Coffee, LayoutList, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/dashboard/shell";
import { HotelsTableReal } from "@/components/dashboard/hotels-table-real";
import { FnbResumenCards } from "@/components/dashboard/fnb-resumen-cards";
import { FnbFinancieroTable } from "@/components/dashboard/fnb-financiero-table";
import { VendedoresPanel } from "@/components/dashboard/vendedores-panel";
import { DesayunosOrigenDatos } from "@/components/dashboard/desayunos-origen-datos";
import { EvolutionChartReal } from "@/components/dashboard/evolution-chart-real";
import { IngresosGastosChart } from "@/components/dashboard/ingresos-gastos-chart";
import { PrecioCosteChart } from "@/components/dashboard/precio-coste-chart";
import { ObjetivoPenetracionCard } from "@/components/dashboard/objetivo-penetracion-card";
import { AlertsBlockReal } from "@/components/dashboard/alerts-block-real";
import { RankingListReal } from "@/components/dashboard/ranking-list-real";
import { OpportunityBlockReal } from "@/components/dashboard/opportunity-block-real";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchDesayunos, type HotelReal, type SerieMensual, type Vendedor } from "@/lib/hoteles-api";
import { rangeForPreset, type RangePreset } from "@/lib/date-range";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { SectionTitle } from "@/components/dashboard/section-title";

type Tab = "accion" | "detalle";

const TABS: { key: Tab; label: string; icon: typeof Target }[] = [
  { key: "accion", label: "¿Dónde actuar hoy?", icon: Target },
  { key: "detalle", label: "Detalle completo", icon: LayoutList },
];

export default function DesayunosPage() {
  const [tab, setTab] = useState<Tab>("accion");
  const [preset, setPreset] = useState<RangePreset>("mes");
  const [custom, setCustom] = useState(() => rangeForPreset("mes"));
  const [hoteles, setHoteles] = useState<HotelReal[] | null>(null);
  const [serieMensual, setSerieMensual] = useState<SerieMensual[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [origenDatos, setOrigenDatos] = useState<"odoo" | "cache" | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { desde, hasta } = preset === "custom" ? custom : rangeForPreset(preset);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDesayunos(desde, hasta)
      .then((data) => {
        setHoteles(data.hoteles);
        setSerieMensual(data.serieMensual);
        setVendedores(data.vendedores ?? []);
        setOrigenDatos(data.origenDatos);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [desde, hasta]);

  return (
    <DashboardShell
      title="Desayunos"
      subtitle="Producción, penetración y financiero F&B de desayuno · datos reales de Odoo"
      origenDatos={origenDatos}
    >
      <RangeFilter
        preset={preset}
        custom={custom}
        onPreset={(p) => {
          setPreset(p);
          if (p !== "custom") setCustom(rangeForPreset(p));
        }}
        onCustom={setCustom}
      />

      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        <section className="flex gap-3 rounded-xl border border-border bg-surface-muted/40 p-4">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <Coffee className="h-4 w-4" />
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p>
              <b className="text-foreground">Qué es este panel:</b> producción, penetración y resultado financiero (F&amp;B) del
              desayuno de todos los hoteles, con datos en vivo de Odoo — PMS (lo vendido en recepción/folio) y Contabilidad (lo ya
              facturado).
            </p>
            <p className="mt-1">
              Usa <b className="text-foreground">¿Dónde actuar hoy?</b> para ver qué hoteles priorizar, o{" "}
              <b className="text-foreground">Detalle completo</b> para el desglose operativo, financiero y de vendedores por hotel.
            </p>
          </div>
        </section>

        <div className="flex gap-1.5 border-b border-border">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}
        {loading && !hoteles && (
          <div className="space-y-6">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        )}

        {hoteles && tab === "accion" && (
          <>
            <ObjetivoPenetracionCard hoteles={hoteles} />
            <div className="grid gap-6 lg:grid-cols-2">
              <AlertsBlockReal hoteles={hoteles} />
              <RankingListReal hoteles={hoteles} />
            </div>
            <OpportunityBlockReal hoteles={hoteles} />
          </>
        )}

        {hoteles && tab === "detalle" && (
          <>
            <SectionTitle title="Rendimiento operativo" subtitle="PMS · producción y penetración por hotel (incluye colaborador, salvo penetración)" />
            {serieMensual.length > 0 && <EvolutionChartReal serie={serieMensual} />}
            <HotelsTableReal hoteles={hoteles} />

            <SectionTitle title="Financiero F&B" subtitle="Contabilidad · ingresos, gastos, margen y presupuesto (excluye colaborador)" />
            <FnbResumenCards hoteles={hoteles} />
            {serieMensual.length > 0 && (
              <div className="grid gap-6 lg:grid-cols-2">
                <IngresosGastosChart serie={serieMensual} />
                <PrecioCosteChart serie={serieMensual} />
              </div>
            )}
            <FnbFinancieroTable hoteles={hoteles} />

            <SectionTitle title="Vendedores" />
            <VendedoresPanel vendedores={vendedores} />

            <SectionTitle title="Metodología" />
            <DesayunosOrigenDatos />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
