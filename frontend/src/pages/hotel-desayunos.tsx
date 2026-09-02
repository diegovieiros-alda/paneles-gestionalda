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
import { TurnosPanel } from "@/components/dashboard/turnos-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { DataLoading } from "@/components/dashboard/loading-screen";
import { Button } from "@/components/ui/button";
import { fetchHotelInfo, fetchHotelDesayunos, type HotelDirectorio, type HotelDesayunos, type MesHotel, type FnbFields, type FacturacionFields } from "@/lib/hoteles-api";
import { exportarCsv } from "@/lib/export-csv";
import {
  ETIQUETA_BADGE_CLASS, ETIQUETA_LABEL, etiqueta, etiquetaCumplimiento,
  fmtEuro, fmtNum, fmtPct, type Etiqueta,
} from "@/lib/mock-data";
import { useAjustesDesayuno } from "@/lib/ajustes-desayuno-context";
import { RANGE_PRESETS_DESAYUNOS, fmtRangoFechas } from "@/lib/date-range";
import { useRangePreset } from "@/lib/use-range-preset";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { type KpiTone } from "@/components/dashboard/kpi-card";

function mesCorto(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { month: "short" });
}

type MesFila = MesHotel & FnbFields & FacturacionFields;
type Col = { label: string; value: (m: MesFila) => React.ReactNode; csv: (m: MesFila) => string | number };

