import { useEffect, useMemo, useState } from "react";
import { Search, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AjustesResueltos } from "@/lib/hoteles-api";
import { fetchAjustesHotelesAdmin, actualizarAjustesHotel, type AjustesHotelAdmin } from "@/lib/ajustes-api";

const CAMPOS: Array<{ clave: keyof AjustesResueltos; label: string }> = [
  { clave: "objetivoPenetracion", label: "Objetivo penetración" },
  { clave: "umbralPenetracion", label: "Umbral de alerta" },
  { clave: "objetivoOportunidad", label: "Objetivo oportunidad" },
];

type FilaEdicion = Partial<Record<keyof AjustesResueltos, string>>;

function aPct(valor: number): string {
  return (valor * 100).toFixed(0);
}

// Tabla de objetivos/umbrales por hotel (2026-09-04, "Objetivos
// configurarlo por hotel") — los 3 mismos ajustes que ya eran editables a
// nivel de cadena, ahora con la opción de fijar un valor propio por hotel.
// Sin override, un hotel usa el valor global (la sección de arriba en
// desayunos-ajustes.tsx) — por eso el placeholder de cada casilla vacía es
// el global, no un 0.
export function AjustesPorHotelTable() {
  const [datos, setDatos] = useState<{ global: AjustesResueltos; hoteles: AjustesHotelAdmin[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cambios, setCambios] = useState<Record<number, FilaEdicion>>({});
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  function cargar() {
    setError(null);
    fetchAjustesHotelesAdmin().then(setDatos).catch((e) => setError(e.message));
  }
  useEffect(cargar, []); // una sola vez al montar

  const hoteles = useMemo(() => {
    const lista = datos?.hoteles ?? [];
    if (!q) return lista;
    const s = q.toLowerCase();
    return lista.filter((h) => h.name.toLowerCase().includes(s) || h.codigo.toLowerCase().includes(s));
  }, [datos, q]);

  const numCambios = Object.keys(cambios).length;

  function editar(hotelId: number, clave: keyof AjustesResueltos, valor: string) {
    setGuardadoOk(false);
    setCambios((c) => ({ ...c, [hotelId]: { ...c[hotelId], [clave]: valor } }));
  }

  function quitarOverrides(hotelId: number) {
    setGuardadoOk(false);
    // Marca las 3 claves para borrar (valor especial "" ya se traduce a
    // null al guardar) — no hace falta que el usuario las borre a mano.
    setCambios((c) => ({
      ...c,
      [hotelId]: { objetivoPenetracion: "", umbralPenetracion: "", objetivoOportunidad: "" },
    }));
  }

  async function guardar() {
    if (!datos) return;
    setGuardando(true);
    setError(null);
    try {
      for (const [hotelIdStr, fila] of Object.entries(cambios)) {
        const hotelId = Number(hotelIdStr);
        const cuerpo: Partial<Record<keyof AjustesResueltos, number | null>> = {};
        for (const { clave } of CAMPOS) {
          const bruto = fila[clave];
          if (bruto === undefined) continue;
          if (bruto === "") {
            cuerpo[clave] = null;
            continue;
          }
          const n = Number(bruto);
          if (!Number.isFinite(n)) throw new Error(`"${clave}" no es un número válido`);
          cuerpo[clave] = n / 100;
        }
        if (Object.keys(cuerpo).length > 0) await actualizarAjustesHotel(hotelId, cuerpo);
      }
      setCambios({});
      setGuardadoOk(true);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los cambios");
    } finally {
      setGuardando(false);
    }
  }

  if (error && !datos) return <p className="text-sm text-danger">{error}</p>;
  if (!datos) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 h-9 rounded-md border border-border bg-surface px-3 text-sm w-64">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            aria-label="Buscar hotel por nombre o código"
            placeholder="Buscar hotel o código…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="bg-transparent outline-none flex-1 min-w-0"
          />
        </div>
        <button
          onClick={guardar}
          disabled={numCambios === 0 || guardando}
          className="ml-auto inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" /> {guardando ? "Guardando…" : `Guardar cambios${numCambios ? ` (${numCambios})` : ""}`}
        </button>
        {guardadoOk && <span className="text-xs text-success">Guardado.</span>}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Hotel</th>
              {CAMPOS.map((c) => (
                <th key={c.clave} className="px-4 py-2.5 font-medium text-right">{c.label}</th>
              ))}
              <th className="px-4 py-2.5 font-medium w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {hoteles.map((h) => {
              const fila = cambios[h.id];
              const tieneOverride = h.overrides.length > 0;
              return (
                <tr key={h.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-foreground">{h.codigo} · {h.name}</div>
                    <div className="text-[11px] text-muted-foreground">{h.zona} · {h.submarca}</div>
                  </td>
                  {CAMPOS.map(({ clave }) => {
                    const esOverride = h.overrides.includes(clave);
                    const valorMostrado = fila?.[clave] !== undefined ? fila[clave] : aPct(h.valores[clave]);
                    return (
                      <td key={clave} className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            placeholder={aPct(datos.global[clave])}
                            value={valorMostrado}
                            onChange={(e) => editar(h.id, clave, e.target.value)}
                            className={cn(
                              "w-16 rounded-md border bg-surface px-2 py-1 text-right num outline-none focus:ring-2 focus:ring-ring",
                              esOverride ? "border-primary/40 text-foreground font-medium" : "border-border text-muted-foreground"
                            )}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2">
                    {tieneOverride && (
                      <button
                        onClick={() => quitarOverrides(h.id)}
                        title="Quitar los valores propios de este hotel (vuelve a heredar el global)"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {hoteles.length === 0 && (
              <tr>
                <td colSpan={CAMPOS.length + 2} className="px-4 py-6 text-center text-muted-foreground">
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
