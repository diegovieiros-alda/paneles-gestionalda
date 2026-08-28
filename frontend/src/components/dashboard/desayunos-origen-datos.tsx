import { Calculator, Database, Info, Landmark, Lightbulb, type LucideIcon } from "lucide-react";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { cn } from "@/lib/utils";

type FuenteTipo = "pms" | "contable" | "derivado";

type Campo = {
  campo: string;
  tipo: FuenteTipo;
  queEs: string;
  origen?: string; // tabla/campo técnico exacto en Odoo, para quien quiera comprobarlo
  calculo: string;
  porque?: string; // por qué se calcula así — la parte que hoy falta explicar
  verificar?: string; // cómo comprobarlo a mano en Odoo
};

const FUENTE_META: Record<FuenteTipo, { label: string; icon: LucideIcon; className: string }> = {
  pms: { label: "PMS (reservas)", icon: Database, className: "bg-chart-1/10 text-chart-1" },
  contable: { label: "Contabilidad", icon: Landmark, className: "bg-chart-3/10 text-chart-3" },
  derivado: { label: "Calculado en la app", icon: Calculator, className: "bg-muted text-muted-foreground" },
};

const OCUPACION: Campo[] = [
  {
    campo: "Alojados",
    tipo: "pms",
    queEs: "Personas alojadas cada noche del rango — no habitaciones.",
    origen: "pms_reservation_line + pms_reservation",
    calculo:
      "SUM(adultos + niños) de las líneas con pernocta (overnight_room = true), reserva de tipo normal y estado distinto de draft/cancel, dentro del rango de fechas.",
    porque:
      "Se cuentan personas, no habitaciones: una habitación puede alojar a varios adultos, así que contar solo habitaciones subestimaría a los alojados y dispararía la penetración de desayuno por encima del 100%.",
    verificar: "Reservas del hotel con pernocta en el rango, sumando adultos + niños de cada una.",
  },
];

const DESAYUNO_PMS: Campo[] = [
  {
    campo: "Desayunos",
    tipo: "pms",
    queEs: "Unidades de desayuno vendidas en el rango, incluyendo las de colaborador (agencias/partners).",
    origen: "folio_sale_line, filtrado por el catálogo de régimen de desayuno",
    calculo:
      "SUM(cantidad) de las líneas cuyo producto pertenece a un régimen de desayuno (AD, ADB, ADE, ADN, DESCOL, DESGRUP, DESGRUPCOL, DESNEGCOL, SAD), con fecha en el rango y estado distinto de draft/cancel.",
    porque:
      "Se incluye colaborador porque es una venta real (dinero real cobrado), aunque esas unidades no siempre correspondan a un huésped contado en \"Alojados\".",
    verificar: "Líneas de venta del folio de esos productos en el rango de fechas, sumando cantidad.",
  },
  {
    campo: "Penetración",
    tipo: "pms",
    queEs: "% de alojados que desayunan de forma directa — sin colaborador.",
    origen: "mismas líneas que \"Desayunos\", excluyendo los regímenes de colaborador",
    calculo: "(unidades sin colaborador) ÷ Alojados.",
    porque:
      "Se excluye colaborador a propósito: una venta a agencia puede no corresponder a ningún huésped contado en \"Alojados\", así que incluirla dispararía la penetración por encima del 100% (caso real verificado). Por eso Penetración × Alojados no coincide con el número mostrado en \"Desayunos\".",
  },
  {
    campo: "Producción",
    tipo: "pms",
    queEs: "Dinero vendido por desayuno según el PMS, incluyendo colaborador — mezcla lo ya facturado con lo aún no facturado.",
    origen: "folio_sale_line + account_move_line si ya hay factura",
    calculo:
      "Importe ya facturado (factura del folio en estado posted) cuando existe; si aún no se ha facturado, el importe de producción del propio folio.",
    porque:
      "Se prioriza el importe facturado porque es el dato contable definitivo; mientras no se facture, se usa el importe del folio como mejor estimación disponible — nunca se deja en blanco. Ver \"Facturado\"/\"Sin facturar\" para el desglose de esta cifra.",
    verificar: "Si ya está facturada: el importe en la factura del folio. Si no: el importe de la línea en el folio, antes de facturar.",
  },
  {
    campo: "Facturado / Sin facturar",
    tipo: "pms",
    queEs: "Desglose de \"Producción\": qué parte ya tiene factura posted vinculada y qué parte todavía no.",
    origen: "mismas líneas que \"Producción\", separadas en vez de combinadas con un único importe",
    calculo:
      "Facturado = SUM del importe de factura de las líneas que sí tienen una factura posted vinculada. Sin facturar = SUM del importe del folio (price_subtotal) de las que no. Facturado + Sin facturar = Producción, siempre.",
    porque:
      "\"Producción\" combina ambas cosas en una sola cifra para no dejar nunca un hueco, pero eso oculta cuánto de la venta del periodo está aún pendiente de facturar — útil para ver el retraso de facturación, sobre todo en el mes en curso.",
    verificar: "Contar cuántas líneas de folio de desayuno del rango no tienen ninguna factura posted vinculada todavía, y su importe.",
  },
  {
    campo: "Precio medio",
    tipo: "derivado",
    queEs: "Precio medio de venta del desayuno, incluyendo colaborador.",
    calculo: "Producción ÷ Desayunos (unidades totales).",
    porque: "Es un cociente de los dos datos PMS de arriba — no existe como campo propio en Odoo.",
  },
];

