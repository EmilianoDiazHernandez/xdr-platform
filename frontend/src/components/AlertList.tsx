import { Alerta } from "../types";

const SEV_COLOR: Record<string, string> = {
  Alta:  "#ef4444",
  Media: "#f59e0b",
  Baja:  "#10b981",
};

const SEV_ROW_BG: Record<string, string> = {
  Alta:  "rgba(239,68,68,0.08)",
  Media: "rgba(245,158,11,0.08)",
  Baja:  "rgba(16,185,129,0.08)",
};

const SEV_ROW_BORDER: Record<string, string> = {
  Alta:  "rgba(239,68,68,0.18)",
  Media: "rgba(245,158,11,0.18)",
  Baja:  "rgba(16,185,129,0.18)",
};

const SEV_BADGE_BG: Record<string, string> = {
  Alta:  "rgba(239,68,68,0.15)",
  Media: "rgba(245,158,11,0.15)",
  Baja:  "rgba(16,185,129,0.15)",
};

function ordenar(alertas: Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) => {
    if (a.severidad === "Alta" && b.severidad !== "Alta") return -1;
    if (b.severidad === "Alta" && a.severidad !== "Alta") return 1;
    return b.timestamp.localeCompare(a.timestamp);
  }).slice(0, 10);
}

export function AlertList({ alertas }: { alertas: Alerta[] }) {
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
      <div style={{ padding: "8px" }}>
        {ordenadas.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3"
            style={{
              padding: "8px 10px",
              marginBottom: "4px",
              borderRadius: "7px",
              background: SEV_ROW_BG[a.severidad],
              border: `1px solid ${SEV_ROW_BORDER[a.severidad]}`,
              borderLeft: `3px solid ${SEV_COLOR[a.severidad]}`,
              cursor: "pointer",
              transition: "opacity 0.12s",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            {/* Info */}
            <div className="flex-1 min-w-0">
              <p style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#fff",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {a.descripcion}
              </p>
              <p className="font-mono" style={{ fontSize: "10px", color: "var(--txt3)", marginTop: "2px" }}>
                {a.ip_origen} · {a.timestamp.split(" ")[1]}
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
                background: SEV_BADGE_BG[a.severidad],
                color: SEV_COLOR[a.severidad],
                border: `1px solid ${SEV_ROW_BORDER[a.severidad]}`,
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