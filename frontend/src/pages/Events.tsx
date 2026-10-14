import { useEffect, useState, useMemo } from "react";
import { fetchEvents, fetchIncidentTimeline } from "../api/config";
import { CorrelatedEvent, AttackFlowStep, IncidentTimeline, TimelineItem } from "../types";
import { getSeverityStyle, getVectorStyle, formatTimestamp } from "../lib/design-tokens";
import { ShieldAlert, ChevronDown, Activity, Clock, Target, Hash } from "lucide-react";

function AccordionEvent({
  event,
  startExpanded,
}: {
  event: CorrelatedEvent;
  startExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [timelineData, setTimelineData] = useState<IncidentTimeline | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const sevStyle = getSeverityStyle(event.severity);
  const isOpen = event.status === "Abierto";

  useEffect(() => {
    if (expanded && !timelineData) {
      setLoadingTimeline(true);
      fetchIncidentTimeline(event.id)
        .then((data: any) => {
          if (Array.isArray(data)) {
            setTimelineData({
              id_evento_correlacionado: event.id,
              id_dispositivo_origen: event.target_node,
              fecha_inicio: event.start_time,
              fecha_actualizacion: event.last_update,
              estado: event.status,
              severidad_global: event.severity,
              probabilidad_global: event.probability,
              total_pasos: data.length,
              vectores_involucrados: Array.from(
                new Set(data.map((d: any) => d.vector || d.layer).filter(Boolean))
              ),
              timeline: data,
            });
          } else {
            setTimelineData(data);
          }
          setLoadingTimeline(false);
        })
        .catch((err) => {
          console.warn("[TIMELINE] Usando attack_flow local:", err);
          setLoadingTimeline(false);
        });
    }
  }, [expanded, event.id, timelineData]);

  const items: Array<TimelineItem | AttackFlowStep> =
    timelineData?.timeline && timelineData.timeline.length > 0
      ? timelineData.timeline
      : event.attack_flow || [];

  return (
    <div
      className={`rounded-xl border transition-all mb-3 overflow-hidden shadow-sm ${
        expanded
          ? "bg-slate-900 border-indigo-500/50 shadow-indigo-500/5"
          : "bg-slate-900/80 border-slate-800/80 hover:border-slate-700"
      }`}
    >
      {/* Cabecera del Incidente */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between p-4 cursor-pointer select-none bg-slate-950/40 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-3.5 min-w-0 pr-3">
          {/* Badge de Severidad */}
          <span className={`text-[10px] font-bold font-mono px-2.5 py-1 rounded-md flex-shrink-0 ${sevStyle.badgeClass}`}>
            {sevStyle.label}
          </span>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-100 truncate">
                Incidente en <span className="text-sky-400 font-mono">{event.target_node}</span>
              </h3>

              {timelineData?.vectores_involucrados &&
                timelineData.vectores_involucrados.map((v) => {
                  const vs = getVectorStyle(v);
                  return (
                    <span
                      key={v}
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${vs.badgeClass}`}
                    >
                      {vs.label}
                    </span>
                  );
                })}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono flex-wrap">
              <span className="text-slate-500">ID: {event.id}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-slate-500" />
                {formatTimestamp(event.start_time)}
              </span>
              {event.probability !== undefined && (
                <>
                  <span>·</span>
                  <span className="text-indigo-400 font-semibold">
                    Probabilidad: {(event.probability * 100).toFixed(0)}%
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Estado y Chevron */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full uppercase tracking-wider ${
              isOpen
                ? "bg-red-500/10 text-red-400 border border-red-500/30"
                : "bg-slate-800 text-slate-400 border border-slate-700"
            }`}
          >
            {event.status}
          </span>
          <div
            className={`text-slate-400 transition-transform duration-200 ${
              expanded ? "rotate-180 text-indigo-400" : ""
            }`}
          >
            <ChevronDown size={18} />
          </div>
        </div>
      </div>

      {/* Contenido Desplegable (Línea de Tiempo Forense) */}
      {expanded && (
        <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-slate-950/50">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Activity size={14} className="text-indigo-400" />
              <span>Secuencia de Pasos Forenses Multi-Vector ({items.length})</span>
            </h4>
            {loadingTimeline && (
              <span className="text-xs text-indigo-400 font-mono animate-pulse">
                Sincronizando timeline...
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs">
              No hay eventos secuenciales registrados en este incidente.
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
              {items.map((step: any, i: number) => {
                const vectorName = step.vector || step.layer || "Desconocido";
                const vs = getVectorStyle(vectorName);
                const stepSev = getSeverityStyle(step.severidad);

                return (
                  <div key={i} className="relative flex items-start gap-3 group">
                    {/* Indicador de paso en la línea vertical */}
                    <div className="absolute -left-6 mt-1 flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 border-2 border-indigo-500 text-[10px] font-bold text-indigo-300 font-mono shadow-sm">
                      {i + 1}
                    </div>

                    {/* Tarjeta del paso */}
                    <div className="flex-1 p-3.5 rounded-lg bg-slate-900/90 border border-slate-800/80 group-hover:border-slate-700 transition-colors">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${vs.badgeClass}`}>
                            {vs.label}
                          </span>

                          {step.mitre_tactic && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                              {step.mitre_tactic}
                            </span>
                          )}

                          {step.mitre_technique_id && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                              {step.mitre_technique_id}
                            </span>
                          )}

                          {step.mitre_software_id && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-pink-500/15 text-pink-300 border border-pink-500/30">
                              TOOL: {step.mitre_software_id}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 font-mono text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded font-bold ${stepSev.badgeClass}`}>
                            {stepSev.label}
                          </span>
                          <span className="text-slate-500">
                            {formatTimestamp(step.timestamp)}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-200 leading-relaxed">
                        {step.descripcion || step.description}
                      </p>

                      {/* Metadatos Forenses */}
                      {(step.ip_destino || step.dest_ip || step.file_hash) && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center gap-4 text-xs font-mono text-slate-400 flex-wrap">
                          {(step.ip_destino || step.dest_ip) && (
                            <div className="flex items-center gap-1.5">
                              <Target size={12} className="text-sky-400" />
                              <span>Destino:</span>
                              <span className="text-slate-200 font-bold">
                                {step.ip_destino || step.dest_ip}
                              </span>
                            </div>
                          )}

                          {step.file_hash && (
                            <div className="flex items-center gap-1.5">
                              <Hash size={12} className="text-indigo-400" />
                              <span>Hash:</span>
                              <code className="text-indigo-300 bg-slate-950 px-1 py-0.5 rounded border border-slate-800 text-[11px]">
                                {step.file_hash.substring(0, 18)}...
                              </code>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Events({ eventoSeleccionado }: { eventoSeleccionado?: string | null }) {
  const [eventos, setEventos] = useState<CorrelatedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "abiertos" | "cerrados">("todos");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const evData = await fetchEvents();
        setEventos(evData);
      } catch (e) {
        console.error("Error loading events page data", e);
      }
      setLoading(false);
    }
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  const eventosFiltrados = useMemo(() => {
    return eventos
      .filter((ev) => {
        if (filtroEstado === "abiertos") return ev.status === "Abierto";
        if (filtroEstado === "cerrados") return ev.status !== "Abierto";
        return true;
      })
      .sort((a, b) => {
        if (a.status === "Abierto" && b.status !== "Abierto") return -1;
        if (b.status === "Abierto" && a.status !== "Abierto") return 1;
        return new Date(b.last_update).getTime() - new Date(a.last_update).getTime();
      });
  }, [eventos, filtroEstado]);

  const conteo = useMemo(() => {
    return {
      todos: eventos.length,
      abiertos: eventos.filter(e => e.status === "Abierto").length,
      cerrados: eventos.filter(e => e.status !== "Abierto").length,
    };
  }, [eventos]);

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4 max-w-7xl mx-auto w-full h-full min-h-0">
      {/* Encabezado contextual */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-800/60 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
            <span>Incidentes Correlacionados</span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {eventos.length} incidentes
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Motor de correlación multi-capa: reconstrucción secuencial de vectores y progresión de ataque
          </p>
        </div>

        {/* Pestañas de filtrado de estado */}
        <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setFiltroEstado("todos")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              filtroEstado === "todos"
                ? "bg-slate-800 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Todos ({conteo.todos})
          </button>
          <button
            onClick={() => setFiltroEstado("abiertos")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              filtroEstado === "abiertos"
                ? "bg-red-500/20 text-red-300 border border-red-500/30 shadow-sm"
                : "text-slate-400 hover:text-red-400"
            }`}
          >
            Abiertos ({conteo.abiertos})
          </button>
          <button
            onClick={() => setFiltroEstado("cerrados")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              filtroEstado === "cerrados"
                ? "bg-slate-800 text-slate-300 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Cerrados ({conteo.cerrados})
          </button>
        </div>
      </div>

      {/* Lista de Incidentes */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 pr-1">
        {loading && eventos.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            Cargando incidentes correlacionados...
          </div>
        ) : eventosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl bg-slate-900/40">
            <ShieldAlert size={32} className="opacity-30 mb-2" />
            <p>No hay incidentes correlacionados bajo el filtro actual.</p>
          </div>
        ) : (
          eventosFiltrados.map((ev) => (
            <AccordionEvent
              key={ev.id}
              event={ev}
              startExpanded={eventoSeleccionado === ev.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
