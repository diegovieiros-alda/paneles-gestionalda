import { cn } from "@/lib/utils";
import { conSigno, fmtEuro, fmtPct } from "@/lib/mock-data";

function toneClass(n: number, positivoEsBueno: boolean) {
  if (n === 0) return "text-muted-foreground";
  const esBueno = positivoEsBueno ? n > 0 : n < 0;
  return esBueno ? "text-success" : "text-danger";
}

/** Importe con signo explícito (+/-) y color (verde si positivo es bueno, rojo si no). */
export function SignedEuro({ value, positivoEsBueno = true, className }: { value: number; positivoEsBueno?: boolean; className?: string }) {
  return <span className={cn("font-medium", toneClass(value, positivoEsBueno), className)}>{conSigno(value, fmtEuro(value))}</span>;
}

/** Porcentaje con signo explícito (+/-) y color. */
export function SignedPct({ value, positivoEsBueno = true, digits = 0, className }: { value: number; positivoEsBueno?: boolean; digits?: number; className?: string }) {
  return <span className={cn("font-medium", toneClass(value, positivoEsBueno), className)}>{conSigno(value, fmtPct(value, digits))}</span>;
}
