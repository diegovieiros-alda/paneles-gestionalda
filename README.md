# Documentación técnica — `paneles-gestionalda`

Repo: https://github.com/diegovieiros-alda/paneles-gestionalda
Producción: https://paneles.gestionalda.es

## 1. Qué es

Panel de gestión interno para Alda Hotels: una webapp con **login y roles por
usuario** que muestra dashboards operativos y financieros con **datos en vivo
de Odoo** (el PMS/ERP de la cadena, en solo lectura). Sustituye/complementa
informes que hoy corren como workflows de n8n — el motor de cálculo del
dashboard de Bloqueos es explícitamente un port a Python del nodo
"Consolidador y Motor Financiero" de ese workflow n8n.

Arquitectura: **React (Vite + TypeScript) + Django**, monorepo con dos
carpetas (`backend/`, `frontend/`) más una tercera (`diseño/`) que es un
proyecto aparte de mockups de diseño (no se despliega).

```
paneles-gestionalda/
├── backend/     Django — API en /api/, admin en /admin/
├── frontend/    React + Vite + TypeScript — SPA con router
└── diseño/      Proyecto de mockups (TanStack, Bun) — referencia visual, no productivo
```

---

## 2. Backend (Django)

### 2.1 Estructura

```
backend/
├── manage.py
├── requirements.txt          Django 5.2, gunicorn, psycopg2-binary, python-dotenv, whitenoise
├── config/                   proyecto Django
│   ├── settings.py
│   ├── urls.py                → /admin/, /api/ (incluye core.urls)
│   ├── wsgi.py / asgi.py
└── core/                     única app Django
    ├── models.py              DashboardAccess, MapeoRolPuesto, PerfilUsuario
    ├── accounts.py            registro, login, decoradores de permisos
    ├── views.py                endpoints públicos de dashboards
    ├── admin_views.py          endpoints de administración (usuarios/roles)
    ├── cache.py                cache de queries a Odoo + tracking odoo/cache
    ├── db_routers.py           router que impide migrar/escribir en 'odoo'
    ├── bloqueos/                dominio "Bloqueos de habitaciones"
    │   ├── repository.py        SQL contra Odoo
    │   ├── engine.py             cálculo puro (sin BD)
    │   └── service.py            orquesta repository + engine
    ├── hoteles/                  dominio "Hoteles / Desayunos"
    │   ├── repository.py         SQL contra Odoo (muy extenso)
    │   └── service.py             orquesta y da forma a la respuesta
    └── migrations/               8 migraciones (modelos propios, no tocan 'odoo')
```

### 2.2 Dos bases de datos

`config/settings.py` define **dos conexiones**:

- **`default`** — Postgres propio de la app (usuarios, permisos, mapeos de
  roles). Aquí sí se migra.
- **`odoo`** — conexión de **solo lectura** a la base de datos de producción
  del PMS/ERP Odoo. No tiene modelos Django (serían cientos de tablas); se
  consulta con SQL crudo vía `connections["odoo"].cursor()`. Un
  `OdooReadOnlyRouter` (`db_routers.py`) impide que Django intente migrar
  nada ahí. La conexión usa `sslmode=require` y `CONN_MAX_AGE=60`.

Esta separación es el patrón central del backend: **todo dato de negocio
real viene de Odoo por SQL directo**; la base propia solo guarda identidad,
permisos y configuración de la propia app.

### 2.3 Cache

`core/cache.py` implementa un decorador `@cache_result` que cachea por
argumentos posicionales (hash SHA1 de `pickle.dumps(...)`) durante 5 minutos,
usando **`FileBasedCache`** (disco compartido) en vez de cache en memoria del
proceso — necesario porque gunicorn corre con varios workers y cada uno
tendría su propia memoria si fuera `LocMemCache`.

Además, un `ContextVar` (`tracking()`) cuenta hits/misses durante una vista
para poder informar al frontend si la respuesta vino de Odoo en vivo o de
cache (campo `origenDatos: "odoo" | "cache"` en casi todas las respuestas).

### 2.4 Autenticación y autorización

- Autenticación por **sesión de Django** (cookies, no tokens/JWT), con
  protección CSRF estándar (`/api/auth/csrf/` expone la cookie, el frontend
  la reenvía en `X-CSRFToken`).
- **Registro cerrado**: solo puede crear cuenta quien tenga un `work_email`
  activo en `hr_employee` de Odoo (`accounts.empleado_activo`, consulta a la
  BD `odoo`). No filtra por `company_id` — cualquier sociedad del grupo
  cuenta.
