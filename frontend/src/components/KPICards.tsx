import { Alerta } from "../types";
import { ShieldAlert, AlertTriangle, Monitor, Activity } from "lucide-react";

export function KPICards({ alertas }: { alertas: Alerta[] }) {
  const total = alertas.length;
  const criticas = alertas.filter(a => a.severidad === "Alta" || (typeof a.severidad === "string" && a.severidad.toLowerCase().includes("crit"))).length;
  const hosts = new Set(alertas.map(a => a.ip_origen).filter(Boolean)).size;
  const correlacionadas = alertas.filter(a => a.isGeneralEvent).length;

  const cards = [
    {
      label: "Total Alertas",
      valor: total,
      sub: "Últimas 24 horas",
      Icon: Activity,
      color: "text-slate-100",
      accent: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    },
    {
      label: "Amenazas Críticas",
      valor: criticas,
      sub: "Requieren atención inmediata",
      Icon: AlertTriangle,
      color: criticas > 0 ? "text-red-400" : "text-slate-100",
      accent: "text-red-400 bg-red-500/10 border-red-500/20",
    },
    {
      label: "Activos Afectados",
      valor: hosts,
      sub: "Endpoints y servidores únicos",
      Icon: Monitor,
      color: "text-amber-400",
      accent: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      label: "Incidentes Multi-Capa",
      valor: correlacionadas,
      sub: "Correlación forense activa",
      Icon: ShieldAlert,
      color: "text-sky-400",
      accent: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {cards.map((c) => {
        const Icon = c.Icon;
        return (
          <div
            key={c.label}
            className="flex flex-col justify-between p-4 rounded-xl bg-slate-900/90 border border-slate-800/80 shadow-sm hover:border-slate-700/80 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                {c.label}
              </span>
              <div className={`p-1.5 rounded-lg border ${c.accent}`}>
                <Icon size={15} />
              </div>
            </div>

            <div className="my-1">
              <span className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${c.color} font-mono`}>
                {c.valor}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 mt-1 truncate">
              {c.sub}
            </p>
          </div>
        );
      })}
    </div>
  );
}
