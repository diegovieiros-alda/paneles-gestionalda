import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Ban, BedDouble, ChevronDown, Coffee, MapPin, Building2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { DashboardShell } from "@/components/dashboard/shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { HotelBlockCard, OcupacionBar } from "@/components/dashboard/hotel-block-card";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { fetchHotelInfo, fetchHotelDesayunos, type HotelDirectorio, type HotelDesayunos } from "@/lib/hoteles-api";
import { fetchHotelBloqueos, type HotelBloqueosReport } from "@/lib/bloqueos-api";
import { fmtEuro, fmtNum, fmtPct } from "@/lib/mock-data";
import { rangeForPreset, type RangePreset } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

function mesCorto(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { month: "short" });
}

function useRango(inicial: RangePreset) {
  const [preset, setPreset] = useState<RangePreset>(inicial);
  const [custom, setCustom] = useState(() => rangeForPreset(inicial === "custom" ? "30d" : inicial));
  const { desde, hasta } = preset === "custom" ? custom : rangeForPreset(preset);
  return {
    desde, hasta, preset, custom,
    onPreset: (p: RangePreset) => {
      setPreset(p);
      if (p !== "custom") setCustom(rangeForPreset(p));
    },
    onCustom: setCustom,
  };
}

function CollapsibleSection({
  title, subtitle, icon: Icon, children,
}: {
  title: string;
  subtitle?: string;
  icon: typeof Coffee;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-accent/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-foreground">{title}</div>
            {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border p-5">{children}</div>}
    </section>
  );
}

function DesayunosPanel({ hotelId }: { hotelId: string }) {
  const rango = useRango("mes");
  const [data, setData] = useState<HotelDesayunos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHotelDesayunos(hotelId, rango.desde, rango.hasta).then(setData).catch((e) => setError(e.message));
  }, [hotelId, rango.desde, rango.hasta]);

  const chartData = data?.serieMensual.map((m) => ({ mes: mesCorto(m.mes), produccion: m.produccion })) ?? [];

  return (
    <div className="space-y-6">
      <RangeFilter preset={rango.preset} custom={rango.custom} onPreset={rango.onPreset} onCustom={rango.onCustom} compact />

      {error && <p className="text-sm text-danger">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {data && (
        <>
          <section className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            <KpiCard label="Producción" value={fmtEuro(data.actual.produccion)} tone="neutral" />
            <KpiCard label="Alojados" value={fmtNum(data.actual.alojados)} tone="neutral" />
            <KpiCard label="Desayunos" value={fmtNum(data.actual.desayunos)} tone="neutral" />
            <KpiCard label="Penetración" value={fmtPct(data.actual.penetracion)} tone={data.actual.penetracion >= 0.55 ? "positive" : "warning"} />
            <KpiCard label="Precio medio" value={`${data.actual.precioMedio.toFixed(2)}€`} tone="neutral" />
          </section>

          <section>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Evolución mensual · últimos 12 meses</h3>
            <div className="h-64 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={fmtEuro} width={80} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number) => [fmtEuro(v), "Producción"]}
                  />
                  <Bar dataKey="produccion" name="Producción" fill="var(--color-primary)" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/60">
                <tr>
                  {["Mes", "Alojados", "Desayunos", "Penetración", "Producción", "Precio medio"].map((h) => (
                    <th key={h} className="text-[11px] font-medium text-muted-foreground uppercase px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.serieMensual.map((m) => (
                  <tr key={m.mes} className="border-t border-border">
                    <td className="px-4 py-2.5 font-medium text-foreground capitalize">{mesCorto(m.mes)}</td>
                    <td className="px-4 py-2.5 num">{fmtNum(m.alojados)}</td>
                    <td className="px-4 py-2.5 num">{fmtNum(m.desayunos)}</td>
                    <td className="px-4 py-2.5 num">{fmtPct(m.penetracion)}</td>
                    <td className="px-4 py-2.5 num">{fmtEuro(m.produccion)}</td>
                    <td className="px-4 py-2.5 num text-muted-foreground">{m.precioMedio.toFixed(2)}€</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function OcupacionPanel({ hotelId }: { hotelId: string }) {
  const rango = useRango("30d");
  const [data, setData] = useState<HotelBloqueosReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHotelBloqueos(hotelId, rango.desde, rango.hasta).then(setData).catch((e) => setError(e.message));
  }, [hotelId, rango.desde, rango.hasta]);

  return (
    <div className="space-y-4">
      <RangeFilter preset={rango.preset} custom={rango.custom} onPreset={rango.onPreset} onCustom={rango.onCustom} compact />

      {error && <p className="text-sm text-danger">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {data && !data.hotel && (
        <p className="text-sm text-muted-foreground">Sin datos de ocupación en el periodo seleccionado.</p>
      )}

      {data?.hotel && (
        <>
          <section className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard label="Inventario" value={fmtNum(data.hotel.kpis.totalInventario)} tone="neutral" />
            <KpiCard label="Ocupación" value={`${data.hotel.kpis.porcentajeOcupacion}%`} tone="positive" />
            <KpiCard label="Libres" value={`${data.hotel.kpis.porcentajeLibre}%`} tone="neutral" />
            <KpiCard
              label="ADR aplicado"
              value={data.hotel.kpis.adrUtilizado !== null ? `${data.hotel.kpis.adrUtilizado.toFixed(2)}€` : "—"}
              tone="neutral"
            />
          </section>
          <OcupacionBar kpis={data.hotel.kpis} />
        </>
      )}
    </div>
  );
}

function BloqueosPanel({ hotelId }: { hotelId: string }) {
  const rango = useRango("30d");
  const [data, setData] = useState<HotelBloqueosReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHotelBloqueos(hotelId, rango.desde, rango.hasta).then(setData).catch((e) => setError(e.message));
  }, [hotelId, rango.desde, rango.hasta]);

  return (
    <div className="space-y-4">
      <RangeFilter preset={rango.preset} custom={rango.custom} onPreset={rango.onPreset} onCustom={rango.onCustom} compact />

      {error && <p className="text-sm text-danger">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {data && !data.hotel && (
        <p className="text-sm text-muted-foreground">Sin habitaciones bloqueadas en el periodo seleccionado.</p>
      )}
      {data?.hotel && <HotelBlockCard hotel={data.hotel} />}
    </div>
  );
}

export default function HotelDetail() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const { usuario } = useAuth();
  const [hotel, setHotel] = useState<HotelDirectorio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hotelId) return;
    setLoading(true);
    setError(null);
    fetchHotelInfo(hotelId)
      .then(setHotel)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [hotelId]);

  if (loading) {
    return (
      <DashboardShell title="Cargando…">
        <div className="p-10 text-center text-sm text-muted-foreground">Cargando hotel…</div>
      </DashboardShell>
    );
  }

  if (error || !hotel || !hotelId) {
    return (
      <DashboardShell title="Hotel no encontrado">
        <div className="p-10 text-center text-muted-foreground">
          {error || "Ese hotel no existe."} <Link to="/hoteles" className="text-primary underline">Volver</Link>
        </div>
      </DashboardShell>
    );
  }

  const tieneDesayunos = usuario?.dashboards.includes("desayunos");
  const tieneBloqueos = usuario?.dashboards.includes("bloqueos");

  return (
    <DashboardShell title={hotel.name} subtitle={`${hotel.zona} · ${hotel.sociedad}`}>
      <div className="p-6 space-y-6 max-w-[1500px] mx-auto">
        <div className="flex items-center gap-3">
          <Link to="/hoteles" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a Hoteles
          </Link>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-soft">
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Hotel · {hotel.id}</div>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">{hotel.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {hotel.zona}</span>
              <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {hotel.sociedad}</span>
            </div>
          </div>
        </div>

        {tieneBloqueos && (
          <CollapsibleSection title="Ocupación" subtitle="Habitaciones ocupadas, libres y ADR aplicado" icon={BedDouble}>
            <OcupacionPanel hotelId={hotelId} />
          </CollapsibleSection>
        )}

        {tieneDesayunos && (
          <CollapsibleSection title="Desayunos" subtitle="Producción, penetración y evolución mensual" icon={Coffee}>
            <DesayunosPanel hotelId={hotelId} />
          </CollapsibleSection>
        )}

        {tieneBloqueos && (
          <CollapsibleSection title="Bloqueos" subtitle="Habitaciones fuera de servicio" icon={Ban}>
            <BloqueosPanel hotelId={hotelId} />
          </CollapsibleSection>
        )}

        {!tieneDesayunos && !tieneBloqueos && (
          <p className="text-sm text-muted-foreground text-center py-10">
            Tu rol no tiene acceso a ningún dato adicional de este hotel.
          </p>
        )}
      </div>
    </DashboardShell>
  );
}
