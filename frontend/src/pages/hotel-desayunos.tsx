import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { DashboardShell } from "@/components/dashboard/shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import { DesayunosOrigenDatos } from "@/components/dashboard/desayunos-origen-datos";
import { HotelDetailHeader } from "@/components/dashboard/hotel-detail-header";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHotelInfo, fetchHotelDesayunos, type HotelDirectorio, type HotelDesayunos } from "@/lib/hoteles-api";
import { fmtEuro, fmtNum, fmtPct } from "@/lib/mock-data";
import { rangeForPreset, type RangePreset } from "@/lib/date-range";

function mesCorto(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { month: "short" });
}

export default function HotelDesayunosPage() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const [hotel, setHotel] = useState<HotelDirectorio | null>(null);
  const [hotelError, setHotelError] = useState<string | null>(null);
  const [preset, setPreset] = useState<RangePreset>("mes");
  const [custom, setCustom] = useState(() => rangeForPreset("mes"));
  const [data, setData] = useState<HotelDesayunos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { desde, hasta } = preset === "custom" ? custom : rangeForPreset(preset);

  useEffect(() => {
    if (!hotelId) return;
    fetchHotelInfo(hotelId).then(setHotel).catch((e) => setHotelError(e.message));
  }, [hotelId]);

  useEffect(() => {
    if (!hotelId) return;
    fetchHotelDesayunos(hotelId, desde, hasta).then(setData).catch((e) => setError(e.message));
  }, [hotelId, desde, hasta]);

  if (hotelError || !hotelId) {
    return (
      <DashboardShell title="Hotel no encontrado">
        <div className="p-10 text-center text-muted-foreground">{hotelError || "Ese hotel no existe."}</div>
      </DashboardShell>
    );
  }

  const chartData = data?.serieMensual.map((m) => ({ mes: mesCorto(m.mes), produccion: m.produccion })) ?? [];

  return (
    <DashboardShell title={hotel?.name ?? "Cargando…"} subtitle={hotel ? `${hotel.zona} · ${hotel.sociedad}` : undefined} origenDatos={hotel?.origenDatos}>
      <div className="p-6 space-y-6 max-w-[1500px] mx-auto">
        {!hotel && !hotelError && (
          <>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-28 rounded-xl" />
          </>
        )}
        {hotel && <HotelDetailHeader hotel={hotel} backTo="/desayunos" backLabel="Volver a Desayunos" />}

        <div className="flex flex-wrap items-center gap-2">
          <RangeFilter preset={preset} custom={custom} onPreset={(p) => { setPreset(p); if (p !== "custom") setCustom(rangeForPreset(p)); }} onCustom={setCustom} compact />
          <DataSourceBadge origen={data?.origenDatos} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {!data && !error && (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        )}

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
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">F&amp;B · contable (excluye colaborador)</h3>
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5 mt-3">
                <KpiCard label="Ingresos" value={fmtEuro(data.actual.ingresos)} tone="neutral" />
                <KpiCard label="Gastos" value={fmtEuro(data.actual.gastos)} tone="neutral" />
                <KpiCard label="Margen bruto" value={fmtPct(data.actual.margenBruto, 0)} tone={data.actual.margenBruto >= 0.5 ? "positive" : "warning"} />
                <KpiCard label="Precio medio venta" value={`${data.actual.precioMedioVenta.toFixed(2)}€`} tone="neutral" />
                <KpiCard label="Resultado F&B" value={fmtEuro(data.actual.resultadoFB)} tone="neutral" />
              </div>
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
                      formatter={(v: number, name: string) => [fmtEuro(v), name]}
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

            <DesayunosOrigenDatos />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
