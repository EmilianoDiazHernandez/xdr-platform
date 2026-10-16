import { EstadoServicio } from "../types";
import { Network, Laptop, Mail, Database } from "lucide-react";

type EstadoUi = "online" | "offline" | "desconocido";

const UI_ESTADO: Record<EstadoUi, { label: string; icono: string; punto: string; texto: string }> = {
  online: {
    label: "ONLINE",
    icono: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    punto: "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]",
    texto: "text-emerald-400",
  },
  offline: {
    label: "OFFLINE",
    icono: "bg-red-500/10 border-red-500/20 text-red-400",
    punto: "bg-red-500",
    texto: "text-red-400",
  },
  // El servicio no respondió y no se puede afirmar su estado
  desconocido: {
    label: "DESCONOCIDO",
    icono: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    punto: "bg-amber-400",
    texto: "text-amber-400",
  },
};

function estadoDe(s: EstadoServicio): EstadoUi {
  if (s.desconocido) return "desconocido";
  return s.activo ? "online" : "offline";
}

function getIcon(nombre: string) {
  const n = nombre.toLowerCase();
  if (n.includes("red") || n.includes("network")) return Network;
  if (n.includes("endpoint") || n.includes("host")) return Laptop;
  if (n.includes("email") || n.includes("mail")) return Mail;
  return Database;
}

export function StatusPanel({ servicios }: { servicios: EstadoServicio[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {servicios.map((s) => {
        const Icon = getIcon(s.nombre);
        const ui = UI_ESTADO[estadoDe(s)];
        return (
          <div
            key={s.nombre}
            className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/60 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-2 rounded-lg border ${ui.icono}`}>
                <Icon size={16} />
              </div>
              <div className="flex items-center min-w-0">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {s.nombre}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 pl-2">
              <span className={`w-2 h-2 rounded-full ${ui.punto}`} />
              <span className={`text-[10px] font-mono font-bold uppercase ${ui.texto}`}>
                {ui.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
