import { useEffect, useState } from "react";
import { fetchTopology, fetchEvents, fetchIncidentTimeline, fetchAlertas } from "../api/config";
import { TopologyData, TopologyNode, CorrelatedEvent, Alerta } from "../types";
import { NetworkGraph } from "../components/NetworkGraph";
import { CyberKillChainTimeline } from "../components/CyberKillChainTimeline";
import { ShieldAlert, X, Server, Network, Activity, ShieldCheck } from "lucide-react";

export function Topology({ nodoInicial }: { nodoInicial?: string | null } = {}) {
  const [data, setData] = useState<TopologyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [allEvents, setAllEvents] = useState<CorrelatedEvent[]>([]);
  const [allAlerts, setAllAlerts] = useState<Alerta[]>([]);

  // Estado para la Trazabilidad Táctica (Cyber Kill Chain)
  const [killChainTimeline, setKillChainTimeline] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [activeEvent, setActiveEvent] = useState<CorrelatedEvent | null>(null);

  // Seleccionar automáticamente el nodo correspondiente a nodoInicial (IP / ID / Label)
  useEffect(() => {
    if (!nodoInicial || !data?.nodes?.length) return;
    const target = nodoInicial.trim().toLowerCase();
    const match = data.nodes.find(n => {
      const nIp = (n.ip || "").toLowerCase();
      const nId = (n.id || "").toLowerCase();
      const nLabel = (n.label || "").toLowerCase();
      return (
        nIp === target ||
        nId === target ||
        nLabel === target ||
        (nIp && (target.includes(nIp) || nIp.includes(target))) ||
        (nLabel && (target.includes(nLabel) || nLabel.includes(target)))
      );
    });
    if (match) {
      setSelectedNode(match);
      setPanelAbierto(true);
    }
  }, [nodoInicial, Boolean(data?.nodes?.length)]);

  useEffect(() => {
    if (selectedNode) {
      fetchEvents()
        .then((events: CorrelatedEvent[]) => {
          const matching = events.find(e => 
            e.target_node === selectedNode.id || 
            (selectedNode.ip && e.target_node === selectedNode.ip) ||
            (selectedNode.label && e.target_node === selectedNode.label)
          );
          if (matching) {
            setActiveEvent(matching);
            setLoadingTimeline(true);
            fetchIncidentTimeline(matching.id)
              .then((res: any) => {
                const list = Array.isArray(res) ? res : (res?.timeline || matching.attack_flow || []);
                setKillChainTimeline(list);
                setLoadingTimeline(false);
              })
              .catch((err) => {
                console.warn("[TOPOLOGY] Error timeline incidente:", err);
                setKillChainTimeline(matching.attack_flow || []);
                setLoadingTimeline(false);
              });
          } else {
            setActiveEvent(null);
            setKillChainTimeline([]);
          }
        })
        .catch(console.error);
    } else {
      setActiveEvent(null);
      setKillChainTimeline([]);
    }
  }, [selectedNode]);

  useEffect(() => {
    async function load() {
      try {
        const [topoRes, eventsRes, alertsRes] = await Promise.allSettled([
          fetchTopology(),
          fetchEvents(),
          fetchAlertas()
        ]);
        if (topoRes.status === "fulfilled") setData(topoRes.value);
        if (eventsRes.status === "fulfilled") setAllEvents(eventsRes.value);
        if (alertsRes.status === "fulfilled") setAllAlerts(alertsRes.value);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 2500); // Polling cada 2.5s
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 font-mono text-xs">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span>Cargando topología de red...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2 font-mono text-xs">
        <span>Error de conexión al motor de topología.</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4 h-full relative overflow-hidden">
      {/* Encabezado contextual de Topología */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-800/60 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
            <span>Topología y Mapa de Activos</span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              BLUEPRINT RED
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Visualización de nodos de infraestructura, tráfico en tiempo real y riesgo contextual
          </p>
        </div>

        {/* Métricas rápidas de red */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg">
            <Server size={14} className="text-indigo-400" />
            <span className="text-slate-400 uppercase text-[11px]">Dispositivos:</span>
            <span className="text-slate-100 font-bold">{data.stats.total_nodes}</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg">
            <Network size={14} className="text-emerald-400" />
            <span className="text-slate-400 uppercase text-[11px]">Enlaces:</span>
            <span className="text-slate-100 font-bold">{data.stats.total_edges}</span>
          </div>
        </div>
      </div>


      {/* Contenedor Principal: Grafo a la izquierda y Drawer Inspector a la derecha */}
      <div className="flex flex-1 min-h-0 w-full gap-4 relative overflow-hidden">
        {/* Lienzo del Grafo */}
        <div className="flex-1 min-w-0 h-full relative overflow-hidden rounded-xl border border-slate-800 shadow-sm">
          <NetworkGraph 
            nodes={data.nodes} 
            edges={data.edges} 
            events={allEvents}
            alerts={allAlerts}
            onSelectNode={(node) => {
              setSelectedNode(node);
              setPanelAbierto(true);
            }}
            selectedNodeId={selectedNode?.id}
          />

          {/* Botón flotante para reabrir inspector si está cerrado */}
          {selectedNode && !panelAbierto && (
            <button
              type="button"
              onClick={() => setPanelAbierto(true)}
              className="absolute top-4 right-4 z-10 flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-xl bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/30"
              title="Mostrar detalles del activo"
            >
              <ShieldAlert size={14} />
              <span>Inspector: {selectedNode.label || selectedNode.ip}</span>
              <span>▶</span>
            </button>
          )}
        </div>

        {/* Panel Lateral: Asset Inspector */}
        {panelAbierto && (
          <aside className="w-[360px] lg:w-[400px] xl:w-[440px] flex-shrink-0 h-full flex flex-col rounded-xl overflow-hidden shadow-2xl bg-slate-900/95 border border-slate-800 transition-all">
            {/* Header del Inspector */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 bg-slate-950/80 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex-shrink-0">
                  <ShieldAlert size={16} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-slate-100 tracking-tight truncate">
                    {selectedNode ? (selectedNode.label || selectedNode.ip) : "Inspector de Activo"}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono truncate">
                    {selectedNode ? `IP: ${selectedNode.ip || "N/A"} · MAC: ${selectedNode.mac || "N/A"}` : "Selecciona un dispositivo"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {selectedNode && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNode(null);
                      setPanelAbierto(false);
                    }}
                    className="px-2 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-[10px]"
                    title="Deseleccionar activo"
                  >
                    Limpiar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPanelAbierto(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Cerrar panel"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Contenido scrolleable del Inspector */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4 min-h-0">
              {selectedNode ? (
                <>
                  {/* 1. Información General del Activo */}
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Telemetría del Dispositivo
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">
                          Dirección IP
                        </span>
                        <p className="font-mono text-sky-400 font-bold">
                          {selectedNode.ip || "N/A"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">
                          Hostname
                        </span>
                        <p className="text-slate-100 font-medium truncate">
                          {selectedNode.label || "N/A"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">
                          Tipo de Activo
                        </span>
                        <p className="text-slate-300 capitalize font-medium">
                          {selectedNode.type}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">
                          Dirección MAC
                        </span>
                        <code className="text-indigo-300 font-mono text-[11px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 inline-block">
                          {selectedNode.mac}
                        </code>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-slate-800/80">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">
                        Identificador
                      </span>
                      <p className="text-[11px] text-slate-400 font-mono break-all">
                        {selectedNode.id}
                      </p>
                    </div>

                    <div className={`p-2.5 rounded-lg border text-xs font-medium ${
                      selectedNode.critical
                        ? "bg-red-500/10 border-red-500/30 text-red-300"
                        : "bg-sky-500/10 border-sky-500/30 text-sky-300"
                    }`}>
                      {selectedNode.critical
                        ? "⚠️ Activo clasificado como CRÍTICO para la infraestructura."
                        : "ℹ️ Activo estándar de la red interna."}
                    </div>
                  </div>

                  {/* 2. Conexiones Directas */}
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="flex justify-between items-center mb-2.5 pb-1 border-b border-slate-800/60">
                      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Flujos de Red Activos
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {data.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length} enlaces
                      </span>
                    </div>

                    <div className="max-h-[150px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
                      {(() => {
                        const nodeEdges = data.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id);
                        if (nodeEdges.length === 0) {
                          return <p className="text-xs text-slate-400">Sin tráfico detectado recientemente.</p>;
                        }

                        return nodeEdges.map((edge, i) => {
                          const isSource = edge.source === selectedNode.id;
                          const peerId = isSource ? edge.target : edge.source;
                          const peer = data.nodes.find(n => n.id === peerId);

                          return (
                            <div key={i} className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold text-slate-200 truncate">
                                  {isSource ? "→ " : "← "} {peer?.label || peer?.ip || "Externo"}
                                </span>
                                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                  edge.risk > 0.5
                                    ? "bg-red-500/15 text-red-400 border border-red-500/30"
                                    : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                }`}>
                                  {Math.round(edge.risk * 100)}% Riesgo
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                                <span>{peer?.ip || peerId}</span>
                                <span>{edge.weight} flujos</span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* 3. Cyber Kill Chain */}
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="flex justify-between items-center mb-2.5 pb-1 border-b border-slate-800/60">
                      <div className="flex items-center gap-1.5">
                        <Activity size={14} className="text-indigo-400" />
                        <h4 className="text-[11px] font-bold text-slate-100 uppercase tracking-wider">
                          Cyber Kill Chain
                        </h4>
                      </div>
                      {activeEvent && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {activeEvent.id}
                        </span>
                      )}
                    </div>

                    {loadingTimeline ? (
                      <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-[11px] font-mono">Cargando progresión táctica...</span>
                      </div>
                    ) : (
                      <CyberKillChainTimeline timeline={killChainTimeline} />
                    )}
                  </div>
                </>
              ) : (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
                  <ShieldCheck size={32} className="opacity-30" />
                  <p className="text-xs">Selecciona un dispositivo en el grafo para inspeccionar su telemetría y progresión táctica.</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
