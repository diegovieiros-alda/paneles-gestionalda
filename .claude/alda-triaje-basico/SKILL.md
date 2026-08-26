---
name: alda-triaje-basico
description: Triaje de incidencias del PMS Roomdoo/Alda en modo solo-diagnóstico — clasificar el problema, localizar la evidencia en la BD de solo lectura (pms_api_log, queue_job, pms_notification_log) y decidir si se escala y con qué información. Usar ante "esta reserva no está", "esto falló", "algo va lento" o cualquier ticket de hotel con síntoma técnico.
---

# Triaje básico de incidencias — solo diagnóstico

Este entorno es de **solo lectura**: aquí se diagnostica y se documenta; las
acciones correctoras (reiniciar servicios, re-lanzar trabajos, corregir datos) las
ejecuta el equipo técnico. El objetivo del triaje es entregar al técnico un caso ya
acotado: qué pasó, cuándo, a quién afecta y dónde está la evidencia.

## Metodología

1. **Clasifica el síntoma**: ¿dato que falta o está mal (reserva, precio, dispo)?
   ¿mensaje de error en pantalla? ¿lentitud? ¿algo que no se envió (WhatsApp, canal)?
2. **Acota**: hotel (`pms_property`), fechas, folio/localizador si lo hay. Sin esto
   no hay triaje — pídelo antes de consultar nada.
3. **Busca la evidencia en la fuente correcta** (tabla de abajo) con consultas RO
   acotadas (skill `alda-consultas-bd`).
4. **Distingue transitorio de persistente**: un error puntual durante un despliegue
   nocturno que no se repite no es lo mismo que un error que ocurre cada vez.
5. **Documenta y escala** con el formato de `alda-reporte-bugs` si procede.

## Dónde mirar cada cosa

| Síntoma | Fuente (solo lectura) |
|---|---|
| Reserva/modificación de OTA que no aparece o aparece mal | `pms_api_log`: buscar el localizador en `request`, revisar `status` y `response` |
| Precio/dispo/restricción desactualizado en el canal | `pms_api_log` (request_type availability/prices/restrictions) + `queue_job` fallidos → skill `alda-sync-otas-diagnostico` |
| "¿Le llegó el WhatsApp al huésped?" | `pms_notification_log` → skill `alda-bookai-whatsapp` |
| Proceso asíncrono que no terminó (export, envío) | `queue_job` con `state='failed'` y su `exc_info` |
| Descuadre de caja/balance/factura | skill `alda-contabilidad-diagnostico` |
| Histórico de cambios de un registro | `mail_message` / `mail_tracking_value` del registro |
| Error en pantalla del front / lentitud general | No visible desde la BD: recoger captura, hora exacta, usuario y hotel, y escalar |

## Consultas de arranque típicas

```sql
-- llamadas API con error de un hotel en una ventana
SELECT id, request_date, method, endpoint, request_type, status
FROM pms_api_log
WHERE pms_property_id = :property_id
  AND request_date >= :desde AND status = 'error'
ORDER BY request_date DESC LIMIT 100;

-- buscar un localizador de OTA en las llamadas
SELECT id, request_date, method, endpoint, status
FROM pms_api_log
WHERE request LIKE '%LOCALIZADOR%'
  AND request_date >= :desde
ORDER BY request_date DESC LIMIT 50;

-- jobs fallidos recientes
SELECT id, date_created, channel, left(name, 120) AS job, left(exc_info, 300) AS error
FROM queue_job
WHERE state = 'failed' AND date_created >= now() - interval '7 days'
ORDER BY date_created DESC LIMIT 100;
```

(El `LIKE '%...%'` sobre `request` es pesado: acótalo SIEMPRE por fecha y, si se
puede, por `pms_property_id`.)

## Patrones conocidos (hipótesis de arranque, no diagnósticos automáticos)

- **PUT de OTA rechazado con error de validación engañoso** (ej: "Board Service X
  not available in Room Type Y"): la causa real puede ser otra (tarifa extinta,
  configuración del hotel). Adjuntar el `pms_api_log` completo al escalar.
- **Folio facturado**: las modificaciones de OTA sobre folios con líneas facturadas
  se rechazan a propósito (`FOLIO_HAS_INVOICED_LINES`) — no es un bug, es un límite
  del flujo; el hotel debe gestionar el cambio manualmente.
- **Errores en oleada a la misma hora en varios hoteles**: sospecha de caída del
  servicio externo (channel manager) o despliegue — mirar si los `error` de
  `pms_api_log` se concentran en una ventana temporal.
- **Job fallido por timeout contra el channel manager**: el estado suele viajar en
  el siguiente export si el hotel tiene actividad; aun así, reportarlo para que el
  técnico valore re-lanzarlo.

## Qué debe llevar el escalado

Hotel, ventana temporal, folio/localizador, la(s) query(s) usadas y su resultado,
IDs de `pms_api_log`/`queue_job` relevantes, y si el código de `src/` sugiere una
causa, el fichero:línea — todo con el formato de `alda-reporte-bugs`.
