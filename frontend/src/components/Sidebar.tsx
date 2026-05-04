import {
  LayoutDashboard,
  Network,
  Bell,
  FileText,
  Settings,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";

const MENU = [
  {
    section: "General",
    items: [
      { id: "inicio",    label: "Inicio",    Icon: LayoutDashboard, color: "#10b981" },
      { id: "topologia", label: "Topología", Icon: Network,          color: "#64748b" },
    ],
  },
  {
    section: "Detección",
    items: [
      { id: "alertas", label: "Alertas", Icon: Bell,         color: "#f59e0b" },
      { id: "eventos", label: "Eventos", Icon: CalendarDays, color: "#64748b" },
    ],
  },
  {
    section: "Reportes",
    items: [
      { id: "reportes", label: "Reportes PDF", Icon: FileText, color: "#64748b" },
    ],
  },
  {
    section: "Sistema",
    items: [
      { id: "configuracion", label: "Configuración", Icon: Settings, color: "#64748b" },
    ],
  },
];

interface SidebarProps {
  activo: string;
  onNavegar: (id: string) => void;
}

export function Sidebar({ activo, onNavegar }: SidebarProps) {
  return (
    <aside
      className="flex flex-col flex-shrink-0"
      style={{
        width: "220px",
        minHeight: "100vh",
        background: "var(--bg2)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 py-5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
          }}
        >
          <ShieldCheck size={16} color="#fff" />
        </div>
        <div>
          <p style={{ fontSize: "13px", fontWeight: 700, color: "#fff", lineHeight: 1 }}>
            XDR Platform
          </p>
          <p style={{ fontSize: "9px", color: "var(--txt3)", letterSpacing: "1.5px", textTransform: "uppercase", marginTop: "3px" }}>
            v1.0.0
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {MENU.map(({ section, items }) => (
          <div key={section} className="mb-1">
            <p
              className="px-2 py-2"
              style={{
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "var(--txt3)",
              }}
            >
              {section}
            </p>
            {items.map(({ id, label, Icon, color }) => {
              const isActive = activo === id;
              return (
                <button
                  key={id}
                  onClick={() => onNavegar(id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
                  style={{
                    background: isActive ? "rgba(124,58,237,0.15)" : "transparent",
                    color: isActive ? "#c4b5fd" : "var(--txt2)",
                    fontSize: "12px",
                    fontWeight: isActive ? 600 : 500,
                    marginBottom: "2px",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={e => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={e => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <Icon
                    size={14}
                    color={isActive ? "#c4b5fd" : color}
                    style={{ flexShrink: 0 }}
                  />
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="px-4 py-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <p style={{
          fontSize: "9px",
          color: "var(--txt3)",
          textAlign: "center",
          letterSpacing: "0.8px",
          textTransform: "uppercase",
        }}>
          IPN · ESCOM · 2026-B139
        </p>
      </div>
    </aside>
  );
}
