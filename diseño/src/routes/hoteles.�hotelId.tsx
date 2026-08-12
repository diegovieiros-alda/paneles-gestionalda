import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, MapPin, User, Building2, TrendingUp, TrendingDown } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { getHotel, meses, fmtEuro, fmtNum, fmtPct } from "@/lib/mock-data";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, BarChart, Bar,
} from "recharts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/hoteles/$hotelId")({
  head: ({ params }) => ({
    meta: [
      { title: `Hotel ${params.hotelId} · Breakfast OS` },
      { name: "description", content: `Detalle del servicio de desayunos del hotel ${params.hotelId}: evolución mensual, comparativa LY y presupuesto, precio, penetración, coste y margen.` },
    ],
  }),
  loader: ({ params }) => {
    const hotel = getHotel(params.hotelId);
    if (!hotel) throw notFound();
    return { hotel };
  },
  component: HotelDetail,
  notFoundComponent: () => (
    <DashboardShell title="Hotel no encontrado">
      <div className="p-10 text-center text-muted-foreground">
        Ese hotel no existe. <Link to="/" className="text-primary underline">Volver</Link>
      </div>
    </DashboardShell>
  ),
});

function HotelDetail() {
  const { hotel } = Route.useLoaderData();

  const monthly = meses.map((m, i) => ({
    mes: m,
    actual: hotel.trend[i],
    ly: Math.round(hotel.trend[i] * (0.85 + (i % 3) * 0.04)),
    presupuesto: Math.round(hotel.trend[i] * (0.95 + (i % 4) * 0.02)),
  }));

  const precioTrend = meses.map((m, i) => ({
    mes: m,
    precio: +(hotel.precioMedio * (0.95 + Math.sin(i / 2) * 0.05)).toFixed(2),
    coste: +(hotel.coste * (0.95 + Math.cos(i / 2) * 0.05)).toFixed(2),
  }));

  const penetracionTrend = meses.map((m, i) => ({
    mes: m,
    pen: +(hotel.penetracion * 100 * (0.9 + Math.sin(i / 3) * 0.1)).toFixed(1),
  }));

  const statusColorMap: Record<string, string> = {
    ok: "text-success bg-success/10 border-success/20",
    warn: "text-warning bg-warning/10 border-warning/20",
    alert: "text-danger bg-danger/10 border-danger/20",
  };
  const statusColor = statusColorMap[hotel.status];

  return (
    <DashboardShell title={hotel.name} subtitle={`${hotel.zone} · ${hotel.regional} · ${hotel.sociedad}`}>
      <div className="p-6 space-y-6 max-w-[1500px] mx-auto">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver al dashboard
          </Link>
        </div>

        {/* Header card */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-soft">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Hotel · {hotel.id}</div>
              <h1 className="mt-1 text-2xl font-semibold text-foreground">{hotel.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {hotel.ciudad}, {hotel.provincia}</span>
                <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" /> {hotel.regional}</span>
                <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {hotel.submarca} · {hotel.tipo}</span>
              </div>
            </div>
            <div className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border", statusColor)}>
              {hotel.status === "ok" ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {hotel.status === "ok" ? "En objetivo" : hotel.status === "warn" ? "Requiere seguimiento" : "Requiere atención"}
            </div>
          </div>
        </div>

        {/* Resumen KPIs */}
        <section className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Producción" value={fmtEuro(hotel.produccion)} delta={hotel.variacion} deltaLabel="vs LY" tone={hotel.variacion >= 0 ? "positive" : "negative"} trend={hotel.trend} />
          <KpiCard label="Desayunos" value={fmtNum(hotel.desayunos)} tone="neutral" trend={hotel.trend.map((v: number) => v / hotel.precioMedio)} />
          <KpiCard label="Penetración" value={fmtPct(hotel.penetracion)} tone={hotel.penetracion >= 0.55 ? "positive" : "warning"} />
          <KpiCard label="Precio medio" value={`${hotel.precioMedio.toFixed(2)}€`} tone="neutral" />
          <KpiCard label="Coste" value={`${hotel.coste.toFixed(2)}€`} tone="neutral" />
          <KpiCard label="Margen" value={fmtPct(hotel.margen)} tone={hotel.margen >= 0.5 ? "positive" : "warning"} />
        </section>

        {/* Evolution */}
        <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-foreground">Evolución mensual · Actual vs LY vs Presupuesto</h2>
          <div className="h-72 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={fmtEuro} width={80} />
                <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12 }} formatter={(v: number) => fmtEuro(v)} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
                <Line dataKey="actual" name="Actual" stroke="var(--color-primary)" strokeWidth={2.2} dot={{ r: 3 }} />
                <Line dataKey="ly" name="Año anterior" stroke="var(--color-chart-2)" strokeWidth={1.8} dot={false} />
                <Line dataKey="presupuesto" name="Presupuesto" stroke="var(--color-chart-4)" strokeWidth={1.8} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Two charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
            <h2 className="text-sm font-semibold text-foreground">Precio medio vs Coste</h2>
            <div className="h-56 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={precioTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12 }} />
                  <Area dataKey="precio" name="Precio" stroke="var(--color-primary)" fill="url(#pr)" strokeWidth={2} />
                  <Line dataKey="coste" name="Coste" stroke="var(--color-chart-5)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
            <h2 className="text-sm font-semibold text-foreground">Penetración mensual (%)</h2>
            <div className="h-56 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={penetracionTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 12 }} formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="pen" name="Penetración" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Histórico table */}
        <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Histórico mensual</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/60">
                <tr>
                  {["Mes", "Actual", "LY", "Var.", "Presupuesto", "Var. Ppto"].map((h) => (
                    <th key={h} className="text-[11px] font-medium text-muted-foreground uppercase px-4 py-3 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => {
                  const vLy = ((m.actual - m.ly) / m.ly) * 100;
                  const vPr = ((m.actual - m.presupuesto) / m.presupuesto) * 100;
                  return (
                    <tr key={m.mes} className="border-t border-border">
                      <td className="px-4 py-2.5 font-medium text-foreground">{m.mes}</td>
                      <td className="px-4 py-2.5 num">{fmtEuro(m.actual)}</td>
                      <td className="px-4 py-2.5 num text-muted-foreground">{fmtEuro(m.ly)}</td>
                      <td className={cn("px-4 py-2.5 num", vLy >= 0 ? "text-success" : "text-danger")}>
                        {vLy >= 0 ? "+" : ""}{vLy.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5 num text-muted-foreground">{fmtEuro(m.presupuesto)}</td>
                      <td className={cn("px-4 py-2.5 num", vPr >= 0 ? "text-success" : "text-danger")}>
                        {vPr >= 0 ? "+" : ""}{vPr.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
