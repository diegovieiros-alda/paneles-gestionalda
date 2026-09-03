import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { DashboardShell } from "@/components/dashboard/shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { GaugeKpiCard } from "@/components/dashboard/gauge-kpi-card";
import { LyComparison } from "@/components/dashboard/ly-comparison";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import { DesayunosOrigenDatos } from "@/components/dashboard/desayunos-origen-datos";
import { HotelDetailHeader } from "@/components/dashboard/hotel-detail-header";
import { SectionTitle } from "@/components/dashboard/section-title";
import { SignedEuro, SignedPct } from "@/components/dashboard/signed-value";
import { IngresosGastosChart } from "@/components/dashboard/ingresos-gastos-chart";
import { PrecioCosteChart } from "@/components/dashboard/precio-coste-chart";
import { AlojadosDesayunosChart } from "@/components/dashboard/alojados-desayunos-chart";
import { DesglosePorProductoTable } from "@/components/dashboard/desglose-producto-table";
import { TurnosPanel } from "@/components/dashboard/turnos-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { DataLoading, LoadingOverlay } from "@/components/dashboard/loading-screen";
import { Button } from "@/components/ui/button";
import { fetchHotelInfo, fetchHotelDesayunos, TIPOS_DESAYUNO, type HotelDirectorio, type HotelDesayunos, type MesHotel, type FnbFields, type FacturacionFields } from "@/lib/hoteles-api";
import { exportarCsv } from "@/lib/export-csv";
import {
  ORIGEN_PRESUPUESTO_LABEL, etiqueta, etiquetaCumplimiento,
  fmtEuro, fmtNum, fmtPct, type Etiqueta,
} from "@/lib/mock-data";
import { useAjustesDesayuno } from "@/lib/ajustes-desayuno-context";
import { RANGE_PRESETS_DESAYUNOS, fmtRangoFechas } from "@/lib/date-range";
import { useRangePreset } from "@/lib/use-range-preset";
import { Download } from "lucide-react";
import { type KpiTone } from "@/components/dashboard/kpi-card";

function mesCorto(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { month: "short" });
}

// La ficha de hotel no vive dentro de DesayunosFiltrosProvider (a
// propósito: si compartiera ese contexto, montarla dispararía también el
// fetch pesado de la cadena completa solo para heredar los filtros). En su
// lugar, las tablas/listas que enlazan aquí (ver fnb-financiero-table.tsx
// y hermanas, vía hrefHotelDesayunos) pasan desde/hasta/tipo por query
// string — dos bugs reales reportados 2026-09-03: "al seleccionar un
// hotel se resetean los filtros" (fechas) y "las fichas individuales no
// muestran los mismos datos que en la lista" (tipo de desayuno/Producto,
// que esta página no tiene UI propia para cambiar — solo hereda el que
// traiga la URL).
const _FECHA_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function rangoDesdeUrl(params: URLSearchParams): { desde: string; hasta: string } | undefined {
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  if (!desde || !hasta || !_FECHA_ISO_RE.test(desde) || !_FECHA_ISO_RE.test(hasta) || desde > hasta) return undefined;
  return { desde, hasta };
}