const FNB_CONTABLE: Campo[] = [
  {
    campo: "Ingresos",
    tipo: "contable",
    queEs: "Ingresos contables de desayuno — sin colaborador.",
    origen: "account_move_line, cuenta 70500000020 (\"Desayunos\")",
    calculo: "SUM(importe) de líneas contables en esa cuenta, con factura en estado posted y fecha en el rango.",
    porque:
      "El colaborador se contabiliza en otras cuentas, así que no aparece aquí: es una fuente de verdad deliberadamente distinta de \"Producción\" (PMS), no un error de suma.",
    verificar: "Contabilidad → mayor de la cuenta 70500000020, filtrando por hotel y rango de fechas.",
  },
  {
    campo: "Gastos",
    tipo: "contable",
    queEs: "Compras de materia prima de desayuno.",
    origen: "account_move_line, cuentas 60100000001 y 60100000002",
    calculo: "SUM(importe) de líneas en esas cuentas, factura posted, fecha en el rango.",
    porque:
      "Se excluyen a propósito Rappels y las cuentas de colaborador/externo: no son coste directo de materia prima. Ojo: es la compra registrada ese mes, no el consumo real del periodo (se compra en lotes) — un mes con una compra grande puede salir con margen bruto negativo sin que sea un error.",
    verificar: "Esas dos cuentas, sumando importe en el rango. (La tercera cuenta prevista, 60100000003, aún no existe en el plan contable.)",
  },
  {
    campo: "Margen bruto",
    tipo: "derivado",
    queEs: "% de los ingresos que queda tras el coste de materia prima.",
    calculo: "(Ingresos − Gastos) ÷ Ingresos.",
    porque: "Cociente de las dos filas anteriores — no existe como campo propio en Odoo.",
  },
  {
    campo: "Precio medio venta",
    tipo: "derivado",
    queEs: "Precio medio según contabilidad — no confundir con \"Precio medio\" (PMS, incluye colaborador).",
    calculo: "Ingresos ÷ Unidades, siendo Unidades la cantidad de esas mismas líneas contables.",
    porque: "Usa solo la cuenta contable (sin colaborador), a diferencia de \"Precio medio\" del bloque PMS.",
  },
  {
    campo: "Coste medio",
    tipo: "derivado",
    queEs: "Coste medio de materia prima por unidad de desayuno.",
    calculo: "Gastos ÷ Unidades (las mismas Unidades que Precio medio venta).",
    porque: "Cociente de dos filas anteriores — no existe como campo propio en Odoo.",
  },
  {
    campo: "Resultado F&B",
    tipo: "derivado",
    queEs: "Beneficio contable de desayuno del periodo.",
    calculo: "Ingresos − Gastos.",
    porque: "Resta directa de las dos filas de arriba.",
  },
  {
    campo: "Presupuesto (ingresos/gastos)",
    tipo: "contable",
    queEs: "Objetivo presupuestario confirmado para ese hotel y periodo.",
    origen: "account_move_budget_line + account_move_budget, mismas cuentas contables de Ingresos/Gastos",
    calculo:
      "Ingresos presupuestados = credit − debit en la cuenta 70500000020. Gastos presupuestados = debit − credit en 60100000001/60100000002. Solo cuenta si el presupuesto está en estado confirmed.",
    porque:
      "El signo es el habitual en contabilidad: en una cuenta de ingreso el importe vive en \"credit\", en una de gasto en \"debit\" — no al revés. Los presupuestos en borrador (draft) no son oficiales y se ignoran. El presupuesto se guarda por mes completo, así que si el rango de fechas elegido no es un mes (o varios meses) completo, no se calcula: mostrar el presupuesto del mes entero junto a un rango parcial daría un dato engañoso.",
    verificar: "Módulo de Presupuestos (Accounting Budgets) → presupuesto confirmado del hotel y periodo.",
  },
  {
    campo: "Cumplimiento (presupuesto)",
    tipo: "derivado",
    queEs: "% del presupuesto ya alcanzado.",
    calculo: "Ingresos reales ÷ Presupuesto de ingresos (mismo cálculo para gastos).",
    porque: "Se muestra vacío (—), no 0%, cuando no hay presupuesto confirmado (un 0% sugeriría erróneamente que no se vendió nada) o cuando el rango elegido no es un mes completo (ver \"Presupuesto\" arriba).",
  },
];

