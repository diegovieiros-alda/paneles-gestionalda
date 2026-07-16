import { type ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { TARGET_PENETRACION, TARGET_OPORTUNIDAD } from "@/lib/mock-data";

export default function AjustesPage() {
  return (
    <DashboardShell title="Ajustes" subtitle="Objetivos y umbrales de alerta">
      <div className="p-6 space-y-6 max-w-[900px] mx-auto">
        <Card title="Objetivos" desc="Valores usados para calcular oportunidad y alertas.">
          <Row label="Objetivo penetración operativa" value={`${(TARGET_PENETRACION * 100).toFixed(0)}%`} />
          <Row label="Objetivo penetración techo (oportunidad)" value={`${(TARGET_OPORTUNIDAD * 100).toFixed(0)}%`} />
          <Row label="Precio medio objetivo" value="12,00 €" />
          <Row label="Margen mínimo aceptable" value="50%" />
        </Card>

        <Card title="Alertas" desc="Umbrales que disparan una alerta en el panel.">
          <Row label="Penetración crítica" value="< 38%" />
          <Row label="Precio bajo objetivo" value="< 10,00 €" />
          <Row label="Caída vs año anterior" value="< -10%" />
          <Row label="Margen bajo" value="< 48%" />
        </Card>

        <Card title="Sincronización" desc="Origen de datos operativos.">
          <Row label="Última sincronización" value="Hoy · 09:12" />
          <Row label="Frecuencia" value="Cada 15 min" />
          <Row label="Estado" value="Conectado" />
        </Card>
      </div>
    </DashboardShell>
  );
}

function Card({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      <div className="mt-4 divide-y divide-border">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground num">{value}</span>
    </div>
  );
}
