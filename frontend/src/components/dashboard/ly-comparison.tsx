import { SignedPct } from "@/components/dashboard/signed-value";

// Línea compacta "LY <valor> <variación con signo>" para meter debajo de
// un valor actual sin añadir una columna propia — las tablas de Desayunos
// ya se rediseñaron para no tener scroll horizontal (2026-09-03), así que
// LY se apila como segunda línea muda en vez de repetir el patrón de
// columnas triples del spec (Actual/Presupuesto/LY), que las habría vuelto
// a ensanchar.
export function LyComparison({
  valorLY, variacion, formatear, positivoEsBueno = true,
}: { valorLY: number; variacion: number | null; formatear: (n: number) => string; positivoEsBueno?: boolean }) {
  return (
    <span className="text-[10px] text-muted-foreground/70 inline-flex items-center gap-1">
      LY {formatear(valorLY)}
      {variacion !== null && (
        <SignedPct value={variacion} positivoEsBueno={positivoEsBueno} digits={0} className="text-[10px] font-normal" />
      )}
    </span>
  );
}
