import { Clock3, Download } from "lucide-react";
import { fmtNum } from "@/lib/mock-data";
import { exportarCsv } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TurnoDesayuno } from "@/lib/hoteles-api";

// Reemplaza el antiguo "VendedoresPanel" (nombre de la persona que
// registró la venta — dato personal/laboral, ver instrucciones de
// organización) por un desglose sin nombres: unidades por turno y canal.
const TURNOS: Array<{ key: TurnoDesayuno["turno"]; label: string }> = [
  { key: "manana_07_15", label: "Mañana · 07-15h" },
  { key: "tarde_15_23", label: "Tarde · 15-23h" },
  { key: "noche_23_07", label: "Noche · 23-07h" },
];

const CANALES: Array<{ key: TurnoDesayuno["canal"]; label: string; color: string }> = [
  { key: "recepcion_hotel", label: "Recepción del hotel", color: "bg-primary" },
  { key: "automatico", label: "Automático (canales)", color: "bg-accent-foreground/40" },
  { key: "central_reservas", label: "Central de reservas", color: "bg-warning" },
  { key: "sin_usuario", label: "Sin usuario", color: "bg-muted-foreground/30" },
];

export function TurnosPanel({ turnos, scope = "cadena completa" }: { turnos: TurnoDesayuno[]; scope?: string }) {
  const total = turnos.reduce((s, t) => s + t.unidades, 0);
  const porTurno = TURNOS.map((t) => ({
    ...t,
    filas: turnos.filter((f) => f.turno === t.key),
    unidades: turnos.filter((f) => f.turno === t.key).reduce((s, f) => s + f.unidades, 0),
  }));
  const maxTurno = Math.max(1, ...porTurno.map((t) => t.unidades));

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <header className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-muted-foreground" />
            Desayuno por turno
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {scope} · {fmtNum(total)} unidades en el periodo
          </p>
        </div>
        {total > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportarCsv(
                `desayunos-turnos-${new Date().toISOString().slice(0, 10)}`,
                ["Turno", "Canal", "Unidades"],
                turnos.map((t) => [
                  TURNOS.find((x) => x.key === t.turno)?.label ?? t.turno,
                  CANALES.find((x) => x.key === t.canal)?.label ?? t.canal,
                  t.unidades,
                ])
              )
            }
          >
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
        )}
      </header>
      <p className="text-[11px] text-muted-foreground/80 mb-4">
        Franjas horarias de convención (no el horario real de cada hotel) · "Canal" es una estimación por patrón de
        acceso, no un dato de quién atendió.
      </p>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Sin ventas registradas en el periodo.</p>
      ) : (
        <div className="space-y-3">
          {porTurno.map((t) => (
            <div key={t.key}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-foreground/90">{t.label}</span>
                <span className="text-xs text-muted-foreground num">{fmtNum(t.unidades)} unidades</span>
              </div>
              <div className="h-2 rounded-full bg-surface-muted overflow-hidden flex">
                {CANALES.map((c) => {
                  const u = t.filas.find((f) => f.canal === c.key)?.unidades ?? 0;
                  if (!u) return null;
                  return (
                    <div
                      key={c.key}
                      className={cn("h-full", c.color)}
                      style={{ width: `${(u / maxTurno) * 100}%` }}
                      title={`${c.label}: ${fmtNum(u)} unidades`}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
            {CANALES.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full", c.color)} />
                {c.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
