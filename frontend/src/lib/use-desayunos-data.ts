import { useEffect, useMemo, useState } from "react";
import { fetchDesayunos, fetchSerieMensual, fetchTurnos, TIPOS_DESAYUNO, type HotelReal, type SerieMensual, type TurnoDesayuno } from "@/lib/hoteles-api";
import { rangeForPreset, type RangePreset } from "@/lib/date-range";

const TODOS_TIPOS = TIPOS_DESAYUNO.map((t) => t.value) as string[];

function filtraHoteles(
  hoteles: HotelReal[], zona: string, submarca: string, q: string, hotelIds: number[]
): HotelReal[] {
  return hoteles.filter((h) => {
    if (zona && h.zona !== zona) return false;
    if (submarca && h.submarca !== submarca) return false;
    // Selector explícito de hotel(es) (spec: "seleccionar un hotel concreto
    // o varios") — distinto del buscador de texto de abajo, que sigue
    // existiendo aparte para filtrar rápido sin abrir el selector.
    if (hotelIds.length > 0 && !hotelIds.includes(h.id)) return false;
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

/** Carga de datos de Desayunos compartida por las 4 páginas de esta sección
 * (Detalle completo, Oportunidades, Alertas, Tendencias) — cada una es su
 * propia ruta, pero todas necesitan el mismo fetch por rango de fechas y
 * los mismos filtros de hotel (zona, submarca, tipo de desayuno, búsqueda
 * por nombre/código, selector de hotel). "hoteles"/"hotelesFiltrados" son
 * el filtro client-side de siempre; "serieMensual" (para Tendencias) se
 * filtra en el backend cuando hace falta, ver hotelIdsActivos más abajo y
 * fetchSerieMensual en hoteles-api.ts. */
export function useDesayunosData() {
  const [preset, setPreset] = useState<RangePreset>("dia");
  const [custom, setCustom] = useState(() => rangeForPreset("dia"));
  const [hoteles, setHoteles] = useState<HotelReal[] | null>(null);
  // Cadena completa (siempre disponible, viene con fetchDesayunos) vs.
  // filtrada por Zona/Submarca/Hotel (solo cuando ese filtro está activo,
  // ver hotelIdsActivos más abajo) — Tendencias es la única vista que
  // consume "serieMensual", pero el filtro vive en este hook compartido.
  const [serieMensualBase, setSerieMensualBase] = useState<SerieMensual[]>([]);
  const [serieMensualFiltrada, setSerieMensualFiltrada] = useState<SerieMensual[]>([]);
  const [serieMensualLoading, setSerieMensualLoading] = useState(false);
  const [turnos, setTurnos] = useState<TurnoDesayuno[]>([]);
  const [origenDatos, setOrigenDatos] = useState<"odoo" | "cache" | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tipos, setTipos] = useState<string[]>(TODOS_TIPOS);
  const [zona, setZona] = useState("");
  const [submarca, setSubmarca] = useState("");
  const [q, setQ] = useState("");
  const [hotelIds, setHotelIds] = useState<number[]>([]);

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
        setSerieMensualBase(data.serieMensual);
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
    () => (hoteles ? filtraHoteles(hoteles, zona, submarca, q, hotelIds) : hoteles),
    [hoteles, zona, submarca, q, hotelIds]
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
  // búsqueda/selección) — undefined si ninguno está activo (Turnos y la
  // serie mensual piden cadena completa en ese caso, ver más abajo).
  const hotelIdsActivos = useMemo(() => {
    if (!zona && !submarca && !qDebounced && hotelIds.length === 0) return undefined;
    return filtraHoteles(hoteles ?? [], zona, submarca, qDebounced, hotelIds).map((h) => h.id);
  }, [hoteles, zona, submarca, qDebounced, hotelIds]);

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

  // Serie mensual filtrada por Hotel: mismo patrón que Turnos, arriba
  // (endpoint aparte, 2026-09-03 — Tendencias pedía extender a esta vista
  // los filtros de Zona/Submarca/Hotel que ya tenían Detalle/Oportunidades/
  // Alertas). Sin filtro activo no hace falta pedir nada nuevo: se usa
  // serieMensualBase, ya incluida en fetchDesayunos. Nota: como
  // hotelIdsActivos es compartido por las 4 vistas, cambiar Zona/Submarca
  // en Detalle también dispara esta petición aunque no se esté mirando
  // Tendencias — mismo coste ya aceptado para Turnos.
  useEffect(() => {
    if (!hotelIdsActivos) return;
    let vivo = true;
    setSerieMensualLoading(true);
    const tiposParam = tipos.length < TODOS_TIPOS.length ? tipos : undefined;
    fetchSerieMensual(desde, hasta, tiposParam, hotelIdsActivos)
      .then((data) => {
        if (vivo) setSerieMensualFiltrada(data.serieMensual);
      })
      .catch(() => {
        // Se queda con la serie filtrada anterior en vez de romper la página.
      })
      .finally(() => {
        if (vivo) setSerieMensualLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [desde, hasta, tipos, hotelIdsActivos]);

  const serieMensual = hotelIdsActivos ? serieMensualFiltrada : serieMensualBase;

  return {
    hoteles,
    hotelesFiltrados,
    serieMensual,
    turnos,
    turnosFiltradosPorHotel: !!hotelIdsActivos,
    origenDatos,
    loading: loading || turnosLoading || (!!hotelIdsActivos && serieMensualLoading),
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
      hotelIds,
      onHotelIds: setHotelIds,
      // Lista completa para el selector (no la filtrada) — elegir un hotel
      // no debería depender de qué otro filtro esté ya activo.
      hotelesDisponibles: hoteles ?? [],
    },
  };
}
