import type { NivelSeveridad } from "./index";

// CU-21 / CU-22: solo agregados. Nunca IPs, puertos, IDs de alerta ni descripciones técnicas (RN07, RN12).
export interface ResumenEjecutivo {
  periodo:             { inicio: string; fin: string };
  totalesPorSeveridad: Record<NivelSeveridad, number>;
  tendenciaPct:        number;                        // vs periodo anterior
  topTiposAtaque:      { tipo: string; total: number }[]; // máx. 3
}

// CU-20
export interface ReporteGenerado {
  nombre: string;
  fecha:  string;
  url:    string;
}
