// SOLO DESARROLLO — agregados ya calculados para CU-20/21/22.
// Contiene únicamente conteos por día; ninguna alerta individual (RN12).
import type { NivelSeveridad, ReporteGenerado } from "../types";

export const TIPOS_ATAQUE = [
  "Escaneo de puertos",
  "Fuerza bruta",
  "Phishing",
  "Malware",
  "Exfiltración de datos",
] as const;

export interface AgregadoDiario {
  fecha:      string; // YYYY-MM-DD
  severidad:  Record<NivelSeveridad, number>;
  porTipo:    Record<(typeof TIPOS_ATAQUE)[number], number>;
}

// Generador determinista (mismo resultado en cada carga)
function pseudoAleatorio(semilla: number): number {
  const x = Math.sin(semilla * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function fechaIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DIAS_HISTORICO = 120;

export const agregadosDiarios: AgregadoDiario[] = Array.from({ length: DIAS_HISTORICO }, (_, i) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (DIAS_HISTORICO - 1 - i));
  const r = (k: number) => pseudoAleatorio(i * 10 + k);
  return {
    fecha: fechaIso(d),
    severidad: {
      Crítica: Math.floor(r(1) * 3),
      Alta:    2 + Math.floor(r(2) * 6),
      Media:   5 + Math.floor(r(3) * 10),
      Baja:    8 + Math.floor(r(4) * 14),
    },
    porTipo: {
      "Escaneo de puertos":    6 + Math.floor(r(5) * 10),
      "Fuerza bruta":          3 + Math.floor(r(6) * 7),
      "Phishing":              2 + Math.floor(r(7) * 6),
      "Malware":               1 + Math.floor(r(8) * 4),
      "Exfiltración de datos": Math.floor(r(9) * 3),
    },
  };
});

export const reportesMock: ReporteGenerado[] = [
  { nombre: "ALERTAS-20261013-0915.pdf", fecha: "2026-10-13T09:15:00Z", url: "" },
  { nombre: "ALERTAS-20261015-0800.pdf", fecha: "2026-10-15T08:00:00Z", url: "" },
  { nombre: "ALERTAS-20261006-1730.pdf", fecha: "2026-10-06T17:30:00Z", url: "" },
  { nombre: "ALERTAS-20260930-1200.pdf", fecha: "2026-09-30T12:00:00Z", url: "" },
];
