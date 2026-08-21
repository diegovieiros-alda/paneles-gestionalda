import { Users } from "lucide-react";
import { fmtEuro, fmtNum } from "@/lib/mock-data";
import type { Vendedor } from "@/lib/hoteles-api";

export function VendedoresPanel({ vendedores }: { vendedores: Vendedor[] }) {
  const top = vendedores.slice(0, 8);

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Vendedores · Desayuno
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quién registró la venta (cadena completa) · {vendedores.length} usuarios distintos
          </p>
        </div>
      </header>
      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Sin ventas registradas en el periodo.</p>
      ) : (
        <div className="divide-y divide-border">
          {top.map((v) => (
            <div key={v.vendedor} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-foreground/90 truncate">{v.vendedor}</span>
              <span className="text-xs text-muted-foreground num shrink-0 ml-3">
                {fmtNum(v.lineas)} líneas · <span className="text-foreground font-medium">{fmtEuro(v.importe)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
