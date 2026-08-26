---
name: alda-bookai-whatsapp
description: Auditoría de notificaciones WhatsApp/BookAI en Alda — reglas, plantillas Meta, log de envíos (pms.notification.log) y entrega real. Usar ante "¿le llegó el WhatsApp al huésped?", "¿por qué no se envió?", auditorías de plantillas o dudas sobre la configuración BookAI de un hotel.
---

# BookAI / WhatsApp — auditoría de notificaciones

## Modelo mental: DOS planos, no confundirlos

1. **Odoo = configuración + libro de envíos.** Aquí viven las reglas de notificación,
   las plantillas y `pms.notification.log`, que registra **cada intento de envío**
   con su estado y la respuesta HTTP de BookAI. Odoo NO sabe si el mensaje llegó al
   móvil.
2. **BookAI = entrega real.** El backend BookAI (y Meta detrás) sabe si el mensaje
   quedó sent/delivered/read/failed en WhatsApp.

Un "se envió" en Odoo solo significa "BookAI aceptó la petición". Un "no le llegó"
puede ser: no se intentó (regla/condición), se intentó y falló (error), o se entregó a
Meta y Meta lo rechazó (plantilla, número, ventana 24h).

## Piezas en Odoo (`pms_bookai`)

- **Regla de notificación**: qué evento dispara qué plantilla, por qué canal
  (bookai_whatsapp), con qué desfase temporal y a qué hoteles aplica.
- **Plantilla**: el contenido. Se aprueba en Meta por **nombre + idioma**; cambiar el
  cuerpo en Odoo no cambia lo aprobado en Meta — deben mantenerse alineados.
- **`pms.notification.log`**: un registro por intento. Estados:
  - `sent` / `delivered` / `read` → OK.
  - `skipped` → NO se envió por una condición/regla. Mirar el campo de error (ej:
    "BookAI deshabilitado para la propiedad"). No es un fallo.
  - `failed` / `error` → fallo real; incluye el HTTP status devuelto por BookAI.
- Config por entorno en `ir.config_parameter`: `pms_bookai.api_endpoint`
  (prod = `https://bookai-aws.roomdoo.com/`; staging suele apuntar a
  predev o a un ngrok de desarrollo que cambia), `instance_id` y `api_token` (distinto
  por entorno, gestionado desde el backend BookAI).

## Playbook de auditoría

**"¿Se le envió X a este folio/huésped?"**
1. Buscar en `pms.notification.log` por folio/plantilla/fecha.
2. No hay registro → ninguna regla disparó: revisar reglas del hotel (¿plantilla
   asociada? ¿hotel incluido? ¿condiciones del evento?).
3. `skipped` → leer el motivo; suele ser configuración de la property o exclusión
   (ej: agencias excluidas de recordatorios de pago vía
   `bookai_exclude_payment_reminders` en el partner).
4. `sent` pero el huésped dice que no llegó → el problema está en el plano
   BookAI/Meta: comprobar en BookAI la conversación (errores de Meta: plantilla no
   aprobada en ese idioma, número inválido, fuera de ventana). Si hay conector MCP de
   auditoría BookAI disponible, usar `notification_sends` / `diagnose_conversation`;
   si no, escalar a quien tenga acceso al backend BookAI.

**"Auditar una plantilla"**: contenido en Odoo vs aprobado en Meta (nombre+idioma) +
histórico de envíos de esa plantilla (ratio skipped/failed).

**"Cuadrar Odoo vs BookAI"**: reconciliación intento-a-entrega (herramienta
`notification_reconcile` del conector de auditoría, si está conectado).

## Cómo compone BookAI el prompt de sus agentes (para no duplicar)

El backend BookAI inyecta automáticamente en cada worker: la KB (docs con
`inject_always`), fecha/hora con TZ del hotel, contexto de la property (pricelists,
room types), datos del huésped y sus reservas, resultados de pasos previos y la lista
de tools disponibles. **No duplicar nada de eso en el `system_prompt` del agente en
Odoo** — el prompt del agente debe llevar solo el comportamiento específico.
Excepción: los **supervisores** no reciben KB — sus reglas de escalado deben ir en su
propio system_prompt.

Las descripciones de las tools del SDK se sincronizan por cron diario desde el backend
(**sobrescribe** lo editado en Odoo): los cambios de descripciones se hacen en el SDK
(vendored en el repo bookai), no en Odoo.

## Problemas conocidos (a jul-2026)

- **Cron de recordatorios de pago**: server action definida solo en BD de prod (no en
  git), sin límite, capaz de estar >28 min en una transacción → bloquea updates de
  módulo y consume CPU. Si hay latencia y ese cron está activo, es sospechoso
  habitual (ver `alda-operativa-prod`).
- Plantillas: la aprobación en Meta es por nombre+idioma; una plantilla "rota"
  (rechazada o desalineada con Odoo) falla silenciosamente para ese idioma concreto —
  al auditar, comprobar TODOS los idiomas configurados.
- La configuración de reglas/plantillas/WhatsApp **no se replica** automáticamente
  entre staging y prod (la KB sí se ha replicado en despliegues); tras un alta de
  hotel en prod hay que crear sus bindings/reglas explícitamente.
