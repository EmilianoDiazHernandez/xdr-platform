import { Alerta, NivelSeveridad, PageId } from "../types";
import { formatHora } from "../lib/format";

const SEV_COLOR: Record<NivelSeveridad, string> = {
  Crítica: "#dc2626",
  Alta: "#ef4444",
  Media: "#f59e0b",
  Baja: "#10b981",
};

const SEV_ROW_BG: Record<NivelSeveridad, string> = {
  Crítica: "rgba(220,38,38,0.12)",
  Alta: "rgba(239,68,68,0.08)",
  Media: "rgba(245,158,11,0.08)",
  Baja: "rgba(16,185,129,0.08)",
};

const SEV_ROW_BORDER: Record<NivelSeveridad, string> = {
  Crítica: "rgba(220,38,38,0.3)",
  Alta: "rgba(239,68,68,0.18)",
  Media: "rgba(245,158,11,0.18)",
  Baja: "rgba(16,185,129,0.18)",
};

const SEV_BADGE_BG: Record<NivelSeveridad, string> = {
  Crítica: "rgba(220,38,38,0.2)",
  Alta: "rgba(239,68,68,0.15)",
  Media: "rgba(245,158,11,0.15)",
  Baja: "rgba(16,185,129,0.15)",
};

// Crítica y Alta van primero; el resto se ordena por fecha descendente
const PRIORIDAD: Record<NivelSeveridad, number> = { Crítica: 0, Alta: 1, Media: 2, Baja: 2 };

function ordenar(alertas: Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) => {
    const diff = PRIORIDAD[a.severidad] - PRIORIDAD[b.severidad];
    if (diff !== 0) return diff;
    return b.timestamp.localeCompare(a.timestamp);
  });
}

export function AlertList({ alertas, onNavegar }: { alertas: Alerta[], onNavegar?: (pagina: PageId, param?: string) => void }) {
  const ordenadas = ordenar(alertas);

  return (
    <div
      style={{
        background: "var(--bg3)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>
          Alertas recientes
        </span>
        <span style={{ fontSize: "10px", color: "var(--txt3)" }}>
          {alertas.length} alertas · Alta primero
        </span>
      </div>

      {/* Rows */}
      <div style={{ padding: "8px", maxHeight: "450px", overflowY: "auto" }} className="custom-scrollbar">
        {ordenadas.map((a) => (
          <div
            key={a.id}
            onClick={() => {
              if (a.isGeneralEvent && onNavegar) {
                onNavegar("alertas", String(a.id));
              }
            }}
            className="flex items-center gap-3"
            style={{
              padding: "8px 10px",
              marginBottom: "4px",
              borderRadius: "7px",
              background: a.isGeneralEvent ? SEV_ROW_BG[a.severidad] : "rgba(255,255,255,0.02)",
              border: `1px solid ${a.isGeneralEvent ? SEV_ROW_BORDER[a.severidad] : "rgba(255,255,255,0.05)"}`,
              borderLeft: `3px solid ${a.isGeneralEvent ? SEV_COLOR[a.severidad] : "#64748b"}`,
              cursor: a.isGeneralEvent ? "pointer" : "default",
              transition: "opacity 0.12s",
              opacity: a.isGeneralEvent ? 1 : 0.7,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = a.isGeneralEvent ? "0.85" : "0.9")}
            onMouseLeave={e => (e.currentTarget.style.opacity = a.isGeneralEvent ? "1" : "0.7")}
          >
            {/* Info */}
            <div className="flex-1 min-w-0">
              <p style={{
                fontSize: "11px",
                fontWeight: 600,
                color: a.isGeneralEvent ? "#a78bfa" : "#fff",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {a.isGeneralEvent && <span style={{marginRight: "4px"}}>⚠️</span>}
                {a.descripcion}
              </p>
              <p className="font-mono" style={{ fontSize: "10px", color: "var(--txt3)", marginTop: "2px" }}>
                {a.ip_origen} · {formatHora(a.timestamp)}
              </p>
            </div>

            {/* Badge */}
            <span
              style={{
                fontSize: "9px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.6px",
                padding: "3px 8px",
                borderRadius: "5px",
                background: a.isGeneralEvent ? SEV_BADGE_BG[a.severidad] : "rgba(255,255,255,0.05)",
                color: a.isGeneralEvent ? SEV_COLOR[a.severidad] : "var(--txt3)",
                border: `1px solid ${a.isGeneralEvent ? SEV_ROW_BORDER[a.severidad] : "rgba(255,255,255,0.1)"}`,
                flexShrink: 0,
              }}
            >
              {a.severidad}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}