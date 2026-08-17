import { getCookie } from "@/lib/auth-api";

export type UsuarioAdmin = {
  id: number;
  email: string;
  nombre: string;
  activo: boolean;
  esSuperusuario: boolean;
  departamento: string;
  puesto: string;
  grupoId: number | null;
  grupoNombre: string | null;
};

export type Rol = { id: number; nombre: string; dashboards: string[] };

export type DashboardDisponible = { key: string; nombre: string };

export type MapeoRol = { id: number; departamentoOdoo: string; grupoId: number; grupoNombre: string };

async function apiFetch<T>(url: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = "GET", body } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    await fetch("/api/auth/csrf/", { credentials: "include" });
    headers["X-CSRFToken"] = getCookie("csrftoken") ?? "";
  }

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const responseBody = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(responseBody?.error || `Error de red (${res.status})`);
  }
  return responseBody as T;
}

export function fetchUsuarios() {
  return apiFetch<{ usuarios: UsuarioAdmin[] }>("/api/admin/usuarios/");
}

export function actualizarUsuario(
  id: number,
  cambios: { grupoId?: number | null; activo?: boolean; esSuperusuario?: boolean }
) {
  return apiFetch<UsuarioAdmin>(`/api/admin/usuarios/${id}/`, { method: "PATCH", body: cambios });
}

export function eliminarUsuario(id: number) {
  return apiFetch<{ ok: boolean }>(`/api/admin/usuarios/${id}/`, { method: "DELETE" });
}

export function fetchRoles() {
  return apiFetch<{ roles: Rol[] }>("/api/admin/roles/");
}

export function crearRol(nombre: string, dashboards: string[]) {
  return apiFetch<Rol>("/api/admin/roles/", { method: "POST", body: { nombre, dashboards } });
}

export function actualizarRol(id: number, cambios: { nombre?: string; dashboards?: string[] }) {
  return apiFetch<Rol>(`/api/admin/roles/${id}/`, { method: "PATCH", body: cambios });
}

export function eliminarRol(id: number) {
  return apiFetch<{ ok: boolean }>(`/api/admin/roles/${id}/`, { method: "DELETE" });
}

export function fetchDashboardsDisponibles() {
  return apiFetch<{ dashboards: DashboardDisponible[] }>("/api/admin/dashboards/");
}

export function fetchDepartamentos() {
  return apiFetch<{ departamentos: string[] }>("/api/admin/departamentos/");
}

export function fetchMapeos() {
  return apiFetch<{ mapeos: MapeoRol[] }>("/api/admin/mapeos/");
}

export function crearMapeo(departamentoOdoo: string, grupoId: number) {
  return apiFetch<MapeoRol>("/api/admin/mapeos/", { method: "POST", body: { departamentoOdoo, grupoId } });
}

export function actualizarMapeo(id: number, grupoId: number) {
  return apiFetch<MapeoRol>(`/api/admin/mapeos/${id}/`, { method: "PATCH", body: { grupoId } });
}

export function eliminarMapeo(id: number) {
  return apiFetch<{ ok: boolean }>(`/api/admin/mapeos/${id}/`, { method: "DELETE" });
}
