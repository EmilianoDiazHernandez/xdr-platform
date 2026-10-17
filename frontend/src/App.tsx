import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Home }    from "./pages/Home";
import { Topology } from "./pages/Topology";
import { Alerts } from "./pages/Alerts";
import { Events } from "./pages/Events";
import { Layers, Menu } from "lucide-react";

const TITULOS: Record<string, string> = {
  inicio:        "Panel de Control",
  topologia:     "Topología de Red",
  alertas:       "Alertas Individuales",
  eventos:       "Incidentes Correlacionados",
  reportes:      "Reportes Forenses",
  configuracion: "Configuración del Sistema",
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
  const [paginaActiva, setPaginaActiva] = useState("inicio");
  const [eventoSeleccionado, setEventoSeleccionado] = useState<string | null>(null);
  const [nodoSeleccionado, setNodoSeleccionado] = useState<string | null>(null);
  const [sidebarMobileAbierto, setSidebarMobileAbierto] = useState(false);
  const [sidebarDesktopColapsado, setSidebarDesktopColapsado] = useState(false);

  const handleNavegar = (pagina: string, param?: string) => {
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
    if (paginaActiva === "inicio") return <Home onNavegar={handleNavegar} />;
    if (paginaActiva === "topologia") return <Topology nodoInicial={nodoSeleccionado} />;
    if (paginaActiva === "alertas") return <Alerts onNavegar={handleNavegar} eventoSeleccionado={eventoSeleccionado} />;
    if (paginaActiva === "eventos") return <Events eventoSeleccionado={eventoSeleccionado} />;
    return <Placeholder titulo={TITULOS[paginaActiva]} />;
  };

  return (
    <div className="flex w-full h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Botón flotante para abrir el menú en dispositivos móviles */}
      <button
        onClick={() => setSidebarMobileAbierto(true)}
        className="lg:hidden fixed top-3 left-3 z-40 p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300 hover:text-white shadow-xl backdrop-blur transition-all"
        aria-label="Abrir menú"
        title="Abrir menú lateral"
      >
        <Menu size={18} />
      </button>

      <Sidebar
        activo={paginaActiva}
        onNavegar={(p) => handleNavegar(p)}
        abiertoMobile={sidebarMobileAbierto}
        onCerrarMobile={() => setSidebarMobileAbierto(false)}
        colapsadoDesktop={sidebarDesktopColapsado}
        onToggleColapsoDesktop={() => setSidebarDesktopColapsado(!sidebarDesktopColapsado)}
      />

      {/* Área principal a pantalla completa (sin Header ni StatusBar) */}
      <main className="flex-1 h-screen overflow-y-auto min-w-0 bg-[#090d16] custom-scrollbar">
        {renderPagina()}
      </main>
    </div>
  );
}
