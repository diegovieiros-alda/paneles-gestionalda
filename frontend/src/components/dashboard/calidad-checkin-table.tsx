import { AlertTriangle, ShieldCheck } from "lucide-react";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { cn } from "@/lib/utils";
import { fmtNum, fmtPct } from "@/lib/mock-data";
import type { HotelReal } from "@/lib/hoteles-api";

const UMBRAL_AVISO = 0.15; // diferencia declarado→check-in a partir de la cual conviene revisar a mano

function fila(h: HotelReal) {
  const { declarado, checkin, reservasTotal, reservasSinCheckin } = h.calidadCheckin;
  const diferencia = declarado > 0 ? (declarado - checkin) / declarado : 0;
  const pctSinCheckin = reservasTotal > 0 ? reservasSinCheckin / reservasTotal : 0;
  return { h, declarado, checkin, diferencia, reservasTotal, reservasSinCheckin, pctSinCheckin };
}

export function CalidadCheckinTable({ hoteles }: { hoteles: HotelReal[] }) {
  const rows = hoteles
    .map(fila)
    .filter((r) => r.reservasTotal > 0)
    .sort((a, b) => b.diferencia - a.diferencia);

  if (rows.length === 0) return null;

  return (
    <CollapsibleSection
      icon={ShieldCheck}
      title="Calidad del dato: declarado vs. check-in"
      subtitle="Auditoría — no es el dato usado para Penetración, solo para detectar reservas sin check-in registrado"
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          "Alojados" (y por tanto Penetración) siempre usa el dato <b className="text-foreground">declarado</b> en la
          reserva — es la fuente más completa. El check-in confirmado (<code className="font-mono text-[11px]">pms_checkin_partner</code>)
          casi siempre da menos personas: es un registro de viajeros, no un censo de ocupación, y no garantiza una
          fila por persona alojada. Úsalo solo para detectar hoteles/periodos con muchas reservas sin ningún check-in
          registrado, que merezca la pena revisar a mano en recepción.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Hotel</th>
                <th className="pb-2 pr-4 font-medium text-right">Declarado</th>
                <th className="pb-2 pr-4 font-medium text-right">Check-in</th>
                <th className="pb-2 pr-4 font-medium text-right">Diferencia</th>
                <th className="pb-2 font-medium text-right">Reservas sin check-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const aviso = r.diferencia >= UMBRAL_AVISO;
                return (
                  <tr key={r.h.id} className="align-top">
                    <td className="py-2.5 pr-4 font-medium text-foreground whitespace-nowrap">{r.h.name}</td>
                    <td className="py-2.5 pr-4 text-right num text-foreground/80">{fmtNum(r.declarado)}</td>
                    <td className="py-2.5 pr-4 text-right num text-foreground/80">{fmtNum(r.checkin)}</td>
                    <td className="py-2.5 pr-4 text-right num">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          aviso ? "bg-warning/15 text-warning" : "bg-success/15 text-success"
                        )}
                      >
                        {aviso && <AlertTriangle className="h-3 w-3" />}
                        -{fmtPct(r.diferencia, 0)}
                      </span>
                    </td>
                    <td className="py-2.5 text-right num text-muted-foreground">
                      {r.reservasSinCheckin} de {r.reservasTotal} ({fmtPct(r.pctSinCheckin, 0)})
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </CollapsibleSection>
  );
}
