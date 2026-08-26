---
name: alda-mapa-proyecto
description: Mapa de arquitectura del Odoo de Alda Hotels (PMS Roomdoo sobre Odoo 16/Doodba) adaptado al entorno del taller — qué repos hay en src/, qué módulo hace qué, entornos, y cómo llega el código a producción. Usar al orientarse, buscar dónde vive una funcionalidad o entender por qué "el código dice X pero producción hace Y".
---

# Mapa del proyecto Alda Hotels — Odoo 16 (entorno taller)

Sistema de gestión hotelera (PMS Roomdoo) sobre Odoo 16 / OCB, desplegado con Doodba.
Esta skill orienta sobre **dónde vive cada cosa** en el workspace del taller y **cómo
llega el código a producción**.

## Estructura del workspace (`~/alda-ia/`)

- `src/` — clones de solo lectura de los repos fuente relevantes (rama 16.0):
  - `src/pms` — repo OCA base del PMS. Modelos núcleo. La mayoría del custom hereda de aquí.
  - `src/roomdoo-modules` — módulos Roomdoo/CommitSun: API REST, conectores, BookAI…
  - `src/aldamodules` — módulos específicos de Alda (contabilidad, KPIs, helpdesk).
  - `src/l10n-spain` — localización española OCA (SII, facturae…).
  - `src/odoo` — OCB, el core de Odoo (opcional, solo si se clonó).
- `alda-ia-taller/contexto/` — snapshot de `addons.yaml` (qué módulos están
  instalables), `repos.yaml` (qué ramas componen la imagen de prod) y `mapa-bd.md`.
- `informes/` — salida de los informes que generes.

Este workspace NO tiene un Odoo corriendo: el código es **contexto de lectura** y los
datos se consultan en la BD de producción (solo lectura, skill `alda-consultas-bd`).

Hay más repos en producción que no están clonados aquí (OCA varios, `enterprise` —
este último con licencia OEEL-1, nunca copiar su código). La lista completa está en
`contexto/addons.yaml`. Si necesitas código de un repo no clonado, dilo en vez de
inventar su contenido.

## Módulos clave y su papel

- **`pms` (OCA)** — modelos núcleo: `pms.property`, `pms.folio`, `pms.reservation`,
  `pms.reservation.line`, `pms.service`, `pms.room`, `pms.room.type`,
  `pms.availability.plan.rule`, `pms.checkin.partner`,
  `pms.board.service.room.type` (regímenes).
- **`pms_api_rest`** (roomdoo-modules) — API REST que consume el frontend Roomdoo
  (React) y clientes externos (Neobookings, integradores). Cada llamada queda en el
  modelo `pms.api.log`.
- **`roomdoo_fastapi` / `pms_fastapi`** — capa FastAPI más nueva (deprecación
  progresiva del base_rest antiguo).
- **`connector_pms` + `connector_pms_wubook`** — sincronización con el channel
  manager (Neobookings). Ver skill `alda-sync-otas-diagnostico`.
- **`pms_l10n_es`** — comunicación SES (partes de viajeros/RH a policía).
- **`pms_bookai` / `pms_notifications`** — notificaciones WhatsApp/IA. Ver skill
  `alda-bookai-whatsapp`.
- **`alda_pms_kpi`** (aldamodules) — KPIs internos de Alda.

## Entornos

| Entorno | URL | Nota |
|---|---|---|
| Producción | `odoo.gestionalda.es` | BD `odoo`. La BD que consulta este taller (solo lectura) |
| Staging/demo | `odoo.staging.aldahotels.roomdoo.com`, frontend `predev.roomdoo.com` | Donde se reproducen bugs y se prueban cambios |

## Cómo llega el código a producción (importante para no confundirse)

1. Los repos fuente (`pms`, `roomdoo-modules`, `aldamodules`…) viven en GitHub.
2. Un repo "scaffolding" (GitLab, gestionado por el equipo técnico) define en
   `repos.yaml` qué ramas/PRs de cada repo se mergean al construir la **imagen
   Docker** de cada entorno (`main` → prod, `staging` → demo).
3. Producción ejecuta esa imagen: **el código corre desde dentro de la imagen**. Un
   commit mergeado en GitHub NO está en producción hasta que se construye y despliega
   una imagen nueva que lo incluya.
4. Además pueden existir **hot-patches** (parches aplicados a mano en el contenedor
   por el equipo técnico) que no están en ningún repo todavía.

**Consecuencia práctica**: si el código de `src/` contradice lo que hace producción,
no es necesariamente un error tuyo — puede haber drift (rama distinta, imagen
antigua, hot-patch). Preséntalo como discrepancia a verificar por el equipo técnico,
citando fichero y línea.

## Cómo buscar en el código

- Buscar la implementación de un endpoint: grep en
  `src/roomdoo-modules/pms_api_rest/services/` (ej: `pms_folio_service.py`).
- Buscar un modelo/campo: grep `_name = "pms.` o el nombre del campo en `src/pms` y
  `src/roomdoo-modules`.
- La cabecera `_inherit` indica qué módulos extienden un modelo — un mismo modelo
  puede estar repartido entre varios repos.
