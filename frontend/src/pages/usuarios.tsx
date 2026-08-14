import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import {
  actualizarMapeo,
  actualizarUsuario,
  crearMapeo,
  eliminarMapeo,
  fetchDepartamentos,
  fetchMapeos,
  fetchRoles,
  fetchUsuarios,
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
  const [departamentos, setDepartamentos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      const [u, r, m, d] = await Promise.all([
        fetchUsuarios(),
        fetchRoles(),
        fetchMapeos(),
        fetchDepartamentos(),
      ]);
      setUsuarios(u.usuarios);
      setRoles(r.roles);
      setMapeos(m.mapeos);
      setDepartamentos(d.departamentos);
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
                      {u.email}{u.departamento ? ` · ${u.departamento}` : ""}
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
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <MapeosSection roles={roles} departamentos={departamentos} mapeos={mapeos} onChange={cargar} setError={setError} />
      </div>
    </DashboardShell>
  );
}

function MapeosSection({
  roles, departamentos, mapeos, onChange, setError,
}: {
  roles: Rol[];
  departamentos: string[];
  mapeos: MapeoRol[];
  onChange: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const [nuevoDepartamento, setNuevoDepartamento] = useState("");
  const [nuevoRol, setNuevoRol] = useState("");

  async function onCrear() {
    if (!nuevoDepartamento || !nuevoRol) return;
    try {
      await crearMapeo(nuevoDepartamento, Number(nuevoRol));
      setNuevoDepartamento("");
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

  const departamentosSinMapeo = departamentos.filter(
    (d) => !mapeos.some((m) => m.departamentoOdoo.toLowerCase() === d.toLowerCase())
  );

  return (
    <section className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <header className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Departamento → rol</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Rol que se asigna solo al registrarse un empleado de cada departamento de Odoo.
        </p>
      </header>

      <div className="divide-y divide-border">
        {mapeos.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="flex-1 min-w-[220px] text-sm text-foreground">{m.departamentoOdoo}</div>
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
          value={nuevoDepartamento}
          onChange={(e) => setNuevoDepartamento(e.target.value)}
        >
          <option value="">Departamento…</option>
          {departamentosSinMapeo.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select className={SELECT_CLASS} value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)}>
          <option value="">Rol…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.nombre}</option>
          ))}
        </select>
        <Button size="sm" disabled={!nuevoDepartamento || !nuevoRol} onClick={onCrear}>Añadir mapeo</Button>
      </div>
    </section>
  );
}