const TURNOS: Campo[] = [
  {
    campo: "Turnos",
    tipo: "pms",
    queEs: "Unidades de desayuno y su facturado/sin facturar, por franja horaria y canal de venta — sin nombre de ninguna persona.",
    origen: "folio_sale_line.create_date / create_uid → res_users.login",
    calculo:
      "Turno según la hora de creación de la línea (hora de Madrid): Mañana 07-15h, Tarde 15-23h, Noche 23-07h. Canal según el patrón del login que la creó: @sh360 → Central de reservas, roomdoo/Wubook → Automático, resto → Recepción del hotel. Facturado/Sin facturar: mismo desglose que en \"Facturado / Sin facturar\" de Producción (factura posted vinculada o no), aplicado a cada turno/canal — Facturado + Sin facturar siempre coincide con la Producción total del periodo.",
    porque:
      "Antes se mostraba el nombre de quién generó cada apunte contable — dato personal/laboral de un empleado, no debe salir en un panel de gestión. Se sustituyó (2026-08-28) por este desglose por turno/canal, calculado desde el PMS (folio_sale_line, igual que Producción) en vez de Contabilidad: se comprobó que la fecha del apunte contable no sirve para esto (más de 6.500 líneas de un mes entero caían todas en la misma hora, por un proceso automático de asiento nocturno, no por venta real). Las franjas horarias son una convención de turnos habituales, no el horario real confirmado de cada hotel; \"canal\" es una estimación por patrón de login, no un catálogo mantenido.",
  },
];

const DERIVADOS: Campo[] = [
  {
    campo: "Facturación potencial",
    tipo: "derivado",
    queEs: "Proyección de ingreso si se cerrara el hueco de penetración — no es un dato de Odoo.",
    calculo: "Alojados × (55% objetivo − Penetración actual), con mínimo 0, × Precio medio venta.",
    porque:
      "El 55% es un objetivo configurado en la app (ver Ajustes), no un dato de Odoo ni un objetivo oficial confirmado por el momento. Se calcula sobre el hueco de alojados, no dividiendo por la penetración actual: dividir dispara la cifra a valores absurdos cuando la penetración actual es casi cero (bug real detectado y corregido).",
  },
  {
    campo: "Etiqueta (semáforo)",
    tipo: "derivado",
    queEs: "Clasificación visual rápida del estado de un hotel.",
    calculo: "Penetración < 38% → rojo · 38–55% → naranja · ≥ 55% → verde.",
    porque: "Los umbrales están configurados en la app, no en Odoo, y tampoco son un objetivo oficial confirmado (ver Ajustes).",
  },
];

