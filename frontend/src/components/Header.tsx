import { useEffect, useState } from "react";
import { Menu, Shield, LogOut } from "lucide-react";
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

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hora = ahora.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const handleLogout = async () => {
    if (cerrando) return;
    setCerrando(true);
    await logout();
  };

  return (
    <header className="flex items-center justify-between flex-shrink-0 px-4 sm:px-6 h-12 bg-slate-900/95 border-b border-slate-800/80 backdrop-blur z-20">
      {/* Lado izquierdo: Botón Menú + Migas de pan contextuales */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors"
            aria-label="Abrir menú de navegación"
            title="Desplegar menú lateral"
          >
            <Menu size={16} />
          </button>
        )}

        <div className="flex items-center gap-2 text-xs truncate">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Shield size={14} className="text-indigo-400 flex-shrink-0" />
            <span className="hidden sm:inline font-medium">Consola SOC</span>
          </div>
          <span className="text-slate-600">/</span>
          <span className="font-semibold text-slate-100 truncate">{titulo}</span>
        </div>
      </div>

      {/* Lado derecho: Monitoreo en vivo + Reloj + Usuario */}
      <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0">
        {/* Indicador de transmisión en tiempo real */}
        <div className="hidden sm:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="uppercase">Live Engine</span>
        </div>

        {/* Reloj digital de precisión SOC */}
        <div className="hidden sm:flex items-center px-2.5 py-1 rounded-md bg-slate-950/70 border border-slate-800 text-slate-300 font-mono text-xs">
          <span>{hora}</span>
        </div>

        {/* Usuario de la sesión + cerrar sesión */}
        {session && (
          <div className="flex items-center gap-2.5 pl-2.5 sm:pl-3 border-l border-slate-800">
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="text-xs font-semibold text-slate-100">{session.user.nombre}</span>
              <span className="text-[10px] font-medium text-slate-400">{ROLE_LABEL[session.user.role]}</span>
            </div>
            <button
              onClick={handleLogout}
              disabled={cerrando}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-950/70 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors disabled:opacity-50"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
