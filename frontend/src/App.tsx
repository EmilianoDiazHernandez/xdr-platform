import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header }  from "./components/Header";
import { Home }    from "./pages/Home";
import { Topology } from "./pages/Topology";
import { Alerts } from "./pages/Alerts";
import { Login } from "./pages/Login";
import { Forbidden } from "./pages/Forbidden";
import { useAuth } from "./auth/AuthContext";
import { canAccess, canSeeTechnicalStatus, defaultPageFor } from "./auth/permissions";
import type { PageId, Role } from "./types";

const TITULOS: Record<PageId, string> = {
  "inicio":             "Inicio",
  "topologia":          "Topología de red",
  "alertas":            "Alertas",
  "eventos":            "Eventos",
  "anomalias":          "Anomalías",
  "reportes":           "Reportes PDF",
  "admin-usuarios":     "Usuarios",
  "admin-servicios":    "Estado de servicios",
  "admin-logs":         "Logs del sistema",
  "ejecutivo":          "Resumen ejecutivo",
  "reportes-generados": "Reportes",
};

function Placeholder({ titulo }: { titulo: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center p-8"
      style={{ flex: 1, color: "var(--txt3)", gap: "8px" }}
    >
      <p style={{ fontSize: "24px", fontWeight: 800, color: "var(--txt2)" }}>{titulo}</p>
      <p style={{ fontSize: "12px" }}>Disponible en un ciclo posterior</p>
    </div>
  );
}

function StatusBar() {
  return (
    <div
      className="flex items-center justify-between flex-shrink-0 overflow-x-auto text-nowrap px-4 sm:px-5"
      style={{
        height: "28px",
        background: "var(--bg2)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
        {[
          { color: "#10b981", label: "Sistemas operativos" },
          { color: "#3b82f6", label: "DB: 14ms" },
          { color: "#64748b", label: "Zeek activo" },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: item.color }} />
            <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--txt3)" }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
      <div className="hidden sm:flex items-center gap-4 flex-shrink-0 pl-4">
        <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--txt3)" }}>
          API v1.0.0
        </span>
        <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--txt3)" }}>
          TT 2026-B139
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const { session } = useAuth();
  return session ? <Dashboard role={session.user.role} /> : <Login />;
}

function Dashboard({ role }: { role: Role }) {
  const [paginaActiva, setPaginaActiva] = useState<PageId>(() => defaultPageFor(role));
  const [eventoSeleccionado, setEventoSeleccionado] = useState<string | null>(null);
  const [sidebarMobileAbierto, setSidebarMobileAbierto] = useState(false);
  const [sidebarDesktopColapsado, setSidebarDesktopColapsado] = useState(false);

  const handleNavegar = (pagina: PageId, param?: string) => {
    setPaginaActiva(pagina);
    setSidebarMobileAbierto(false);
    if (param) setEventoSeleccionado(param);
    else setEventoSeleccionado(null);
  };

  const renderPagina = () => {
    if (!canAccess(role, paginaActiva)) return <Forbidden onVolver={handleNavegar} />;
    if (paginaActiva === "inicio") return <Home onNavegar={handleNavegar} />;
    if (paginaActiva === "topologia") return <Topology />;
    if (paginaActiva === "alertas") return <Alerts eventoSeleccionado={eventoSeleccionado} />;
    return <Placeholder titulo={TITULOS[paginaActiva]} />;
  };

  return (
    <div
      className="flex w-full"
      style={{ height: "100vh", background: "var(--bg)", overflow: "hidden" }}
    >
      <Sidebar
        activo={paginaActiva}
        onNavegar={(p) => handleNavegar(p)}
        abiertoMobile={sidebarMobileAbierto}
        onCerrarMobile={() => setSidebarMobileAbierto(false)}
        colapsadoDesktop={sidebarDesktopColapsado}
        onToggleColapsoDesktop={() => setSidebarDesktopColapsado(!sidebarDesktopColapsado)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        <Header
          titulo={TITULOS[paginaActiva]}
          onToggleSidebar={() => setSidebarMobileAbierto(!sidebarMobileAbierto)}
        />
        <main className="flex-1 overflow-y-auto min-w-0 custom-scrollbar">
          {renderPagina()}
        </main>
        {canSeeTechnicalStatus(role) && <StatusBar />}
      </div>
    </div>
  );
}
