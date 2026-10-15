import { EstadoServicio } from "../types";

const UI_ESTADO = {
  online:      { label: "Online",      color: "var(--green)", bg: "var(--green-bg)",        border: "rgba(16,185,129,0.2)", ancho: "90%" },
  offline:     { label: "Offline",     color: "var(--red)",   bg: "var(--red-bg)",          border: "rgba(239,68,68,0.2)",  ancho: "0%" },
  desconocido: { label: "Desconocido", color: "#f59e0b",      bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)", ancho: "0%" },
};

function estadoDe(s: EstadoServicio): keyof typeof UI_ESTADO {
  if (s.desconocido) return "desconocido";
  return s.activo ? "online" : "offline";
}

export function StatusPanel({ servicios }: { servicios: EstadoServicio[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {servicios.map(s => { const ui = UI_ESTADO[estadoDe(s)]; return (
        <div
          key={s.nombre}
          style={{
            background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--txt2)" }}>
              {s.nombre}
            </span>
            <span
              style={{
                fontSize: "9px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.8px",
                padding: "2px 7px",
                borderRadius: "4px",
                background: ui.bg,
                color: ui.color,
                border: `1px solid ${ui.border}`,
              }}
            >
              {ui.label}
            </span>
          </div>

          {/* Progress bar */}
          <div
            style={{
              height: "4px",
              background: "rgba(255,255,255,0.06)",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: "2px",
                width: ui.ancho,
                background: ui.color,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      ); })}
    </div>
  );
}