function CampoCard({ c }: { c: Campo }) {
  const meta = FUENTE_META[c.tipo];
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={cn("grid place-items-center h-7 w-7 rounded-md shrink-0", meta.className)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h4 className="text-sm font-semibold text-foreground">{c.campo}</h4>
        <span className={cn("ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap", meta.className)}>
          {meta.label}
        </span>
      </div>

      <p className="text-xs text-foreground/80">{c.queEs}</p>

      <div className="rounded-md bg-surface-muted/60 border border-border/60 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Cálculo</div>
        <div className="text-[11px] font-mono text-foreground/90 leading-relaxed">{c.calculo}</div>
      </div>

      {c.porque && (
        <div className="flex gap-2 rounded-md bg-primary/5 border border-primary/15 px-3 py-2">
          <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <p className="text-[11px] text-foreground/80">
            <b className="text-foreground">Por qué así: </b>
            {c.porque}
          </p>
        </div>
      )}

      {(c.origen || c.verificar) && (
        <div className="text-[10px] text-muted-foreground pt-2 border-t border-border/60 space-y-1">
          {c.origen && (
            <div>
              <span className="font-medium text-muted-foreground/80">Tabla/campo en Odoo: </span>
              <span className="font-mono">{c.origen}</span>
            </div>
          )}
          {c.verificar && (
            <div>
              <span className="font-medium text-muted-foreground/80">Para comprobarlo a mano: </span>
              {c.verificar}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Grupo({ titulo, subtitulo, campos }: { titulo: string; subtitulo?: string; campos: Campo[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">{titulo}</h3>
      {subtitulo && <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">{subtitulo}</p>}
      <div className={cn("grid gap-3 sm:grid-cols-2", !subtitulo && "mt-3")}>
        {campos.map((c) => (
          <CampoCard key={c.campo} c={c} />
        ))}
      </div>
    </div>
  );
}

function Leyenda() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-muted/40 px-3 py-2.5">
      <span className="text-[11px] text-muted-foreground mr-1">Origen de cada dato:</span>
      {(Object.keys(FUENTE_META) as FuenteTipo[]).map((tipo) => {
        const meta = FUENTE_META[tipo];
        const Icon = meta.icon;
        return (
          <span key={tipo} className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium", meta.className)}>
            <Icon className="h-3 w-3" />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

export function DesayunosOrigenDatos() {
  return (
    <CollapsibleSection
      icon={Database}
      title="¿De dónde vienen estos datos?"
      subtitle="Qué es cada campo, cómo se calcula y por qué se calcula así"
    >
      <div className="space-y-6">
        <Leyenda />

        <p className="text-xs text-muted-foreground leading-relaxed">
          Dos fuentes reales en Odoo, que no siempre coinciden a propósito: el <b className="text-foreground">PMS</b> (reservas y venta de
          desayuno, tal como ocurre en recepción/folio) y <b className="text-foreground">Contabilidad</b> (lo que ya está facturado y
          contabilizado, sin colaborador). Los campos marcados como <b className="text-foreground">calculado en la app</b> son cocientes o
          proyecciones que no existen como tales en Odoo.
        </p>

        <Grupo titulo="Ocupación" campos={OCUPACION} />
        <Grupo
          titulo="Desayunos, Penetración, Producción, Precio medio"
          subtitulo="PMS · lo que se vendió en recepción/folio"
          campos={DESAYUNO_PMS}
        />
        <Grupo
          titulo="Financiero F&B"
          subtitulo="Contabilidad · lo ya facturado, excluye colaborador"
          campos={FNB_CONTABLE}
        />
        <Grupo titulo="Turnos" campos={TURNOS} />
        <Grupo titulo="Métricas derivadas" subtitulo="No son datos de Odoo: se calculan en la app" campos={DERIVADOS} />

        <div className="flex gap-2.5 rounded-lg border border-border bg-surface-muted/40 p-3.5">
          <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
            <p>
              <b className="text-foreground">No implementado todavía:</b> "Presupuesto Revenue" (pms.budget) — ese modelo solo tiene
              ingreso de habitación (room_revenue), sin ningún campo de desayuno. "Reseñas" y "Elasticidad" tampoco tienen cálculo
              definido aún.
            </p>
            <p>
              Metodología detallada, bugs encontrados y verificados:{" "}
              <code className="font-mono">.claude/alda-precios-desayuno/SKILL.md</code> en el repositorio del proyecto.
            </p>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
