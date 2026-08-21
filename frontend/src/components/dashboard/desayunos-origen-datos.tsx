import { Database } from "lucide-react";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";

type Fila = { campo: string; origen: string; calculo: string; verificar: string };

const OCUPACION: Fila[] = [
  {
    campo: "Alojados",
    origen: "pms_reservation_line + pms_reservation",
    calculo:
      "SUM(adults + children_occupying) de líneas con overnight_room = true, reservation_type = 'normal', state no en (draft, cancel), date en el rango.",
    verificar:
      "Personas-noche, no habitaciones-noche (una habitación puede alojar varios adultos). En Odoo: reservas del hotel con pernocta en el rango, sumar adultos + niños de cada una.",
  },
];

const DESAYUNO_PMS: Fila[] = [
  {
    campo: "Desayunos",
    origen: "folio_sale_line, filtrado por catálogo de régimen",
    calculo:
      "SUM(product_uom_qty) de líneas cuyo producto está en pms_board_service_room_type_line para régimen (pms_board_service.default_code) AD, ADB, ADE, ADN, DESCOL, DESGRUP, DESGRUPCOL, DESNEGCOL o SAD. date_order en el rango, state no en (draft, cancel).",
    verificar:
      "Incluye colaborador (DESCOL/DESNEGCOL/DESGRUPCOL). En Odoo: líneas de venta del folio de esos productos, en el rango de fechas, sumar cantidad.",
  },
  {
    campo: "Penetración",
    origen: "mismas líneas que Desayunos, pero EXCLUYENDO colaborador",
    calculo:
      "(SUM(product_uom_qty) de régimen ≠ DESCOL/DESNEGCOL/DESGRUPCOL) / Alojados.",
    verificar:
      "El numerador NO es el mismo número que se muestra en \"Desayunos\" (que sí incluye colaborador) — a propósito: una venta a colaborador (agencia/partner) puede no corresponder a ningún huésped contado en \"Alojados\", así que sumarla infla la penetración por encima del 100% (caso verificado). Por eso Penetración × Alojados ≠ Desayunos mostrado.",
  },
  {
    campo: "Producción",
    origen: "folio_sale_line (todas las líneas de Desayunos, incl. colaborador) + account_move_line si hay factura",
    calculo:
      "SUM(COALESCE(monto_facturado, price_subtotal)). monto_facturado = SUM(account_move_line.price_subtotal) de la(s) factura(s) en estado posted asociadas a esa línea de folio (vía folio_sale_line_invoice_rel); si no hay factura posted, se usa price_subtotal del propio folio (aún en producción, sin facturar).",
    verificar:
      "Si la línea ya está facturada: comprobar el importe en la factura del folio (Contabilidad > Facturas). Si no: el importe de la línea de servicio en el folio, antes de facturar.",
  },
  {
    campo: "Precio medio",
    origen: "derivado",
    calculo: "Producción / Desayunos (unidades totales, incl. colaborador).",
    verificar: "No es un dato propio de Odoo, es un cociente de las dos filas anteriores.",
  },
];

const FNB_CONTABLE: Fila[] = [
  {
    campo: "Ingresos",
    origen: "account_move_line, cuenta contable 70500000020 (\"Desayunos\")",
    calculo: "SUM(price_subtotal) de líneas con esa cuenta, account_move.state = 'posted', date en el rango.",
    verificar:
      "En Odoo: Contabilidad → informe/mayor de la cuenta 70500000020, filtrar por hotel y rango de fechas, sumar importe. NO incluye colaborador (esas ventas se contabilizan en otras cuentas) — a diferencia de \"Producción\" de arriba, son dos fuentes deliberadamente distintas.",
  },
  {
    campo: "Gastos",
    origen: "account_move_line, cuentas 60100000001 y 60100000002",
    calculo:
      "SUM(price_subtotal) de líneas en esas cuentas, state = 'posted', date en el rango. (60100000003 \"Compras F&B Restauración\" aún no existe en el plan contable.)",
    verificar:
      "En Odoo: Contabilidad → esas dos cuentas, sumar importe en el rango. Excluidas a propósito: 60910000000 (Rappels), 60700000000/60700000001 (colaborador/empresa externa) — no son coste directo de materia prima. Ojo: es la compra registrada ese mes, no el consumo real del periodo (se compra en lotes) — un mes con una compra grande puede salir con margen bruto negativo sin que sea un error.",
  },
  {
    campo: "Margen bruto",
    origen: "derivado",
    calculo: "(Ingresos − Gastos) / Ingresos.",
    verificar: "Cociente de las dos filas anteriores, no un dato propio de Odoo.",
  },
  {
    campo: "Precio medio venta",
    origen: "derivado",
    calculo:
      "Ingresos / Unidades, donde Unidades = SUM(account_move_line.quantity) de las mismas líneas de la cuenta 70500000020.",
    verificar: "No confundir con \"Precio medio\" (PMS, incluye colaborador) — esta usa solo la cuenta contable.",
  },
  {
    campo: "Coste medio",
    origen: "derivado",
    calculo: "Gastos / Unidades (mismas Unidades que Precio medio venta).",
    verificar: "Cociente, no un dato propio de Odoo.",
  },
  {
    campo: "Resultado F&B",
    origen: "derivado",
    calculo: "Ingresos − Gastos.",
    verificar: "Cociente, no un dato propio de Odoo.",
  },
];

