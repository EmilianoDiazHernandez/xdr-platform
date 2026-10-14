import { useEffect, useState } from "react";
import { Menu, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { ROLE_LABEL } from "../auth/roles";

interface HeaderProps {
  titulo: string;
  onToggleSidebar?: () => void;
}

export function Header({ titulo, onToggleSidebar }: HeaderProps) {
  const { session, logout } = useAuth();
  const [ahora, setAhora] = useState(new Date());
  const [cerrando, setCerrando] = useState(false);

  const handleLogout = async () => {
    if (cerrando) return;
    setCerrando(true);
    await logout();
  };

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hora = ahora.toLocaleTimeString("es-MX", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <div
      className="flex items-center justify-between flex-shrink-0 px-4 sm:px-6"
      style={{
        height: "52px",
        background: "rgba(24,18,32,0.8)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Left: Hamburger button + Breadcrumb */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="flex items-center justify-center p-2 rounded-lg text-slate-300 hover:text-white transition-colors"
            style={{
              background: "var(--bg3)",
              border: "1px solid var(--border)",
            }}
            aria-label="Abrir menú de navegación"
            title="Desplegar menú lateral"
          >
            <Menu size={16} />
          </button>
        )}

        <div className="flex items-center gap-2" style={{ fontSize: "12px" }}>
          <span className="hidden sm:inline" style={{ color: "var(--txt3)" }}>XDR Platform</span>
          <span className="hidden sm:inline" style={{ color: "var(--txt3)", fontSize: "10px" }}>›</span>
          <span style={{ color: "var(--txt)", fontWeight: 600 }}>{titulo}</span>
        </div>
      </div>

      {/* Right: Live pill + Clock */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Live pill */}
        <div
          className="flex items-center gap-2"
          style={{
            background: "var(--green-bg)",
            border: "1px solid rgba(16,185,129,0.2)",
            borderRadius: "20px",
            padding: "4px 10px",
            fontSize: "9px",
            fontWeight: 700,
            color: "var(--green)",
            textTransform: "uppercase",
            letterSpacing: "0.8px",
          }}
        >
          <span
            style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: "var(--green)",
              animation: "xdr-pulse 2s infinite",
            }}
          />
          Live
        </div>
        {/* Clock */}
        <span
          className="font-mono hidden xs:inline"
          style={{ fontSize: "11px", color: "var(--txt3)" }}
        >
          {hora}
        </span>

        {/* Usuario + cerrar sesión */}
        {session && (
          <div className="flex items-center gap-3" style={{ paddingLeft: "12px", borderLeft: "1px solid var(--border)" }}>
            <div className="hidden md:flex flex-col items-end" style={{ lineHeight: 1.2 }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--txt)" }}>{session.user.nombre}</span>
              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--txt3)" }}>
                {ROLE_LABEL[session.user.role]}
              </span>
            </div>
            <button
              onClick={handleLogout}
              disabled={cerrando}
              className="flex items-center gap-2 rounded-lg text-slate-300 hover:text-white transition-colors"
              style={{
                padding: "6px 10px",
                background: "var(--bg3)",
                border: "1px solid var(--border)",
                fontSize: "11px",
                fontWeight: 600,
                cursor: cerrando ? "default" : "pointer",
                opacity: cerrando ? 0.6 : 1,
              }}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes xdr-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