// Tabla mensual reutilizable: misma estructura (mes + N columnas + exportar),
// solo cambian las columnas — evita triplicar el markup para Producción,
// Desayunos facturados y Financiero F&B (antes era una única tabla mezclando
// las tres cosas).
function TablaMensual({
  title, subtitle, cols, serie, exportBase,
}: { title: string; subtitle?: string; cols: Col[]; serie: MesFila[]; exportBase: string }) {
  return (
    <section className="overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportarCsv(
              exportBase,
              ["Mes", ...cols.map((c) => c.label)],
              serie.map((m) => [mesCorto(m.mes), ...cols.map((c) => c.csv(m))])
            )
          }
        >
          <Download className="h-3.5 w-3.5" /> Exportar
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-surface-muted/60">
          <tr>
            <th className="text-[11px] font-medium text-muted-foreground uppercase px-4 py-3 text-left whitespace-nowrap">Mes</th>
            {cols.map((c) => (
              <th key={c.label} className="text-[11px] font-medium text-muted-foreground uppercase px-4 py-3 text-center whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {serie.map((m) => (
            <tr key={m.mes} className="border-t border-border">
              <td className="px-4 py-2.5 font-medium text-foreground capitalize">{mesCorto(m.mes)}</td>
              {cols.map((c) => (
                <td key={c.label} className="px-4 py-2.5 num text-center">{c.value(m)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
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
  const { ajustes } = useAjustesDesayuno();
  const { hotelId } = useParams<{ hotelId: string }>();
  const [hotel, setHotel] = useState<HotelDirectorio | null>(null);
  const [hotelError, setHotelError] = useState<string | null>(null);
  const { preset, custom, desde, hasta, onPreset, onCustom } = useRangePreset("dia");
  const [data, setData] = useState<HotelDesayunos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hotelId) return;
    fetchHotelInfo(hotelId).then(setHotel).catch((e) => setHotelError(e.message));
  }, [hotelId]);

  useEffect(() => {
    if (!hotelId) return;
    let vivo = true;
    setLoading(true);
    fetchHotelDesayunos(hotelId, desde, hasta)
      .then((d) => { if (vivo) setData(d); })
      .catch((e) => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
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
    <DashboardShell
      title={hotel?.name ?? "Cargando…"}
      subtitle={hotel ? `${hotel.zona} · ${hotel.sociedad}` : undefined}
      origenDatos={hotel?.origenDatos}
      periodo={fmtRangoFechas(desde, hasta)}
      cargando={loading && !!data}
    >
      <div className="p-6 space-y-6 max-w-[1500px] mx-auto">
        {!hotel && !hotelError && (
          <>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-28 rounded-xl" />
          </>
        )}
        {hotel && <HotelDetailHeader hotel={hotel} backTo="/desayunos" backLabel="Volver a Desayunos" />}

        <div className="flex flex-wrap items-center gap-2">
          <RangeFilter preset={preset} custom={custom} onPreset={onPreset} onCustom={onCustom} compact presets={RANGE_PRESETS_DESAYUNOS} />
          <DataSourceBadge origen={data?.origenDatos} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {!data && !error && <DataLoading />}

        {data && (
          <>
            <SectionTitle title="Rendimiento operativo" subtitle="PMS · producción y penetración (incluye colaborador, salvo penetración)" />
            <section className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              <KpiCard
                label="Producción"
                value={fmtEuro(data.actual.produccion)}
                tone="neutral"
                footer={`Facturado ${fmtEuro(data.actual.produccionFacturada)} (${fmtPct(data.actual.porcentajeFacturado, 0)}) · sin facturar ${fmtEuro(data.actual.produccionSinFacturar)}`}
              />
              <KpiCard label="Alojados" value={fmtNum(data.actual.alojados)} tone="neutral" />
              <KpiCard label="Desayunos" value={fmtNum(data.actual.desayunos)} tone="neutral" />
              <KpiCard
                label="Penetración"
                value={fmtPct(data.actual.penetracion)}
                tone={TONE_POR_ETIQUETA[etiqueta(data.actual.penetracion, ajustes.umbralPenetracion, ajustes.objetivoPenetracion)]}
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

            <TablaMensual
              title="Producción por mes"
              subtitle="PMS · incluye colaborador, salvo penetración"
              exportBase={`desayunos-produccion-${hotel?.name ?? hotelId}-${new Date().toISOString().slice(0, 10)}`}
              serie={data.serieMensual}
              cols={[
                { label: "Alojados", value: (m) => fmtNum(m.alojados), csv: (m) => m.alojados },
                { label: "Desayunos", value: (m) => fmtNum(m.desayunos), csv: (m) => m.desayunos },
                { label: "Penetración", value: (m) => fmtPct(m.penetracion), csv: (m) => (m.penetracion * 100).toFixed(1) },
                { label: "Producción", value: (m) => fmtEuro(m.produccion), csv: (m) => m.produccion.toFixed(2) },
                { label: "Precio medio", value: (m) => `${m.precioMedio.toFixed(2)}€`, csv: (m) => m.precioMedio.toFixed(2) },
              ]}
            />

            <TablaMensual
              title="Desayunos facturados por mes"
              subtitle="Qué parte de la producción ya tiene factura"
              exportBase={`desayunos-facturados-${hotel?.name ?? hotelId}-${new Date().toISOString().slice(0, 10)}`}
              serie={data.serieMensual}
              cols={[
                { label: "Desayunos facturados", value: (m) => fmtNum(m.desayunosFacturados), csv: (m) => m.desayunosFacturados },
                { label: "Sin facturar", value: (m) => fmtNum(m.desayunosSinFacturar), csv: (m) => m.desayunosSinFacturar },
                { label: "Producción facturada", value: (m) => fmtEuro(m.produccionFacturada), csv: (m) => m.produccionFacturada.toFixed(2) },
                { label: "Sin facturar", value: (m) => fmtEuro(m.produccionSinFacturar), csv: (m) => m.produccionSinFacturar.toFixed(2) },
                { label: "% Facturado", value: (m) => fmtPct(m.porcentajeFacturado, 0), csv: (m) => (m.porcentajeFacturado * 100).toFixed(1) },
              ]}
            />

            <TablaMensual
              title="Financiero F&B por mes"
              subtitle="Contabilidad · excluye colaborador"
              exportBase={`desayunos-financiero-${hotel?.name ?? hotelId}-${new Date().toISOString().slice(0, 10)}`}
              serie={data.serieMensual}
              cols={[
                { label: "Ingresos", value: (m) => fmtEuro(m.ingresos), csv: (m) => m.ingresos.toFixed(2) },
                { label: "Gastos", value: (m) => fmtEuro(m.gastos), csv: (m) => m.gastos.toFixed(2) },
                { label: "Margen bruto", value: (m) => <SignedPct value={m.margenBruto} />, csv: (m) => (m.margenBruto * 100).toFixed(1) },
                {
                  label: "Presupuesto ingresos",
                  value: (m) => (m.presupuestoIngresos > 0 ? fmtEuro(m.presupuestoIngresos) : "—"),
                  csv: (m) => (m.presupuestoIngresos > 0 ? m.presupuestoIngresos.toFixed(2) : ""),
                },
                {
                  label: "Cumplimiento",
                  value: (m) => (m.cumplimientoIngresos !== null ? fmtPct(m.cumplimientoIngresos, 0) : "—"),
                  csv: (m) => (m.cumplimientoIngresos !== null ? (m.cumplimientoIngresos * 100).toFixed(1) : ""),
                },
                { label: "Resultado F&B", value: (m) => <SignedEuro value={m.resultadoFB} />, csv: (m) => m.resultadoFB.toFixed(2) },
              ]}
            />

            <SectionTitle title="Turnos" />
            <TurnosPanel turnos={data.turnos ?? []} scope={hotel?.name ?? "este hotel"} />

            <SectionTitle title="Metodología" />
            <DesayunosOrigenDatos />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
