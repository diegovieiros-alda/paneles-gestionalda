// ponytail: CSV (Excel lo abre nativo) en vez de un .xlsx real — evita añadir
// una librería solo para generar un binario. Añadir xlsx si algún día hace
// falta más de una hoja o formato con estilos.
function celda(valor: unknown): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  return /[",;\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function exportarCsv(nombreArchivo: string, columnas: string[], filas: unknown[][]) {
  const lineas = [columnas, ...filas].map((fila) => fila.map(celda).join(";"));
  const csv = "﻿" + lineas.join("\r\n"); // BOM: que Excel detecte UTF-8
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo.endsWith(".csv") ? nombreArchivo : `${nombreArchivo}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
