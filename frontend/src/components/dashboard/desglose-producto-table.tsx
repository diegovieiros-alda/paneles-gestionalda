import { useState } from "react";
import { fmtEuro, fmtNum } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { DesgloseProducto } from "@/lib/hoteles-api";

const MODOS = [
  { key: "unidades", label: "Unidades" },
  { key: "ventas", label: "Ventas €" },
] as const;

export function DesglosePorProductoTable({ desglose }: { desglose: DesgloseProducto[] }) {
  const [modo, setModo] = useState<(typeof MODOS)[number]["key"]>("ventas");

  return (
    <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Desglose por producto</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Qué se ha vendido, por nombre real del producto</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {MODOS.map((m) => (
            <button
              key={m.key}
              onClick={() => setModo(m.key)}
              aria-pressed={modo === m.key}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-medium border transition-colors",
                modo === m.key
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "bg-surface border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      {desglose.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Sin ventas de desayuno en el periodo seleccionado.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-surface-muted/60">
            <tr>
              <th className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-5 py-3.5 text-left">Producto</th>
              <th className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-5 py-3.5 text-right">
                {modo === "unidades" ? "Unidades" : "Ventas"}
              </th>
              {modo === "ventas" && (
                <th className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-5 py-3.5 text-right">Precio medio</th>
              )}
            </tr>
          </thead>
          <tbody>
            {desglose.map((p) => (
              <tr key={p.producto} className="border-t border-border hover:bg-accent/30 transition-colors">
                <td className="px-5 py-3 text-foreground font-medium">{p.producto}</td>
                <td className="px-5 py-3 text-right num text-foreground/90">
                  {modo === "unidades" ? fmtNum(p.unidades) : fmtEuro(p.ventas)}
                </td>
                {modo === "ventas" && (
                  <td className="px-5 py-3 text-right num text-muted-foreground">{p.precioMedio.toFixed(2)}€</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
