import { EstadoServicio } from "../types";
import { Network, Laptop, Mail, Database } from "lucide-react";

export function StatusPanel({ servicios }: { servicios: EstadoServicio[] }) {
  const getIcon = (nombre: string) => {
    const n = nombre.toLowerCase();
    if (n.includes("red") || n.includes("network")) return Network;
    if (n.includes("endpoint") || n.includes("host")) return Laptop;
    if (n.includes("email") || n.includes("mail")) return Mail;
    return Database;
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {servicios.map((s) => {
        const Icon = getIcon(s.nombre);
        return (
          <div
            key={s.nombre}
            className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/60 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-2 rounded-lg border ${
                s.activo
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}>
                <Icon size={16} />
              </div>
              <div className="flex items-center min-w-0">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {s.nombre}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 pl-2">
              <span className={`w-2 h-2 rounded-full ${
                s.activo
                  ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                  : "bg-red-500"
              }`} />
              <span className={`text-[10px] font-mono font-bold uppercase ${
                s.activo ? "text-emerald-400" : "text-red-400"
              }`}>
                {s.activo ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}