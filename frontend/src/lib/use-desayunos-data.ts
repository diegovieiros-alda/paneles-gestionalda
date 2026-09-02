import { useEffect, useMemo, useState } from "react";
import { fetchDesayunos, fetchTurnos, TIPOS_DESAYUNO, type HotelReal, type SerieMensual, type TurnoDesayuno } from "@/lib/hoteles-api";
import { rangeForPreset, type RangePreset } from "@/lib/date-range";

const TODOS_TIPOS = TIPOS_DESAYUNO.map((t) => t.value) as string[];

function filtraHoteles(hoteles: HotelReal[], zona: string, submarca: string, q: string): HotelReal[] {
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
}

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
  const [turnos, setTurnos] = useState<TurnoDesayuno[]>([]);
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

  // Precarga en segundo plano de "Mes actual" — la segunda selección de
  // Periodo más probable tras el filtro por defecto (Día). Si el usuario
  // la elige a los pocos segundos, fetchDesayunos ya tiene la respuesta en
  // su caché en memoria (ver hoteles-api.ts) y no espera a la red ni a
  // Odoo. Con 1s de margen para no competir con la petición del filtro
  // por defecto, y solo desde el filtro por defecto (no tiene sentido
  // precargar "Mes" si el usuario ya está mirando otra cosa).
  useEffect(() => {
    if (preset !== "dia") return;
    const { desde: dm, hasta: hm } = rangeForPreset("mes");
    const id = setTimeout(() => {
      fetchDesayunos(dm, hm).catch(() => {});
    }, 1000);
    return () => clearTimeout(id);
  }, [preset]);

  const zonas = useMemo(
    () => Array.from(new Set((hoteles ?? []).map((h) => h.zona))).sort((a, b) => a.localeCompare(b)),
    [hoteles]
  );
  const submarcas = useMemo(
    () => Array.from(new Set((hoteles ?? []).map((h) => h.submarca))).sort((a, b) => a.localeCompare(b)),
    [hoteles]
  );

  const hotelesFiltrados = useMemo(
    () => (hoteles ? filtraHoteles(hoteles, zona, submarca, q) : hoteles),
    [hoteles, zona, submarca, q]
  );

  // Escribir en el buscador de hotel disparaba antes una petición al
  // backend (fetchTurnos) en CADA pulsación de tecla — contra producción,
  // sin índice en las columnas de fecha (ver aviso en kpis-definiciones.md),
  // así que "sada marina" lanzaba ~11 peticiones solapadas (reportado:
  // "los filtros tardan mucho en cargar"). El filtrado de la propia tabla
  // (hotelesFiltrados, arriba) sigue siendo instantáneo porque es solo un
  // filter() en memoria — únicamente se retrasa 350ms la búsqueda que SÍ
  // dispara red.
  const [qDebounced, setQDebounced] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 350);
    return () => clearTimeout(id);
  }, [q]);

  // IDs de los hoteles resultantes del filtro de Hotel (zona/submarca/
  // búsqueda) — undefined si ese filtro no está activo (turnos de cadena
  // completa, ver más abajo).
  const hotelIdsActivos = useMemo(() => {
    if (!zona && !submarca && !qDebounced) return undefined;
    return filtraHoteles(hoteles ?? [], zona, submarca, qDebounced).map((h) => h.id);
  }, [hoteles, zona, submarca, qDebounced]);

  const [turnosLoading, setTurnosLoading] = useState(false);

  // Turnos siempre se pide aparte de fetchDesayunos (2026-09-02, ver
  // hoteles-api.ts) — antes viajaba embebido en ese resumen y bloqueaba la
  // tabla de hoteles hasta que Turnos también terminara de calcularse en
  // el backend, aunque el usuario no hubiera tocado ningún filtro de
  // Hotel. Al pedirlo en paralelo, la tabla puede mostrarse en cuanto
  // llegue su propia respuesta, sin esperar a esta.
  useEffect(() => {
    let vivo = true;
    setTurnosLoading(true);
    const tiposParam = tipos.length < TODOS_TIPOS.length ? tipos : undefined;
    fetchTurnos(desde, hasta, tiposParam, hotelIdsActivos)
      .then((data) => {
        if (vivo) setTurnos(data.turnos);
      })
      .catch(() => {
        // Se queda con el turnos anterior en vez de romper la página —
        // no es el dato principal.
      })
      .finally(() => {
        if (vivo) setTurnosLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [desde, hasta, tipos, hotelIdsActivos]);

  return {
    hoteles,
    hotelesFiltrados,
    serieMensual,
    turnos,
    turnosFiltradosPorHotel: !!hotelIdsActivos,
    origenDatos,
    loading: loading || turnosLoading,
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
