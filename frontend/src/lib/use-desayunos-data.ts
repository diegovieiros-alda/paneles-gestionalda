import { useEffect, useMemo, useState } from "react";
import { fetchDesayunos, TIPOS_DESAYUNO, type HotelReal, type SerieMensual, type TurnoDesayuno } from "@/lib/hoteles-api";
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
    setLoading(true);
    setError(null);
    // Todos los tipos seleccionados == sin filtro (mismo resultado en
    // backend, ver repository.fetch_desayunos), evita mandar el parámetro.
    const tiposParam = tipos.length < TODOS_TIPOS.length ? tipos : undefined;
    fetchDesayunos(desde, hasta, tiposParam)
      .then((data) => {
        setHoteles(data.hoteles);
        setSerieMensual(data.serieMensual);
        setTurnos(data.turnos ?? []);
        setOrigenDatos(data.origenDatos);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
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

  return {
    hoteles,
    hotelesFiltrados,
    serieMensual,
    turnos,
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
