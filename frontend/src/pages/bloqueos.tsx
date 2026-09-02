import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, Percent } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { fetchBloqueos, type BloqueoHotel, type BloqueosReport } from "@/lib/bloqueos-api";
import { useRangePreset } from "@/lib/use-range-preset";
import { fmtEuro, fmtNum } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { fmtFecha, HotelBlockCard } from "@/components/dashboard/hotel-block-card";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { Skeleton } from "@/components/ui/skeleton";

function SummaryCard({
  icon: Icon, label, value, sub, tone,
}: { icon: typeof Ban; label: string; value: string; sub: string; tone: "neutral" | "primary" | "danger" }) {
  const toneClass = {
    neutral: "text-foreground before:bg-primary/60",
    primary: "text-primary before:bg-primary",
    danger: "text-danger before:bg-danger",
  }[tone];
  return (
    <div className={cn(
      "relative rounded-xl border border-border bg-surface p-5 shadow-soft",
      "before:absolute before:left-0 before:top-4 before:bottom-4 before:w-[3px] before:rounded-full",
      toneClass
    )}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold num", toneClass.split(" ")[0])}>{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

export default function BloqueosPage() {
  const { preset, custom, desde, hasta, onPreset, onCustom } = useRangePreset("ayer");
  const [report, setReport] = useState<BloqueosReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError(null);
    fetchBloqueos(desde, hasta)
      .then((d) => { if (vivo) setReport(d); })
      .catch((e) => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [desde, hasta]);

  const porZona = useMemo(() => {
    const map = new Map<string, BloqueoHotel[]>();
    for (const h of report?.hoteles ?? []) {
      if (!map.has(h.zona)) map.set(h.zona, []);
      map.get(h.zona)!.push(h);
    }
    return map;
  }, [report]);
  const zonas = [...porZona.keys()].sort((a, b) => a.localeCompare(b));

  const subtitle = report
    ? report.fechaInicio === report.fechaFin
      ? `Habitaciones fuera de servicio · ${fmtFecha(report.fechaInicio)}`
      : `Habitaciones fuera de servicio · ${fmtFecha(report.fechaInicio)} → ${fmtFecha(report.fechaFin)} (${report.diasEnRango} días)`
    : "Habitaciones fuera de servicio";

  return (
    <DashboardShell title="Bloqueos" subtitle={subtitle} origenDatos={report?.origenDatos} cargando={loading && !!report}>
      <RangeFilter preset={preset} custom={custom} onPreset={onPreset} onCustom={onCustom} />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}

        {loading && !report && (
          <div className="space-y-6">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
            <Skeleton className="h-48 rounded-xl" />
          </div>
        )}

        {report && (
          <>
            <section className="grid gap-4 grid-cols-1 md:grid-cols-3">
              <SummaryCard
                icon={Ban}
                label="Incidencias de bloqueo"
                value={`${fmtNum(report.resumen.totalHabitacionesBloqueadas)}`}
                sub={`${fmtNum(report.resumen.totalNochesBloqueadas)} habitaciones-noche · ${report.resumen.totalHotelesAfectados}/${report.resumen.totalHotelesCadena} hoteles`}
                tone="neutral"
              />
              <SummaryCard
                icon={Percent}
                label="Ratio bloqueo cadena"
                value={`${report.resumen.ratioBloqueoGlobal}%`}
                sub={`Sobre ${fmtNum(report.resumen.inventarioTotalCadena)} habitaciones · ${report.diasEnRango} día${report.diasEnRango !== 1 ? "s" : ""}`}
                tone="primary"
              />
              <SummaryCard
                icon={AlertTriangle}
                label="Impacto financiero"
                value={fmtEuro(report.resumen.totalPerdidaEstimada)}
                sub={report.resumen.adrMedioCadena !== null ? `ADR medio cadena: ${report.resumen.adrMedioCadena.toFixed(2)}€/noche` : "Sin ventas para calcular ADR"}
                tone="danger"
              />
            </section>

            {zonas.length === 0 && (
              <div className="text-sm text-muted-foreground p-10 text-center rounded-xl border border-border bg-surface shadow-soft">
                Sin habitaciones bloqueadas en el periodo seleccionado.
              </div>
            )}

            {zonas.map((zona, i) => {
              const hoteles = porZona.get(zona)!;
              const bloqueadasZona = hoteles.reduce((a, h) => a + h.kpis.habitacionesBloqueadas, 0);
              const impactoZona = hoteles.reduce((a, h) => a + (h.kpis.perdidaFinancieraEstimada ?? 0), 0);
              return (
                <section
                  key={zona}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards"
                >
                  <div className="flex items-center justify-between border-b-2 border-foreground/80 pb-1.5">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">📍 {zona}</h2>
                    <span className="text-xs text-muted-foreground">
                      {hoteles.length} hotel{hoteles.length !== 1 ? "es" : ""} · <b className="text-danger">{bloqueadasZona}</b> incidencias · <b className="text-danger">{fmtEuro(impactoZona)}</b>
                    </span>
                  </div>
                  <div className="space-y-4">
                    {hoteles.map((h) => <HotelBlockCard key={h.hotelId} hotel={h} />)}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
