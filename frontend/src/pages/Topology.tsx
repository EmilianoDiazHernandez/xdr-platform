import { useEffect, useState } from "react";
import { fetchTopology, fetchNodeAlerts, fetchEvents, fetchIncidentTimeline } from "../api/config";
import { TopologyData, TopologyNode, CorrelatedEvent } from "../types";
import { NetworkGraph } from "../components/NetworkGraph";
import { CyberKillChainTimeline } from "../components/CyberKillChainTimeline";
import { ShieldAlert, X, Activity } from "lucide-react";

export function Topology() {
  const [data, setData] = useState<TopologyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [nodeAlerts, setNodeAlerts] = useState<any[]>([]);

  // Estado para la Trazabilidad Táctica (Cyber Kill Chain)
  const [killChainTimeline, setKillChainTimeline] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [modalTimelineAbierto, setModalTimelineAbierto] = useState(false);
  const [activeEvent, setActiveEvent] = useState<CorrelatedEvent | null>(null);

  useEffect(() => {
    if (selectedNode) {
      // 1. Cargar alertas individuales del activo
      fetchNodeAlerts(selectedNode.id).then(setNodeAlerts).catch(console.error);

      // 2. Comprobar si el nodo pertenece a un evento correlacionado (incidente táctico)
      fetchEvents()
        .then((events: CorrelatedEvent[]) => {
          const matching = events.find(e => e.target_node === selectedNode.id);
          if (matching) {
            setActiveEvent(matching);
            setLoadingTimeline(true);
            fetchIncidentTimeline(matching.id)
              .then((timeline) => {
                setKillChainTimeline(Array.isArray(timeline) ? timeline : []);
                setLoadingTimeline(false);
              })
              .catch((err) => {
                console.warn("[TOPOLOGY] Error consultando timeline del incidente:", err);
                setKillChainTimeline([]);
                setLoadingTimeline(false);
              });
          } else {
            setActiveEvent(null);
            setKillChainTimeline([]);
          }
        })
        .catch(console.error);
    } else {
      setNodeAlerts([]);
      setActiveEvent(null);
      setKillChainTimeline([]);
      setModalTimelineAbierto(false);
    }
  }, [selectedNode]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchTopology();
        setData(res);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 2000); // Polling cada 2 segundos
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) return <div className="p-10 text-center color-[var(--txt3)]">Cargando topología...</div>;
  if (!data) return <div className="p-10 text-center color-[var(--txt3)]">Error al cargar datos.</div>;

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5 h-full relative">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
            Topología de Red
          </h1>
          <p style={{ fontSize: "12px", color: "var(--txt2)", marginTop: "2px" }}>
            Mapeo visual de activos y flujos de tráfico (GNS3 Style)
          </p>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-start sm:items-end">
            <span style={{ fontSize: "10px", color: "var(--txt3)", fontWeight: 700, textTransform: "uppercase" }}>Dispositivos</span>
            <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>{data.stats.total_nodes}</span>
          </div>
          <div className="flex flex-col items-start sm:items-end">
            <span style={{ fontSize: "10px", color: "var(--txt3)", fontWeight: 700, textTransform: "uppercase" }}>Enlaces Activos</span>
            <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>{data.stats.total_edges}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_320px] gap-5 flex-1 min-h-0">
        {/* Main View: Network Graph */}
        <NetworkGraph 
          nodes={data.nodes} 
          edges={data.edges} 
          onSelectNode={setSelectedNode}
          selectedNodeId={selectedNode?.id}
        />

        {/* Sidebar: Details & Connections */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Node Details */}
          <div style={{ 
            background: "var(--bg3)", 
            borderRadius: "12px", 
            border: "1px solid var(--border)",
            padding: "20px",
          }}>
            <h3 style={{ fontSize: "14px", fontWeight: 800, color: "#fff", marginBottom: "16px" }}>Detalles del Activo</h3>
            {selectedNode ? (
              <div className="flex flex-col gap-4">
                <div>
                  <label style={{ fontSize: "10px", color: "var(--txt3)", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                    Dirección MAC
                  </label>
                  <code style={{ fontSize: "12px", color: "#c4b5fd", background: "rgba(124,58,237,0.1)", padding: "4px 8px", borderRadius: "4px", display: "block" }}>
                    {selectedNode.mac}
                  </code>
                </div>
                <div>
                  <label style={{ fontSize: "10px", color: "var(--txt3)", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                    ID de Dispositivo
                  </label>
                  <p style={{ fontSize: "11px", color: "var(--txt2)", wordBreak: "break-all" }}>{selectedNode.id}</p>
                </div>
                <div style={{ padding: "12px", borderRadius: "8px", background: selectedNode.critical ? "rgba(239,68,68,0.05)" : "rgba(59,130,246,0.05)", border: `1px solid ${selectedNode.critical ? "rgba(239,68,68,0.2)" : "rgba(59,130,246,0.2)"}` }}>
                  <p style={{ fontSize: "11px", color: selectedNode.critical ? "#fca5a5" : "#93c5fd", fontWeight: 600 }}>
                    {selectedNode.critical ? "Este activo es considerado crítico para la organización." : "Activo estándar de la red interna."}
                  </p>
                </div>

                {/* Acceso a Trazabilidad Táctica si existe evento activo */}
                {activeEvent && (
                  <div className="pt-2">
                    <button
                      onClick={() => setModalTimelineAbierto(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all shadow-lg hover:brightness-110 active:scale-[0.98]"
                      style={{
                        background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(79,70,229,0.3))",
                        border: "1px solid rgba(167,139,250,0.5)",
                        color: "#e2ddf0",
                      }}
                      title="Ver Trazabilidad Táctica de la Cadena de Ataque"
                    >
                      <ShieldAlert size={15} className="text-violet-400" />
                      Cyber Kill Chain ({killChainTimeline.length || activeEvent.attack_flow?.length || 0})
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: "12px", color: "var(--txt3)", textAlign: "center", padding: "20px 0" }}>
                Selecciona un dispositivo para ver sus detalles
              </p>
            )}
          </div>

          {/* Connections List */}
          <div style={{ 
            background: "var(--bg3)", 
            borderRadius: "12px", 
            border: "1px solid var(--border)",
            padding: "20px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0
          }}>
            <h3 style={{ fontSize: "14px", fontWeight: 800, color: "#fff", marginBottom: "16px" }}>Conexiones Directas</h3>
            <div style={{ flex: 1, overflowY: "auto" }} className="pr-2">
              {selectedNode ? (
                (() => {
                  const nodeEdges = data.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id);
                  if (nodeEdges.length === 0) return <p style={{ fontSize: "11px", color: "var(--txt3)" }}>No se detectaron flujos recientes.</p>;
                  
                  return nodeEdges.map((edge, i) => {
                    const isSource = edge.source === selectedNode.id;
                    const peerId = isSource ? edge.target : edge.source;
                    const peer = data.nodes.find(n => n.id === peerId);
                    
                    return (
                      <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", marginBottom: "4px" }}>
                        <div className="flex justify-between items-center mb-1">
                          <span style={{ fontSize: "11px", color: "#fff", fontWeight: 600 }}>
                            {isSource ? "→ " : "← "} {peer?.label || "Externo"}
                          </span>
                          <span style={{ fontSize: "10px", color: edge.risk > 0.5 ? "#ef4444" : "#10b981", fontWeight: 800 }}>
                            {Math.round(edge.risk * 100)}% Riesgo
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span style={{ fontSize: "10px", color: "var(--txt3)" }}>{peer?.ip}</span>
                          <span style={{ fontSize: "10px", color: "var(--txt3)" }}>{edge.weight} flujos</span>
                        </div>
                      </div>
                    );
                  });
                })()
              ) : (
                <p style={{ fontSize: "12px", color: "var(--txt3)", textAlign: "center", padding: "20px 0" }}>
                  -
                </p>
              )}
            </div>
          </div>

          {/* Node Alerts List */}
          <div style={{ 
            background: "var(--bg3)", 
            borderRadius: "12px", 
            border: "1px solid var(--border)",
            padding: "20px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0
          }}>
            <div className="flex justify-between items-center mb-4">
              <h3 style={{ fontSize: "14px", fontWeight: 800, color: "#fff", margin: 0 }}>Alertas del Activo</h3>
              {activeEvent && (
                <button
                  onClick={() => setModalTimelineAbierto(true)}
                  className="text-[11px] font-bold text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
                >
                  <Activity size={12} />
                  Kill Chain
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }} className="pr-2">
              {selectedNode ? (
                nodeAlerts.length === 0 ? (
                  <p style={{ fontSize: "11px", color: "var(--txt3)", textAlign: "center" }}>No hay alertas para este activo.</p>
                ) : (
                  nodeAlerts.map((al, idx) => (
                    <div key={idx} style={{ padding: "10px", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", background: "rgba(239,68,68,0.05)" }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: "11px", color: "#fca5a5", fontWeight: 700 }}>{al.tipo_deteccion} - {al.tipo_ataque}</span>
                        <span style={{ fontSize: "10px", color: "var(--txt3)" }}>Sev {al.id_severidad}</span>
                      </div>
                      <p style={{ fontSize: "10px", color: "var(--txt2)" }}>{al.descripcion}</p>
                      <p style={{ fontSize: "9px", color: "var(--txt3)", marginTop: "4px" }}>{new Date(al.time).toLocaleString()}</p>
                    </div>
                  ))
                )
              ) : (
                <p style={{ fontSize: "12px", color: "var(--txt3)", textAlign: "center", padding: "20px 0" }}>
                  Selecciona un dispositivo
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal / Panel lateral de Trazabilidad Cyber Kill Chain (aislado exclusivamente a Topología) */}
      {modalTimelineAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm transition-all">
          <div 
            className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl overflow-hidden"
          >
            {/* Header del Modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/90">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-400">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                    Trazabilidad Táctica — Cyber Kill Chain
                  </h2>
                  <p className="text-xs text-slate-400">
                    Activo: <strong className="text-slate-200">{selectedNode?.label || selectedNode?.ip}</strong> · Incidente: <code className="text-violet-400 font-mono text-[11px]">{activeEvent?.id}</code>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalTimelineAbierto(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Contenido del Modal con CyberKillChainTimeline */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-slate-950/40">
              {loadingTimeline ? (
                <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  <span>Cargando progresión táctica del ataque...</span>
                </div>
              ) : (
                <CyberKillChainTimeline timeline={killChainTimeline} />
              )}
            </div>

            {/* Footer del Modal */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/70 flex justify-between items-center text-xs text-slate-400">
              <span>Total de eventos cronológicos: <strong className="text-white">{killChainTimeline.length}</strong></span>
              <button
                onClick={() => setModalTimelineAbierto(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
