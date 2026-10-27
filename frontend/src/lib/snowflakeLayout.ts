import { TopologyNode, TopologyEdge } from "../types";

export interface SnowflakeNodeLayout extends TopologyNode {
  x: number;
  y: number;
  level: number;
  angle: number;       // En radianes
  radius: number;      // Distancia al centro en px
  branchId: string;    // "wan" | "dmz" | "lan" | string
  branchName: string;  // Etiqueta legible del segmento
  isCenter: boolean;
}

export interface SnowflakeEdgeLayout {
  edge: TopologyEdge;
  sourceNode: SnowflakeNodeLayout;
  targetNode: SnowflakeNodeLayout;
  isTreeEdge: boolean;
  isCrossBranch: boolean;
  pathD: string;
}

export interface SnowflakeGuides {
  centerX: number;
  centerY: number;
  rings: { radius: number; label: string }[];
  axes: { angle: number; label: string; branchId: string; length: number }[];
}

export interface SnowflakeLayoutResult {
  nodes: SnowflakeNodeLayout[];
  nodeMap: Map<string, SnowflakeNodeLayout>;
  edges: SnowflakeEdgeLayout[];
  guides: SnowflakeGuides;
  bounds: {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
}

/**
 * Normaliza una dirección IP o identificador eliminando máscaras CIDR y espacios
 */
function cleanIp(ip?: string): string {
  if (!ip) return "";
  return ip.replace(/\/.*$/, "").trim().toLowerCase();
}

/**
 * Identifica el nodo núcleo central (Core Gateway / Router principal)
 */
function findCenterNode(nodes: TopologyNode[], edges: TopologyEdge[]): TopologyNode | null {
  if (nodes.length === 0) return null;

  // 1. Coincidencia por IP conocida de Gateway L3
  const coreIps = ["185.15.2.1", "172.16.0.1", "10.20.30.1"];
  const ipMatch = nodes.find(n => {
    const ip = cleanIp(n.ip);
    return coreIps.includes(ip) || ip.endsWith(".1");
  });
  if (ipMatch) return ipMatch;

  // 2. Coincidencia por etiqueta / rol
  const labelMatch = nodes.find(n => {
    const l = (n.label || "").toLowerCase();
    const t = (n.type || "").toLowerCase();
    return (
      l.includes("gateway") ||
      l.includes("core-router") ||
      l.includes("legit-router") ||
      (t === "router" && !l.includes("isp"))
    );
  });
  if (labelMatch) return labelMatch;

  // 3. Fallback: nodo con mayor grado de conexiones en el grafo
  const degrees = new Map<string, number>();
  edges.forEach(e => {
    degrees.set(e.source, (degrees.get(e.source) || 0) + 1);
    degrees.set(e.target, (degrees.get(e.target) || 0) + 1);
  });

  let bestNode = nodes[0];
  let maxDegree = -1;
  nodes.forEach(n => {
    const deg = degrees.get(n.id) || 0;
    if (deg > maxDegree) {
      maxDegree = deg;
      bestNode = n;
    }
  });

  return bestNode;
}

/**
 * Determina a qué segmento/rama del copo de nieve pertenece un nodo
 */
function classifyNodeBranch(node: TopologyNode, isCenter: boolean): { branchId: string; branchName: string } {
  if (isCenter) {
    return { branchId: "core", branchName: "Núcleo Central" };
  }

  const ip = cleanIp(node.ip);
  const label = (node.label || "").toLowerCase();
  const type = (node.type || "").toLowerCase();

  // Segmento WAN (Internet / Borde)
  if (
    ip.startsWith("185.15.") ||
    label.includes("wan") ||
    label.includes("isp") ||
    label.includes("partner") ||
    label.includes("ext") ||
    label.includes("attacker")
  ) {
    return { branchId: "wan", branchName: "Segmento WAN (Borde)" };
  }

  // Segmento DMZ (Servidores perimetrales)
  if (
    ip.startsWith("172.16.") ||
    label.includes("dmz") ||
    label.includes("mail") ||
    label.includes("intranet") ||
    label.includes("erp") ||
    label.includes("corp-mail")
  ) {
    return { branchId: "dmz", branchName: "Segmento DMZ (Servicios)" };
  }

  // Segmento LAN (Red Interna Corporativa)
  if (
    ip.startsWith("10.20.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    label.includes("lan") ||
    label.includes("pc") ||
    label.includes("db") ||
    label.includes("workstation") ||
    label.includes("ventas") ||
    label.includes("finanzas") ||
    label.includes("rrhh") ||
    label.includes("ti")
  ) {
    return { branchId: "lan", branchName: "Segmento LAN (Corporativa)" };
  }

  // Fallback por tipo de dispositivo
  if (type === "server") {
    return { branchId: "dmz", branchName: "Segmento Servidores" };
  }
  if (type === "workstation") {
    return { branchId: "lan", branchName: "Segmento LAN" };
  }

  return { branchId: "wan", branchName: "Segmento Externo" };
}

/**
 * Clasifica la jerarquía/nivel del nodo dentro de su rama:
 * Nivel 1: Conmutadores de Distribución / Routers de Borde
 * Nivel 2: Conmutadores de Acceso / Servidores
 * Nivel 3: Estaciones de trabajo / Dispositivos finales (Hojas)
 */
function getNodeHierarchyLevel(node: TopologyNode, isCenter: boolean): number {
  if (isCenter) return 0;

  const ip = cleanIp(node.ip);
  const label = (node.label || "").toLowerCase();
  const type = (node.type || "").toLowerCase();

  // Nivel 1: Conmutadores de distribución y routers de borde
  if (
    ip === "185.15.2.3" ||
    ip === "172.16.0.2" ||
    ip === "10.20.30.2" ||
    label.includes("sw-dmz") ||
    label.includes("sw-core") ||
    label.includes("router-isp") ||
    type === "switch" && (label.includes("core") || label.includes("dist"))
  ) {
    return 1;
  }

  // Nivel 2: Switch de acceso o Servidores
  if (
    ip === "10.20.30.3" ||
    label.includes("sw-access") ||
    ip === "185.15.2.2" ||
    label.includes("partner") ||
    ip.startsWith("172.16.0.") ||
    ip === "10.20.30.50" ||
    ip === "10.20.30.51" ||
    label.includes("db") ||
    label.includes("srv") ||
    label.includes("erp") ||
    label.includes("mail") ||
    type === "server" ||
    type === "database"
  ) {
    return 2;
  }

  // Nivel 3: PCs y estaciones de trabajo
  return 3;
}

/**
 * Calcula la distribución matemática del Copo de Nieve (Snowflake Topology Layout)
 * garantizando cero intersecciones en el árbol estructural de la red.
 */
export function computeSnowflakeLayout(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  dimensions: { width: number; height: number }
): SnowflakeLayoutResult {
  const width = Math.max(dimensions.width || 800, 600);
  const height = Math.max(dimensions.height || 600, 500);
  const centerX = width / 2;
  const centerY = height / 2;

  // Escala adaptativa según tamaño del contenedor
  const minDimension = Math.min(width, height);
  const scale = Math.max(0.65, Math.min(1.25, minDimension / 800));

  const R1 = 140 * scale; // Nivel 1: Distribución / Borde
  const R2 = 255 * scale; // Nivel 2: Acceso / Servidores
  const R3 = 370 * scale; // Nivel 3: Estaciones de trabajo / Hojas

  const centerNode = findCenterNode(nodes, edges);
  const centerId = centerNode?.id;

  // 1. Agrupar nodos por rama del copo de nieve
  const branchMap: Record<string, TopologyNode[]> = {
    wan: [],
    dmz: [],
    lan: []
  };
  const otherBranches: Map<string, TopologyNode[]> = new Map();

  nodes.forEach(node => {
    if (node.id === centerId) return;
    const { branchId } = classifyNodeBranch(node, false);
    if (branchMap[branchId]) {
      branchMap[branchId].push(node);
    } else {
      if (!otherBranches.has(branchId)) {
        otherBranches.set(branchId, []);
      }
      otherBranches.get(branchId)!.push(node);
    }
  });

  // Ángulos maestros de simetría de Copo de Nieve (Tríada a 120° de separación)
  // -90° (Norte / Arriba) = WAN
  // 150° (Suroeste / Abajo-Izquierda) = DMZ
  // 30°  (Sureste / Abajo-Derecha) = LAN
  const branchConfigs: Record<string, { baseAngle: number; name: string }> = {
    wan: { baseAngle: -Math.PI / 2, name: "Segmento WAN (Borde)" },
    dmz: { baseAngle: (5 * Math.PI) / 6, name: "Segmento DMZ (Servicios)" },
    lan: { baseAngle: Math.PI / 6, name: "Segmento LAN (Corporativa)" }
  };

  const layoutNodes: SnowflakeNodeLayout[] = [];
  const nodeMap = new Map<string, SnowflakeNodeLayout>();

  // 2. Posicionar el Nodo Núcleo Central
  if (centerNode) {
    const centerLayout: SnowflakeNodeLayout = {
      ...centerNode,
      x: centerX,
      y: centerY,
      level: 0,
      angle: 0,
      radius: 0,
      branchId: "core",
      branchName: "Gateway L3 Central",
      isCenter: true
    };
    layoutNodes.push(centerLayout);
    nodeMap.set(centerNode.id, centerLayout);
  }

  // 3. Posicionar el Brazo WAN (Norte, -90°)
  const wanNodes = branchMap.wan;
  if (wanNodes.length > 0) {
    const baseAngle = branchConfigs.wan.baseAngle;
    
    // Separar Router ISP y Socios / Terminales
    const ispNode = wanNodes.find(n => {
      const ip = cleanIp(n.ip);
      const l = (n.label || "").toLowerCase();
      return ip === "185.15.2.3" || l.includes("isp") || l.includes("router");
    });
    const externalPeers = wanNodes.filter(n => n.id !== ispNode?.id);

    if (ispNode) {
      const layout: SnowflakeNodeLayout = {
        ...ispNode,
        x: centerX + R1 * Math.cos(baseAngle),
        y: centerY + R1 * Math.sin(baseAngle),
        level: 1,
        angle: baseAngle,
        radius: R1,
        branchId: "wan",
        branchName: branchConfigs.wan.name,
        isCenter: false
      };
      layoutNodes.push(layout);
      nodeMap.set(ispNode.id, layout);
    }

    // Peers externos distribuidos en abanico en Nivel 2
    const totalPeers = externalPeers.length;
    const angularSpan = Math.min(Math.PI / 4, Math.max(0.2, (totalPeers - 1) * 0.16));
    externalPeers.forEach((peer, idx) => {
      const offset = totalPeers === 1 ? 0 : -angularSpan / 2 + (idx / (totalPeers - 1)) * angularSpan;
      const angle = baseAngle + offset;
      const radius = ispNode ? R2 : R1 + 40;
      const layout: SnowflakeNodeLayout = {
        ...peer,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        level: ispNode ? 2 : 1,
        angle,
        radius,
        branchId: "wan",
        branchName: branchConfigs.wan.name,
        isCenter: false
      };
      layoutNodes.push(layout);
      nodeMap.set(peer.id, layout);
    });
  }

  // 4. Posicionar el Brazo DMZ (Suroeste, 150°)
  const dmzNodes = branchMap.dmz;
  if (dmzNodes.length > 0) {
    const baseAngle = branchConfigs.dmz.baseAngle;

    // Conmutador de distribución DMZ
    const swDmz = dmzNodes.find(n => {
      const ip = cleanIp(n.ip);
      const l = (n.label || "").toLowerCase();
      return ip === "172.16.0.2" || l.includes("sw-dmz") || l.includes("switch");
    });
    const dmzServers = dmzNodes.filter(n => n.id !== swDmz?.id);

    if (swDmz) {
      const layout: SnowflakeNodeLayout = {
        ...swDmz,
        x: centerX + R1 * Math.cos(baseAngle),
        y: centerY + R1 * Math.sin(baseAngle),
        level: 1,
        angle: baseAngle,
        radius: R1,
        branchId: "dmz",
        branchName: branchConfigs.dmz.name,
        isCenter: false
      };
      layoutNodes.push(layout);
      nodeMap.set(swDmz.id, layout);
    }

    // Ordenar servidores DMZ: Intranet (izquierda), ERP (centro), Mail (derecha)
    const sortedServers = [...dmzServers].sort((a, b) => {
      const ipA = cleanIp(a.ip);
      const ipB = cleanIp(b.ip);
      return ipA.localeCompare(ipB);
    });

    const totalServers = sortedServers.length;
    const angularSpan = Math.min(Math.PI / 3.2, Math.max(0.25, (totalServers - 1) * 0.16));
    sortedServers.forEach((srv, idx) => {
      const offset = totalServers === 1 ? 0 : -angularSpan / 2 + (idx / (totalServers - 1)) * angularSpan;
      const angle = baseAngle + offset;
      const radius = swDmz ? R2 : R1 + 50;
      const layout: SnowflakeNodeLayout = {
        ...srv,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        level: 2,
        angle,
        radius,
        branchId: "dmz",
        branchName: branchConfigs.dmz.name,
        isCenter: false
      };
      layoutNodes.push(layout);
      nodeMap.set(srv.id, layout);
    });
  }

  // 5. Posicionar el Brazo LAN (Sureste, 30°)
  const lanNodes = branchMap.lan;
  if (lanNodes.length > 0) {
    const baseAngle = branchConfigs.lan.baseAngle;

    // Switch Core LAN
    const swCore = lanNodes.find(n => {
      const ip = cleanIp(n.ip);
      const l = (n.label || "").toLowerCase();
      return ip === "10.20.30.2" || l.includes("sw-core");
    });

    // Switch Acceso LAN
    const swAccess = lanNodes.find(n => {
      const ip = cleanIp(n.ip);
      const l = (n.label || "").toLowerCase();
      return ip === "10.20.30.3" || l.includes("sw-access");
    });

    // Servidores DB
    const dbServers = lanNodes.filter(n => {
      const ip = cleanIp(n.ip);
      const l = (n.label || "").toLowerCase();
      return (
        n.id !== swCore?.id &&
        n.id !== swAccess?.id &&
        (ip.endsWith(".50") || ip.endsWith(".51") || l.includes("db") || l.includes("analytics"))
      );
    });

    // Workstations (PCs de usuarios)
    const workstations = lanNodes.filter(n => {
      return (
        n.id !== swCore?.id &&
        n.id !== swAccess?.id &&
        !dbServers.some(db => db.id === n.id)
      );
    });

    // 5.1 Colocar Switch Core LAN en Nivel 1 (R1, baseAngle)
    if (swCore) {
      const layout: SnowflakeNodeLayout = {
        ...swCore,
        x: centerX + R1 * Math.cos(baseAngle),
        y: centerY + R1 * Math.sin(baseAngle),
        level: 1,
        angle: baseAngle,
        radius: R1,
        branchId: "lan",
        branchName: branchConfigs.lan.name,
        isCenter: false
      };
      layoutNodes.push(layout);
      nodeMap.set(swCore.id, layout);
    }

    // 5.2 Colocar Bases de Datos en Nivel 2 (desplazadas hacia el eje superior de LAN)
    dbServers.forEach((db, idx) => {
      const angle = baseAngle - 0.28 + idx * 0.15;
      const layout: SnowflakeNodeLayout = {
        ...db,
        x: centerX + R2 * Math.cos(angle),
        y: centerY + R2 * Math.sin(angle),
        level: 2,
        angle,
        radius: R2,
        branchId: "lan",
        branchName: branchConfigs.lan.name,
        isCenter: false
      };
      layoutNodes.push(layout);
      nodeMap.set(db.id, layout);
    });

    // 5.3 Colocar Switch de Acceso en Nivel 2 (alineado hacia el sub-eje de puestos de trabajo)
    const accessAngle = baseAngle + 0.18;
    if (swAccess) {
      const layout: SnowflakeNodeLayout = {
        ...swAccess,
        x: centerX + R2 * Math.cos(accessAngle),
        y: centerY + R2 * Math.sin(accessAngle),
        level: 2,
        angle: accessAngle,
        radius: R2,
        branchId: "lan",
        branchName: branchConfigs.lan.name,
        isCenter: false
      };
      layoutNodes.push(layout);
      nodeMap.set(swAccess.id, layout);
    }

    // 5.4 Colocar Workstations en Nivel 3 (Abanico de hojas dendríticas del copo de nieve)
    const sortedWorkstations = [...workstations].sort((a, b) => {
      const ipA = cleanIp(a.ip);
      const ipB = cleanIp(b.ip);
      return ipA.localeCompare(ipB);
    });

    const totalWs = sortedWorkstations.length;
    const wsSpan = Math.min(Math.PI / 3.4, Math.max(0.3, (totalWs - 1) * 0.14));
    sortedWorkstations.forEach((ws, idx) => {
      const offset = totalWs === 1 ? 0 : -wsSpan / 2 + (idx / (totalWs - 1)) * wsSpan;
      const angle = accessAngle + offset;
      const layout: SnowflakeNodeLayout = {
        ...ws,
        x: centerX + R3 * Math.cos(angle),
        y: centerY + R3 * Math.sin(angle),
        level: 3,
        angle,
        radius: R3,
        branchId: "lan",
        branchName: branchConfigs.lan.name,
        isCenter: false
      };
      layoutNodes.push(layout);
      nodeMap.set(ws.id, layout);
    });
  }

  // 6. Manejo dinámico para topologías arbitrarias o nodos adicionales
  if (otherBranches.size > 0) {
    let extraBranchIdx = 0;
    const totalExtra = otherBranches.size;
    otherBranches.forEach((extraNodes, branchId) => {
      const extraAngle = (extraBranchIdx / totalExtra) * Math.PI * 2;
      extraBranchIdx++;
      extraNodes.forEach((node, nodeIdx) => {
        const angle = extraAngle + (nodeIdx - extraNodes.length / 2) * 0.15;
        const radius = R2;
        const layout: SnowflakeNodeLayout = {
          ...node,
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
          level: 2,
          angle,
          radius,
          branchId,
          branchName: `Segmento ${branchId.toUpperCase()}`,
          isCenter: false
        };
        layoutNodes.push(layout);
        nodeMap.set(node.id, layout);
      });
    });
  }

  // Asegurar que ningún nodo quede sin posición
  nodes.forEach(n => {
    if (!nodeMap.has(n.id)) {
      const fallbackAngle = Math.random() * Math.PI * 2;
      const layout: SnowflakeNodeLayout = {
        ...n,
        x: centerX + R2 * Math.cos(fallbackAngle),
        y: centerY + R2 * Math.sin(fallbackAngle),
        level: getNodeHierarchyLevel(n, false),
        angle: fallbackAngle,
        radius: R2,
        branchId: "lan",
        branchName: "Dispositivo de Red",
        isCenter: false
      };
      layoutNodes.push(layout);
      nodeMap.set(n.id, layout);
    }
  });

  // 7. Enrutamiento Óptimo de Aristas (Árbol directo vs Curvas de tráfico inter-segmento)
  const layoutEdges: SnowflakeEdgeLayout[] = [];

  edges.forEach(edge => {
    const s = nodeMap.get(edge.source);
    const t = nodeMap.get(edge.target);
    if (!s || !t) return;

    // Detectar si es arista estructural de árbol
    const isOneCenter = s.isCenter || t.isCenter;
    const isSameBranch = s.branchId === t.branchId && s.branchId !== "core";
    const levelDiff = Math.abs(s.level - t.level);

    // Es enlace de árbol si conecta con el centro o si conecta niveles jerárquicos adyacentes en la misma rama
    const isTreeEdge = isOneCenter || (isSameBranch && levelDiff === 1);
    const isCrossBranch = !isSameBranch && !isOneCenter;

    let pathD = "";

    if (!isCrossBranch) {
      // Enlace directo en línea recta sin intersecciones
      pathD = `M ${s.x} ${s.y} L ${t.x} ${t.y}`;
    } else {
      // Enlace inter-segmento cruzado: enrutar mediante curva de Bézier hacia el exterior para no cruzar el centro
      const midX = (s.x + t.x) / 2;
      const midY = (s.y + t.y) / 2;
      const dxFromCenter = midX - centerX;
      const dyFromCenter = midY - centerY;
      const distFromCenter = Math.hypot(dxFromCenter, dyFromCenter) || 1;

      // Si la línea recta pasa cerca del núcleo, empujar el punto de control hacia afuera
      const pushFactor = Math.max(R1 * 1.25, R2 * 0.95);
      const ctrlX = centerX + (dxFromCenter / distFromCenter) * pushFactor;
      const ctrlY = centerY + (dyFromCenter / distFromCenter) * pushFactor;

      pathD = `M ${s.x} ${s.y} Q ${ctrlX} ${ctrlY} ${t.x} ${t.y}`;
    }

    layoutEdges.push({
      edge,
      sourceNode: s,
      targetNode: t,
      isTreeEdge,
      isCrossBranch,
      pathD
    });
  });

  // 8. Construcción de Guías visuales del Copo de Nieve (Anillos concéntricos y ejes radiales)
  const guides: SnowflakeGuides = {
    centerX,
    centerY,
    rings: [
      { radius: R1, label: "Distribución / Borde" },
      { radius: R2, label: "Servicios y Acceso" },
      { radius: R3, label: "Estaciones de Trabajo" }
    ],
    axes: [
      { angle: branchConfigs.wan.baseAngle, label: "WAN / EXTERNO", branchId: "wan", length: R2 + 40 },
      { angle: branchConfigs.dmz.baseAngle, label: "DMZ / SERVIDORES", branchId: "dmz", length: R2 + 40 },
      { angle: branchConfigs.lan.baseAngle, label: "LAN / USUARIOS", branchId: "lan", length: R3 + 40 }
    ]
  };

  return {
    nodes: layoutNodes,
    nodeMap,
    edges: layoutEdges,
    guides,
    bounds: {
      width,
      height,
      centerX,
      centerY
    }
  };
}
