import { AlertTriangle, ShieldCheck } from "lucide-react";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { cn } from "@/lib/utils";
import { fmtNum, fmtPct } from "@/lib/mock-data";
import type { HotelReal } from "@/lib/hoteles-api";

const UMBRAL_AVISO = 0.15; // diferencia declarado→check-in a partir de la cual conviene revisar a mano
const UMBRAL_NO_USA_CHECKIN = 0.7; // % de reservas sin ningún check-in a partir del cual la propiedad
// probablemente no usa el check-in digital en absoluto — comparar ahí no aporta nada, solo mete ruido
// (ej. un hotel con 0 check-ins en 39 reservas: no es un hueco a auditar, es que no usa el módulo).
const MIN_RESERVAS = 5; // por debajo de esto, la muestra es demasiado pequeña para ser útil

function fila(h: HotelReal) {
  const { declarado, checkin, reservasTotal, reservasSinCheckin } = h.calidadCheckin;
  const diferencia = declarado > 0 ? (declarado - checkin) / declarado : 0;
  const pctSinCheckin = reservasTotal > 0 ? reservasSinCheckin / reservasTotal : 0;
  return { h, declarado, checkin, diferencia, reservasTotal, reservasSinCheckin, pctSinCheckin };
}

export function CalidadCheckinTable({ hoteles }: { hoteles: HotelReal[] }) {
  const todas = hoteles.map(fila).filter((r) => r.reservasTotal >= MIN_RESERVAS);
  const noUsaCheckin = todas.filter((r) => r.pctSinCheckin >= UMBRAL_NO_USA_CHECKIN);
  const auditables = todas.filter((r) => r.pctSinCheckin < UMBRAL_NO_USA_CHECKIN).sort((a, b) => b.diferencia - a.diferencia);

  if (todas.length === 0) return null;

  return (
    <CollapsibleSection
      icon={ShieldCheck}
      title="Calidad del dato: declarado vs. check-in"
      subtitle="Auditoría — no es el dato usado para Penetración, solo para detectar huecos de check-in que merezca la pena revisar"
    >
      <div className="space-y-5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          "Alojados" (y por tanto Penetración) siempre usa el dato <b className="text-foreground">declarado</b> en la
          reserva — es la fuente más completa. El check-in confirmado (<code className="font-mono text-[11px]">pms_checkin_partner</code>)
          casi siempre da menos personas: es un registro de viajeros, no un censo de ocupación, y no garantiza una
          fila por persona alojada. Esta tabla es solo para detectar dónde vale la pena revisar el check-in a mano en
          recepción — no para sustituir ningún KPI.
        </p>

        {auditables.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Hotel</th>
                  <th className="pb-2 pr-4 font-medium text-center">Declarado</th>
                  <th className="pb-2 pr-4 font-medium text-center">Check-in</th>
                  <th className="pb-2 pr-4 font-medium text-center">Diferencia</th>
                  <th className="pb-2 font-medium text-center">Reservas sin check-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditables.map((r) => {
                  const aviso = r.diferencia >= UMBRAL_AVISO;
                  return (
                    <tr key={r.h.id} className="align-top">
                      <td className="py-2.5 pr-4 font-medium text-foreground whitespace-nowrap">{r.h.name}</td>
                      <td className="py-2.5 pr-4 text-center num text-foreground/80">{fmtNum(r.declarado)}</td>
                      <td className="py-2.5 pr-4 text-center num text-foreground/80">{fmtNum(r.checkin)}</td>
                      <td className="py-2.5 pr-4 text-center num">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                            aviso ? "bg-warning/15 text-warning" : "bg-success/15 text-success"
                          )}
                        >
                          {aviso && <AlertTriangle className="h-3 w-3" />}
                          {r.diferencia >= 0 ? "-" : "+"}
                          {fmtPct(Math.abs(r.diferencia), 0)}
                        </span>
                      </td>
                      <td className="py-2.5 text-center num text-muted-foreground">
                        {r.reservasSinCheckin} de {r.reservasTotal} ({fmtPct(r.pctSinCheckin, 0)})
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            Ningún hotel con suficiente check-in registrado para comparar en este periodo.
          </p>
        )}

        {noUsaCheckin.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-muted/40 p-3.5">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <b className="text-foreground">{noUsaCheckin.length} propiedades sin apenas check-in registrado</b> (≥
              {fmtPct(UMBRAL_NO_USA_CHECKIN, 0)} de sus reservas sin ninguno) — probablemente no usan el check-in
              digital en este periodo, no una reserva concreta sin rellenar. No aparecen arriba porque comparar ahí
              no dice nada útil:
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {noUsaCheckin.map((r) => r.h.name).join(" · ")}
            </p>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
