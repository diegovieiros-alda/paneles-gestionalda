import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import {
  actualizarMapeo,
  actualizarRol,
  actualizarUsuario,
  crearMapeo,
  crearRol,
  eliminarMapeo,
  eliminarRol,
  eliminarUsuario,
  fetchDashboardsDisponibles,
  fetchMapeos,
  fetchPuestos,
  fetchRoles,
  fetchUsuarios,
  type DashboardDisponible,
  type MapeoRol,
  type Rol,
  type UsuarioAdmin,
} from "@/lib/admin-api";

const SELECT_CLASS =
  "rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground";

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [mapeos, setMapeos] = useState<MapeoRol[]>([]);
  const [puestos, setPuestos] = useState<string[]>([]);
  const [dashboardsCatalogo, setDashboardsCatalogo] = useState<DashboardDisponible[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      const [u, r, m, p, db] = await Promise.all([
        fetchUsuarios(),
        fetchRoles(),
        fetchMapeos(),
        fetchPuestos(),
        fetchDashboardsDisponibles(),
      ]);
      setUsuarios(u.usuarios);
      setRoles(r.roles);
      setMapeos(m.mapeos);
      setPuestos(p.puestos);
      setDashboardsCatalogo(db.dashboards);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function onCambiarRol(usuario: UsuarioAdmin, grupoId: string) {
    try {
      await actualizarUsuario(usuario.id, { grupoId: grupoId ? Number(grupoId) : null });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  async function onToggleActivo(usuario: UsuarioAdmin) {
    try {
      await actualizarUsuario(usuario.id, { activo: !usuario.activo });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  async function onHacerSuperusuario(usuario: UsuarioAdmin) {
    const nombre = usuario.nombre || usuario.email;
    if (!confirm(`¿Hacer superusuario a ${nombre}? Tendrá acceso total y ya no se podrá gestionar desde aquí.`)) return;
    try {
      await actualizarUsuario(usuario.id, { esSuperusuario: true });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  async function onEliminar(usuario: UsuarioAdmin) {
    const nombre = usuario.nombre || usuario.email;
    if (!confirm(`¿Eliminar la cuenta de ${nombre}? Esta acción no se puede deshacer.`)) return;
    try {
      await eliminarUsuario(usuario.id);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  return (
    <DashboardShell title="Usuarios" subtitle="Gestión de usuarios y roles">
      <div className="p-6 max-w-[1200px] mx-auto space-y-6">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
        )}

        <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
          <header className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Usuarios registrados</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {usuarios ? `${usuarios.length} usuarios` : "Cargando…"}
            </p>
          </header>

          {usuarios && (
            <div className="divide-y divide-border">
              {usuarios.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-[220px]">
                    <div className="text-sm font-medium text-foreground">{u.nombre || u.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.email}
                      {u.puesto ? ` · ${u.puesto}` : ""}
                      {u.departamento ? ` · ${u.departamento}` : ""}
                    </div>
                  </div>

                  {u.esSuperusuario ? (
                    <span className="text-xs text-muted-foreground px-2 py-1">Superusuario</span>
                  ) : (
                    <>
                      <select
                        className={SELECT_CLASS}
                        value={u.grupoId ?? ""}
                        onChange={(e) => onCambiarRol(u, e.target.value)}
                      >
                        <option value="">Sin rol</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.nombre}</option>
                        ))}
                      </select>
                      <Button
                        variant={u.activo ? "outline" : "secondary"}
                        size="sm"
                        onClick={() => onToggleActivo(u)}
                      >
                        {u.activo ? "Activo" : "Desactivado"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => onHacerSuperusuario(u)}>
                        Hacer superusuario
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => onEliminar(u)}>
                        Eliminar
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <RolesSection roles={roles} dashboardsCatalogo={dashboardsCatalogo} onChange={cargar} setError={setError} />

        <MapeosSection roles={roles} puestos={puestos} mapeos={mapeos} onChange={cargar} setError={setError} />
      </div>
    </DashboardShell>
  );
}

function RolesSection({
  roles, dashboardsCatalogo, onChange, setError,
}: {
  roles: Rol[];
  dashboardsCatalogo: DashboardDisponible[];
  onChange: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevosDashboards, setNuevosDashboards] = useState<string[]>([]);

  async function onToggleDashboard(rol: Rol, key: string) {
    const dashboards = rol.dashboards.includes(key)
      ? rol.dashboards.filter((d) => d !== key)
      : [...rol.dashboards, key];
    try {
      await actualizarRol(rol.id, { dashboards });
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  async function onEliminar(rol: Rol) {
    try {
      await eliminarRol(rol.id);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  function toggleNuevoDashboard(key: string) {
    setNuevosDashboards((prev) => (prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]));
  }

  async function onCrear() {
    if (!nuevoNombre.trim()) return;
    try {
      await crearRol(nuevoNombre.trim(), nuevosDashboards);
      setNuevoNombre("");
      setNuevosDashboards([]);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <header className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Roles</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Qué secciones ve cada rol. Crea al menos un rol para poder asignárselo a los usuarios.
        </p>
      </header>

      <div className="divide-y divide-border">
        {roles.map((r) => (
          <div key={r.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
            <div className="min-w-[140px] text-sm font-medium text-foreground pt-1">{r.nombre}</div>
            <div className="flex-1 flex flex-wrap gap-x-4 gap-y-2">
              {dashboardsCatalogo.map((d) => (
                <label key={d.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={r.dashboards.includes(d.key)}
                    onChange={() => onToggleDashboard(r, d.key)}
                  />
                  {d.nombre}
                </label>
              ))}
            </div>
            <Button variant="destructive" size="sm" onClick={() => onEliminar(r)}>Eliminar</Button>
          </div>
        ))}
        {roles.length === 0 && (
          <p className="px-5 py-4 text-sm text-muted-foreground">Todavía no hay roles creados.</p>
        )}
      </div>

      <div className="px-5 py-4 border-t border-border bg-surface-muted/30 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Nombre del rol"
            placeholder="Nombre del rol"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground w-52"
          />
          <Button size="sm" disabled={!nuevoNombre.trim()} onClick={onCrear}>Crear rol</Button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {dashboardsCatalogo.map((d) => (
            <label key={d.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={nuevosDashboards.includes(d.key)}
                onChange={() => toggleNuevoDashboard(d.key)}
              />
              {d.nombre}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function MapeosSection({
  roles, puestos, mapeos, onChange, setError,
}: {
  roles: Rol[];
  puestos: string[];
  mapeos: MapeoRol[];
  onChange: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const [nuevoPuesto, setNuevoPuesto] = useState("");
  const [nuevoRol, setNuevoRol] = useState("");

  async function onCrear() {
    if (!nuevoPuesto || !nuevoRol) return;
    try {
      await crearMapeo(nuevoPuesto, Number(nuevoRol));
      setNuevoPuesto("");
      setNuevoRol("");
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  async function onCambiarRolMapeo(mapeo: MapeoRol, grupoId: string) {
    try {
      await actualizarMapeo(mapeo.id, Number(grupoId));
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  async function onEliminar(mapeo: MapeoRol) {
    try {
      await eliminarMapeo(mapeo.id);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  const puestosSinMapeo = puestos.filter(
    (p) => !mapeos.some((m) => m.puestoTrabajo.toLowerCase() === p.toLowerCase())
  );

  return (
    <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <header className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Puesto de trabajo → rol</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Rol que se asigna solo al registrarse un empleado de cada puesto de trabajo de Odoo.
        </p>
      </header>

      <div className="divide-y divide-border">
        {mapeos.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="flex-1 min-w-[220px] text-sm text-foreground">{m.puestoTrabajo}</div>
            <select
              className={SELECT_CLASS}
              value={m.grupoId}
              onChange={(e) => onCambiarRolMapeo(m, e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
            <Button variant="destructive" size="sm" onClick={() => onEliminar(m)}>Quitar</Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-t border-border bg-surface-muted/30">
        <select
          className={SELECT_CLASS}
          value={nuevoPuesto}
          onChange={(e) => setNuevoPuesto(e.target.value)}
        >
          <option value="">Puesto de trabajo…</option>
          {puestosSinMapeo.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select className={SELECT_CLASS} value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)}>
          <option value="">Rol…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.nombre}</option>
          ))}
        </select>
        <Button size="sm" disabled={!nuevoPuesto || !nuevoRol} onClick={onCrear}>Añadir mapeo</Button>
      </div>
    </section>
  );
}
