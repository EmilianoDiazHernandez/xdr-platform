// API del Directivo / Auditor (CU-20, CU-21, CU-22).
// REGLA CRÍTICA (RN12): este módulo NUNCA llama a /alertas, /topology* ni /eventos-correlacionados*.
// El resumen llega ya agregado; jamás se calcula en el cliente a partir de alertas individuales.
// SOLO DESARROLLO (adaptador mock) — el adaptador "api" sigue el contrato objetivo del backend.
import { apiBlob, apiRequest, REPORT_TIMEOUT_MS } from "./client";
import { API_BASE_URL, MODO_MOCK, REPORT_BASE_URL } from "./config";
import { agregadosDiarios, reportesMock, TIPOS_ATAQUE } from "../mocks/ejecutivo";
import type { NivelSeveridad, ReporteGenerado, ResumenEjecutivo } from "../types";

export interface ExecutiveApi {
  // inicio y fin en formato YYYY-MM-DD, ambos inclusive
  obtenerResumen(inicio: string, fin: string): Promise<ResumenEjecutivo>;
  listarReportes(): Promise<ReporteGenerado[]>;
  descargarReporte(reporte: ReporteGenerado): Promise<Blob>;
}

/* ─── Adaptador mock: suma agregados diarios ya calculados ─── */

const latencia = () => new Promise(r => setTimeout(r, 300));

const DIA_MS = 24 * 60 * 60 * 1000;

function aFecha(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function aIso(fecha: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

// Suma días de calendario (setDate respeta los cambios de horario de verano)
function sumarDias(iso: string, dias: number): string {
  const d = aFecha(iso);
  d.setDate(d.getDate() + dias);
  return aIso(d);
}

function enRango(inicio: string, fin: string) {
  return agregadosDiarios.filter(a => a.fecha >= inicio && a.fecha <= fin);
}

function totalEnRango(inicio: string, fin: string): number {
  return enRango(inicio, fin).reduce(
    (acc, a) => acc + a.severidad.Crítica + a.severidad.Alta + a.severidad.Media + a.severidad.Baja, 0,
  );
}

// PDF mínimo válido para que la descarga de demostración se pueda abrir
function pdfDemostracion(titulo: string): Blob {
  const texto = `Reporte de demostracion: ${titulo}`.replace(/[()\\]/g, "");
  const contenido = `BT /F1 14 Tf 72 720 Td (${texto}) Tj ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

const mockAdapter: ExecutiveApi = {
  async obtenerResumen(inicio, fin) {
    await latencia();
    const dias = enRango(inicio, fin);

    const totalesPorSeveridad: Record<NivelSeveridad, number> = { Crítica: 0, Alta: 0, Media: 0, Baja: 0 };
    const porTipo = new Map<string, number>(TIPOS_ATAQUE.map(t => [t, 0]));
    for (const d of dias) {
      for (const sev of Object.keys(totalesPorSeveridad) as NivelSeveridad[]) totalesPorSeveridad[sev] += d.severidad[sev];
      for (const tipo of TIPOS_ATAQUE) porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + d.porTipo[tipo]);
    }

    // Periodo anterior: misma duración, inmediatamente antes del inicio
    const duracionDias = Math.round((aFecha(fin).getTime() - aFecha(inicio).getTime()) / DIA_MS) + 1;
    const prevFin = sumarDias(inicio, -1);
    const prevInicio = sumarDias(inicio, -duracionDias);
    const actual = totalEnRango(inicio, fin);
    const anterior = totalEnRango(prevInicio, prevFin);
    const tendenciaPct = anterior === 0 ? 0 : Math.round(((actual - anterior) / anterior) * 1000) / 10;

    const topTiposAtaque = [...porTipo.entries()]
      .map(([tipo, total]) => ({ tipo, total }))
      .filter(t => t.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    return { periodo: { inicio, fin }, totalesPorSeveridad, tendenciaPct, topTiposAtaque };
  },

  async listarReportes() {
    await latencia();
    return [...reportesMock];
  },

  async descargarReporte(reporte) {
    await latencia();
    return pdfDemostracion(reporte.nombre);
  },
};

/* ─── Adaptador api (contrato objetivo) ─── */

const apiAdapter: ExecutiveApi = {
  obtenerResumen(inicio, fin) {
    const q = `?inicio=${encodeURIComponent(inicio)}&fin=${encodeURIComponent(fin)}`;
    return apiRequest<ResumenEjecutivo>(API_BASE_URL, `/executive/summary${q}`);
  },

  listarReportes() {
    return apiRequest<ReporteGenerado[]>(REPORT_BASE_URL, "/reports");
  },

  descargarReporte(reporte) {
    return apiBlob(REPORT_BASE_URL, `/reports/${encodeURIComponent(reporte.nombre)}`, { timeoutMs: REPORT_TIMEOUT_MS });
  },
};

export const executiveApi: ExecutiveApi = MODO_MOCK ? mockAdapter : apiAdapter;
