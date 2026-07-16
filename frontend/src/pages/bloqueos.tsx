import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, Percent } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { fetchBloqueos, type BloqueoHotel, type BloqueosReport } from "@/lib/bloqueos-api";
import { RANGE_PRESETS, rangeForPreset, type RangePreset } from "@/lib/date-range";
import { fmtEuro, fmtNum } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function fmtFecha(iso: string) {
  if (!iso || iso === "N/A") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function RangeFilter({
  preset, custom, onPreset, onCustom,
}: {
  preset: RangePreset;
  custom: { desde: string; hasta: string };
  onPreset: (p: RangePreset) => void;
  onCustom: (c: { desde: string; hasta: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border bg-surface-muted/50">
      {RANGE_PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => onPreset(p.key)}
          className={cn(
            "h-8 px-3 rounded-full text-xs font-medium border transition-colors",
            preset === p.key
              ? "bg-primary/10 border-primary/20 text-primary"
              : "bg-surface border-border text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => onPreset("custom")}
        className={cn(
          "h-8 px-3 rounded-full text-xs font-medium border transition-colors",
          preset === "custom"
            ? "bg-primary/10 border-primary/20 text-primary"
            : "bg-surface border-border text-muted-foreground hover:text-foreground"
        )}
      >
        Personalizado
      </button>
      {preset === "custom" && (
        <div className="flex items-center gap-1.5 text-xs">
          <input
            type="date"
            value={custom.desde}
            max={custom.hasta}
            onChange={(e) => onCustom({ ...custom, desde: e.target.value })}
            className="h-8 rounded-md border border-border bg-surface px-2 text-foreground"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            value={custom.hasta}
            min={custom.desde}
            onChange={(e) => onCustom({ ...custom, hasta: e.target.value })}
            className="h-8 rounded-md border border-border bg-surface px-2 text-foreground"
          />
        </div>
      )}
    </div>
  );
}

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

function OcupacionBar({ kpis }: { kpis: BloqueoHotel["kpis"] }) {
  const pctBloq = Math.max(0, 100 - kpis.porcentajeLibre - kpis.porcentajeOcupacion);
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-border/60">
        <div className="bg-muted-foreground/30" style={{ width: `${kpis.porcentajeLibre}%` }} />
        <div className="bg-primary" style={{ width: `${kpis.porcentajeOcupacion}%` }} />
        <div className="bg-danger" style={{ width: `${pctBloq}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>Libres <b className="text-foreground num">{kpis.nochesLibres}</b> ({kpis.porcentajeLibre}%)</span>
        <span>Ocupadas <b className="text-foreground num">{kpis.nochesOcupadas}</b> ({kpis.porcentajeOcupacion}%)</span>
        <span>Bloqueadas <b className="text-danger num">{kpis.nochesBloqueadas}</b> ({kpis.porcentajeBloqueo}%)</span>
        <span className="ml-auto">Hab.-noche total <b className="text-foreground num">{kpis.totalInventario * kpis.diasEnRango}</b></span>
      </div>
    </div>
  );
}

function HotelBlockCard({ hotel }: { hotel: BloqueoHotel }) {
  const { kpis } = hotel;
  const multiDia = kpis.diasEnRango > 1;
  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-secondary/60 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{hotel.hotelName}</h3>
        <span className="text-xs text-muted-foreground">
          {kpis.habitacionesBloqueadas} incidencia{kpis.habitacionesBloqueadas !== 1 ? "s" : ""}
          {multiDia && <> · {kpis.nochesBloqueadas} noches bloqueadas</>}
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">ADR aplicado</div>
            <div className="text-base font-semibold num text-primary">
              {kpis.adrUtilizado !== null ? `${kpis.adrUtilizado.toFixed(2)}€` : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">% Bloqueo</div>
            <div className="text-base font-semibold num text-foreground">{kpis.porcentajeBloqueo}%</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-danger">Coste oportunidad</div>
            <div className="text-base font-semibold num text-danger">
              {kpis.perdidaFinancieraEstimada !== null ? fmtEuro(kpis.perdidaFinancieraEstimada) : "—"}
            </div>
          </div>
        </div>

        <OcupacionBar kpis={kpis} />

        {Object.keys(hotel.resumenMotivos).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(hotel.resumenMotivos).map(([motivo, count]) => (
              <span key={motivo} className="text-[11px] bg-secondary text-secondary-foreground border border-border rounded px-1.5 py-0.5">
                {motivo}: <b>{count}</b>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto border-t border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted/60">
            <tr>
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase px-4 py-2">Habitación</th>
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase px-4 py-2">Reserva</th>
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase px-4 py-2">Causa</th>
              <th className="text-left text-[10px] font-medium text-muted-foreground uppercase px-4 py-2">Motivo</th>
              <th className="text-center text-[10px] font-medium text-muted-foreground uppercase px-4 py-2">Inicio → Desbloqueo</th>
              {multiDia && <th className="text-right text-[10px] font-medium text-muted-foreground uppercase px-4 py-2">Noches en rango</th>}
            </tr>
          </thead>
          <tbody>
            {hotel.detalle.map((d, i) => (
              <Fragment key={`${hotel.hotelId}-${i}`}>
                <tr className="border-t border-border">
                  <td className="px-4 py-2 text-xs font-medium text-foreground whitespace-nowrap">Hab. {d.habitacionNum}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{d.codigoReserva}</td>
                  <td className="px-4 py-2 text-xs font-medium text-danger">{d.causaCierre}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{d.motivo}</td>
                  <td className="px-4 py-2 text-xs text-center whitespace-nowrap num">
                    {fmtFecha(d.rangoReserva.checkin)} → {fmtFecha(d.rangoReserva.checkout)}
                    <div className="text-[10px] text-muted-foreground">{d.rangoReserva.diasTotalesBloqueo} día{d.rangoReserva.diasTotalesBloqueo !== 1 ? "s" : ""} en total</div>
                  </td>
                  {multiDia && <td className="px-4 py-2 text-xs text-right num text-foreground">{d.nochesEnRango}</td>}
                </tr>
                {d.comentarioFolio && (
                  <tr className="bg-surface-muted/30">
                    <td colSpan={multiDia ? 6 : 5} className="px-4 pb-2 text-[11px] text-muted-foreground italic">💬 {d.comentarioFolio}</td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BloqueosPage() {
  const [preset, setPreset] = useState<RangePreset>("ayer");
  const [custom, setCustom] = useState(() => rangeForPreset("ayer"));
  const [report, setReport] = useState<BloqueosReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { desde, hasta } = preset === "custom" ? custom : rangeForPreset(preset);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchBloqueos(desde, hasta)
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
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
    <DashboardShell title="Bloqueos" subtitle={subtitle}>
      <RangeFilter
        preset={preset}
        custom={custom}
        onPreset={(p) => {
          setPreset(p);
          if (p !== "custom") setCustom(rangeForPreset(p));
        }}
        onCustom={setCustom}
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}

        {loading && !report && (
          <div className="text-sm text-muted-foreground p-10 text-center">Cargando informe de bloqueos…</div>
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

            {zonas.map((zona) => {
              const hoteles = porZona.get(zona)!;
              const bloqueadasZona = hoteles.reduce((a, h) => a + h.kpis.habitacionesBloqueadas, 0);
              const impactoZona = hoteles.reduce((a, h) => a + (h.kpis.perdidaFinancieraEstimada ?? 0), 0);
              return (
                <section key={zona} className="space-y-3">
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
