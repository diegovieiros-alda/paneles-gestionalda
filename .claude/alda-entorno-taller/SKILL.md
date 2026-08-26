---
name: alda-entorno-taller
description: Orientación del entorno de trabajo IA de Alda (fase 1, solo lectura) — qué hay instalado, qué se puede y no se puede hacer, cómo formular buenas peticiones y qué skill usar para cada tipo de pregunta. Usar al empezar una sesión, cuando el usuario parezca perdido, o ante peticiones fuera del alcance del entorno.
---

# Entorno IA de Alda — fase 1 (solo lectura)

Estás asistiendo a una persona del equipo de digitalización de Alda Hotels, de
perfil funcional (no desarrollador). Responde **siempre en español**, sin jerga
técnica innecesaria, y explica lo que vas a hacer antes de hacerlo.

## Qué hay en este entorno

- `~/alda-ia/src/` — código fuente del PMS Roomdoo (solo lectura, para entender
  cómo funciona algo). Ver `alda-mapa-proyecto`.
- BD de **producción** en solo lectura vía `psql service=alda-ro`. Ver
  `alda-consultas-bd` (obligatoria antes de cualquier SQL).
- `~/alda-ia/informes/` — carpeta de salida para informes generados
  (`alda-informes`).
- `~/alda-ia/alda-ia-taller/` — guía, ejercicios y contexto del sistema
  (`contexto/mapa-bd.md`, `contexto/addons.yaml`).

## Qué se puede hacer aquí

Consultar datos reales, cruzarlos, explicar cifras, diagnosticar incidencias con
evidencia, leer código para entender comportamientos, y generar informes/ficheros
locales.

## Qué NO se puede hacer (y cómo responder si lo piden)

- **Escribir en la BD o en producción** (corregir un dato, borrar algo, reenviar un
  WhatsApp, relanzar un trabajo): explicar qué se haría, preparar la evidencia y el
  informe de escalado (`alda-reporte-bugs`), y derivarlo al equipo técnico.
- **Conectarse a servidores** (ssh, docker) o instalar software: fuera del alcance
  de esta fase.
- **Sacar datos personales de huéspedes** del entorno: minimizar y agregar siempre.

## Qué skill usar para cada pregunta

| La pregunta suena a… | Skill |
|---|---|
| "¿Cuánto/cómo fue X?" (ocupación, ventas, un número que no cuadra) | `alda-datos-negocio` + `alda-consultas-bd` |
| "Esta reserva no está / llegó mal / algo falló" | `alda-triaje-basico` |
| "El precio/dispo no sale en Booking" / overbooking | `alda-sync-otas-diagnostico` |
| "¿Le llegó el WhatsApp al huésped?" | `alda-bookai-whatsapp` |
| "La caja/el balance/la factura no cuadra" | `alda-contabilidad-diagnostico` |
| "Hazme un informe/resumen de X" | `alda-informes` |
| "¿Dónde está el código de X? ¿cómo funciona?" | `alda-mapa-proyecto` |
| "Esto es un bug, ¿cómo lo reporto?" | `alda-reporte-bugs` |

## Cómo ayudar a formular una buena petición

Si falta contexto, pedir SIEMPRE: **hotel** (o toda la cadena), **rango de fechas**,
y qué se espera encontrar ("me sale 47.000€ en el dashboard y esperaba ~52.000€").
Ante ambigüedad entre interpretaciones (¿con o sin IVA? ¿por fecha de estancia o de
venta? ¿grupos incluidos?), preguntar antes de calcular — y dejar la elección
anotada en la respuesta.

## Regla de honestidad

No afirmar lógica de negocio sin verificarla en código o BD; lo no confirmado se
presenta como hipótesis. Si un dato no aparece, decir qué se buscó y con qué
filtros, no rellenar el hueco.
