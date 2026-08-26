---
name: alda-sync-otas-diagnostico
description: Diagnóstico solo-lectura de la sincronización Roomdoo ↔ Neobookings/OTAs (disponibilidad, precios, restricciones, reservas). Usar ante overbookings, precios o disponibilidad desactualizados en canales, o room types que "no salen" al channel manager. Diagnostica con SQL RO; los pushes de barrido y arreglos los ejecuta el equipo técnico.
---

# Sincronización con el channel manager — diagnóstico (solo lectura)

Cómo viaja la información entre Roomdoo y las OTAs (vía Neobookings), y cómo
diagnosticar cuando no viaja. La remediación (pushes forzados, crear bindings,
re-lanzar jobs) la ejecuta el equipo técnico: el valor aquí es **acotar la causa**.

## Arquitectura del push (Roomdoo → Neobookings)

```
cambio (precio/dispo/regla/reserva)
  → listener del conector (en tiempo real)
  → trabajo asíncrono (queue_job, canales wubook/avail/prices)
  → payload hacia Neobookings
  → cada envío queda en pms_api_log (request_type: availability/prices/restrictions)
```

- Entrada (Neobookings → Roomdoo): las reservas de OTA entran por la API
  (`pms_api_log` con `request_type='folios'`).
- Mecánica "dirty" (autocuración parcial): cualquier export de un hotel arrastra
  todo lo pendiente de ese ámbito → un fallo puntual suele autocurarse **si el hotel
  tiene actividad**; en hoteles con poco movimiento puede persistir días.

## Concepto crítico: bindings

Cada room type que deba sincronizarse necesita un **binding** por hotel
(`channel_wubook_pms_room_type`). **Room type sin binding = agujero negro
silencioso**: queda fuera de todos los envíos sin ningún error registrado. Nada crea
bindings automáticamente al crear un room type nuevo.

```sql
-- room types con habitaciones activas en un hotel y SIN binding
-- (causa raíz silenciosa más repetida)
SELECT DISTINCT rt.id, rt.default_code
FROM pms_room_type rt
JOIN pms_room r ON r.room_type_id = rt.id AND r.active
WHERE r.pms_property_id = :property_id
  AND NOT EXISTS (
        SELECT 1 FROM channel_wubook_pms_room_type b
        WHERE b.odoo_id = rt.id)
LIMIT 50;
```
(El binding es por backend/hotel: `channel_wubook_pms_room_type.backend_id` →
`channel_wubook_backend`. El grafo completo está en `contexto/relaciones-bd.md`.)

## Playbook: "el precio/dispo/restricción no llega al canal"

1. **¿Hay binding del room type?** (query de arriba). Sin binding, nada sale en
   tiempo real.
2. **¿Salió el envío y con qué resultado?**
```sql
SELECT id, request_date, request_type, status,
       target_date_from, target_date_to
FROM pms_api_log
WHERE pms_property_id = :property_id
  AND request_type IN ('availability','prices','restrictions')
  AND request_date >= :desde
ORDER BY request_date DESC LIMIT 100;
```
   - HTTP 400 "Hotel does not exist" en `response` = el hotel no está dado de alta
     en Neobookings.
   - Un `error` con `'NoneType' object has no attribute 'ok'` en envíos de
     restricciones puede ser un no-op benigno (payload vacío) — no confundir con
     fallo real.
3. **¿El job asíncrono falló?** `queue_job` con `state='failed'` y `exc_info` con
   timeout de `ws.neobookings.com` (skill `alda-triaje-basico`).
4. Escalado: hotel, room types y ventana de fechas afectada + IDs de log/job.
   El equipo técnico decide si lanza un push de barrido.

## Playbook: overbooking

1. Reconstruir la línea temporal: reservas de esa noche/room type
   (`pms_reservation_line` con `occupies_availability`) y los envíos de
   disponibilidad de esa property alrededor de la hora de la reserva
   (`pms_api_log`, request_type='availability': ¿qué dispo se envió y cuándo?).
2. ¿Hubo errores del channel manager ese día? (`status='error'` concentrados en una
   ventana = caída de Neobookings; puede causar overs en varias propiedades a la vez).
3. ¿El room type tenía binding activo?
4. Con la línea temporal montada, escalar: el equipo técnico verifica los fixes
   conocidos (dispo obsoleta en el push post-reserva, reintentos ante 5xx) y decide
   la remediación con el hotel.

## Señales de auditoría preventiva (consultas periódicas útiles)

- Room types activos sin binding (query de arriba) — por hotel.
- `pms_api_log` con `status='error'` de tipo availability en los últimos N días,
  agrupado por property: los picos delatan hoteles con sync degradado.
- Hoteles sin NINGÚN envío de availability en 48h teniendo reservas nuevas: posible
  cadena de push rota.
