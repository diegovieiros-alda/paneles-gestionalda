import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/dashboard/section-title";
import { AjustesPorHotelTable } from "@/components/dashboard/ajustes-por-hotel-table";
import { fetchAjustesDesayuno, actualizarAjustesDesayuno } from "@/lib/ajustes-api";
import type { AjustesResueltos } from "@/lib/hoteles-api";

// Formulario en % (0-100) para el usuario; se convierte a fracción (0-1) al
// guardar, que es como los espera el backend (mismo formato que ya usaban
// TARGET_PENETRACION/UMBRAL_PENETRACION/TARGET_OPORTUNIDAD hardcodeados).
type FormPct = Record<keyof AjustesResueltos, string>;

function aFormPct(a: AjustesResueltos): FormPct {
  return {
    objetivoPenetracion: (a.objetivoPenetracion * 100).toFixed(0),
    umbralPenetracion: (a.umbralPenetracion * 100).toFixed(0),
    objetivoOportunidad: (a.objetivoOportunidad * 100).toFixed(0),
  };
}

const CAMPOS: Array<{ clave: keyof AjustesResueltos; label: string; desc: string }> = [
  {
    clave: "objetivoPenetracion",
    label: "Objetivo de penetración",
    desc: "Penetración directa a la que se aspira — marca el 100% de la barra en \"Oportunidades\" y decide el tono verde/naranja del semáforo.",
  },
  {
    clave: "umbralPenetracion",
    label: "Umbral de alerta",
    desc: "Por debajo de este % un hotel aparece en \"Alertas\" y en rojo en el semáforo.",
  },
  {
    clave: "objetivoOportunidad",
    label: "Objetivo techo (oportunidad)",
    desc: "Penetración techo usada para calcular la facturación potencial no capturada.",
  },
];

export default function DesayunosAjustesPage() {
  const [form, setForm] = useState<FormPct | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState(false);

  useEffect(() => {
    fetchAjustesDesayuno().then((a) => setForm(aFormPct(a))).catch((e) => setError(e.message));
  }, []);

  async function guardar() {
    if (!form) return;
    setError(null);
    setGuardadoOk(false);
    setGuardando(true);
    try {
      const cambios: Partial<AjustesResueltos> = {};
      for (const { clave } of CAMPOS) {
        const n = Number(form[clave]);
        if (!Number.isFinite(n)) throw new Error(`"${clave}" no es un número válido`);
        cambios[clave] = n / 100;
      }
      const actualizados = await actualizarAjustesDesayuno(cambios);
      setForm(aFormPct(actualizados));
      setGuardadoOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los ajustes");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <DashboardShell title="Ajustes" subtitle="Desayunos · objetivos y umbrales de alerta">
      <div className="p-6 space-y-8 max-w-[1100px] mx-auto">
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 text-xs text-foreground/80">
          Estos valores no son un objetivo oficial confirmado por dirección/revenue — son de referencia interna
          para calcular oportunidad y alertas. Cambiarlos aquí afecta a lo que ve cualquier persona con acceso a
          Desayunos, no solo a tu sesión.
        </div>

        <section className="max-w-[700px] space-y-3">
          <SectionTitle title="Valor global" subtitle="Se aplica a cualquier hotel sin un valor propio (ver abajo)." />
          <div className="rounded-xl border border-border bg-surface p-5 shadow-soft space-y-5">
            {!form && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {error && <p className="text-sm text-danger">{error}</p>}

            {form && (
              <>
                {CAMPOS.map(({ clave, label, desc }) => (
                  <div key={clave} className="flex items-start justify-between gap-4 py-2 border-t border-border first:border-t-0 first:pt-0">
                    <div className="max-w-sm">
                      <div className="text-sm font-medium text-foreground">{label}</div>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={form[clave]}
                        onChange={(e) => setForm({ ...form, [clave]: e.target.value })}
                        className="w-20 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-right num outline-none focus:ring-2 focus:ring-ring"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                ))}

                <div className="flex items-center gap-3 pt-2">
                  <Button onClick={guardar} disabled={guardando}>
                    <Save className="h-3.5 w-3.5" /> {guardando ? "Guardando…" : "Guardar"}
                  </Button>
                  {guardadoOk && <span className="text-xs text-success">Guardado.</span>}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="Por hotel" subtitle="Un valor propio aquí gana al valor global de arriba para ese hotel." />
          <AjustesPorHotelTable />
        </section>
      </div>
    </DashboardShell>
  );
}
