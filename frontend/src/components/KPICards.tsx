import { Alerta } from "../types";

export function KPICards({ alertas }: { alertas: Alerta[] }) {
  const total = alertas.length;
  const criticas = alertas.filter(a => a.severidad === "Alta").length;
  const hosts = new Set(alertas.map(a => a.ip_origen)).size;

  const cards = [
    { label: "Total alertas", valor: total, color: "#fff", sub: "Últimas 24 horas" },
    { label: "Críticas", valor: criticas, color: "var(--red)", sub: "Requieren atención" },
    { label: "Hosts afectados", valor: hosts, color: "var(--amber)", sub: "Hosts únicos" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map(c => (
        <div
          key={c.label}
          style={{
            background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "14px 16px",
          }}
        >
          <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--txt3)", marginBottom: "6px" }}>
            {c.label}
          </p>
          <p style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-1px", color: c.color, lineHeight: 1 }}>
            {c.valor}
          </p>
          <p style={{ fontSize: "10px", color: "var(--txt3)", marginTop: "4px" }}>
            {c.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
