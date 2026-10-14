/**
 * Design Tokens y Utilidades Estéticas Centralizadas para la Plataforma XDR
 * Inspirado en estándares de consolas SOC de clase empresarial (CrowdStrike, Defender, Sentinel)
 */

export interface SeverityStyle {
  text: string;
  bg: string;
  border: string;
  label: string;
  badgeClass: string;
}

export const SEVERITY_CONFIG: Record<string, SeverityStyle> = {
  critica: {
    text: "#ef4444",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.3)",
    label: "CRÍTICA",
    badgeClass: "bg-red-500/10 text-red-400 border border-red-500/30",
  },
  alta: {
    text: "#f97316",
    bg: "rgba(249, 115, 22, 0.12)",
    border: "rgba(249, 115, 22, 0.3)",
    label: "ALTA",
    badgeClass: "bg-orange-500/10 text-orange-400 border border-orange-500/30",
  },
  media: {
    text: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.3)",
    label: "MEDIA",
    badgeClass: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
  },
  baja: {
    text: "#10b981",
    bg: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.3)",
    label: "BAJA",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  },
  info: {
    text: "#38bdf8",
    bg: "rgba(56, 189, 248, 0.12)",
    border: "rgba(56, 189, 248, 0.3)",
    label: "INFO",
    badgeClass: "bg-sky-500/10 text-sky-400 border border-sky-500/30",
  },
};

export function getSeverityStyle(sev: number | string | undefined): SeverityStyle {
  if (sev === undefined || sev === null) return SEVERITY_CONFIG.info;

  if (typeof sev === "number") {
    if (sev >= 4) return SEVERITY_CONFIG.critica;
    if (sev === 3) return SEVERITY_CONFIG.alta;
    if (sev === 2) return SEVERITY_CONFIG.media;
    return SEVERITY_CONFIG.baja;
  }

  const s = sev.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s.includes("crit") || s === "4") return SEVERITY_CONFIG.critica;
  if (s.includes("alt") || s === "3") return SEVERITY_CONFIG.alta;
  if (s.includes("med") || s === "2") return SEVERITY_CONFIG.media;
  if (s.includes("baj") || s === "1") return SEVERITY_CONFIG.baja;
  return SEVERITY_CONFIG.info;
}

export interface VectorStyle {
  color: string;
  bg: string;
  border: string;
  label: string;
  badgeClass: string;
}

export const VECTOR_CONFIG: Record<string, VectorStyle> = {
  red: {
    color: "#38bdf8",
    bg: "rgba(56, 189, 248, 0.12)",
    border: "rgba(56, 189, 248, 0.3)",
    label: "RED / ZEEK",
    badgeClass: "bg-sky-500/10 text-sky-400 border border-sky-500/30",
  },
  endpoint: {
    color: "#c084fc",
    bg: "rgba(192, 132, 252, 0.12)",
    border: "rgba(192, 132, 252, 0.3)",
    label: "ENDPOINT / EDR",
    badgeClass: "bg-purple-500/10 text-purple-400 border border-purple-500/30",
  },
  email: {
    color: "#fb923c",
    bg: "rgba(251, 146, 60, 0.12)",
    border: "rgba(251, 146, 60, 0.3)",
    label: "EMAIL / OSINT",
    badgeClass: "bg-orange-500/10 text-orange-400 border border-orange-500/30",
  },
};

export function getVectorStyle(vectorName: string = ""): VectorStyle {
  const v = vectorName.toLowerCase();
  if (v.includes("red") || v.includes("net") || v.includes("zeek")) return VECTOR_CONFIG.red;
  if (v.includes("end") || v.includes("host") || v.includes("proceso") || v.includes("edr")) return VECTOR_CONFIG.endpoint;
  if (v.includes("mail") || v.includes("correo") || v.includes("phish")) return VECTOR_CONFIG.email;

  return {
    color: "#94a3b8",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.3)",
    label: vectorName.toUpperCase() || "SISTEMA",
    badgeClass: "bg-slate-500/10 text-slate-400 border border-slate-500/30",
  };
}

export function formatTimestamp(ts?: string): string {
  if (!ts) return "--:--:--";
  const clean = ts.replace("T", " ").split(".")[0];
  return clean;
}
