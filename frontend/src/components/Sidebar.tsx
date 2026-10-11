import {
  LayoutDashboard,
  Network,
  Bell,
  FileText,
  Settings,
  CalendarDays,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  X,
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
  abiertoMobile?: boolean;
  onCerrarMobile?: () => void;
  colapsadoDesktop?: boolean;
  onToggleColapsoDesktop?: () => void;
}

export function Sidebar({
  activo,
  onNavegar,
  abiertoMobile = false,
  onCerrarMobile,
  colapsadoDesktop = false,
  onToggleColapsoDesktop,
}: SidebarProps) {
  const handleItemClick = (id: string) => {
    onNavegar(id);
    if (onCerrarMobile) {
      onCerrarMobile();
    }
  };

  return (
    <>
      {/* Backdrop overlay para pantallas móviles/tablets */}
      {abiertoMobile && (
        <div
          onClick={onCerrarMobile}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Contenedor del Sidebar */}
      <aside
        className={`flex flex-col flex-shrink-0 transition-all duration-300 z-50
          fixed lg:static top-0 bottom-0 left-0
          ${abiertoMobile ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{
          width: colapsadoDesktop ? "68px" : "220px",
          minHeight: "100vh",
          background: "var(--bg2)",
          borderRight: "1px solid var(--border)",
        }}
      >
        {/* Logo y Encabezado del Menú */}
        <div
          className="flex items-center justify-between px-4 py-5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3 overflow-hidden">
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
            {!colapsadoDesktop && (
              <div className="transition-opacity duration-200">
                <p style={{ fontSize: "13px", fontWeight: 700, color: "#fff", lineHeight: 1 }}>
                  XDR Platform
                </p>
                <p style={{ fontSize: "9px", color: "var(--txt3)", letterSpacing: "1.5px", textTransform: "uppercase", marginTop: "3px" }}>
                  v1.0.0
                </p>
              </div>
            )}
          </div>

          {/* Botón de cierre en vista móvil */}
          <button
            onClick={onCerrarMobile}
            className="lg:hidden p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        {/* Lista de Navegación */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 custom-scrollbar">
          {MENU.map(({ section, items }) => (
            <div key={section} className="mb-2">
              {!colapsadoDesktop ? (
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
              ) : (
                <div style={{ height: "1px", background: "var(--border)", margin: "8px 4px" }} />
              )}

              {items.map(({ id, label, Icon, color }) => {
                const isActive = activo === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleItemClick(id)}
                    title={colapsadoDesktop ? label : undefined}
                    className={`w-full flex items-center ${colapsadoDesktop ? "justify-center" : "gap-3"} px-3 py-2 rounded-lg transition-all`}
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
                      size={16}
                      color={isActive ? "#c4b5fd" : color}
                      style={{ flexShrink: 0 }}
                    />
                    {!colapsadoDesktop && (
                      <span className="truncate">{label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Pie del Sidebar y Toggle de Colapso en Desktop */}
        <div
          className="px-3 py-3 flex flex-col gap-2"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {/* Botón desplegable / colapsable para Desktop */}
          {onToggleColapsoDesktop && (
            <button
              onClick={onToggleColapsoDesktop}
              className={`hidden lg:flex items-center ${colapsadoDesktop ? "justify-center" : "justify-between"} w-full px-2 py-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-[11px]`}
              title={colapsadoDesktop ? "Expandir menú" : "Colapsar menú"}
            >
              {!colapsadoDesktop && <span style={{ color: "var(--txt3)", fontSize: "10px", fontWeight: 600 }}>Colapsar menú</span>}
              {colapsadoDesktop ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}

          {!colapsadoDesktop ? (
            <p style={{
              fontSize: "9px",
              color: "var(--txt3)",
              textAlign: "center",
              letterSpacing: "0.8px",
              textTransform: "uppercase",
            }}>
              IPN · ESCOM · 2026-B139
            </p>
          ) : (
            <p style={{
              fontSize: "8px",
              color: "var(--txt3)",
              textAlign: "center",
              fontWeight: 700,
            }}>
              ESCOM
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
