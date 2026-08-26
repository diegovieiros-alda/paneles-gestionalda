---
name: alda-reporte-bugs
description: Cómo documentar y reportar un bug o comportamiento raro del PMS Roomdoo/Alda con calidad — estructura del informe, impacto cuantificado, reproducción en predev (nunca en producción) e higiene de datos. Usar cuando durante un análisis aparezca algo que huele a bug y haya que trasladarlo al equipo técnico/Roomdoo.
---

# Reporte de bugs — cómo trasladar un hallazgo con calidad

El equipo de digitalización no arregla bugs del PMS: los **documenta bien** y los
traslada por su canal de soporte (helpdesk / contacto con el equipo Roomdoo). Un bug
bien documentado se arregla en días; uno mal documentado rebota semanas.

## Estructura del informe (preparadla con Claude antes de enviar)

**Título**: `[front|back|front+back] <síntoma corto> en <área>`.
Ej: `[back] recaudación duplicada en cierre de caja cuando queda extracto vacío`.

Bloques en este orden:

1. **Resumen** — 1-2 líneas: qué pasa y a quién le pasa.
2. **Impacto cuantificado**: 🔴/🟡/🟢 criticidad · 📊 cuántos casos/registros
   (¡con la query que lo cuenta!) · 🏨 hoteles afectados · 📅 desde cuándo.
3. **Detalle**: pasos exactos para verlo, datos de ejemplo (ver higiene abajo),
   y si Claude localizó el código sospechoso, fichero y línea del repo en `src/`.
4. **Evidencia de BD** (si aplica): la consulta SQL de solo lectura que demuestra el
   problema y su resultado (agregado, sin datos personales).
5. **Hipótesis de causa** — claramente marcada como hipótesis si no está confirmada
   en código. NUNCA afirmar lógica de negocio sin verificarla.

## Reproducción: SIEMPRE en staging, nunca en producción

- Los pasos de reproducción deben apuntar a **`https://predev.roomdoo.com`**
  (frontend contra el backend demo de staging), no a producción.
- Este entorno de taller es de **solo lectura**: no se puede (ni se debe) intentar
  reproducir nada escribiendo en producción. La evidencia se recoge con consultas RO.

## Higiene de información (obligatorio)

- Fuera de los canales internos (y siempre en cualquier cosa que pueda acabar en un
  repo público de GitHub): **nada de** IDs de registros de producción, nombres de
  clientes/huéspedes, teléfonos, importes reales ni URLs internas.
- Los datos concretos (folio, hotel, importes) van solo en el ticket interno.
- En los informes generados, preferir agregados a listados nominales.

## Checklist antes de enviar

- [ ] ¿Título estándar y síntoma claro?
- [ ] ¿Impacto cuantificado con query reproducible?
- [ ] ¿Pasos de reproducción en predev (no en prod)?
- [ ] ¿Referencia a código (`src/…/fichero.py:línea`) si se localizó?
- [ ] ¿Hipótesis marcadas como hipótesis?
- [ ] ¿Sin datos personales ni sensibles donde no toca?
