import { useEffect, useMemo, useState } from "react";
import { fetchDesayunos, fetchTurnos, TIPOS_DESAYUNO, type HotelReal, type SerieMensual, type TurnoDesayuno } from "@/lib/hoteles-api";
import { rangeForPreset, type RangePreset } from "@/lib/date-range";

const TODOS_TIPOS = TIPOS_DESAYUNO.map((t) => t.value) as string[];

/** Carga de datos de Desayunos compartida por las páginas "Detalle completo",
 * "Oportunidades" y "Alertas" — cada una es su propia ruta, pero todas
 * necesitan el mismo fetch por rango de fechas y los mismos filtros de
 * hotel (zona, submarca, tipo de desayuno, búsqueda por nombre/código).
 * "Tendencias" usa serieMensual, que es un agregado global del backend y no
 * se puede filtrar por zona/submarca sin cambiar la consulta — fuera de
 * alcance aquí. */
export function useDesayunosData() {
  const [preset, setPreset] = useState<RangePreset>("dia");
  const [custom, setCustom] = useState(() => rangeForPreset("dia"));
  const [hoteles, setHoteles] = useState<HotelReal[] | null>(null);
  const [serieMensual, setSerieMensual] = useState<SerieMensual[]>([]);
  // Turnos de cadena completa (respeta Producto, ver service.get_resumen)
  // pero NO Hotel/Zona/Submarca — ese filtro es client-side sobre
  // `hoteles` y Turnos no tiene desglose por hotel que filtrar en el
  // navegador. turnosFiltrados (más abajo) cubre ese caso con un fetch
  // aparte cuando el filtro de hotel está activo.
  const [turnos, setTurnos] = useState<TurnoDesayuno[]>([]);
  const [turnosFiltrados, setTurnosFiltrados] = useState<TurnoDesayuno[] | null>(null);
  const [origenDatos, setOrigenDatos] = useState<"odoo" | "cache" | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tipos, setTipos] = useState<string[]>(TODOS_TIPOS);
  const [zona, setZona] = useState("");
  const [submarca, setSubmarca] = useState("");
  const [q, setQ] = useState("");

  const { desde, hasta } = preset === "custom" ? custom : rangeForPreset(preset);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError(null);
    // Todos los tipos seleccionados == sin filtro (mismo resultado en
    // backend, ver repository.fetch_desayunos), evita mandar el parámetro.
    const tiposParam = tipos.length < TODOS_TIPOS.length ? tipos : undefined;
    fetchDesayunos(desde, hasta, tiposParam)
      .then((data) => {
        // "vivo": si el usuario cambia de filtro otra vez antes de que
        // esta respuesta llegue, no la apliques — si no, dos peticiones en
        // vuelo pueden resolver en cualquier orden y la más lenta (con un
        // filtro ya abandonado) pisaría a la más reciente.
        if (!vivo) return;
        setHoteles(data.hoteles);
        setSerieMensual(data.serieMensual);
        setTurnos(data.turnos ?? []);
        setOrigenDatos(data.origenDatos);
      })
      .catch((e) => {
        if (vivo) setError(e.message);
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [desde, hasta, tipos]);

  const zonas = useMemo(
    () => Array.from(new Set((hoteles ?? []).map((h) => h.zona))).sort((a, b) => a.localeCompare(b)),
    [hoteles]
  );
  const submarcas = useMemo(
    () => Array.from(new Set((hoteles ?? []).map((h) => h.submarca))).sort((a, b) => a.localeCompare(b)),
    [hoteles]
  );

  const hotelesFiltrados = useMemo(() => {
    if (!hoteles) return hoteles;
    return hoteles.filter((h) => {
      if (zona && h.zona !== zona) return false;
      if (submarca && h.submarca !== submarca) return false;
      if (q) {
        const s = q.toLowerCase();
        // (h.codigo ?? ""): 2 de 132 hoteles no tienen código en Odoo
        // (verificado 2026-08-28) — sin este fallback, .toLowerCase() de
        // un null rompía toda la página al escribir en el buscador.
        if (!h.name.toLowerCase().includes(s) && !(h.codigo ?? "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [hoteles, zona, submarca, q]);

  // IDs de los hoteles resultantes del filtro de Hotel (zona/submarca/
  // búsqueda) — undefined si ese filtro no está activo, para no disparar
  // el fetch aparte de turnosFiltrados sin necesidad.
  const hotelIdsActivos = useMemo(() => {
    if (!zona && !submarca && !q) return undefined;
    return (hotelesFiltrados ?? []).map((h) => h.id);
  }, [hotelesFiltrados, zona, submarca, q]);

  useEffect(() => {
    if (!hotelIdsActivos) {
      setTurnosFiltrados(null);
      return;
    }
    let vivo = true;
    const tiposParam = tipos.length < TODOS_TIPOS.length ? tipos : undefined;
    fetchTurnos(desde, hasta, tiposParam, hotelIdsActivos)
      .then((data) => {
        if (vivo) setTurnosFiltrados(data.turnos);
      })
      .catch(() => {
        // Si falla, se queda con el turnos de cadena completa anterior
        // en vez de romper la página — no es el dato principal.
      });
    return () => {
      vivo = false;
    };
  }, [desde, hasta, tipos, hotelIdsActivos]);

  return {
    hoteles,
    hotelesFiltrados,
    serieMensual,
    turnos: turnosFiltrados ?? turnos,
    turnosFiltradosPorHotel: !!hotelIdsActivos,
    origenDatos,
    loading,
    error,
    desde,
    hasta,
    rangeProps: {
      preset,
      custom,
      onPreset: (p: RangePreset) => {
        setPreset(p);
        if (p !== "custom") setCustom(rangeForPreset(p));
      },
      onCustom: setCustom,
    },
    filterProps: {
      q,
      onQ: setQ,
      zona,
      onZona: setZona,
      zonas,
      submarca,
      onSubmarca: setSubmarca,
      submarcas,
      tipos,
      onTipos: setTipos,
    },
  };
}
