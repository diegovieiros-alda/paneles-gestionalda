export type Usuario = { email: string; nombre: string; esSuperusuario: boolean; dashboards: string[] };

export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function postJson(url: string, body: unknown): Promise<Usuario> {
  await fetch("/api/auth/csrf/", { credentials: "include" });

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken") ?? "",
    },
    body: JSON.stringify(body),
  });

  const responseBody = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(responseBody?.error || `Error de red (${res.status})`);
  }
  return responseBody as Usuario;
}

export function registrar(email: string, password: string, nombre: string) {
  return postJson("/api/auth/registro/", { email, password, nombre });
}

export function iniciarSesion(email: string, password: string) {
  return postJson("/api/auth/login/", { email, password });
}

export async function cerrarSesion(): Promise<void> {
  await fetch("/api/auth/logout/", {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRFToken": getCookie("csrftoken") ?? "" },
  });
}

export async function obtenerSesion(): Promise<Usuario | null> {
  const res = await fetch("/api/auth/me/", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("No se pudo cargar la sesión");
  return res.json();
}