const VENDEDORES: Fila[] = [
  {
    campo: "Vendedores",
    origen: "account_move_line.create_uid → res_users → res_partner.name",
    calculo:
      "Agrupado por usuario que creó la línea contable de la cuenta 70500000020, SUM(price_subtotal) y COUNT(*), ordenado de mayor a menor importe.",
    verificar:
      "\"Creado por\" refleja quién/qué generó el registro contable — a veces es un proceso automático (p.ej. \"OdooBot\"), no necesariamente una persona que vendió el desayuno.",
  },
];

const DERIVADOS: Fila[] = [
  {
    campo: "Facturación potencial",
    origen: "no viene de Odoo — combina datos reales con un objetivo configurado en la app",
    calculo:
      "(Desayunos × 55% [penetración objetivo] / Penetración actual) × Precio medio venta.",
    verificar: "Es una proyección, no algo que se pueda buscar en Odoo directamente. El 55% es el objetivo operativo configurado en la app (ver Ajustes), no un dato del PMS.",
  },
  {
    campo: "Etiqueta (semáforo)",
    origen: "no viene de Odoo",
    calculo:
      "Clasificación de Penetración contra umbrales de la app: < 38% rojo, 38–55% naranja, ≥ 55% verde.",
    verificar: "Los umbrales (38%/55%) están configurados en la app, no en Odoo.",
  },
];

function Tabla({ filas }: { filas: Fila[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Campo</th>
            <th className="pb-2 pr-4 font-medium">Origen (tabla/campo Odoo)</th>
            <th className="pb-2 pr-4 font-medium">Cálculo</th>
            <th className="pb-2 font-medium">Cómo verificarlo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map((f) => (
            <tr key={f.campo} className="align-top">
              <td className="py-2.5 pr-4 font-medium text-foreground whitespace-nowrap">{f.campo}</td>
              <td className="py-2.5 pr-4 text-muted-foreground font-mono text-[11px] min-w-[220px]">{f.origen}</td>
              <td className="py-2.5 pr-4 text-foreground/80 min-w-[280px]">{f.calculo}</td>
              <td className="py-2.5 text-muted-foreground min-w-[280px]">{f.verificar}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DesayunosOrigenDatos() {
  return (
    <CollapsibleSection
      icon={Database}
      title="¿De dónde vienen estos datos?"
      subtitle="Detalle campo a campo para verificar en Odoo"
    >
      <div className="space-y-6">
        <div>
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Ocupación</h3>
          <Tabla filas={OCUPACION} />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">
            Desayunos, Penetración, Producción, Precio medio (PMS)
          </h3>
          <Tabla filas={DESAYUNO_PMS} />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">
            F&amp;B contable · Ingresos, Gastos, Margen (excluye colaborador)
          </h3>
          <Tabla filas={FNB_CONTABLE} />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Vendedores</h3>
          <Tabla filas={VENDEDORES} />
        </div>
        <div>
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">
            Métricas derivadas (no son datos de Odoo)
          </h3>
          <Tabla filas={DERIVADOS} />
        </div>
        <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
          Metodología detallada, bugs encontrados y verificados: <code className="font-mono">.claude/alda-precios-desayuno/SKILL.md</code> en el repositorio del proyecto.
        </p>
      </div>
    </CollapsibleSection>
  );
}
