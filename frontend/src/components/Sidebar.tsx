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
    section: "Supervisión",
    items: [
      { id: "inicio",    label: "Inicio",          Icon: LayoutDashboard },
      { id: "topologia", label: "Topología Red",   Icon: Network },
    ],
  },
  {
    section: "Detección & Análisis",
    items: [
      { id: "alertas", label: "Alertas",              Icon: Bell },
      { id: "eventos", label: "Incidentes Correlacionados", Icon: CalendarDays },
    ],
  },
  {
    section: "Inteligencia",
    items: [
      { id: "reportes", label: "Reportes Forenses", Icon: FileText },
    ],
  },
  {
    section: "Sistema",
    items: [
      { id: "configuracion", label: "Configuración", Icon: Settings },
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
      {/* Backdrop overlay para pantallas móviles */}
      {abiertoMobile && (
        <div
          onClick={onCerrarMobile}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Contenedor principal del Sidebar */}
      <aside
        className={`flex flex-col flex-shrink-0 transition-all duration-300 z-50
          fixed lg:static top-0 bottom-0 left-0
          bg-slate-900 border-r border-slate-800/80 select-none
          ${abiertoMobile ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"}
          ${colapsadoDesktop ? "w-[68px]" : "w-[230px]"}
        `}
      >
        {/* Cabecera de la Marca e Identidad */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-slate-800/80 flex-shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex-shrink-0 shadow-sm">
              <ShieldCheck size={18} />
            </div>
            {!colapsadoDesktop && (
              <div className="flex flex-col truncate">
                <span className="text-xs font-bold text-slate-100 tracking-tight leading-none">
                  XDR Platform
                </span>
                <span className="text-[10px] text-slate-400 font-medium tracking-wide mt-1">
                  SOC Console
                </span>
              </div>
            )}
          </div>

          {/* Botón de cierre móvil */}
          <button
            onClick={onCerrarMobile}
            className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>
        </div>

        {/* Lista de Navegación por Secciones */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 custom-scrollbar space-y-4">
          {MENU.map(({ section, items }) => (
            <div key={section} className="space-y-1">
              {!colapsadoDesktop ? (
                <p className="px-3 py-1 text-[10px] font-semibold tracking-wider uppercase text-slate-500">
                  {section}
                </p>
              ) : (
                <div className="h-px bg-slate-800/80 my-2 mx-2" />
              )}

              {items.map(({ id, label, Icon }) => {
                const isActive = activo === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleItemClick(id)}
                    title={colapsadoDesktop ? label : undefined}
                    className={`relative w-full flex items-center ${
                      colapsadoDesktop ? "justify-center px-0" : "gap-3 px-3"
                    } py-2 rounded-lg text-xs transition-colors ${
                      isActive
                        ? "bg-indigo-600/15 text-indigo-300 font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-indigo-500 before:rounded-r"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-medium"
                    }`}
                  >
                    <Icon
                      size={16}
                      className={`flex-shrink-0 ${isActive ? "text-indigo-400" : "text-slate-400"}`}
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

        {/* Pie del Sidebar y Toggle de Colapso */}
        <div className="p-3 border-t border-slate-800/80 flex flex-col gap-2 flex-shrink-0 bg-slate-900/60">
          {onToggleColapsoDesktop && (
            <button
              onClick={onToggleColapsoDesktop}
              className={`hidden lg:flex items-center ${
                colapsadoDesktop ? "justify-center" : "justify-between"
              } w-full px-2.5 py-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs`}
              title={colapsadoDesktop ? "Expandir menú lateral" : "Colapsar menú lateral"}
            >
              {!colapsadoDesktop && (
                <span className="text-[11px] font-medium text-slate-400">
                  Minimizar panel
                </span>
              )}
              {colapsadoDesktop ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
            </button>
          )}

          {!colapsadoDesktop ? (
            <div className="flex items-center justify-between px-1 text-[10px] text-slate-500 font-mono">
              <span>ESCOM IPN</span>
              <span>v1.0.0</span>
            </div>
          ) : (
            <div className="text-center text-[9px] font-mono text-slate-500 font-bold">
              v1.0
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
