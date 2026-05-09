import { useEffect, useState } from "react";
import { fetchTopology } from "../api/config";
import { TopologyData, TopologyNode } from "../types";
import { ShieldAlert, Activity } from "lucide-react";
import { NetworkGraph } from "../components/NetworkGraph";

export function Topology() {
  const [data, setData] = useState<TopologyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);

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
  }, []);

  if (loading) return <div className="p-10 text-center color-[var(--txt3)]">Cargando topología...</div>;
  if (!data) return <div className="p-10 text-center color-[var(--txt3)]">Error al cargar datos.</div>;

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px", height: "100%" }}>
      {/* Header Info */}
      <div className="flex justify-between items-end">
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
            Topología de Red
          </h1>
          <p style={{ fontSize: "12px", color: "var(--txt2)", marginTop: "2px" }}>
            Mapeo visual de activos y flujos de tráfico (GNS3 Style)
          </p>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-end">
            <span style={{ fontSize: "10px", color: "var(--txt3)", fontWeight: 700, textTransform: "uppercase" }}>Dispositivos</span>
            <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>{data.stats.total_nodes}</span>
          </div>
          <div className="flex flex-col items-end">
            <span style={{ fontSize: "10px", color: "var(--txt3)", fontWeight: 700, textTransform: "uppercase" }}>Enlaces Activos</span>
            <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>{data.stats.total_edges}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "20px", flex: 1, minHeight: 0 }}>
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
        </div>
      </div>
    </div>
  );
}
