# Roadmap del dashboard de Desayunos — spec vs. estado real

Este documento compara el documento de spec ("Dashboard Desayunos -
Hoteles.pdf") con el código real del repositorio, sección por sección.
Es un mapa de estado y prioridades, no una fuente de definiciones de
negocio — para eso sigue mandando `kpis-definiciones.md`.

Generado a partir de una auditoría del código (no del documento de spec en
sí, que no vive en este repo) realizada el 2026-09-03, más el primer lote
de implementación ("gaps rápidos") ya desplegado ese mismo día.

Leyenda:
- ✅ **Hecho** — coincide con el spec.
- 🟡 **Parcial** — existe pero con diferencias, ver detalle.
- ⬜ **Falta** — no existe, no requiere datos nuevos ni decisiones de negocio.
- 🔒 **Bloqueado por datos** — el dato de origen no existe en Odoo (confirmado en el propio código, no es una suposición).
- 🚫 **No se va a implementar** — motivo explícito (privacidad/conflicto de datos).

---

## 1. Filtros (aplican a todas las vistas)

| Campo | Estado | Detalle |
|---|---|---|
| Fecha: Mes/Trimestre/Anual + personalizado | 🟡 | "Anual fiscal" (1 oct–30 sep) y "Personalizado" coinciden con el spec. "Mes" es un único botón (mes en curso), no "últimos 3 meses a elegir". "Trimestre" son los 4 trimestres naturales del año en curso (decisión ya confirmada con el usuario, no fiscal) — spec pide "últimos 2 trimestres". Por defecto arranca en "Día", el spec pide "último mes completo". |
| Zona (RGM) | 🟡 | Funciona, pero es un diccionario Python hardcodeado (`bloqueos/engine.py::MAPEO_ZONAS`), copia de respaldo de una hoja de Google Sheets que este proyecto no puede leer — no viene de Odoo. Si "Zona RGM" del spec es otra cosa, esto no la cubre. |
| Submarca | ✅ | Viene de Odoo (`res_brand`). 43% de los hoteles no tienen marca asignada (sale como "Sin submarca", no se oculta). |
| Tipo Hotel (Urbano/Mix/Vacacional) | 🔒 | Declarado explícitamente en el código: "no existen en el PMS ni está previsto añadirlos". |
| Segmento Hotel (Grupos/individual/empresa) | 🔒 | Mismo motivo. Ojo: podría ser un atributo de la *reserva*, no del *hotel* — aclarar con quien pidió el spec antes de tratarlo como "bloqueado". |
| Tipo Desayuno (Producto) | 🟡 | Existen 4 valores (buffet/express/colaborador/**otros**), el spec solo menciona 3. "Otros" es una decisión ya tomada (agrupa lo que no encaja en los otros 3) — no repartirlo sin confirmar. |
| Selector de hotel (uno o varios + buscador) | ✅ *(añadido 2026-09-03)* | Buscador por nombre/código + desplegable con checkboxes para fijar una selección concreta de uno o varios hoteles (`HotelMultiSelect`), combinable con Zona/Submarca. Solo en Detalle completo. |
| Filtros aplican a todas las vistas | 🟡 | Comparten estado entre Detalle/Oportunidades/Alertas. Tendencias solo hereda la fecha (su serie es un agregado de cadena, no filtrable por hotel). La ficha de hotel vive fuera de ese estado compartido a propósito (evita disparar el fetch pesado de toda la cadena) — hereda fecha y tipo por URL desde 2026-09-03. |

---

## 2. Tabla hoteles "Producción"

| Campo | Estado | Detalle |
|---|---|---|
| Filtro de etiqueta | 🔒 | No hay tag de Odoo en ninguna consulta. (Ojo: existe un concepto interno con el mismo nombre — el semáforo verde/naranja/rojo de penetración — que es otra cosa, no un tag). |
| Filtro de estado del hotel | 🔒 | `_HOTELES_SQL` solo trae `id, name, código, company_id` — no hay columna de estado en ninguna consulta. |
| Hotel (código + nombre) | ✅ *(añadido 2026-09-03)* | |
| Zona | ✅ | Desde el rediseño de tablas (2026-09-03), va como segunda línea bajo el nombre del hotel, no como columna propia — se quitaron columnas para eliminar el scroll horizontal. |
| Submarca | ✅ *(añadido 2026-09-03)* | Misma segunda línea que Zona, junto con "Sociedad" (no pedida por el spec, se mantiene por aportar información). |
| Alojados / Desayunos / Penetración / Precio medio, cada uno en 3 columnas (Actual, Presupuesto+%var, LY+%var) | 🟡 | Actual + **LY ✅ (añadido 2026-09-03)**: línea compacta "LY X +Y%" bajo el valor, no una columna propia (habría vuelto a meter scroll horizontal). Presupuesto por hotel para estas 4 métricas sigue sin existir en esta tabla (el presupuesto en unidades del Excel solo está en la serie mensual de la ficha de un hotel). |

---

## 3. Tabla hoteles "Facturación"

No hay una tabla que se llame así — la más parecida es `FnbFinancieroTable` ("F&B · Ingresos, gastos y margen"), que mezcla fuente PMS y fuente contable de una forma que el spec no distingue.

| Campo | Estado | Detalle |
|---|---|---|
| Filtro de etiqueta / estado | 🔒 | Mismo motivo que la tabla de Producción. |
| Hotel (código + nombre) | ✅ *(añadido 2026-09-03)* | |
| Zona / Submarca | ✅ *(añadidas 2026-09-03)* | No existían ni como columna ni como dato visible, solo como filtro. Desde el rediseño de tablas van como segunda línea bajo el nombre del hotel, no como columnas propias. |
| Facturación (Actual/Presupuesto+%var/LY+%var) | 🟡 | Actual + Presupuesto sí (con origen Odoo/Excel visible, y el cumplimiento como etiqueta junto al importe desde el rediseño). La "variación" se expresa como % de cumplimiento (100% = en objetivo), no como variación con signo. LY no existe. |
| Coste medio (3 columnas) | 🟡 | Solo Actual (desde el rediseño, en la misma celda que Precio medio venta, en dos líneas). |
| Margen bruto (3 columnas) | 🟡 | Solo Actual (desde el rediseño, en la misma celda que Resultado F&B). |
| Oportunidad | ✅ | Facturación potencial vs objetivo de penetración, ya implementada y validada (con un bug histórico corregido — no simplificar la fórmula). |

**Aviso de diseño pendiente de decidir**: el spec junta en una tabla métricas que en este código viven deliberadamente separadas — "Producción/Desayunos/Precio medio" (PMS, incluye colaborador) vs. "Ingresos/Gastos/Margen/Coste medio" (contable, excluye colaborador). Si se construye la tabla "Facturación" tal cual la pide el spec, hay que decidir explícitamente de qué fuente sale cada columna o los números no van a cuadrar entre sí.

---

## 4. Vista completa del hotel

### 4.1 Datos del hotel

| Campo | Estado |
|---|---|
| Código | ✅ *(añadido 2026-09-03, sustituye al id interno de Odoo en la cabecera)* |
| Nombre | ✅ |
| Zona | ✅ |
| Submarca | ✅ *(añadido 2026-09-03)* |
| Tipo hotel | 🔒 (ver §1) |
| Tipo desayuno (mezcla) | ✅ *(añadido 2026-09-03 — chip "Vende: Buffet, Colaborador...")* |
| Etiqueta (chip) | 🔒 (ver §2) |

### 4.2 KPIs principales

| Campo | Estado | Detalle |
|---|---|---|
| Gráfico de medidor circular 360° | ✅ *(añadido 2026-09-03)* | `GaugeKpiCard` (recharts `RadialBarChart`, sin dependencia nueva). Solo en los KPIs con un objetivo real que comparar — ver detalle por KPI abajo. |
| Facturación/Ingresos (vs presupuesto, vs LY) | ✅ *(LY añadido 2026-09-03)* | vs presupuesto: gauge (Odoo/Excel, absorbe la antigua tarjeta "Presupuesto"). vs LY: línea `LyComparison` en el mismo footer del gauge. |
| Gastos (vs presupuesto, vs LY) | ✅ *(LY añadido 2026-09-03)* | vs presupuesto: gauge, semáforo invertido a propósito (gastar de más es malo). vs LY: `LyComparison` con `positivoEsBueno=false` (gastar menos que el año pasado es lo bueno). |
| Alojados (vs presupuesto, vs LY) | ✅ *(LY añadido 2026-09-03)* | vs previsto del Excel: gauge (2026-09-03). vs LY: `LyComparison` como footer del gauge. |
| Ud. desayunos (vs presupuesto, vs LY) | ✅ *(LY añadido 2026-09-03)* | Igual que Alojados: gauge vs previsto del Excel + `LyComparison` como footer. |
| Penetración (vs objetivo, vs LY) | ✅ *(LY añadido 2026-09-03)* | vs objetivo editable: gauge (mismo semáforo de siempre; no es presupuesto real, es un ajuste del dashboard). vs LY: `LyComparison` como footer del gauge. |
| Precio medio (vs LY, vs presupuesto) | 🟡 *(LY añadido 2026-09-03)* | Actual + LY (delta en el propio `KpiCard`). Sin gauge de presupuesto — necesitaría una fórmula de "precio medio presupuestado" que no está definida en `kpis-definiciones.md` (mismo bloqueo que el histórico mensual, punto 4.4). Hay dos "precio medio" en la ficha: PMS (incluye colaborador) y contable (no lo incluye), ambos con LY. |
| Coste medio (vs LY, vs presupuesto) | 🟡 *(LY añadido 2026-09-03)* | Actual + LY (`positivoEsBueno=false`: bajar respecto al año pasado es lo bueno). Sin gauge de presupuesto — mismo motivo que Precio medio. |
| Margen bruto (vs LY, vs presupuesto) | 🟡 *(LY añadido 2026-09-03)* | Actual + LY. Sin gauge de presupuesto — mismo motivo. |
| Resultado F&B | ✅ *(LY añadido 2026-09-03)* | No estaba en el spec como fila propia, pero ya tenía Actual; ahora también con LY (delta en el `KpiCard`). |

### 4.3 Gráficos

| Gráfico | Estado | Detalle |
|---|---|---|
| Evolución (igual que el de "¿Dónde actuar hoy?", con los mismos botones) | 🟡 | Existe un gráfico de barras de Producción de 12 meses, pero sin selector de métrica y es una implementación duplicada de la de Tendencias (candidato a unificar). La serie de 12 meses es fija (no se puede acortar/alargar con botones) y no se filtra por tipo de desayuno. |
| Precio medio vs coste (2 líneas) | ✅ | Ya existe tal cual, reutilizado en Tendencias y en la ficha de hotel. |
| Alojados vs ud. desayunos (4 líneas) | ✅ *(añadido 2026-09-03)* | Antes solo existían 2 de las 4 líneas (los actuales); las de presupuesto (alojados/desayunos previstos del Excel) se calculaban y se descartaban — ahora se exponen y el gráfico ya está en la ficha de hotel. Sin equivalente a nivel de cadena completa todavía. |

### 4.4 Histórico mensual

| Campo | Estado | Detalle |
|---|---|---|
| Columnas Mes/Actual/LY/Variación/Presupuesto/Variación presupuesto | 🟡 | Hoy son 3 tablas separadas (Producción, Facturados, Financiero F&B) con columnas fijas por tema, no una tabla con selector de métrica ni desglose mes a mes — el LY que existe (desde 2026-09-03) es para el periodo agregado seleccionado (Día/Mes/Trimestre/Año fiscal/personalizado), no una columna "LY" por cada fila de un histórico mensual. Solo la tabla Financiero F&B tiene Presupuesto (como % de cumplimiento, no como variación con signo), y solo para Ingresos. |
| Selector de métrica (Facturación/Penetración/Precio medio/Margen bruto/Coste medio) | ⬜ | No existe. **Pendiente de decisión antes de construirlo**: el spec pide comparar cada una de esas 5 métricas contra su propio presupuesto, pero hoy solo hay presupuesto en € para Ingresos/Gastos — "Penetración presupuestada", "Precio medio presupuestado" y "Coste medio presupuestado" no están definidos en `kpis-definiciones.md`. Se pueden derivar (ej. precio medio presupuestado = ingresos presupuestados / desayunos previstos, cuando hay dato de Excel) pero es una fórmula nueva que alguien tiene que confirmar, no algo que se pueda inventar dentro de una tarea de "UI". |

### 4.5 Desglose por producto vendido

✅ **Hecho (2026-09-03).** `repository.fetch_desayunos_por_producto_hotel`, construida de cero sobre `folio_sale_line` + catálogo de régimen (misma fuente que el resto del dashboard, no la consulta documentada en `kpis-definiciones.md` que usa `pms_service_line` + una lista fija de productos). Verificado contra un hotel de referencia (julio 2026): la suma del desglose coincide exactamente (diferencia 0.0) con Producción/Desayunos ya validados, con y sin filtro de Producto. Tabla en la ficha de hotel con toggle Unidades/Ventas € y precio medio.

### 4.6 "Vendedores turnos" (nombre de usuario + unidades)

🚫 **No se va a implementar tal como está en el spec.** El 2026-08-28 se tomó la decisión explícita (documentada en 4 sitios distintos del código: `repository.py`, `turnos-panel.tsx`, `hoteles-api.ts`, `desayunos-origen-datos.tsx`) de eliminar el nombre de la persona que registra cada venta por ser un dato personal/laboral de un empleado, siguiendo las instrucciones de confidencialidad de la organización sobre datos de trabajadores. En su lugar existe un desglose anónimo por turno (franja horaria) y canal de venta (`TurnosPanel`), ya implementado y en producción.

Si de verdad hace falta un análisis por persona, es una petición distinta que necesita pasar por una autorización de RRHH/legal — no es una columna de dashboard que se pueda añadir sin más.

---

## 5. Resumen de prioridad sugerida

1. **Hecho (2026-09-03)**: código+zona+submarca en tablas y cabecera, tipo de desayuno mixto, KPI Coste medio en la ficha, gráfico Alojados vs desayunos con presupuesto en unidades, rediseño de las 3 tablas (sin scroll horizontal), desglose por producto vendido, selector real de uno o varios hoteles, gauges circulares 360° (Alojados/Desayunos/Penetración/Ingresos/Gastos, donde ya hay un objetivo real), **LY (comparativa año anterior)** en la tabla Producción, la tabla Financiero F&B y en todos los KPIs de la ficha de hotel (alojados, desayunos, penetración, precio medio ×2, producción, ingresos, gastos, margen bruto, coste medio, resultado F&B) — verificado con tests y con medición real de rendimiento en producción (el cron horario de precalentado ya absorbe el coste marginal para las vistas más comunes).
2. **Pendiente de decidir contigo, no de programar directamente**:
   - Fórmulas de "presupuesto" para Precio medio/Coste medio/Margen bruto (necesarias para el histórico mensual con selector y para dar gauge a esos 3 KPIs, que hoy se quedan sin él a propósito).
   - Qué fuente (PMS vs. contable) usa cada columna de la tabla "Facturación" si se construye tal cual el spec.
   - Si "Tipo Hotel"/"Segmento Hotel"/"Etiqueta"/"Estado del hotel" merecen una tabla propia en este proyecto (mismo patrón que `PresupuestoDesayunoMensual`) o se dejan pendientes hasta que existan en Odoo.
3. **Trabajo grande, sin bloqueos de decisión, a programar cuando se priorice**:
   - Consolidar el histórico mensual en una tabla con selector de métrica y con LY/presupuesto por mes (una vez resueltas las fórmulas de presupuesto del punto 2).
4. **No se va a hacer**: "Vendedores" con nombre de usuario (conflicto de privacidad, ver §4.6).

---

*Última actualización: 2026-09-03. Mantener este documento cuando se cierre cada punto — moverlo de la sección correspondiente a "Hecho" con la fecha, igual que el historial de cambios de `kpis-definiciones.md`.*