- **Roles = `django.contrib.auth.Group`**, sin modelo de "Rol" propio. Cada
  dashboard es un `codename` de permiso `core.ver_<key>` (definido de forma
  declarativa en `DashboardAccess.Meta.permissions`, modelo sin tabla:
  `managed = False`). Los dashboards son:
  `bloqueos, oportunidades, desayunos, tendencias, alertas, ajustes`.
- **Asignación automática de rol**: al hacer login (no solo al registrarse),
  si el email del usuario tiene `puesto` en Odoo, se busca un
  `MapeoRolPuesto` (tabla propia, editable desde la pantalla de
  administración) que mapea `puesto_trabajo → Group`. Solo se asigna si el
  usuario **no tiene ya** un grupo (para no pisar una asignación manual de
  un admin). Los superusuarios se saltan este paso: ya ven todo.
- Decoradores en `accounts.py`:
  - `requiere_dashboard(key)` — exige sesión + permiso `ver_<key>` (o
    superuser).
  - `requiere_algun_dashboard(*keys)` — igual pero basta con uno; lo usa
    `hotel_detalle`, porque **no existe un dashboard "hoteles" propio**: la
    ficha de un hotel se llega desde cualquier dashboard que liste hoteles
    (hoy Desayunos y Bloqueos).
  - `requiere_superuser` — para toda la sección de administración
    (`admin_views.py`).
- `PerfilUsuario` cachea `departamento_odoo`/`puesto_trabajo` en cada login
  para no volver a consultar Odoo al listar usuarios en la pantalla de
  administración.

### 2.5 Endpoints (`core/urls.py`)

```
GET  /api/health/
GET  /api/auth/csrf/
POST /api/auth/registro/        POST /api/auth/login/    POST /api/auth/logout/
GET  /api/auth/me/

GET  /api/bloqueos/?desde&hasta                    (permiso: bloqueos)
GET  /api/hoteles/<id>/                            (permiso: bloqueos O desayunos)
GET  /api/hoteles/<id>/bloqueos/?desde&hasta        (permiso: bloqueos)
GET  /api/desayunos/?desde&hasta&tipo=buffet,...    (permiso: desayunos)
GET  /api/hoteles/<id>/desayunos/?desde&hasta       (permiso: desayunos)

GET     /api/admin/usuarios/                (superuser)
PATCH/DELETE /api/admin/usuarios/<id>/
GET/POST     /api/admin/roles/
PATCH/DELETE /api/admin/roles/<id>/
GET     /api/admin/dashboards/
GET     /api/admin/puestos/                 (puestos distintos en Odoo, cacheado)
GET/POST     /api/admin/mapeos/
PATCH/DELETE /api/admin/mapeos/<id>/
```

Todas las vistas de datos siguen el mismo patrón: validan fechas (`?desde`,
`?hasta`, ISO `YYYY-MM-DD`), limitan el rango máximo, envuelven la consulta
en `with tracking() as t:` y añaden `origenDatos` a la respuesta; los errores
inesperados se registran con `logger.exception` y devuelven `502` sin
detalle interno.

Límites de rango:
- **Bloqueos**: máx. 92 días (~3 meses) — evita lanzar consultas enormes
  contra Odoo.
- **Desayunos**: máx. 370 días (~1 año fiscal), más permisivo porque el
  resumen ya consulta 12 meses de serie mensual sin problema.

### 2.6 Dominio "Bloqueos" (`core/bloqueos/`)

Objetivo: por cada hotel y rango de fechas, calcular cuántas
habitaciones-noche están **fuera de servicio** (bloqueadas), su motivo, y el
**coste de oportunidad estimado** (habitaciones-noche bloqueadas × ADR real
del hotel).

- **`repository.py`** — 3 queries SQL sobre Odoo, todas cacheadas:
  - `fetch_rooms()` — inventario activo (`pms_room` + `pms_property` +
    `res_partner`).
  - `fetch_room_types()` — qué tipos de habitación cuentan como
    "overnight" (`pms_room_type`).
  - `fetch_lines(desde, hasta)` — una fila por línea de reserva
    (roomnight) del rango, con reserva, hotel y motivo de cierre ya
    resueltos (`pms_reservation_line` + `pms_reservation` + `pms_folio` +
    `room_closure_reason`).
