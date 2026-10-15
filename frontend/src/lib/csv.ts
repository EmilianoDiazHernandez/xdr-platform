// Generación de CSV en el cliente (RFC 4180) con BOM UTF-8 para que Excel respete los acentos.

type Celda = string | number | null | undefined;

function escaparCelda(valor: Celda): string {
  if (valor === null || valor === undefined) return "";
  let texto = String(valor);
  // Evita inyección de fórmulas al abrir el archivo en Excel
  if (/^[=+@\t\r]/.test(texto)) texto = "'" + texto;
  return /[",;\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function generarCsv(encabezados: readonly string[], filas: readonly Celda[][]): Blob {
  const lineas = [encabezados, ...filas].map(fila => fila.map(escaparCelda).join(","));
  return new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" });
}
