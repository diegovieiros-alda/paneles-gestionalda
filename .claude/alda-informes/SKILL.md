---
name: alda-informes
description: Generar informes HTML autocontenidos (KPIs, tablas, gráficos) a partir de consultas de solo lectura a la BD de Alda — estructura del informe, dónde guardarlo, reglas de visualización y de privacidad. Usar cuando pidan "un informe", "un resumen para dirección", "un dashboard de X" o exportar resultados presentables.
---

# Informes HTML desde la BD (solo lectura)

## Flujo

1. **Aclarar el encargo**: periodo, hoteles, métricas, y para quién es (dirección
   quiere 5 números y una tendencia; operaciones quiere el detalle).
2. **Consultar** con las reglas de `alda-consultas-bd` (agregados, acotado).
3. **Generar un único fichero HTML autocontenido** (CSS y JS inline, sin CDNs ni
   recursos externos — debe abrirse offline) en `~/alda-ia/informes/` con nombre
   `AAAA-MM-DD-tema.html` (ej: `2026-08-19-ocupacion-semanal.html`).
4. **Abrirlo** en el navegador del usuario (`xdg-open`/`open`/`start` según SO) y
   resumir en la conversación los 2-3 hallazgos principales.

## Estructura del informe

1. **Cabecera**: título, periodo, hoteles incluidos, fecha/hora de generación y
   aviso "datos de producción a fecha X".
2. **KPIs arriba** (3-6 tarjetas): ocupación, producción, ADR, variación vs periodo
   anterior si se pidió comparativa.
3. **Gráficos**: tendencia temporal (línea/barras) antes que tartas; una tarta solo
   para 2-5 categorías. SVG inline generado a mano o con JS vanilla — sin librerías
   externas.
4. **Tabla de detalle** al final, ordenada por la métrica principal, con totales.
5. **Nota metodológica** al pie: qué se incluyó/excluyó (canceladas, staff/out,
   con/sin IVA, fuente = fecha de estancia vs fecha de venta). Esto evita el 90% de
   los "no me cuadra" (ver `alda-datos-negocio`).

## Reglas de visualización

- Números en formato español (1.234,56 €), fechas DD/MM/AAAA.
- Ejes desde 0 en barras; etiquetar unidades (%, €, noches).
- Colores consistentes por hotel/canal en todo el informe; máx ~8 series por
  gráfico (agrupar el resto en "Otros").
- Diseñar para imprimir/PDF en A4 vertical si es para dirección.

## Privacidad (obligatorio)

- Informes con **agregados**: nada de nombres de huéspedes, teléfonos, emails ni
  documentos. Un folio/localizador concreto solo en informes internos de diagnóstico.
- El informe queda en la máquina local. Si va a circular fuera del equipo, revisar
  que no expone importes/datos que no deban salir (preguntar antes de difundir).

## Ejemplo de encargo resuelto

"Informe semanal de ocupación y producción por hotel" →
- Query 1: ocupación por día y hotel (semana pasada, lunes-domingo).
- Query 2: producción con IVA por hotel y canal (misma semana), agregada por folio.
- KPIs: ocupación media cadena, producción total, ADR medio, mejor/peor hotel.
- Gráficos: línea de ocupación diaria por hotel; barras de producción por hotel
  apiladas por canal.
- Tabla: hotel × (ocupación, noches, producción, ADR), con fila de total.
- Nota metodológica: excluidas canceladas y staff/out; importes con IVA; por fecha
  de estancia.