function tiposDesdeParam(tipo: string | null): string[] | undefined {
  return tipo ? tipo.split(",").filter(Boolean) : undefined;
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

// Semáforo de Gastos vs presupuesto: al revés que Ingresos/Alojados/
// Desayunos (donde más alto es mejor) — aquí gastar POR ENCIMA del
// presupuesto es lo malo, no lo bueno, así que no se puede reutilizar
// etiquetaCumplimiento (pensada para métricas donde más es mejor).
function tonoGastos(ratio: number | null): KpiTone {
  if (ratio === null) return "neutral";
  if (ratio <= 1) return "positive";
  if (ratio <= 1.1) return "warning";
  return "negative";
}

export default function HotelDesayunosPage() {
  const { ajustes } = useAjustesDesayuno();
  const { hotelId } = useParams<{ hotelId: string }>();
  const [hotel, setHotel] = useState<HotelDirectorio | null>(null);
  const [hotelError, setHotelError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const rangoUrl = rangoDesdeUrl(searchParams);
  const tipoParam = searchParams.get("tipo");
  const { preset, custom, desde, hasta, onPreset, onCustom } = useRangePreset(rangoUrl ? "custom" : "dia", rangoUrl);
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
    fetchHotelDesayunos(hotelId, desde, hasta, tiposDesdeParam(tipoParam))
      .then((d) => { if (vivo) setData(d); })
      .catch((e) => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [hotelId, desde, hasta, tipoParam]);

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
    >
      <div className="p-6 space-y-6 max-w-[1500px] mx-auto relative">
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
          {/* Sin selector propio de Producto en esta página — solo hereda el
              filtro de la tabla de origen (ver hrefHotelDesayunos). Se avisa
              aquí para que la cifra no parezca "distinta" sin motivo visible
              (bug real reportado: "las fichas no muestran los mismos datos
              que en la lista", causado por ignorar este filtro). */}
          {tiposDesdeParam(tipoParam) && (
            <span
              className="text-[11px] text-muted-foreground bg-surface-muted border border-border rounded-full px-2.5 h-8 inline-flex items-center"
              title="Heredado de la tabla desde la que abriste este hotel"
            >
              Filtro: {tiposDesdeParam(tipoParam)!.map((t) => TIPOS_DESAYUNO.find((td) => td.value === t)?.label ?? t).join(", ")}
            </span>
          )}
          {/* Tipos que el hotel vende de verdad en el periodo (distinto del
              filtro "Producto" heredado de arriba, que puede ser un
              subconjunto) — spec: "Tipo desayuno (en caso de mezclar varios
              mostrar)". */}
          {data && data.tiposDesayuno.length > 0 && (
            <span className="text-[11px] text-muted-foreground bg-surface-muted border border-border rounded-full px-2.5 h-8 inline-flex items-center">
              Vende: {data.tiposDesayuno.map((t) => TIPOS_DESAYUNO.find((td) => td.value === t)?.label ?? t).join(", ")}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {!data && !error && <DataLoading />}
        {loading && data && <LoadingOverlay />}

        {data && (
          <>
            <SectionTitle title="Rendimiento operativo" subtitle="PMS · producción y penetración (incluye colaborador, salvo penetración)" />
            <section className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              <KpiCard
                label="Producción"
                value={fmtEuro(data.actual.produccion)}
                tone="neutral"
                delta={data.actual.produccionVarLY !== null ? data.actual.produccionVarLY * 100 : undefined}
                deltaLabel="vs LY"
                footer={`Facturado ${fmtEuro(data.actual.produccionFacturada)} (${fmtPct(data.actual.porcentajeFacturado, 0)}) · sin facturar ${fmtEuro(data.actual.produccionSinFacturar)}`}
              />
              <GaugeKpiCard
                label="Alojados"
                value={fmtNum(data.actual.alojados)}
                actual={data.actual.alojados}
                target={data.actual.alojadosPrevistos}
                targetLabel={data.actual.alojadosPrevistos !== null ? `Previsto: ${fmtNum(data.actual.alojadosPrevistos)}` : "Sin previsión (Excel)"}
                tone={data.actual.alojadosPrevistos
                  ? TONE_POR_ETIQUETA[etiqueta(data.actual.alojados / data.actual.alojadosPrevistos, 0.9, 1)]
                  : "neutral"}
                footer={<LyComparison valorLY={data.actual.alojadosLY} variacion={data.actual.alojadosVarLY} formatear={fmtNum} />}
              />
              <GaugeKpiCard
                label="Desayunos"
                value={fmtNum(data.actual.desayunos)}
                actual={data.actual.desayunos}
                target={data.actual.desayunosPrevistos}
                targetLabel={data.actual.desayunosPrevistos !== null ? `Previsto: ${fmtNum(data.actual.desayunosPrevistos)}` : "Sin previsión (Excel)"}
                tone={data.actual.desayunosPrevistos
                  ? TONE_POR_ETIQUETA[etiqueta(data.actual.desayunos / data.actual.desayunosPrevistos, 0.9, 1)]
                  : "neutral"}
                footer={<LyComparison valorLY={data.actual.desayunosLY} variacion={data.actual.desayunosVarLY} formatear={fmtNum} />}
              />
              <GaugeKpiCard
                label="Penetración"
                value={fmtPct(data.actual.penetracion)}
                actual={data.actual.penetracion}
                target={ajustes.objetivoPenetracion}
                targetLabel={`Objetivo: ${fmtPct(ajustes.objetivoPenetracion, 0)}`}
                tone={TONE_POR_ETIQUETA[etiqueta(data.actual.penetracion, ajustes.umbralPenetracion, ajustes.objetivoPenetracion)]}
                footer={<LyComparison valorLY={data.actual.penetracionLY} variacion={data.actual.penetracionVarLY} formatear={(n) => fmtPct(n)} />}
              />
              <KpiCard
                label="Precio medio"
                value={`${data.actual.precioMedio.toFixed(2)}€`}
                tone="neutral"
                delta={data.actual.precioMedioVarLY !== null ? data.actual.precioMedioVarLY * 100 : undefined}
                deltaLabel="vs LY"
              />
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
              <GaugeKpiCard
                label="Ingresos"
                value={fmtEuro(data.actual.ingresos)}
                actual={data.actual.ingresos}
                target={data.actual.presupuestoIngresos > 0 ? data.actual.presupuestoIngresos : null}
                targetLabel={
                  data.actual.presupuestoMotivo === "rango_no_es_mes_natural"
                    ? "Elige un mes completo"
                    : data.actual.presupuestoIngresos > 0
                    ? `Presupuesto: ${fmtEuro(data.actual.presupuestoIngresos)}${data.actual.presupuestoOrigen ? ` (${ORIGEN_PRESUPUESTO_LABEL[data.actual.presupuestoOrigen]})` : ""}`
                    : "Sin presupuesto confirmado"
                }
                tone={(() => {
                  const e = etiquetaCumplimiento(data.actual.cumplimientoIngresos);
                  return e ? TONE_POR_ETIQUETA[e] : "neutral";
                })()}
                footer={
                  <span className="flex flex-col gap-0.5 items-start">
                    {/* La fuente que NO ganó, para comparar — pedido explícito 2026-09-02 */}
                    {((data.actual.presupuestoOrigen === "odoo" && data.actual.presupuestoIngresosExcel !== null) ||
                      (data.actual.presupuestoOrigen === "excel" && data.actual.presupuestoIngresosOdoo !== null)) && (
                      <span>
                        {data.actual.presupuestoOrigen === "odoo"
                          ? `Excel: ${fmtEuro(data.actual.presupuestoIngresosExcel!)}`
                          : `Odoo: ${fmtEuro(data.actual.presupuestoIngresosOdoo!)}`}
                      </span>
                    )}
                    <LyComparison valorLY={data.actual.ingresosLY} variacion={data.actual.ingresosVarLY} formatear={fmtEuro} />
                  </span>
                }
              />
              <GaugeKpiCard
                label="Gastos"
                value={fmtEuro(data.actual.gastos)}
                actual={data.actual.gastos}
                target={data.actual.presupuestoGastos > 0 ? data.actual.presupuestoGastos : null}
                targetLabel={data.actual.presupuestoGastos > 0 ? `Presupuesto: ${fmtEuro(data.actual.presupuestoGastos)}` : "Sin presupuesto confirmado"}
                tone={tonoGastos(data.actual.cumplimientoGastos)}
                footer={<LyComparison valorLY={data.actual.gastosLY} variacion={data.actual.gastosVarLY} formatear={fmtEuro} positivoEsBueno={false} />}
              />
              <KpiCard
                label="Margen bruto"
                value={<SignedPct value={data.actual.margenBruto} />}
                tone="neutral"
                delta={data.actual.margenBrutoVarLY !== null ? data.actual.margenBrutoVarLY * 100 : undefined}
                deltaLabel="vs LY"
              />
              <KpiCard
                label="Precio medio venta"
                value={`${data.actual.precioMedioVenta.toFixed(2)}€`}
                tone="neutral"
                delta={data.actual.precioMedioVentaVarLY !== null ? data.actual.precioMedioVentaVarLY * 100 : undefined}
                deltaLabel="vs LY"
              />
              <KpiCard
                label="Coste medio"
                value={`${data.actual.costeMedioGasto.toFixed(2)}€`}
                tone="neutral"
                delta={data.actual.costeMedioGastoVarLY !== null ? data.actual.costeMedioGastoVarLY * 100 : undefined}
                deltaLabel="vs LY"
                positivoEsBueno={false}
              />
              <KpiCard
                label="Resultado F&B"
                value={<SignedEuro value={data.actual.resultadoFB} />}
                tone="neutral"
                delta={data.actual.resultadoFBVarLY !== null ? data.actual.resultadoFBVarLY * 100 : undefined}
                deltaLabel="vs LY"
              />
            </section>

            {data.serieMensual.length > 0 && (
              <div className="grid gap-6 lg:grid-cols-2">
                <IngresosGastosChart serie={data.serieMensual} />
                <PrecioCosteChart serie={data.serieMensual} />
                <AlojadosDesayunosChart serie={data.serieMensual} />
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

            <SectionTitle title="Desglose por producto" />
            <DesglosePorProductoTable desglose={data.desglosePorProducto} />

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
