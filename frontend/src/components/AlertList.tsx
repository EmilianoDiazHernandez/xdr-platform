import { Alerta } from "../types";
import { getSeverityStyle } from "../lib/design-tokens";
import { Bell, ArrowUpRight, ShieldAlert } from "lucide-react";

function ordenar(alertas: Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) => {
    const isCritA = a.severidad === "Alta" || (typeof a.severidad === "string" && a.severidad.toLowerCase().includes("crit"));
    const isCritB = b.severidad === "Alta" || (typeof b.severidad === "string" && b.severidad.toLowerCase().includes("crit"));
    if (isCritA && !isCritB) return -1;
    if (!isCritA && isCritB) return 1;
    return b.timestamp.localeCompare(a.timestamp);
  });
}

export function AlertList({
  alertas,
  onNavegar,
}: {
  alertas: Alerta[];
  onNavegar?: (pagina: string, param?: string) => void;
}) {
  const ordenadas = ordenar(alertas);

  return (
    <div className="flex flex-col h-[500px] rounded-xl bg-slate-900/90 border border-slate-800/80 shadow-sm overflow-hidden">
      {/* Encabezado */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-950/40 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-indigo-400" />
          <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
            Alertas y Detecciones Recientes
          </span>
        </div>
        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
          {alertas.length} activas
        </span>
      </div>

      {/* Lista scrolleable con altura completa */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 custom-scrollbar">
        {ordenadas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12">
            <Bell size={28} className="opacity-30 mb-2" />
            <p className="text-xs">No hay alertas recientes registradas.</p>
          </div>
        ) : (
          ordenadas.map((a, idx) => {
            const sev = getSeverityStyle(a.severidad);
            const isEvent = Boolean(a.isGeneralEvent);

            return (
              <div
                key={a.id || idx}
                onClick={() => {
                  if (onNavegar) {
                    if (isEvent) {
                      onNavegar("eventos", String(a.id));
                    } else if (a.ip_origen) {
                      onNavegar("topologia", a.ip_origen);
                    }
                  }
                }}
                className={`group flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                  isEvent
                    ? "bg-indigo-950/20 border-indigo-500/30 hover:bg-indigo-950/40 hover:border-indigo-500/50"
                    : "bg-slate-950/40 border-slate-800/60 hover:bg-slate-800/40 hover:border-slate-700"
                }`}
              >
                {/* Información principal */}
                <div className="flex items-start gap-2.5 min-w-0 pr-2">
                  <div className="mt-0.5 flex-shrink-0">
                    {isEvent ? (
                      <ShieldAlert size={14} className="text-indigo-400" />
                    ) : (
                      <span
                        className="block w-2 h-2 rounded-full mt-1"
                        style={{ backgroundColor: sev.text }}
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
                      {a.descripcion}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] font-mono text-slate-400">
                      <span className="text-sky-400 font-semibold">{a.ip_origen || "N/A"}</span>
                      <span>·</span>
                      <span>{a.timestamp.includes(" ") ? a.timestamp.split(" ")[1] : a.timestamp}</span>
                      {a.mitre_technique_id && (
                        <>
                          <span>·</span>
                          <span className="text-indigo-400 font-bold">{a.mitre_technique_id}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Badge y acción */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${sev.badgeClass}`}
                  >
                    {sev.label}
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}