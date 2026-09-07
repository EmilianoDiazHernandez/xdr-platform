import React, { useMemo, useState, useEffect, useRef } from "react";
import { TopologyNode, TopologyEdge, CorrelatedEvent } from "../types";
import { Server, Laptop, Router, Cpu, ShieldAlert, Crosshair } from "lucide-react";

interface NodeWithPos extends TopologyNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface NetworkGraphProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  onSelectNode: (node: TopologyNode) => void;
  selectedNodeId?: string;
  activeEvent?: CorrelatedEvent | null;
}

export function NetworkGraph({ nodes, edges, onSelectNode, selectedNodeId, activeEvent }: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphNodes, setGraphNodes] = useState<NodeWithPos[]>([]);
  
  // Inicializar posiciones aleatorias
  useEffect(() => {
    const initialNodes = nodes.map(n => ({
      ...n,
      x: Math.random() * 800,
      y: Math.random() * 600,
      vx: 0,
      vy: 0
    }));
    setGraphNodes(initialNodes);
  }, [nodes]);

  // Simulación de fuerzas simple (Force-Directed)
  useEffect(() => {
    if (graphNodes.length === 0) return;

    let frameId: number;
    const simulation = () => {
      setGraphNodes(prev => {
        const next = prev.map(n => ({ ...n }));
        const width = containerRef.current?.clientWidth || 800;
        const height = containerRef.current?.clientHeight || 600;

        // 1. Repulsión entre nodos (Coulomb)
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const dx = next[i].x - next[j].x;
            const dy = next[i].y - next[j].y;
            const distSq = dx * dx + dy * dy + 0.1;
            const force = 1500 / distSq;
            const fx = (dx / Math.sqrt(distSq)) * force;
            const fy = (dy / Math.sqrt(distSq)) * force;
            next[i].vx += fx; next[i].vy += fy;
            next[j].vx -= fx; next[j].vy -= fy;
          }
        }

        // 2. Atracción por enlaces (Hooke)
        edges.forEach(edge => {
          const source = next.find(n => n.id === edge.source);
          const target = next.find(n => n.id === edge.target);
          if (source && target) {
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist - 120) * 0.02;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            source.vx += fx; source.vy += fy;
            target.vx -= fx; target.vy -= fy;
          }
        });

        // 3. Gravedad al centro
        next.forEach(n => {
          const dx = (width / 2) - n.x;
          const dy = (height / 2) - n.y;
          n.vx += dx * 0.005;
          n.vy += dy * 0.005;

          // Aplicar velocidad y fricción
          n.x += n.vx;
          n.y += n.vy;
          n.vx *= 0.8;
          n.vy *= 0.8;

          // Límites
          n.x = Math.max(40, Math.min(width - 40, n.x));
          n.y = Math.max(40, Math.min(height - 40, n.y));
        });

        return next;
      });
      frameId = requestAnimationFrame(simulation);
    };

    frameId = requestAnimationFrame(simulation);
    return () => cancelAnimationFrame(frameId);
  }, [edges, graphNodes.length]);

  const getIcon = (type: string, color: string) => {
    const props = { size: 16, color };
    switch (type.toLowerCase()) {
      case "server": return <Server {...props} />;
      case "workstation": return <Laptop {...props} />;
      case "router": return <Router {...props} />;
      default: return <Cpu {...props} />;
    }
  };

  return (
    <div 
      ref={containerRef}
      style={{ 
        width: "100%", 
        height: "100%", 
        background: "#0f0a1a", 
        borderRadius: "12px", 
        border: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
        cursor: "grab"
      }}
    >
      <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
        {/* Enlaces */}
        {edges.map((edge, i) => {
          const s = graphNodes.find(n => n.id === edge.source);
          const t = graphNodes.find(n => n.id === edge.target);
          if (!s || !t) return null;
          
          let isDimmed = false;
          if (activeEvent) {
            isDimmed = edge.source !== activeEvent.target_node && edge.target !== activeEvent.target_node;
          }

          return (
            <line
              key={i}
              x1={s.x} y1={s.y}
              x2={t.x} y2={t.y}
              stroke={edge.risk > 0.5 ? "rgba(239, 68, 68, 0.4)" : "rgba(124, 58, 237, 0.2)"}
              strokeWidth={Math.min(4, 1 + edge.weight / 10)}
              opacity={isDimmed ? 0.1 : 1}
              style={{ transition: "opacity 0.3s" }}
            />
          );
        })}
      </svg>

      {/* Nodos */}
      {graphNodes.map(node => {
        const isSelected = node.id === selectedNodeId;
        const isEventTarget = activeEvent?.target_node === node.id;
        
        let isDimmed = false;
        if (activeEvent) {
          isDimmed = !isEventTarget && !edges.some(e => (e.source === activeEvent.target_node && e.target === node.id) || (e.target === activeEvent.target_node && e.source === node.id));
        }

        return (
          <div
            key={node.id}
            onClick={() => onSelectNode(node)}
            style={{
              position: "absolute",
              left: node.x,
              top: node.y,
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "pointer",
              zIndex: isSelected || isEventTarget ? 10 : 1,
              transition: "transform 0.1s ease-out, opacity 0.3s",
              opacity: isDimmed ? 0.2 : 1
            }}
          >
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: isSelected ? "#7c3aed" : isEventTarget ? "rgba(239, 68, 68, 0.2)" : "var(--bg3)",
              border: `2px solid ${isEventTarget ? "#ef4444" : node.critical ? "#ef4444" : isSelected ? "#c4b5fd" : "var(--border)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: isEventTarget ? "0 0 20px rgba(239, 68, 68, 0.6)" : isSelected ? "0 0 15px rgba(124,58,237,0.5)" : "none",
              transition: "all 0.2s"
            }}>
              {getIcon(node.type, isSelected ? "#fff" : isEventTarget ? "#ef4444" : node.critical ? "#ef4444" : "#3b82f6")}
              {isEventTarget && (
                <div style={{ position: "absolute", top: -8, right: -8, background: "#ef4444", borderRadius: "50%", padding: "4px", animation: "pulse 2s infinite" }}>
                  <Crosshair size={12} color="#fff" />
                </div>
              )}
              {!isEventTarget && node.critical && (
                <div style={{ position: "absolute", top: -2, right: -2, background: "#ef4444", borderRadius: "50%", padding: "2px" }}>
                  <ShieldAlert size={8} color="#fff" />
                </div>
              )}
            </div>
            <span style={{ 
              fontSize: "9px", 
              fontWeight: 700, 
              color: isSelected ? "#fff" : "var(--txt2)", 
              marginTop: "4px",
              background: "rgba(15, 10, 26, 0.8)",
              padding: "1px 4px",
              borderRadius: "3px",
              whiteSpace: "nowrap"
            }}>
              {node.label}
            </span>
          </div>
        );
      })}

      {/* Leyenda flotante */}
      <div style={{
        position: "absolute",
        bottom: "12px",
        left: "12px",
        background: "rgba(15,10,26,0.9)",
        border: "1px solid var(--border)",
        padding: "8px 12px",
        borderRadius: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "6px"
      }}>
        <div className="flex items-center gap-2">
          <div style={{ width: "8px", height: "2px", background: "rgba(124, 58, 237, 0.4)" }} />
          <span style={{ fontSize: "9px", color: "var(--txt3)", fontWeight: 700 }}>Flujo Normal</span>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: "8px", height: "2px", background: "rgba(239, 68, 68, 0.6)" }} />
          <span style={{ fontSize: "9px", color: "var(--txt3)", fontWeight: 700 }}>Flujo de Riesgo</span>
        </div>
      </div>
    </div>
  );
}
