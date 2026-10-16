import { useState } from "react";
import { Layers } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header }  from "./components/Header";
import { Home }    from "./pages/Home";
import { Topology } from "./pages/Topology";
import { Alerts } from "./pages/Alerts";
import { Events } from "./pages/Events";
import { Reports } from "./pages/Reports";
import { Anomalies } from "./pages/Anomalies";
import { Users } from "./pages/admin/Users";
import { Services } from "./pages/admin/Services";
import { Logs } from "./pages/admin/Logs";
import { ExecutiveSummary } from "./pages/executive/ExecutiveSummary";
import { GeneratedReports } from "./pages/executive/GeneratedReports";
import { Login } from "./pages/Login";
import { Forbidden } from "./pages/Forbidden";
import { useAuth } from "./auth/AuthContext";
import { canAccess, defaultPageFor } from "./auth/permissions";
import type { PageId, Role } from "./types";

const TITULOS: Record<PageId, string> = {
  "inicio":             "Inicio",
  "topologia":          "Topología de red",
  "alertas":            "Alertas",
  "eventos":            "Incidentes Correlacionados",
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
    <div className="flex flex-col items-center justify-center p-12 h-full text-center">
      <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4 shadow-inner">
        <Layers size={24} />
      </div>
      <h2 className="text-lg font-bold text-slate-100">{titulo}</h2>
      <p className="text-xs text-slate-400 mt-1 max-w-sm">
        Módulo en etapa de integración forense para el ciclo de entrega posterior.
      </p>
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
  const [nodoSeleccionado, setNodoSeleccionado] = useState<string | null>(null);
  const [sidebarMobileAbierto, setSidebarMobileAbierto] = useState(false);
  const [sidebarDesktopColapsado, setSidebarDesktopColapsado] = useState(false);

  const handleNavegar = (pagina: PageId, param?: string) => {
    setPaginaActiva(pagina);
    setSidebarMobileAbierto(false);
    if (pagina === "topologia") {
      setNodoSeleccionado(param || null);
      setEventoSeleccionado(null);
    } else if (pagina === "eventos" || pagina === "alertas") {
      setEventoSeleccionado(param || null);
      setNodoSeleccionado(null);
    } else {
      setEventoSeleccionado(null);
      setNodoSeleccionado(null);
    }
  };

  const renderPagina = () => {
    if (!canAccess(role, paginaActiva)) return <Forbidden onVolver={handleNavegar} />;
    if (paginaActiva === "inicio") return <Home onNavegar={handleNavegar} />;
    if (paginaActiva === "topologia") return <Topology nodoInicial={nodoSeleccionado} />;
    if (paginaActiva === "alertas") return <Alerts onNavegar={handleNavegar} eventoSeleccionado={eventoSeleccionado} />;
    if (paginaActiva === "eventos") return <Events eventoSeleccionado={eventoSeleccionado} />;
    if (paginaActiva === "anomalias") return <Anomalies />;
    if (paginaActiva === "reportes") return <Reports />;
    if (paginaActiva === "admin-usuarios") return <Users />;
    if (paginaActiva === "admin-servicios") return <Services />;
    if (paginaActiva === "admin-logs") return <Logs />;
    if (paginaActiva === "ejecutivo") return <ExecutiveSummary />;
    if (paginaActiva === "reportes-generados") return <GeneratedReports />;
    return <Placeholder titulo={TITULOS[paginaActiva]} />;
  };

  return (
    <div className="flex w-full h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Sidebar
        activo={paginaActiva}
        onNavegar={(p) => handleNavegar(p)}
        abiertoMobile={sidebarMobileAbierto}
        onCerrarMobile={() => setSidebarMobileAbierto(false)}
        colapsadoDesktop={sidebarDesktopColapsado}
        onToggleColapsoDesktop={() => setSidebarDesktopColapsado(!sidebarDesktopColapsado)}
      />

      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        <Header
          titulo={TITULOS[paginaActiva]}
          onToggleSidebar={() => setSidebarMobileAbierto(!sidebarMobileAbierto)}
        />
        <main className="flex-1 overflow-y-auto min-w-0 bg-[#090d16] custom-scrollbar">
          {renderPagina()}
        </main>
      </div>
    </div>
  );
}
