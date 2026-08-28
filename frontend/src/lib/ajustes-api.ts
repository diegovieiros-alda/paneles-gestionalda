import { getCookie } from "@/lib/auth-api";
import type { AjustesDesayuno } from "@/lib/ajustes-desayuno-context";

export async function fetchAjustesDesayuno(): Promise<AjustesDesayuno> {
  const res = await fetch("/api/desayunos/ajustes/");
  if (!res.ok) throw new Error("No se pudieron cargar los ajustes de desayuno");
  return res.json();
}

export async function actualizarAjustesDesayuno(cambios: Partial<AjustesDesayuno>): Promise<AjustesDesayuno> {
  const res = await fetch("/api/desayunos/ajustes/", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") ?? "" },
    body: JSON.stringify(cambios),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `No se pudieron guardar los ajustes (${res.status})`);
  return body as AjustesDesayuno;
}