- **`engine.py`** — **funciones puras**, sin acceso a BD ni red (dato de
  diseño explícito, para poder testear el cálculo sin Odoo). Contiene:
  - `HOTEL_IDS_EXCLUIDOS_FIJOS` y `MAPEO_ZONAS` (diccionario código de
    hotel → zona geográfica, ~130 hoteles) — es el mismo mapeo de respaldo
    que usaba el workflow n8n cuando no podía leer la hoja de Google Sheets
    de zonas; aquí es la única fuente.
  - `es_hotel_excluido()` — excluye por id fijo o por zona ("Niuco",
    "Restauradores", vía regex).
  - `compute_report(rooms, room_types, lines, fecha_inicio, fecha_fin)` —
    el cálculo completo:
    1. Capacidad real por hotel (excluye tipos no-overnight y hoteles
       excluidos).
    2. ADR real y ocupación, solo de reservas `reservation_type == "normal"`
       con línea no `draft`/`cancel`.
    3. Bloqueos (`reservation_type == "out"`): agrupa por reserva, cuenta
       noches dentro del rango pedido y noches totales de la reserva de
       bloqueo, resuelve causa/motivo/categoría del cierre.
    4. Agregados finales por hotel: inventario, % ocupación/bloqueo/libre,
       ADR utilizado, pérdida financiera estimada — y agregados de cadena.
  - Detalle de diseño: si un hotel tiene una reserva de bloqueo pero
    **ninguna** habitación suya está en el inventario activo (caso raro,
    p.ej. habitación archivada en Odoo), `capacidadTotal` es `null` en vez
    de un valor inventado — antes se rellenaba con un `45` fijo que
    contaminaba los porcentajes; ahora esos porcentajes simplemente no se
    calculan.
- **`service.py`** — `get_report(fecha_inicio, fecha_fin)`: si no se pasan
  fechas, usa **ayer** por defecto; llama a los 3 fetch de repository y a
  `compute_report`.

### 2.7 Dominio "Hoteles / Desayunos" (`core/hoteles/`)

El más grande y con más reglas de negocio del repo. Cubre: ocupación
(personas-noche), ventas de desayuno por régimen/tipo, KPIs financieros F&B
(contables) y presupuesto.

Distinciones de negocio documentadas explícitamente en el código (críticas
para no "arreglar" algo que es así a propósito):

- **Regímenes de desayuno** (`_REGIMENES_DESAYUNO`): `AD, ADB, ADE, ADN,
  DESCOL, DESGRUP, DESGRUPCOL, DESNEGCOL, SAD`, identificados por el
  **catálogo real** (`pms_board_service` vía
  `pms_board_service_room_type_line`), no por nombre de producto ni por el
  flag `is_board_service` (no fiable: ~50% de las líneas reales lo tienen en
  `false`).
- **"Colaborador"** (`DESCOL, DESNEGCOL, DESGRUPCOL` — venta a
  partner/agencia, no directa al huésped): cuenta en **producción**
  (dinero real) pero se **excluye de la penetración**, porque una reserva de
  colaborador puede no corresponder a ningún huésped contado en "alojados"
  — mezclarlos daría penetraciones >100% (verificado, no solo teórico).
