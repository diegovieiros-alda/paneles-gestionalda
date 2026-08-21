import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DashboardShell } from "@/components/dashboard/shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { HotelBlockCard, OcupacionBar } from "@/components/dashboard/hotel-block-card";
import { RangeFilter } from "@/components/dashboard/range-filter";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import { HotelDetailHeader } from "@/components/dashboard/hotel-detail-header";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHotelInfo, type HotelDirectorio } from "@/lib/hoteles-api";
import { fetchHotelBloqueos, type HotelBloqueosReport } from "@/lib/bloqueos-api";
import { fmtNum } from "@/lib/mock-data";
import { rangeForPreset, type RangePreset } from "@/lib/date-range";

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

function OcupacionSection({ hotelId }: { hotelId: string }) {
  const rango = useRango("30d");
  const [data, setData] = useState<HotelBloqueosReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHotelBloqueos(hotelId, rango.desde, rango.hasta).then(setData).catch((e) => setError(e.message));
  }, [hotelId, rango.desde, rango.hasta]);

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Ocupación</h3>
      <div className="flex flex-wrap items-center gap-2">
        <RangeFilter preset={rango.preset} custom={rango.custom} onPreset={rango.onPreset} onCustom={rango.onCustom} compact />
        <DataSourceBadge origen={data?.origenDatos} />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!data && !error && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      )}

      {data && !data.hotel && (
        <p className="text-sm text-muted-foreground">Sin datos de ocupación en el periodo seleccionado.</p>
      )}

      {data?.hotel && (
        <>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard label="Inventario" value={fmtNum(data.hotel.kpis.totalInventario)} tone="neutral" />
            <KpiCard label="Ocupación" value={`${data.hotel.kpis.porcentajeOcupacion}%`} tone="positive" />
            <KpiCard label="Libres" value={`${data.hotel.kpis.porcentajeLibre}%`} tone="neutral" />
            <KpiCard
              label="ADR aplicado"
              value={data.hotel.kpis.adrUtilizado !== null ? `${data.hotel.kpis.adrUtilizado.toFixed(2)}€` : "—"}
              tone="neutral"
            />
          </div>
          <OcupacionBar kpis={data.hotel.kpis} />
        </>
      )}
    </section>
  );
}

function BloqueosSection({ hotelId }: { hotelId: string }) {
  const rango = useRango("30d");
  const [data, setData] = useState<HotelBloqueosReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHotelBloqueos(hotelId, rango.desde, rango.hasta).then(setData).catch((e) => setError(e.message));
  }, [hotelId, rango.desde, rango.hasta]);

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Bloqueos</h3>
      <div className="flex flex-wrap items-center gap-2">
        <RangeFilter preset={rango.preset} custom={rango.custom} onPreset={rango.onPreset} onCustom={rango.onCustom} compact />
        <DataSourceBadge origen={data?.origenDatos} />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!data && !error && <Skeleton className="h-40 rounded-xl" />}
      {data && !data.hotel && (
        <p className="text-sm text-muted-foreground">Sin habitaciones bloqueadas en el periodo seleccionado.</p>
      )}
      {data?.hotel && <HotelBlockCard hotel={data.hotel} />}
    </section>
  );
}

export default function HotelBloqueosPage() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const [hotel, setHotel] = useState<HotelDirectorio | null>(null);
  const [hotelError, setHotelError] = useState<string | null>(null);

  useEffect(() => {
    if (!hotelId) return;
    fetchHotelInfo(hotelId).then(setHotel).catch((e) => setHotelError(e.message));
  }, [hotelId]);

  if (hotelError || !hotelId) {
    return (
      <DashboardShell title="Hotel no encontrado">
        <div className="p-10 text-center text-muted-foreground">{hotelError || "Ese hotel no existe."}</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title={hotel?.name ?? "Cargando…"} subtitle={hotel ? `${hotel.zona} · ${hotel.sociedad}` : undefined} origenDatos={hotel?.origenDatos}>
      <div className="p-6 space-y-8 max-w-[1500px] mx-auto">
        {!hotel && !hotelError && (
          <>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-28 rounded-xl" />
          </>
        )}
        {hotel && <HotelDetailHeader hotel={hotel} backTo="/bloqueos" backLabel="Volver a Bloqueos" />}

        {hotelId && <OcupacionSection hotelId={hotelId} />}
        {hotelId && <BloqueosSection hotelId={hotelId} />}
      </div>
    </DashboardShell>
  );
}
