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
import { SectionTitle } from "@/components/dashboard/section-title";
import { SignedEuro, SignedPct } from "@/components/dashboard/signed-value";
import { IngresosGastosChart } from "@/components/dashboard/ingresos-gastos-chart";
import { PrecioCosteChart } from "@/components/dashboard/precio-coste-chart";
import { VendedoresPanel } from "@/components/dashboard/vendedores-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { fetchHotelInfo, fetchHotelDesayunos, type HotelDirectorio, type HotelDesayunos } from "@/lib/hoteles-api";
import { exportarCsv } from "@/lib/export-csv";
import {
  ETIQUETA_BADGE_CLASS, ETIQUETA_LABEL, etiqueta, etiquetaCumplimiento,
  fmtEuro, fmtNum, fmtPct, TARGET_PENETRACION, UMBRAL_PENETRACION, type Etiqueta,
} from "@/lib/mock-data";
import { rangeForPreset, type RangePreset } from "@/lib/date-range";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { type KpiTone } from "@/components/dashboard/kpi-card";

function mesCorto(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { month: "short" });
}

// Mismo semáforo de 3 niveles que "¿Dónde actuar hoy?" (rojo/naranja/verde,
// ver etiqueta() en mock-data) — antes esta ficha usaba un umbral propio de
// solo 2 niveles (>=55% positive, si no warning), que no distinguía un
// hotel crítico (<38%) de uno en seguimiento (38-55%).
const TONE_POR_ETIQUETA: Record<Etiqueta, KpiTone> = {
  verde: "positive",
  naranja: "warning",
  rojo: "negative",
};

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
            <SectionTitle title="Rendimiento operativo" subtitle="PMS · producción y penetración (incluye colaborador, salvo penetración)" />
            <section className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              <KpiCard label="Producción" value={fmtEuro(data.actual.produccion)} tone="neutral" />
              <KpiCard label="Alojados" value={fmtNum(data.actual.alojados)} tone="neutral" />
              <KpiCard label="Desayunos" value={fmtNum(data.actual.desayunos)} tone="neutral" />
              <KpiCard
                label="Penetración"
                value={fmtPct(data.actual.penetracion)}
                tone={TONE_POR_ETIQUETA[etiqueta(data.actual.penetracion, UMBRAL_PENETRACION, TARGET_PENETRACION)]}
              />
              <KpiCard label="Precio medio" value={`${data.actual.precioMedio.toFixed(2)}€`} tone="neutral" />
            </section>

            <div className="h-64">
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

            <SectionTitle title="Financiero F&B" subtitle="Contabilidad · ingresos, gastos, margen y presupuesto (excluye colaborador)" />
            <section className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Ingresos" value={fmtEuro(data.actual.ingresos)} tone="neutral" />
              <KpiCard label="Gastos" value={fmtEuro(data.actual.gastos)} tone="neutral" />
              <KpiCard label="Margen bruto" value={<SignedPct value={data.actual.margenBruto} />} tone="neutral" />
              <KpiCard label="Precio medio venta" value={`${data.actual.precioMedioVenta.toFixed(2)}€`} tone="neutral" />
              <KpiCard label="Resultado F&B" value={<SignedEuro value={data.actual.resultadoFB} />} tone="neutral" />
              <KpiCard
                label="Presupuesto (ingresos)"
                value={data.actual.presupuestoIngresos > 0 ? fmtEuro(data.actual.presupuestoIngresos) : "—"}
                tone="neutral"
                footer={
                  data.actual.presupuestoMotivo === "rango_no_es_mes_natural"
                    ? "Elige un mes completo para ver el cumplimiento"
                    : data.actual.cumplimientoIngresos !== null
                      ? (() => {
                          const e = etiquetaCumplimiento(data.actual.cumplimientoIngresos);
                          return e ? (
                            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", ETIQUETA_BADGE_CLASS[e])}>
                              {fmtPct(data.actual.cumplimientoIngresos, 0)} · {ETIQUETA_LABEL[e]}
                            </span>
                          ) : undefined;
                        })()
                      : "Sin presupuesto confirmado"
                }
              />
            </section>

            {data.serieMensual.length > 0 && (
              <div className="grid gap-6 lg:grid-cols-2">
                <IngresosGastosChart serie={data.serieMensual} />
                <PrecioCosteChart serie={data.serieMensual} />
              </div>
            )}

            <section className="overflow-x-auto">
              <div className="flex justify-end mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    exportarCsv(
                      `desayunos-${hotel?.name ?? hotelId}-${new Date().toISOString().slice(0, 10)}`,
                      [
                        "Mes", "Alojados", "Desayunos", "Penetración %", "Producción", "Precio medio",
                        "Ingresos", "Gastos", "Margen bruto %", "Presupuesto ingresos", "Cumplimiento %", "Resultado F&B",
                      ],
                      data.serieMensual.map((m) => [
                        mesCorto(m.mes), m.alojados, m.desayunos, (m.penetracion * 100).toFixed(1), m.produccion.toFixed(2), m.precioMedio.toFixed(2),
                        m.ingresos.toFixed(2), m.gastos.toFixed(2), (m.margenBruto * 100).toFixed(1),
                        m.presupuestoIngresos > 0 ? m.presupuestoIngresos.toFixed(2) : "",
                        m.cumplimientoIngresos !== null ? (m.cumplimientoIngresos * 100).toFixed(1) : "",
                        m.resultadoFB.toFixed(2),
                      ])
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5" /> Exportar
                </Button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-surface-muted/60">
                  <tr>
                    {["Mes", "Alojados", "Desayunos", "Penetración", "Producción", "Precio medio", "Ingresos", "Gastos", "Margen bruto", "Resultado F&B"].map((h) => (
                      <th key={h} className="text-[11px] font-medium text-muted-foreground uppercase px-4 py-3 text-left whitespace-nowrap">{h}</th>
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
                      <td className="px-4 py-2.5 num">{fmtEuro(m.ingresos)}</td>
                      <td className="px-4 py-2.5 num">{fmtEuro(m.gastos)}</td>
                      <td className="px-4 py-2.5 num"><SignedPct value={m.margenBruto} /></td>
                      <td className="px-4 py-2.5 num"><SignedEuro value={m.resultadoFB} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <SectionTitle title="Vendedores" />
            <VendedoresPanel vendedores={data.vendedores ?? []} scope={hotel?.name ?? "este hotel"} />

            <SectionTitle title="Metodología" />
            <DesayunosOrigenDatos />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
