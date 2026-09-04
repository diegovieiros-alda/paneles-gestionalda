import { getCookie } from "@/lib/auth-api";
import type { AjustesResueltos } from "@/lib/hoteles-api";

export async function fetchAjustesDesayuno(): Promise<AjustesResueltos> {
  const res = await fetch("/api/desayunos/ajustes/");
  if (!res.ok) throw new Error("No se pudieron cargar los ajustes de desayuno");
  return res.json();
}

export async function actualizarAjustesDesayuno(cambios: Partial<AjustesResueltos>): Promise<AjustesResueltos> {
  const res = await fetch("/api/desayunos/ajustes/", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") ?? "" },
    body: JSON.stringify(cambios),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `No se pudieron guardar los ajustes (${res.status})`);
  return body as AjustesResueltos;
}

// "Objetivos configurarlo por hotel" (2026-09-04): un hotel puede tener su
// propio valor para cada clave, que gana sobre el global de arriba —
// `overrides` dice cuáles de las 3 claves son propias del hotel (el resto
// de `valores` viene heredado del global, no es un valor "del hotel").
export type AjustesHotelAdmin = {
  id: number;
  name: string;
  codigo: string;
  zona: string;
  sociedad: string;
  submarca: string;
  valores: AjustesResueltos;
  overrides: Array<keyof AjustesResueltos>;
};

export type AjustesHotelesAdminReport = { global: AjustesResueltos; hoteles: AjustesHotelAdmin[] };

export async function fetchAjustesHotelesAdmin(): Promise<AjustesHotelesAdminReport> {
  const res = await fetch("/api/desayunos/ajustes/hoteles/");
  if (!res.ok) throw new Error("No se pudieron cargar los ajustes por hotel");
  return res.json();
}

// Un valor `null` borra el override de esa clave para este hotel (vuelve a
// heredar el global) — distinto de omitir la clave, que simplemente no la
// toca.
export async function actualizarAjustesHotel(
  hotelId: number, cambios: Partial<Record<keyof AjustesResueltos, number | null>>
): Promise<AjustesResueltos> {
  const res = await fetch(`/api/desayunos/ajustes/hoteles/${hotelId}/`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") ?? "" },
    body: JSON.stringify(cambios),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `No se pudieron guardar los ajustes del hotel (${res.status})`);
  return body as AjustesResueltos;
}
