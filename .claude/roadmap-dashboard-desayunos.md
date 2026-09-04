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
| Fecha: Mes/Trimestre/Anual + personalizado | 🟡 | "Anual fiscal" (1 oct–30 sep) y "Personalizado" coinciden con el spec. "Mes" es un desplegable con los 12 meses del año en curso *(cambiado 2026-09-04 — antes un único botón, siempre el mes en curso; pedido explícito: "que permita elegir cada mes del año")*, más amplio que "últimos 3 meses a elegir" del spec. "Trimestre" son los 4 trimestres naturales del año en curso (decisión ya confirmada con el usuario, no fiscal) — spec pide "últimos 2 trimestres". Por defecto arranca en "Día", el spec pide "último mes completo". |
| Zona (RGM) | 🟡 | Funciona, pero es un diccionario Python hardcodeado (`bloqueos/engine.py::MAPEO_ZONAS`), copia de respaldo de una hoja de Google Sheets que este proyecto no puede leer — no viene de Odoo. Si "Zona RGM" del spec es otra cosa, esto no la cubre. |
| Submarca | ✅ | Viene de Odoo (`res_brand`). 43% de los hoteles no tienen marca asignada (sale como "Sin submarca", no se oculta). |
| Tipo Hotel (Urbano/Mix/Vacacional) | 🔒 | Declarado explícitamente en el código: "no existen en el PMS ni está previsto añadirlos". |
| Segmento Hotel (Grupos/individual/empresa) | 🔒 | Mismo motivo. Ojo: podría ser un atributo de la *reserva*, no del *hotel* — aclarar con quien pidió el spec antes de tratarlo como "bloqueado". |
| Tipo Desayuno (Producto) | 🟡 | Existen 4 valores (buffet/express/colaborador/**otros**), el spec solo menciona 3. "Otros" es una decisión ya tomada (agrupa lo que no encaja en los otros 3) — no repartirlo sin confirmar. |
| Selector de hotel (uno o varios + buscador) | ✅ *(añadido 2026-09-03)* | Buscador por nombre/código + desplegable con checkboxes para fijar una selección concreta de uno o varios hoteles (`HotelMultiSelect`), combinable con Zona/Submarca. |
| Filtros aplican a todas las vistas | ✅ *(cerrado 2026-09-03)* | Detalle, Oportunidades, Alertas y Tendencias muestran ya el mismo bloque completo (Periodo/Hotel/Zona/Submarca/Producto) vía `DesayunosFiltrosPanel`, sin el `mostrarHotel={false}` que antes ocultaba Zona/Submarca/buscador/selector en Oportunidades y Alertas. Tendencias necesitó una consulta nueva (`get_serie_mensual`/`/api/desayunos/serie-mensual/`) porque su serie de 12 meses era un agregado de cadena sin desglose por hotel — ver §8. Sigue sin cubrir Tipo Hotel/Segmento Hotel (🔒, no existen en Odoo). |

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

## 5. Página Ajustes

Existe (`frontend/src/pages/desayunos-ajustes.tsx`, ruta `/desayunos/ajustes`). El spec la titula "Objetivos (**configurarlo por hotel**)" + "Alertas (automatizadas)".

| Campo del spec | Estado | Detalle |
|---|---|---|
| Objetivo de penetración operativa % | ✅ | `objetivoPenetracion` (`desayunos-ajustes.tsx`, valor por defecto en `service.py::AJUSTES_DESAYUNOS_DEFECTO`). |
| Objetivo de penetración (oportunidad) % | ✅ | `objetivoOportunidad`, mismo sitio. |
| Precio medio objetivo € | ⬜ | No existe en frontend ni backend. `set_ajustes_desayunos` (`service.py`) rechaza cualquier clave que no esté en `AJUSTES_DESAYUNOS_DEFECTO` — no se puede añadir sin tocar código y sin definir de dónde sale ese objetivo (¿Excel de presupuesto, como el resto de "presupuesto"? ¿un valor fijo editable?). |
| Margen bruto mínimo aceptable % | ⬜ | No existe. Mismo comentario que el anterior. |
| Alerta de penetración crítica % | 🟡 | Existe como `umbralPenetracion` ("Umbral de alerta" en el formulario), pero el spec lo describe como "**un % debajo del objetivo**" (una diferencia calculada) y en el código es un valor absoluto independiente (0.38 por defecto) sin relación matemática con `objetivoPenetracion` — **decisión pendiente**: ¿se deja como valor absoluto (como hoy) o se recalcula como offset del objetivo? |
| Alerta de precio medio bajo € | ⬜ | No existe. |
| Alerta de caída vs año anterior % | ⬜ | No existe — pese a que LY ya está calculado en el resto de la app desde 2026-09-03, no hay ningún umbral configurable que lo use. |
| Alerta de margen bruto bajo % | ⬜ | No existe. |
| "Por hotel" (título de la sección en el spec) | ✅ *(cerrado 2026-09-04)* | Decisión explícita del usuario: migrar a "por hotel" (frente a mantener global). `DashboardSetting` gana un `hotel_id` opcional (NULL = global, como antes; un id = override de ese hotel, que gana sobre el global) — cambio aditivo, las filas ya existentes siguen siendo el global. `get_hoteles`/`get_hotel_desayunos` devuelven ya los 3 ajustes resueltos por hotel; nueva sección "Por hotel" en la página Ajustes (tabla con buscador, override por fila, botón para volver al global). Verificado con 7 tests nuevos + comprobación directa contra producción (fijar/leer/borrar un override real). Las tarjetas que agregan varios hoteles (`ObjetivoPenetracionCard`, `OpportunityBlockReal`) usan la media ponderada por alojados de cada objetivo propio. |

---

## 6. Página Alertas

Existe (`frontend/src/pages/desayunos-alertas.tsx`, ruta `/desayunos/alertas`). El propio spec ya la marca como dudosa: *"Esta página quizás no tenga utilidad, si las alertas ya se muestran en donde actuar hoy"* — y añade una idea sin desarrollar (alertas personalizables por trabajador).

Contenido real: un único bloque (`AlertsBlockReal`) que lista (máx. 8) los hoteles con `penetracion < ajustes.umbralPenetracion`, ordenados de menor a mayor penetración, cada uno con enlace a su ficha. Es exactamente el mismo criterio (`umbralPenetracion`) que ya alimenta el semáforo verde/naranja/rojo visible en la tabla de Detalle y en la ficha de cada hotel — el propio spec anticipa este solapamiento.

**Decidido 2026-09-04**: se amplía (no se retira ni se deja igual) con las alertas que faltan — precio medio bajo, margen bruto bajo, caída vs LY. Ya no bloqueadas por Ajustes (§5, resuelto): faltan añadir los 2 campos objetivo nuevos (precio medio objetivo €, margen bruto mínimo aceptable %) y decidir contra qué métrica se mide "caída vs año anterior" (el spec no lo especifica — LY ya existe para producción/ingresos/gastos/etc., candidato razonable: Producción, la métrica de volumen principal, a confirmar). Pendiente de implementar.

---

## 7. Página Oportunidades

Existe (`frontend/src/pages/desayunos-oportunidades.tsx`). El spec pide: Total oportunidad en €, barra de progreso de penetración con dos colores, texto dinámico "hoteles abiertos hoy", y una tabla de ranking (ordenada por facturación potencial descendente) con columnas Alojados/Desayunos/Penetración/Facturación/Oportunidad (ud.)/Facturación potencial (%dif) + "Acción sugerida".

| Elemento del spec | Estado | Detalle |
|---|---|---|
| Total oportunidad en € | ✅ | `OpportunityBlockReal` (`facturacionPotencialTotal`). |
| Barra de progreso %penetración vs objetivo, dos colores | ✅ *(añadido 2026-09-03)* | Nuevo componente `TargetProgressBar` (escala 0-100%, segmento sólido = conseguido, segmento más claro = hueco hasta el objetivo), reemplaza la barra de un solo color en `ObjetivoPenetracionCard` y `OpportunityBlockReal`. |
| Texto dinámico "hoteles abiertos hoy" | 🔒 | No existe. Requeriría el campo "estado del hotel" (abierto/baja/alquilado/...), que ya está marcado 🔒 en §2/§3 de este documento por no existir en ninguna consulta (`_HOTELES_SQL` solo trae `id, name, código, company_id`) — mismo bloqueo de datos, no es un trabajo de UI aislado. |
| Tabla ranking fija (Alojados/Desayunos/Penetración/Facturación/Oportunidad/Facturación potencial %dif), ordenada por facturación potencial | 🟡 | Hoy son dos componentes distintos, ninguno igual al del spec: `RankingListReal` es una lista top-8 con un selector de 3 métricas (Producción/Penetración/Precio medio) que el usuario puede cambiar — no muestra todas las columnas a la vez ni está fijo a "facturación potencial"; `OpportunityBlockReal.topHoteles` sí ordena por oportunidad descendente pero es un top-5 con menos columnas, no una tabla completa de todos los hoteles. |
| Columna "Acción sugerida" | ⬜ (no definible) | El propio spec la deja sin definir ("ver cómo enfocar esto") — no hay una fórmula o texto que implementar; no se puede construir sin que alguien la defina primero. |

**Decidido 2026-09-04**: sustituir el ranking actual (lista de 1 métrica + top-5) por la tabla fija del spec, sin la columna "Acción sugerida" (no definible). Pendiente de implementar.

---

## 8. Página Tendencias

Existe (`frontend/src/pages/desayunos-tendencias.tsx`). El spec pide un único gráfico "Evolución" con selector de métrica (Facturación/penetración/precio medio/margen bruto/coste medio), granularidad según el filtro de fecha (día/semana/mes/trimestre/año) + proyección de 3 meses a futuro con IA, y un tooltip con Actual/año anterior/presupuesto.

| Elemento del spec | Estado | Detalle |
|---|---|---|
| Selector de métrica con botones | ⬜ | No existe. `EvolutionChartReal` dibuja una única serie fija: `produccion`. Para añadirlo, `fetch_serie_mensual` (`repository.py`) tendría que devolver también penetración/precio medio/margen bruto/coste medio — hoy solo trae producción. |
| Granularidad según filtro de fecha (día/semana/mes/trimestre/año) | ⬜ | Siempre mensual, ventana fija de 12 meses terminando en el "hasta" del filtro — no cambia con el preset de Periodo elegido. |
| Tooltip con Actual/año anterior/presupuesto | ⬜ | El tooltip solo muestra el valor de la barra (`fmtEuro(v), "Producción"`), sin LY ni presupuesto — aunque LY ya existe a nivel de cadena desde 2026-09-03 (ver histórico del cambio de LY), no está conectado a este gráfico. |
| Proyección 3 meses a futuro con IA | ⬜ | No existe ninguna mención a proyección ni a IA en ningún componente de Tendencias. Requeriría un modelo de forecasting — **no es una tarea de UI**, necesita decisión explícita sobre alcance y método antes de construirse. |
| Filtros heredados (Zona/Submarca/Producto/Hotel) | ✅ *(añadido 2026-09-03)* | Tendencias ya muestra el panel de filtros completo. Endpoint nuevo `get_serie_mensual`/`/api/desayunos/serie-mensual/` (mismo patrón que Turnos, separado de `/api/desayunos/` para no arrastrar el recálculo de la tabla de hoteles) con variantes filtradas de las 3 consultas que arman la serie (PMS, FNB, presupuesto Odoo/Excel) — verificadas contra producción para un hotel de referencia. Sin ningún filtro de hotel activo, `get_resumen` sigue usando exactamente la consulta de siempre (mismo resultado, sin cambios). Producto sí afecta a la parte PMS (desayunos/producción) de la serie; Ingresos/Gastos/Margen (contable) nunca se filtran por Producto en ningún sitio de la app, tampoco aquí — mismo comportamiento que la ficha de hotel. |

**Decidido 2026-09-04**: construir el selector de métrica + tooltip con Actual+LY ya, reutilizando el patrón de LY existente. Presupuesto en el tooltip solo donde ya existe (Facturación/Ingresos) — las otras 4 métricas lo suman cuando se resuelvan sus fórmulas de presupuesto (§9.2). La proyección "3 meses con IA" queda fuera de este alcance por ahora (no descartada, solo no incluida en esta ronda). Pendiente de implementar.

---

## 9. Resumen de prioridad sugerida

1. **Hecho (2026-09-03)**: código+zona+submarca en tablas y cabecera, tipo de desayuno mixto, KPI Coste medio en la ficha, gráfico Alojados vs desayunos con presupuesto en unidades, rediseño de las 3 tablas (sin scroll horizontal), desglose por producto vendido, selector real de uno o varios hoteles, gauges circulares 360° (Alojados/Desayunos/Penetración/Ingresos/Gastos, donde ya hay un objetivo real), **LY (comparativa año anterior)** en la tabla Producción, la tabla Financiero F&B y en todos los KPIs de la ficha de hotel (alojados, desayunos, penetración, precio medio ×2, producción, ingresos, gastos, margen bruto, coste medio, resultado F&B) — verificado con tests y con medición real de rendimiento en producción (el cron horario de precalentado ya absorbe el coste marginal para las vistas más comunes); **filtros completos (Periodo/Hotel/Zona/Submarca/Producto) extendidos a Oportunidades, Alertas y Tendencias** (§1, §7, §8), con la consulta nueva `get_serie_mensual` para la serie de Tendencias, verificada contra producción; **barra de progreso de dos colores en Oportunidades** (§7).
2. **Hecho (2026-09-04)**: **Ajustes "por hotel"** (§5) — `DashboardSetting` gana `hotel_id` opcional, override por hotel > global > valor por defecto, nueva tabla de administración en la página Ajustes. Cambio aditivo, verificado con tests y contra producción (fijar/leer/borrar un override real en un hotel de referencia). **Selector de "Mes" como desplegable** (§1, ver detalle ahí). **Cabecera fija en las 4 tablas de hoteles** (Producción, Financiero F&B, Facturación, Ajustes por hotel) — con hasta ~89 filas, la fila de títulos desaparecía al hacer scroll ("se pierde lo que es cada columna", reportado); cada tabla gana su propio scroll acotado con la cabecera en `sticky top-0`.
3. **Decidido con el usuario 2026-09-04, pendiente de implementar** (ver el detalle de cada una en su sección):
   - **Alertas adicionales** (§6): precio medio bajo, margen bruto bajo, caída vs año anterior — ya no bloqueadas por Ajustes (resuelto en el punto 2), faltan los 2 campos objetivo nuevos (precio medio objetivo €, margen bruto mínimo aceptable %) y decidir contra qué métrica se mide "caída vs LY" (candidato: Producción, a confirmar).
   - **Tabla de ranking de Oportunidades** (§7): sustituir el ranking actual (lista de 1 métrica + top-5) por la tabla fija del spec (Alojados/Desayunos/Penetración/Facturación/Oportunidad/Facturación potencial), sin la columna "Acción sugerida" (no definible).
   - **Selector de métrica en Tendencias** (§8): ampliar `fetch_serie_mensual` para las 4 métricas que faltan (penetración/precio medio/margen bruto/coste medio) + su LY, con tooltip Actual+LY (+presupuesto solo donde ya existe). La proyección "3 meses con IA" queda fuera de esta ronda.
4. **Pendiente de decidir contigo, no de programar directamente**:
   - Fórmulas de "presupuesto" para Precio medio/Coste medio/Margen bruto (necesarias para el histórico mensual con selector y para dar gauge a esos 3 KPIs, que hoy se quedan sin él a propósito, y para completar el tooltip de presupuesto del punto 3).
   - Qué fuente (PMS vs. contable) usa cada columna de la tabla "Facturación" si se construye tal cual el spec.
   - Si "Tipo Hotel"/"Segmento Hotel"/"Etiqueta"/"Estado del hotel" merecen una tabla propia en este proyecto (mismo patrón que `PresupuestoDesayunoMensual`) o se dejan pendientes hasta que existan en Odoo. La misma falta de "Estado del hotel" es lo que bloquea el texto "hoteles abiertos hoy" de Oportunidades (§7).
   - Si el umbral de alerta de penetración pasa a calcularse como offset del objetivo (como sugiere la letra del spec) en vez de un valor absoluto independiente (como hoy, y como se ha implementado para las alertas nuevas del punto 3 por consistencia).
5. **Trabajo grande, sin bloqueos de decisión, a programar cuando se priorice**:
   - Consolidar el histórico mensual en una tabla con selector de métrica y con LY/presupuesto por mes (una vez resueltas las fórmulas de presupuesto del punto 4).
6. **No se va a hacer**: "Vendedores" con nombre de usuario (conflicto de privacidad, ver §4.6).

---

*Última actualización: 2026-09-04. Mantener este documento cuando se cierre cada punto — moverlo de la sección correspondiente a "Hecho" con la fecha, igual que el historial de cambios de `kpis-definiciones.md`.*
