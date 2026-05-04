import { EstadoServicio } from "../types";

export function StatusPanel({ servicios }: { servicios: EstadoServicio[] }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {servicios.map(s => (
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
                background: s.activo ? "var(--green-bg)" : "var(--red-bg)",
                color: s.activo ? "var(--green)" : "var(--red)",
                border: `1px solid ${s.activo ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
              }}
            >
              {s.activo ? "Online" : "Offline"}
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
                width: s.activo ? "90%" : "0%",
                background: s.activo ? "var(--green)" : "var(--red)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}