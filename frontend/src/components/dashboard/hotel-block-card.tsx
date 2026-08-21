import { Fragment } from "react";
import { Link } from "react-router-dom";
import { type BloqueoHotel } from "@/lib/bloqueos-api";
import { fmtEuro } from "@/lib/mock-data";

export function fmtFecha(iso: string) {
  if (!iso || iso === "N/A") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function OcupacionBar({ kpis }: { kpis: BloqueoHotel["kpis"] }) {
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

export function HotelBlockCard({ hotel }: { hotel: BloqueoHotel }) {
  const { kpis } = hotel;
  const multiDia = kpis.diasEnRango > 1;
  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-secondary/60 border-b border-border">
        <Link to={`/bloqueos/${hotel.hotelId}`} className="text-sm font-semibold text-foreground hover:text-primary">
          {hotel.hotelName}
        </Link>
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
