import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { TopologyNode, TopologyEdge, CorrelatedEvent, Alerta } from "../types";
import { 
  Monitor, Router, Network, Server, Database, Mail, Globe, 
  Terminal, Cpu, ShieldAlert, ZoomIn, ZoomOut, RotateCcw, Snowflake
} from "lucide-react";
import { 
  computeSnowflakeLayout, 
  SnowflakeNodeLayout, 
  SnowflakeEdgeLayout 
} from "../lib/snowflakeLayout";

export type EdgeThreatSeverity = "baja" | "media" | "alta" | "critica" | "none";

export interface EdgeColorConfig {
  hasThreat: boolean;
  severity: EdgeThreatSeverity;
  baseColor: string;
  pulseColor: string;
  pulseSpeed: string;
  strokeWidth: number;
}

interface NetworkGraphProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  onSelectNode: (node: TopologyNode) => void;
  selectedNodeId?: string;
  events?: CorrelatedEvent[];
  alerts?: Alerta[];
}

export function NetworkGraph({ 
  nodes, 
  edges, 
  onSelectNode, 
  selectedNodeId,
  events = [],
  alerts = []
}: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Dimensiones del contenedor reactivo
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600
  });

  // Estado de navegación espacial (Zoom & Pan)
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number }>({
    mouseX: 0,
    mouseY: 0,
    panX: 0,
    panY: 0
  });

  // Desplazamiento manual personalizado de nodos (arrastrar y soltar)
  const [customOffsets, setCustomOffsets] = useState<Map<string, { x: number; y: number }>>(new Map());
  const draggingNodeRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    initialOffset: { x: number; y: number };
    hasMoved: boolean;
  } | null>(null);

  // Observador de cambio de tamaño del contenedor para reajuste adaptativo
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Manejador nativo de rueda de ratón para Zoom suave centrado
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      setZoom((z) => Math.max(0.4, Math.min(2.4, z * zoomFactor)));
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Cálculo determinista del diseño en Copo de Nieve (Snowflake Topology)
  const snowflakeLayout = useMemo(() => {
    return computeSnowflakeLayout(nodes, edges, dimensions);
  }, [nodes, edges, dimensions]);

  // Nodos finales combinando la posición matemática del copo de nieve con desplazamientos manuales
  const finalNodes = useMemo(() => {
    return snowflakeLayout.nodes.map((node) => {
      const custom = customOffsets.get(node.id);
      if (custom) {
        return {
          ...node,
          x: node.x + custom.x,
          y: node.y + custom.y
        };
      }
      return node;
    });
  }, [snowflakeLayout.nodes, customOffsets]);

  const finalNodeMap = useMemo(() => {
    const map = new Map<string, SnowflakeNodeLayout>();
    finalNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [finalNodes]);

  // Aristas actualizadas con enrutamiento dinámico (cero intersecciones en árbol y curvas Bézier suaves en cruces)
  const finalEdges = useMemo(() => {
    const { centerX, centerY } = snowflakeLayout.bounds;
    const R1 = snowflakeLayout.guides.rings[0]?.radius || 140;
    const R2 = snowflakeLayout.guides.rings[1]?.radius || 250;

    return edges.map((edge) => {
      const s = finalNodeMap.get(edge.source);
      const t = finalNodeMap.get(edge.target);
      if (!s || !t) return null;

      const isOneCenter = s.isCenter || t.isCenter;
      const isSameBranch = s.branchId === t.branchId && s.branchId !== "core";
      const isCrossBranch = !isSameBranch && !isOneCenter;

      let pathD = "";
      if (!isCrossBranch) {
        // Enlace estructural directo sin cruce
        pathD = `M ${s.x} ${s.y} L ${t.x} ${t.y}`;
      } else {
        // Enlace inter-segmento: curva Bézier cuadrática que rodea el núcleo para evitar atravesar nodos
        const midX = (s.x + t.x) / 2;
        const midY = (s.y + t.y) / 2;
        const dx = midX - centerX;
        const dy = midY - centerY;
        const dist = Math.hypot(dx, dy) || 1;

        const pushRadius = Math.max(R1 * 1.3, R2 * 0.95);
        const ctrlX = centerX + (dx / dist) * pushRadius;
        const ctrlY = centerY + (dy / dist) * pushRadius;

        pathD = `M ${s.x} ${s.y} Q ${ctrlX} ${ctrlY} ${t.x} ${t.y}`;
      }

      return {
        edge,
        sourceNode: s,
        targetNode: t,
        isTreeEdge: isOneCenter || isSameBranch,
        isCrossBranch,
        pathD
      };
    }).filter(Boolean) as SnowflakeEdgeLayout[];
  }, [edges, finalNodeMap, snowflakeLayout]);

  // Controladores de arrastre del lienzo (Pan)
  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current && (e.target as HTMLElement).tagName !== "svg") {
      return;
    }
    setIsPanning(true);
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    // 1. Arrastre de nodo individual
    if (draggingNodeRef.current) {
      const drag = draggingNodeRef.current;
      const dxScreen = e.clientX - drag.startX;
      const dyScreen = e.clientY - drag.startY;

      if (Math.hypot(dxScreen, dyScreen) > 4) {
        drag.hasMoved = true;
      }

      const dxModel = dxScreen / zoom;
      const dyModel = dyScreen / zoom;

      setCustomOffsets((prev) => {
        const next = new Map(prev);
        next.set(drag.nodeId, {
          x: drag.initialOffset.x + dxModel,
          y: drag.initialOffset.y + dyModel
        });
        return next;
      });
      return;
    }

    // 2. Desplazamiento del lienzo completo (Pan)
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy
      });
    }
  }, [isPanning, zoom]);

  const handleMouseUp = useCallback(() => {
    if (draggingNodeRef.current) {
      draggingNodeRef.current = null;
    }
    if (isPanning) {
      setIsPanning(false);
    }
  }, [isPanning]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Manejador de inicio de arrastre o selección de un nodo
  const handleNodeMouseDown = (e: React.MouseEvent, node: SnowflakeNodeLayout) => {
    e.stopPropagation();
    const currentOffset = customOffsets.get(node.id) || { x: 0, y: 0 };
    draggingNodeRef.current = {
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      initialOffset: currentOffset,
      hasMoved: false
    };
  };

  const handleNodeClick = (e: React.MouseEvent, node: SnowflakeNodeLayout) => {
    e.stopPropagation();
    // Si fue un arrastre con movimiento significativo, no activar selección accidental
    if (draggingNodeRef.current?.hasMoved) return;
    onSelectNode(node);
  };

  // Restablecer vistas al estado prístino de Copo de Nieve
  const handleResetLayout = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCustomOffsets(new Map());
  };

  const getNodeDisplayLabel = (node: TopologyNode) => {
    const rawIp = (node.ip || "").toLowerCase();
    const cleanIp = rawIp.replace(/\/.*$/, "").trim();
    if (node.label && !node.label.includes("/32") && node.label !== node.ip && node.label !== "unknown") {
      return node.label;
    }
    const ipNames: Record<string, string> = {
      "172.16.0.1": "GW-ROUTER",
      "172.16.0.2": "SW-DMZ",
      "172.16.0.10": "SRV-DMZ-INTRANET",
      "172.16.0.11": "SRV-DMZ-ERP",
      "172.16.0.20": "CORP-MAIL",
      "10.20.30.1": "GW-LAN",
      "10.20.30.2": "SW-CORE",
      "10.20.30.3": "SW-ACCESS",
      "10.20.30.50": "SRV-DB-PROD",
      "10.20.30.51": "SRV-DB-ANALYTICS",
      "10.20.30.101": "PC-VENTAS",
      "10.20.30.103": "PC-FINANZAS",
      "10.20.30.104": "PC-RRHH",
      "10.20.30.105": "PC-TI-ADMIN",
      "185.15.2.1": "GW-WAN",
      "185.15.2.2": "PARTNER-EXT",
      "185.15.2.3": "ROUTER-ISP"
    };
    return ipNames[cleanIp] || cleanIp || node.label;
  };

  const getNodeIcon = (node: TopologyNode, color: string) => {
    const props = { size: 18, color };
    const type = (node.type || "").toLowerCase();
    const label = (node.label || "").toLowerCase();
    const rawIp = (node.ip || "").toLowerCase();
    const ip = rawIp.replace(/\/.*$/, "").trim();

    // 1. Router / Gateway de red
    if (
      type === "router" ||
      label.includes("router") ||
      label.includes("gateway") ||
      label.includes("gw") ||
      ip === "185.15.2.1" ||
      ip === "172.16.0.1" ||
      ip === "10.20.30.1" ||
      ip === "185.15.2.3"
    ) {
      return <Router {...props} />;
    }

    // 2. Switch de red / Conmutador
    if (
      type === "switch" ||
      label.includes("switch") ||
      label.includes("sw-") ||
      label.includes("sw_") ||
      label.includes("sw") ||
      ip === "172.16.0.2" ||
      ip === "10.20.30.2" ||
      ip === "10.20.30.3"
    ) {
      return <Network {...props} />;
    }

    // 3. Base de Datos / Storage
    if (
      label.includes("db") ||
      label.includes("database") ||
      label.includes("postgres") ||
      label.includes("analytics") ||
      ip === "10.20.30.50" ||
      ip === "10.20.30.51" ||
      ip.endsWith(".50") ||
      ip.endsWith(".51")
    ) {
      return <Database {...props} />;
    }

    // 4. Servidor de Correo (SMTP / Exchange)
    if (
      label.includes("mail") ||
      label.includes("smtp") ||
      label.includes("exchange") ||
      label.includes("correo") ||
      ip === "172.16.0.20" ||
      ip.endsWith(".20")
    ) {
      return <Mail {...props} />;
    }

    // 5. Servidor Web / Portales DMZ (Intranet, ERP, CRM)
    if (
      label.includes("web") ||
      label.includes("intranet") ||
      label.includes("erp") ||
      label.includes("crm") ||
      label.includes("http") ||
      ip === "172.16.0.10" ||
      ip === "172.16.0.11" ||
      ip === "172.16.0.12" ||
      ip.endsWith(".10") ||
      ip.endsWith(".11") ||
      ip.endsWith(".12")
    ) {
      return <Globe {...props} />;
    }

    // 6. Atacante / Socio Comercial Externo WAN
    if (
      label.includes("attacker") ||
      label.includes("kali") ||
      label.includes("partner") ||
      ip === "185.15.2.2"
    ) {
      return <Terminal {...props} />;
    }

    // 7. Servidor general
    if (type === "server" || label.includes("srv") || label.includes("server")) {
      return <Server {...props} />;
    }

    // 8. PC / Estación de Trabajo (Computadora personal / Workstation)
    if (
      type === "workstation" ||
      label.includes("pc") ||
      label.includes("workstation") ||
      label.includes("ventas") ||
      label.includes("finanzas") ||
      label.includes("rrhh") ||
      label.includes("soporte") ||
      label.includes("operaciones") ||
      label.includes("admin") ||
      label.includes("desktop") ||
      label.includes("laptop") ||
      ip.startsWith("10.20.30.1") ||
      ip.startsWith("10.20.30.")
    ) {
      return <Monitor {...props} />;
    }

    // 9. IoT / CPU por defecto
    if (type === "iot") {
      return <Cpu {...props} />;
    }

    return <Monitor {...props} />;
  };

  const getEdgeThreatConfig = (
    edge: TopologyEdge,
    sourceNode?: TopologyNode,
    targetNode?: TopologyNode
  ): EdgeColorConfig => {
    const sIp = (sourceNode?.ip || "").replace(/\/.*$/, "").trim().toLowerCase();
    const tIp = (targetNode?.ip || "").replace(/\/.*$/, "").trim().toLowerCase();
    const sId = (sourceNode?.id || edge.source || "").toLowerCase();
    const tId = (targetNode?.id || edge.target || "").toLowerCase();

    let maxSeverityScore = 0; // 0 = sin alerta (azul), 1 = baja (verde), 2 = media (amarillo), 3 = alta (rojo), 4 = crítica (rojo)

    // 1. Verificar eventos correlacionados activos (Attack Flows)
    for (const ev of events) {
      if (ev.status && ev.status.toLowerCase() !== "abierto") continue;
      const evTarget = (ev.target_node || "").toLowerCase();
      const isSourceMatch = evTarget === sId || (sIp && evTarget === sIp);
      const isTargetMatch = evTarget === tId || (tIp && evTarget === tIp);

      if (isSourceMatch || isTargetMatch) {
        let flowMatches = false;
        if (ev.attack_flow && Array.isArray(ev.attack_flow) && ev.attack_flow.length > 0) {
          for (const step of ev.attack_flow) {
            const destIp = (step.dest_ip || "").replace(/\/.*$/, "").trim().toLowerCase();
            if (destIp && (destIp === tIp || destIp === sIp)) {
              flowMatches = true;
              const stepSev = Number(step.severidad) || 1;
              if (stepSev > maxSeverityScore) maxSeverityScore = stepSev;
            }
          }
        }

        if (flowMatches || isSourceMatch) {
          const evSev = Number(ev.severity) || 1;
          if (evSev > maxSeverityScore) maxSeverityScore = evSev;
        }
      }
    }

    // 2. Verificar alertas directas en los extremos
    for (const alt of alerts) {
      if (alt.disposicion === "Falso positivo" || alt.estado === "Resuelta") continue;
      const aIp = (alt.ip_origen || "").replace(/\/.*$/, "").trim().toLowerCase();
      if (aIp && (aIp === sIp || aIp === tIp)) {
        const sevStr = (alt.severidad || "").toLowerCase();
        let num = 0;
        if (sevStr.includes("crít") || sevStr.includes("crit")) num = 4;
        else if (sevStr.includes("alt")) num = 3;
        else if (sevStr.includes("med")) num = 2;
        else if (sevStr.includes("baj")) num = 1;

        if (num > maxSeverityScore) maxSeverityScore = num;
      }
    }

    // 3. Si alguno de los nodos extremos está marcado como crítico
    if (sourceNode?.critical || targetNode?.critical) {
      if (maxSeverityScore < 3) maxSeverityScore = 3;
    }

    // 4. Mapeo a los colores requeridos:
    if (maxSeverityScore === 0) {
      return {
        hasThreat: false,
        severity: "none",
        baseColor: "rgba(59, 130, 246, 0.4)",   // Azul
        pulseColor: "rgba(96, 165, 250, 0.95)", // Azul brillante
        pulseSpeed: "1.2s",
        strokeWidth: Math.min(5, 1.5 + edge.weight / 6)
      };
    }

    if (maxSeverityScore === 1) {
      return {
        hasThreat: true,
        severity: "baja",
        baseColor: "rgba(34, 197, 94, 0.5)",    // Verde
        pulseColor: "rgba(74, 222, 128, 0.95)", // Verde brillante
        pulseSpeed: "0.9s",
        strokeWidth: Math.min(5, 2 + edge.weight / 6)
      };
    }

    if (maxSeverityScore === 2) {
      return {
        hasThreat: true,
        severity: "media",
        baseColor: "rgba(234, 179, 8, 0.55)",   // Amarillo
        pulseColor: "rgba(250, 204, 21, 0.95)", // Amarillo brillante
        pulseSpeed: "0.6s",
        strokeWidth: Math.min(6, 2.5 + edge.weight / 6)
      };
    }

    return {
      hasThreat: true,
      severity: maxSeverityScore === 4 ? "critica" : "alta",
      baseColor: "rgba(239, 68, 68, 0.65)",    // Rojo
      pulseColor: "rgba(248, 113, 113, 0.95)", // Rojo brillante
      pulseSpeed: "0.35s",
      strokeWidth: Math.min(7, 3 + edge.weight / 6)
    };
  };

  const now = new Date().getTime();
  const { centerX, centerY } = snowflakeLayout.bounds;

  return (
    <div 
      ref={containerRef}
      onMouseDown={handleMouseDownCanvas}
      style={{ 
        width: "100%", 
        height: "100%", 
        backgroundColor: "#090d16", 
        backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        borderRadius: "12px", 
        border: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
        cursor: isPanning ? "grabbing" : "grab",
        userSelect: "none"
      }}
    >
      {/* Contenedor Transformable (Soporta Pan y Zoom centrados) */}
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: `${centerX}px ${centerY}px`,
          transition: isPanning ? "none" : "transform 0.08s ease-out"
        }}
      >
        <svg 
          width="100%" 
          height="100%" 
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        >
          <defs>
            {/* Gradiente sutil para los ejes del Copo de Nieve */}
            <radialGradient id="snowflakeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 1. Fondo de Guías del Copo de Nieve (Anillos Orbitales y Ejes de Simetría) */}
          <g className="snowflake-guides">
            {/* Resplandor central en el núcleo */}
            <circle
              cx={centerX}
              cy={centerY}
              r={snowflakeLayout.guides.rings[0]?.radius || 140}
              fill="url(#snowflakeGlow)"
            />

            {/* Anillos concéntricos orbitales del copo de nieve */}
            {snowflakeLayout.guides.rings.map((ring, idx) => (
              <g key={`ring-${idx}`}>
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={ring.radius}
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.09)"
                  strokeWidth="1"
                  strokeDasharray="4 6"
                />
              </g>
            ))}

            {/* Ejes radiales de las 3 ramas principales (WAN, DMZ, LAN) */}
            {snowflakeLayout.guides.axes.map((axis, idx) => {
              const x2 = centerX + axis.length * Math.cos(axis.angle);
              const y2 = centerY + axis.length * Math.sin(axis.angle);
              return (
                <g key={`axis-${idx}`}>
                  <line
                    x1={centerX}
                    y1={centerY}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(99, 102, 241, 0.15)"
                    strokeWidth="1.5"
                    strokeDasharray="3 4"
                  />
                  {/* Etiqueta de la rama en el extremo */}
                  <text
                    x={x2 + 18 * Math.cos(axis.angle)}
                    y={y2 + 18 * Math.sin(axis.angle)}
                    fill="rgba(148, 163, 184, 0.5)"
                    fontSize="9"
                    fontWeight="700"
                    fontFamily="monospace"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {axis.label}
                  </text>
                </g>
              );
            })}
          </g>

          {/* 2. Enlaces de Red (Aristas sin intersección en árbol + Curvas en cruces) */}
          <g className="snowflake-edges">
            {finalEdges.map((edgeLayout, i) => {
              const { edge, sourceNode, targetNode, pathD, isCrossBranch } = edgeLayout;
              const edgeTime = edge.last_seen ? new Date(edge.last_seen).getTime() : 0;
              const isActive = (now - edgeTime) < 20000;
              const cfg = getEdgeThreatConfig(edge, sourceNode, targetNode);

              return (
                <g key={`edge-${edge.source}-${edge.target}-${i}`}>
                  {/* Línea base estática */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={cfg.baseColor}
                    strokeWidth={cfg.strokeWidth}
                    strokeDasharray={isCrossBranch ? "6 4" : undefined}
                    strokeOpacity={isCrossBranch ? 0.75 : 1}
                  />

                  {/* Animación superpuesta si hay tráfico activo */}
                  {isActive && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={cfg.pulseColor}
                      strokeWidth={Math.min(3.5, 1.2 + edge.weight / 10)}
                      strokeDasharray="5 7"
                    >
                      <animate 
                        attributeName="stroke-dashoffset" 
                        from="24" 
                        to="0" 
                        dur={cfg.pulseSpeed} 
                        repeatCount="indefinite" 
                      />
                    </path>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* 3. Nodos del Grafo (Dispositivos) */}
        {finalNodes.map((node) => {
          const isSelected = node.id === selectedNodeId;
          const isCore = node.isCenter;

          return (
            <div
              key={node.id}
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
              onClick={(e) => handleNodeClick(e, node)}
              style={{
                position: "absolute",
                left: node.x,
                top: node.y,
                transform: "translate(-50%, -50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                cursor: "pointer",
                zIndex: isSelected ? 20 : isCore ? 15 : 10,
                transition: draggingNodeRef.current?.nodeId === node.id ? "none" : "transform 0.15s ease-out"
              }}
              title={`${node.label || node.ip} (${node.branchName})`}
            >
              {/* Contenedor circular del nodo */}
              <div 
                style={{
                  width: isCore ? "46px" : "38px",
                  height: isCore ? "46px" : "38px",
                  borderRadius: "50%",
                  background: isSelected 
                    ? "#7c3aed" 
                    : isCore 
                      ? "#1e1b4b" 
                      : "var(--bg3)",
                  border: `2px solid ${
                    node.critical 
                      ? "#ef4444" 
                      : isSelected 
                        ? "#c4b5fd" 
                        : isCore 
                          ? "#818cf8" 
                          : "var(--border)"
                  }`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: isSelected 
                    ? "0 0 18px rgba(124, 58, 237, 0.65)" 
                    : isCore 
                      ? "0 0 15px rgba(99, 102, 241, 0.4)" 
                      : "0 2px 8px rgba(0, 0, 0, 0.4)",
                  transition: "all 0.2s"
                }}
              >
                {getNodeIcon(
                  node, 
                  isSelected ? "#fff" : node.critical ? "#ef4444" : isCore ? "#a5b4fc" : "#3b82f6"
                )}
                {node.critical && (
                  <div style={{ position: "absolute", top: -2, right: -2, background: "#ef4444", borderRadius: "50%", padding: "2px" }}>
                    <ShieldAlert size={8} color="#fff" />
                  </div>
                )}
              </div>

              {/* Etiqueta del Nodo */}
              <span 
                style={{ 
                  fontSize: isCore ? "10px" : "9px", 
                  fontWeight: 700, 
                  color: isSelected ? "#fff" : isCore ? "#c7d2fe" : "var(--txt2)", 
                  marginTop: "4px",
                  background: isCore ? "rgba(30, 27, 75, 0.9)" : "rgba(15, 10, 26, 0.85)",
                  border: isCore ? "1px solid rgba(129, 140, 248, 0.3)" : "1px solid rgba(255, 255, 255, 0.05)",
                  padding: "1px 5px",
                  borderRadius: "4px",
                  whiteSpace: "nowrap"
                }}
              >
                {getNodeDisplayLabel(node)}
              </span>
            </div>
          );
        })}
      </div>

      {/* 4. Barra Flotante de Controles de Navegación (Zoom & Reset) */}
      <div 
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          background: "rgba(15, 10, 26, 0.92)",
          border: "1px solid var(--border)",
          padding: "4px",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          zIndex: 30
        }}
      >
        <button
          type="button"
          onClick={() => setZoom(z => Math.min(2.4, z + 0.15))}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          title="Acercar (Zoom In)"
        >
          <ZoomIn size={14} />
        </button>

        <span className="font-mono text-[10px] text-slate-400 font-bold px-1.5 min-w-[36px] text-center">
          {Math.round(zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          title="Alejar (Zoom Out)"
        >
          <ZoomOut size={14} />
        </button>

        <div className="w-[1px] h-4 bg-slate-800 mx-0.5" />

        <button
          type="button"
          onClick={handleResetLayout}
          className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-white border border-indigo-500/30 text-[10px] font-bold transition-colors"
          title="Restablecer posición del Copo de Nieve"
        >
          <RotateCcw size={12} />
          <span>Restablecer</span>
        </button>
      </div>

      {/* 5. Insignia descriptiva de distribución (Top-Left) */}
      <div 
        style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          background: "rgba(15, 10, 26, 0.85)",
          border: "1px solid var(--border)",
          padding: "4px 8px",
          borderRadius: "6px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          zIndex: 30,
          pointerEvents: "none"
        }}
      >
        <Snowflake size={13} className="text-indigo-400" />
        <span className="text-[10px] font-mono text-slate-300 font-medium">
          Topología en Copo de Nieve · Cero Intersecciones
        </span>
      </div>

      {/* 6. Leyenda flotante de Tráfico y Amenazas (Bottom-Left) */}
      <div 
        style={{
          position: "absolute",
          bottom: "12px",
          left: "12px",
          background: "rgba(15, 10, 26, 0.92)",
          border: "1px solid var(--border)",
          padding: "8px 12px",
          borderRadius: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          zIndex: 30
        }}
      >
        <div className="flex items-center gap-2">
          <div style={{ width: "12px", height: "3px", background: "#3b82f6", borderRadius: "2px" }} />
          <span style={{ fontSize: "9px", color: "var(--txt2)", fontWeight: 700 }}>Conexión Normal (Sin alerta)</span>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: "12px", height: "3px", background: "#22c55e", borderRadius: "2px" }} />
          <span style={{ fontSize: "9px", color: "var(--txt2)", fontWeight: 700 }}>Amenaza - Severidad Baja</span>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: "12px", height: "3px", background: "#eab308", borderRadius: "2px" }} />
          <span style={{ fontSize: "9px", color: "var(--txt2)", fontWeight: 700 }}>Amenaza - Severidad Media</span>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: "12px", height: "3px", background: "#ef4444", borderRadius: "2px" }} />
          <span style={{ fontSize: "9px", color: "var(--txt2)", fontWeight: 700 }}>Amenaza - Severidad Alta / Crítica</span>
        </div>
        <div className="pt-1 mt-1 border-t border-slate-800/80 flex items-center justify-between text-[9px] text-slate-400 font-mono">
          <span>Arrastre: Pan / Nodos</span>
          <span>Rueda: Zoom</span>
        </div>
      </div>
    </div>
  );
}