- **"Tipo Desayuno"** (`buffet, express, colaborador, otros`) es un filtro
  de negocio **distinto** del régimen: un mismo régimen mezcla productos de
  tipo distinto (p.ej. `ADE` tiene tanto "Desayuno Infantil" como "Express
  Breakfast"), así que se clasifica **por nombre de producto**. Lo que no
  encaja en las 3 categorías cae en "otros" a propósito.
- **Alojados = personas-noche**, no habitaciones-noche (`adults +
  children_occupying`), porque una habitación puede alojar varios adultos.
- **Calidad de check-in**: comparación declarado (reserva) vs. check-in
  confirmado (`pms_checkin_partner`), **solo para auditoría** — nunca se usa
  para "alojados"/penetración, porque usar el check-in real da siempre
  **menos** personas (el check-in es un registro de viajeros, no un censo:
  reservas completadas antiguas no tienen fila de check-in).
- **KPIs financieros F&B** (`ingresos/gastos/margenBruto/...`) vienen de
  **contabilidad** (cuenta `70500000020` "Desayunos" + cuentas de compra de
  materia prima F&B), **no** del PMS — y **excluyen colaborador por
  completo**, a diferencia de "producción". Son dos fuentes de verdad
  distintas a propósito, documentadas también en una skill del repo
  (`.claude/alda-precios-desayuno/SKILL.md`, no incluida en el listado
  anterior pero referenciada en varios docstrings).
- **Presupuesto** (`account.move.budget`, solo `state='confirmed'`):
  `cumplimientoIngresos/Gastos` es `null` (no `0`) cuando no hay presupuesto
  confirmado — un `0%` sugeriría que no se vendió nada, no que falta
  presupuesto.
- **Submarca** (Basic/Standard/Plus/Nomad): se resuelve
  `pms_property → partner → brand → partner.name`; ~43% de los hoteles no
  tiene marca asignada y se muestra como "Sin submarca" en vez de ocultarse.

`service.py` expone:
- `get_hoteles(desde, hasta, tipos_desayuno=None)` — listado de hoteles con
  todas las métricas anteriores, ordenado por producción descendente.
- `get_resumen(...)` — lo anterior + serie mensual (últimos 12 meses,
  fusionando PMS y contabilidad) + top vendedores de desayuno del periodo.
  Es lo que consume la portada de Desayunos.
- `get_hotel_info(id)` / `hotel_existe(id)` — identidad básica de un hotel
  (sin métricas), usada por la ficha de cualquier dashboard.
- `get_hotel_desayunos(id, desde, hasta)` — igual que `get_hoteles` pero
  para un único hotel, con su propia serie mensual y vendedores.

### 2.8 Tests

`bloqueos/tests.py`, `test_accounts.py`, `test_cache.py` (≈280 líneas en
total) — cubren sobre todo `engine.py` (cálculo puro, fácil de testear sin
BD), el flujo de registro/login/asignación de rol, y el decorador de cache.

---

## 3. Frontend (React + Vite + TypeScript)

### 3.1 Stack

React 19, React Router 7, Vite 8 (con plugin `@tailwindcss/vite`, Tailwind
4), Recharts para gráficos, `lucide-react` para iconos, componentes propios
de UI estilo shadcn (`components/ui/`, basados en `@radix-ui/react-slot` +
`class-variance-authority`). En desarrollo, Vite proxya `/api` a
`http://localhost:8000` (`vite.config.ts`).

### 3.2 Estructura

```
frontend/src/
├── App.tsx                  rutas + guardas de acceso
├── main.tsx / index.css
├── lib/
│   ├── auth-context.tsx      contexto de sesión (React Context)
│   ├── auth-api.ts            login/registro/logout/me + gestión CSRF
│   ├── admin-api.ts            endpoints de administración
│   ├── bloqueos-api.ts         tipos + fetch de /api/bloqueos
│   ├── hoteles-api.ts          tipos + fetch de /api/desayunos y /api/hoteles
│   ├── date-range.ts           presets de rango de fechas (hoy/ayer/7d/30d/mes)
│   ├── use-desayunos-data.ts   hook de datos para el dashboard de desayunos
│   ├── export-csv.ts           exportación de tablas a CSV
│   ├── mock-data.ts            datos de ejemplo para dashboards aún no conectados
│   └── utils.ts
├── components/
│   ├── ui/                     primitivos (button, etc.)
│   └── dashboard/               ~28 componentes: sidebar, shell, topbar,
│                                 tablas, gráficos, tarjetas de KPI, badge de
│                                 origen de datos, etc. — varios en pares
│                                 "-real" (datos de Odoo) vs. sin sufijo
│                                 (mock)
└── pages/                       una página por ruta (ver App.tsx)
```

### 3.3 Rutas y guardas de acceso (`App.tsx`)

```
/login              público
/registro            público
/                     redirige al primer dashboard visible del usuario (o /ajustes)
/bloqueos                        ProtectedRoute(dashboard="bloqueos")
/bloqueos/:hotelId                 idem
/desayunos                        ProtectedRoute(dashboard="desayunos")
/desayunos/donde-actuar             idem
/desayunos/detalle                  idem
/desayunos/:hotelId                 idem
/oportunidades                    ProtectedRoute(dashboard="oportunidades")
/tendencias                       ProtectedRoute(dashboard="tendencias")
/alertas                          ProtectedRoute(dashboard="alertas")
/ajustes                          ProtectedRoute(dashboard="ajustes")
/usuarios                         SuperuserRoute
*                                  404
```

`ProtectedRoute` exige sesión + que `usuario.dashboards` incluya la clave del
dashboard (la misma lista que devuelve `/api/auth/me/`, calculada en backend
a partir de los `Group`/permisos). `SuperuserRoute` exige
`usuario.esSuperusuario`. Ninguna de las dos oculta datos "a medias": si no
hay acceso, se muestra una pantalla de "Sin acceso" con botón de cerrar
sesión — la autorización real siempre la aplica el backend en cada endpoint.

Nota de diseño explícita en el propio código: **no existe una sección
"Hoteles" independiente**. Cada dashboard con datos por hotel (Desayunos,
Bloqueos) trae su propio listado y su propia ficha de detalle, protegida por
el permiso de ese dashboard, no por uno genérico.

### 3.4 Estado de conexión a datos reales

Según el comentario en `App.tsx` y la existencia de componentes "-real":
**Bloqueos y Desayunos están conectados a datos reales de Odoo**; el resto
de dashboards (Oportunidades, Tendencias, Alertas) siguen usando
`mock-data.ts` — ya son navegables y respetan el rol del usuario, pero aún
no tienen backend propio.

### 3.5 Autenticación en el cliente

`auth-context.tsx` mantiene el usuario de sesión en un React Context,
cargado al montar la app vía `GET /api/auth/me/`. `auth-api.ts` centraliza
el patrón CSRF de Django: antes de cualquier `POST` (login, registro,
logout) hace `GET /api/auth/csrf/` para obtener la cookie `csrftoken` y la
reenvía en el header `X-CSRFToken`; todas las peticiones usan
`credentials: "include"`. `admin-api.ts` sigue el mismo patrón para los
endpoints de administración (`PATCH`/`POST`/`DELETE`).

### 3.6 Tipado de las respuestas de API

`bloqueos-api.ts` y `hoteles-api.ts` replican en TypeScript, casi campo a
campo, la forma exacta de las respuestas del backend — incluyendo los
matices de negocio (p. ej. `totalInventario: number | null`, con comentario
explicando que es `null` cuando no hay inventario activo conocido; o
`cumplimientoIngresos: number | null`, documentando por qué `null` y no
`0`). Esto mantiene sincronizados frontend y backend sin un generador de
tipos automático (no hay OpenAPI/schema compartido en el repo).

---

## 4. `diseño/` — proyecto de mockups

Carpeta aparte (668 KB), con su propio `package.json`, `bun.lock`/`bunfig.toml`
(gestor de paquetes **Bun**, no npm), `router.tsx` y `routeTree.gen.ts`
(TanStack Router), `server.ts`/`start.ts`. Es un stack **distinto** al del
frontend real (`frontend/`) y no se menciona en el despliegue — funciona como
referencia visual/prototipo de diseño, no como parte de la app en
producción.

---

## 5. Despliegue y desarrollo local

Desplegado en **https://paneles.gestionalda.es**. `gunicorn` sirve el
backend Django (de ahí la necesidad de una cache en disco compartida entre
workers, ver §2.3); `whitenoise` sirve los estáticos del backend
directamente sin un servidor aparte.

```bash
# backend
cd backend
python -m venv venv
venv/bin/pip install -r requirements.txt
cp .env.example .env   # rellenar: DJANGO_SECRET_KEY, DJANGO_DEBUG,
                        # DJANGO_ALLOWED_HOSTS, DJANGO_CSRF_TRUSTED_ORIGINS,
                        # DB_* (Postgres propio), ODOO_DB_* (solo lectura)
venv/bin/python manage.py migrate
venv/bin/python manage.py runserver

# frontend
cd frontend
npm install
npm run dev   # proxya /api a localhost:8000, ver vite.config.ts
```

No se incluye `.env.example` en el listado de archivos revisado; sus claves
se infieren de `settings.py` (`DJANGO_SECRET_KEY`, `DJANGO_DEBUG`,
`DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `DB_NAME/USER/
PASSWORD/HOST/PORT`, `ODOO_DB_NAME/USER/PASSWORD/HOST/PORT/SSLMODE`).

---

## 6. Puntos a tener en cuenta si vas a tocar el código

- **Nunca escribir en la conexión `odoo`** — el router lo impide para
  migraciones, pero el código de aplicación también debe respetarlo por
  convención (no hay salvaguarda a nivel de SQL).
- Si cambias algo en `hoteles/repository.py`, revisa primero los
  comentarios de cabecera de cada query: casi todas documentan **por qué**
  se excluye o incluye colaborador, por qué se usa una cuenta contable y no
  otra, o por qué una query está deliberadamente duplicada (ver
  `_CTES_DESAYUNO_CON_TIPO`, separada a propósito de `_DESAYUNOS_SQL` para
  que el camino sin filtro de tipo no cambie ni un byte de SQL ejecutado).
- `engine.py` de bloqueos es puro por diseño — cualquier lógica nueva de
  cálculo debería mantenerse ahí sin tocar BD, para poder seguir
  testeándola sin Odoo.
- El mapeo de zonas (`MAPEO_ZONAS`) es un diccionario fijo en código, no
  viene de Odoo ni de Google Sheets desde este proyecto — si cambia la
  organización por zonas de la cadena, hay que editarlo a mano aquí.
- Añadir un dashboard nuevo implica: entrada en `DASHBOARDS`
  (`core/models.py`) + migración, endpoint(s) protegidos con
  `requiere_dashboard`, entrada en `NAV` (`sidebar.tsx`) y ruta en
  `App.tsx` envuelta en `ProtectedRoute`.