import { useState, useRef, useEffect } from "react";
import { EstadoAlerta, DisposicionAlerta } from "../types";
import { ChevronDown, Check, Clock, ArrowUpCircle, CheckCircle2, ShieldAlert, type LucideIcon } from "lucide-react";

interface AlertStatusDropdownProps {
  estado?: EstadoAlerta;
  disposicion?: DisposicionAlerta;
  onSelectStatus: (status: EstadoAlerta) => void;
  disabled?: boolean;
}

const OPCIONES_ESTADO: { estado: EstadoAlerta; label: string; icon: LucideIcon; dotColor: string }[] = [
  { estado: "Nueva/Abierta", label: "Nueva / Abierta", icon: ShieldAlert, dotColor: "bg-sky-400" },
  { estado: "En investigación/Pendiente", label: "En investigación / Pendiente", icon: Clock, dotColor: "bg-amber-400" },
  { estado: "Escalada", label: "Escalada", icon: ArrowUpCircle, dotColor: "bg-purple-400" },
  { estado: "Resuelta", label: "Resuelta...", icon: CheckCircle2, dotColor: "bg-emerald-400" },
];

function getStatusStyle(estado: EstadoAlerta) {
  switch (estado) {
    case "Nueva/Abierta":
      return {
        badge: "bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20",
        dot: "bg-sky-400",
        icon: ShieldAlert,
      };
    case "En investigación/Pendiente":
      return {
        badge: "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20",
        dot: "bg-amber-400",
        icon: Clock,
      };
    case "Escalada":
      return {
        badge: "bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20",
        dot: "bg-purple-400",
        icon: ArrowUpCircle,
      };
    case "Resuelta":
      return {
        badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20",
        dot: "bg-emerald-400",
        icon: CheckCircle2,
      };
    default:
      return {
        badge: "bg-slate-500/10 text-slate-400 border-slate-500/30 hover:bg-slate-500/20",
        dot: "bg-slate-400",
        icon: ShieldAlert,
      };
  }
}

export function AlertStatusDropdown({
  estado = "Nueva/Abierta",
  disposicion,
  onSelectStatus,
  disabled = false,
}: AlertStatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const style = getStatusStyle(estado);
  const Icon = style.icon;

  // Si está resuelta, mostrar formato concatenado solicitado: "Resuelta (Disposición)"
  const displayLabel = estado === "Resuelta"
    ? disposicion
      ? `Resuelta (${disposicion})`
      : "Resuelta"
    : estado;

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Botón trigger / split look */}
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold border transition-all cursor-pointer select-none ${style.badge} ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
        title={`Estado actual: ${displayLabel}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
        <Icon size={12} className="flex-shrink-0" />
        <span className="truncate max-w-[200px]">{displayLabel}</span>
        <ChevronDown
          size={12}
          className={`opacity-70 transition-transform duration-150 flex-shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Menú desplegable */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 mt-1 w-60 rounded-lg bg-slate-950/95 border border-slate-800 shadow-2xl py-1 z-50 backdrop-blur-md animate-in fade-in zoom-in-95 font-sans"
        >
          <div className="px-2.5 py-1 text-[10px] uppercase font-mono font-semibold text-slate-500 border-b border-slate-800/80 mb-1">
            Ciclo de Vida de Alerta
          </div>
          {OPCIONES_ESTADO.map((item) => {
            const isCurrent = estado === item.estado;
            const ItemIcon = item.icon;

            return (
              <button
                key={item.estado}
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onSelectStatus(item.estado);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${
                  isCurrent
                    ? "bg-slate-800/80 text-white font-medium"
                    : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.dotColor}`} />
                  <ItemIcon size={13} className="text-slate-400 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
                {isCurrent && <Check size={13} className="text-indigo-400 flex-shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
