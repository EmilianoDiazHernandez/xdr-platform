import { useEffect, useRef, useState, useCallback } from "react";

// ── Tipos que coinciden con la BD de Emiliano ────────────────
export interface Nodo {
  id_dispositivo: string;
  label: string;           // mac_address o hostname
  id_tipo: "router" | "servidor" | "laptop" | "switch" | "dispositivo";
  es_critico: boolean;
  ip?: string;
  mac?: string;
}

export interface Enlace {
  id: string;
  id_origen: string;
  id_destino: string;
  es_anomalia: boolean;
  flow_bytes_s: number;
  flow_packets_s: number;
  id_severidad: "Alto" | "Medio" | "Bajo" | null;
  protocolo_transport?: string;
  puerto_origen?: number;
  puerto_destino?: number;
  descripcion?: string;
}

interface TooltipData {
  x: number;
  y: number;
  html: string;
}

// ── Paleta consistente con el diseño Fortify360 ───────────────
const NODE_COLOR: Record<string, string> = {
  router:     "#ba7517",
  servidor:   "#378add",
  laptop:     "#888780",
  switch:     "#534ab7",
  dispositivo:"#1d9e75",
};
const SEV_COLOR: Record<string, string> = {
  Alto:  "#e24b4a",
  Medio: "#ef9f27",
  Bajo:  "#1d9e75",
};
const EDGE_NORMAL  = "#4b4a6a";
const EDGE_ANOMALY = "#e24b4a";

// ── Datos mock — reemplazar por llamada a la API ──────────────
const MOCK_NODES: Nodo[] = [
  { id_dispositivo:"n1", label:"Router-GW",  id_tipo:"router",     es_critico:true,  ip:"192.168.1.1",  mac:"AA:BB:CC:00:01" },
  { id_dispositivo:"n2", label:"Srv-Web",    id_tipo:"servidor",   es_critico:true,  ip:"192.168.1.10", mac:"AA:BB:CC:00:02" },
  { id_dispositivo:"n3", label:"Srv-BD",     id_tipo:"servidor",   es_critico:true,  ip:"192.168.1.11", mac:"AA:BB:CC:00:03" },
  { id_dispositivo:"n4", label:"PC-Admin",   id_tipo:"laptop",     es_critico:false, ip:"192.168.1.20", mac:"AA:BB:CC:00:04" },
  { id_dispositivo:"n5", label:"PC-User1",   id_tipo:"laptop",     es_critico:false, ip:"192.168.1.21", mac:"AA:BB:CC:00:05" },
  { id_dispositivo:"n6", label:"PC-User2",   id_tipo:"laptop",     es_critico:false, ip:"192.168.1.22", mac:"AA:BB:CC:00:06" },
  { id_dispositivo:"n7", label:"Switch-01",  id_tipo:"switch",     es_critico:false, ip:"192.168.1.2",  mac:"AA:BB:CC:00:07" },
  { id_dispositivo:"n8", label:"IoT-Cam",    id_tipo:"dispositivo",es_critico:false, ip:"192.168.1.50", mac:"AA:BB:CC:00:08" },
];

const MOCK_EDGES: Enlace[] = [
  { id:"e1", id_origen:"n1", id_destino:"n7", es_anomalia:false, flow_bytes_s:1200,  flow_packets_s:45,   id_severidad:null,   protocolo_transport:"TCP",  puerto_origen:80,    puerto_destino:49200 },
  { id:"e2", id_origen:"n7", id_destino:"n2", es_anomalia:false, flow_bytes_s:8400,  flow_packets_s:210,  id_severidad:null,   protocolo_transport:"HTTP", puerto_origen:49200, puerto_destino:80    },
  { id:"e3", id_origen:"n7", id_destino:"n3", es_anomalia:true,  flow_bytes_s:54000, flow_packets_s:900,  id_severidad:"Alto", protocolo_transport:"TCP",  puerto_origen:49900, puerto_destino:3306, descripcion:"Escaneo de puertos en servidor de BD" },
  { id:"e4", id_origen:"n4", id_destino:"n7", es_anomalia:false, flow_bytes_s:2200,  flow_packets_s:60,   id_severidad:null,   protocolo_transport:"SSH",  puerto_origen:22,    puerto_destino:49300 },
  { id:"e5", id_origen:"n5", id_destino:"n7", es_anomalia:true,  flow_bytes_s:95000, flow_packets_s:2100, id_severidad:"Alto", protocolo_transport:"TCP",  puerto_origen:49500, puerto_destino:445,  descripcion:"Posible fuerza bruta SSH desde host interno" },
  { id:"e6", id_origen:"n6", id_destino:"n7", es_anomalia:false, flow_bytes_s:600,   flow_packets_s:18,   id_severidad:null,   protocolo_transport:"DNS",  puerto_origen:53,    puerto_destino:49100 },
  { id:"e7", id_origen:"n8", id_destino:"n7", es_anomalia:true,  flow_bytes_s:31000, flow_packets_s:700,  id_severidad:"Medio",protocolo_transport:"UDP",  puerto_origen:49800, puerto_destino:554,  descripcion:"Tráfico RTSP inusual desde cámara IoT" },
  { id:"e8", id_origen:"n2", id_destino:"n3", es_anomalia:false, flow_bytes_s:3100,  flow_packets_s:88,   id_severidad:null,   protocolo_transport:"TCP",  puerto_origen:5432,  puerto_destino:49600 },
];

// ── Helpers de posición ───────────────────────────────────────
function buildPositions(
  nodes: Nodo[],
  W: number,
  H: number
): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const cx = W / 2, cy = H / 2;
  const r = Math.min(W, H) * 0.35;
  const center = nodes.find((n) => n.id_tipo === "switch") || nodes[0];
  const hub    = nodes.find((n) => n.id_tipo === "router") || nodes[1];
  const rest   = nodes.filter(
    (n) => n.id_dispositivo !== center.id_dispositivo && n.id_dispositivo !== hub.id_dispositivo
  );

  pos[center.id_dispositivo] = { x: cx, y: cy };
  pos[hub.id_dispositivo]    = { x: cx, y: cy - r * 1.05 };

  rest.forEach((n, i) => {
    const a = (i / rest.length) * Math.PI * 2 - Math.PI / 2;
    pos[n.id_dispositivo] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  return pos;
}

function nodeRadius(n: Nodo) { return n.es_critico ? 22 : 15; }

// ── Componente principal ──────────────────────────────────────
interface Props {
  nodes?: Nodo[];
  edges?: Enlace[];
  /** Conectar a WebSocket real: ws://localhost:8000/ws/topologia */
  wsUrl?: string;
}

type Filter = "all" | "anomaly" | "critical";

export default function Topology({
  nodes: propNodes,
  edges: propEdges,
  wsUrl,
}: Props) {
  const [nodes, setNodes]           = useState<Nodo[]>(propNodes ?? MOCK_NODES);
  const [edges, setEdges]           = useState<Enlace[]>(propEdges ?? MOCK_EDGES);
  const [filter, setFilter]         = useState<Filter>("all");
  const [selected, setSelected]     = useState<Nodo | null>(null);
  const [tooltip, setTooltip]       = useState<TooltipData | null>(null);
  const [wsStatus, setWsStatus]     = useState<"off" | "connecting" | "live">("off");

  const cvEdge = useRef<HTMLCanvasElement>(null);
  const cvNode = useRef<HTMLCanvasElement>(null);
  const posRef = useRef<Record<string, { x: number; y: number }>>({});
  const tickRef= useRef(0);
  const rafRef = useRef(0);

  // ── WebSocket (Ciclo 3+) ────────────────────────────────────
  useEffect(() => {
    if (!wsUrl) return;
    setWsStatus("connecting");
    const ws = new WebSocket(wsUrl);
    ws.onopen  = () => setWsStatus("live");
    ws.onclose = () => setWsStatus("off");
    ws.onerror = () => setWsStatus("off");
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.nodes) setNodes(data.nodes);
        if (data.edges) setEdges(data.edges);
      } catch {}
    };
    return () => ws.close();
  }, [wsUrl]);

  // ── Sincronizar props externas ──────────────────────────────
  useEffect(() => { if (propNodes) setNodes(propNodes); }, [propNodes]);
  useEffect(() => { if (propEdges) setEdges(propEdges); }, [propEdges]);

  // ── Resize ──────────────────────────────────────────────────
  const resize = useCallback(() => {
    const wrap = cvNode.current?.parentElement;
    if (!wrap) return;
    const W = wrap.offsetWidth, H = wrap.offsetHeight;
    [cvEdge.current, cvNode.current].forEach((c) => {
      if (c) { c.width = W; c.height = H; }
    });
    posRef.current = buildPositions(nodes, W, H);
  }, [nodes]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // ── Filtro de enlaces ───────────────────────────────────────
  const edgeVisible = useCallback((e: Enlace) => {
    if (filter === "anomaly")  return e.es_anomalia;
    if (filter === "critical") {
      const sn = nodes.find((n) => n.id_dispositivo === e.id_origen);
      const dn = nodes.find((n) => n.id_dispositivo === e.id_destino);
      return !!(sn?.es_critico || dn?.es_critico);
    }
    return true;
  }, [filter, nodes]);

  // ── Loop de animación ───────────────────────────────────────
  useEffect(() => {
    const maxBytes = Math.max(...edges.map((e) => e.flow_bytes_s), 1);

    function drawEdges(t: number) {
      const cv = cvEdge.current; if (!cv) return;
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, cv.width, cv.height);

      edges.forEach((e) => {
        if (!edgeVisible(e)) return;
        const s = posRef.current[e.id_origen];
        const d = posRef.current[e.id_destino];
        if (!s || !d) return;

        const thick = 1 + (e.flow_bytes_s / maxBytes) * 4;
        ctx.save();
        ctx.lineWidth = thick;
        ctx.globalAlpha = 0.7;

        if (e.es_anomalia) {
          ctx.strokeStyle = SEV_COLOR[e.id_severidad ?? "Alto"] ?? EDGE_ANOMALY;
          ctx.setLineDash([8, 5]);
          ctx.lineDashOffset = -(t * 0.045);
        } else {
          ctx.strokeStyle = EDGE_NORMAL;
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();

        // partícula animada en enlaces anómalos
        if (e.es_anomalia) {
          const pct = (t * 0.045) % (Math.PI * 2) / (Math.PI * 2);
          const px = s.x + (d.x - s.x) * (pct % 1);
          const py = s.y + (d.y - s.y) * (pct % 1);
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          ctx.fillStyle = SEV_COLOR[e.id_severidad ?? "Alto"] ?? EDGE_ANOMALY;
          ctx.beginPath();
          ctx.arc(px, py, thick + 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
    }

    function drawNodes() {
      const cv = cvNode.current; if (!cv) return;
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, cv.width, cv.height);

      nodes.forEach((n) => {
        const p = posRef.current[n.id_dispositivo];
        if (!p) return;
        const r = nodeRadius(n);
        const hasAlert = edges.some(
          (e) => edgeVisible(e) && e.es_anomalia && (e.id_origen === n.id_dispositivo || e.id_destino === n.id_dispositivo)
        );
        const color = hasAlert ? "#e24b4a" : (NODE_COLOR[n.id_tipo] ?? "#888780");
        const isSelected = selected?.id_dispositivo === n.id_dispositivo;

        ctx.save();

        // anillo de selección
        if (isSelected) {
          ctx.strokeStyle = "#1d9e75";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // anillo externo para nodos críticos
        if (n.es_critico) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.4;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        // relleno suave
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color + "20";
        ctx.fill();

        // borde
        ctx.strokeStyle = color;
        ctx.lineWidth = n.es_critico ? 2.5 : 1.5;
        ctx.stroke();

        // punto central
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // etiqueta
        ctx.fillStyle = "#c8c8d8";
        ctx.font = "500 10.5px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(n.label, p.x, p.y + r + 5);

        ctx.restore();
      });
    }

    function loop() {
      tickRef.current++;
      drawEdges(tickRef.current);
      drawNodes();
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [nodes, edges, selected, edgeVisible]);

  // ── Hit-testing ─────────────────────────────────────────────
  function getNodeAt(mx: number, my: number): Nodo | null {
    return (
      nodes.find((n) => {
        const p = posRef.current[n.id_dispositivo];
        return p && Math.hypot(mx - p.x, my - p.y) < nodeRadius(n) + 6;
      }) ?? null
    );
  }

  function getEdgeAt(mx: number, my: number): Enlace | null {
    return (
      edges.find((e) => {
        if (!edgeVisible(e)) return false;
        const s = posRef.current[e.id_origen];
        const d = posRef.current[e.id_destino];
        if (!s || !d) return false;
        const len = Math.hypot(d.x - s.x, d.y - s.y);
        const t   = Math.max(0, Math.min(1, ((mx - s.x) * (d.x - s.x) + (my - s.y) * (d.y - s.y)) / (len * len)));
        const px  = s.x + t * (d.x - s.x);
        const py  = s.y + t * (d.y - s.y);
        return Math.hypot(mx - px, my - py) < 8;
      }) ?? null
    );
  }

  // ── Eventos del canvas ───────────────────────────────────────
  function handleMouseMove(ev: React.MouseEvent<HTMLCanvasElement>) {
    const rect = cvNode.current!.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const node = getNodeAt(mx, my);
    const edge = !node ? getEdgeAt(mx, my) : null;

    if (!node && !edge) { setTooltip(null); return; }

    const W = cvNode.current!.width;
    const tx = mx + 14 > W - 230 ? mx - 230 : mx + 14;
    const ty = Math.min(my + 10, cvNode.current!.height - 130);

    if (node) {
      const hasAlert = edges.some(
        (e) => e.es_anomalia && (e.id_origen === node.id_dispositivo || e.id_destino === node.id_dispositivo)
      );
      setTooltip({
        x: tx, y: ty,
        html: `<strong>${node.label}</strong><br/>
          Tipo: ${node.id_tipo}<br/>
          IP: ${node.ip ?? "—"}<br/>
          MAC: ${node.mac ?? "—"}<br/>
          Crítico: ${node.es_critico ? "Sí" : "No"}<br/>
          ${hasAlert ? '<span style="color:#e24b4a">⚠ Alerta activa</span>' : ""}`,
      });
    } else if (edge) {
      const src = nodes.find((n) => n.id_dispositivo === edge.id_origen)?.label ?? edge.id_origen;
      const dst = nodes.find((n) => n.id_dispositivo === edge.id_destino)?.label ?? edge.id_destino;
      setTooltip({
        x: tx, y: ty,
        html: `<strong>${src} → ${dst}</strong><br/>
          Proto: ${edge.protocolo_transport ?? "—"}<br/>
          Bytes/s: ${edge.flow_bytes_s.toLocaleString()}<br/>
          Paquetes/s: ${edge.flow_packets_s}<br/>
          Puerto origen: ${edge.puerto_origen ?? "—"}<br/>
          Puerto destino: ${edge.puerto_destino ?? "—"}<br/>
          ${edge.es_anomalia
            ? `<span style="color:${SEV_COLOR[edge.id_severidad ?? "Alto"]}">${edge.descripcion ?? "Anomalía detectada"}</span>`
            : ""}`,
      });
    }
  }

  function handleClick(ev: React.MouseEvent<HTMLCanvasElement>) {
    const rect = cvNode.current!.getBoundingClientRect();
    const node = getNodeAt(ev.clientX - rect.left, ev.clientY - rect.top);
    setSelected(node === selected ? null : node);
  }

  // ── Métricas del panel lateral ───────────────────────────────
  const activeAlerts = edges.filter((e) => e.es_anomalia);
  const selAlerts    = selected
    ? edges.filter((e) => e.es_anomalia && (e.id_origen === selected.id_dispositivo || e.id_destino === selected.id_dispositivo))
    : [];
  const selConns     = selected
    ? edges.filter((e) => e.id_origen === selected.id_dispositivo || e.id_destino === selected.id_dispositivo)
    : [];

  return (
    <div className="flex flex-col h-full bg-[#0f0b1a] text-slate-200 font-mono">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-300">Topología de red</span>
          {wsUrl && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              wsStatus === "live"
                ? "border-green-500/40 bg-green-500/10 text-green-400"
                : wsStatus === "connecting"
                ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
                : "border-slate-600 text-slate-500"
            }`}>
              {wsStatus === "live" ? "● Live" : wsStatus === "connecting" ? "○ Conectando…" : "○ Sin conexión"}
            </span>
          )}
          {!wsUrl && (
            <span className="text-xs px-2 py-0.5 rounded-full border border-slate-600 text-slate-500">
              Datos sintéticos — Ciclo 1
            </span>
          )}
        </div>

        {/* Filtros */}
        <div className="flex gap-2">
          {(["all", "anomaly", "critical"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1 rounded-full border transition-all ${
                filter === f
                  ? f === "anomaly"
                    ? "bg-red-500/20 border-red-500/50 text-red-300"
                    : "bg-violet-500/20 border-violet-500/50 text-violet-300"
                  : "border-white/10 text-slate-400 hover:border-white/20"
              }`}
            >
              {f === "all" ? "Todos" : f === "anomaly" ? "Anomalías" : "Críticos"}
            </button>
          ))}
        </div>

        {/* Contadores */}
        <div className="flex gap-4 text-xs">
          <span className="text-slate-400">{nodes.length} nodos</span>
          <span className={activeAlerts.length > 0 ? "text-red-400" : "text-slate-400"}>
            {activeAlerts.length} alertas
          </span>
        </div>
      </div>

      {/* ── Canvas + Panel ───────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Canvas */}
        <div className="relative flex-1">
          <canvas ref={cvEdge} className="absolute inset-0 w-full h-full" />
          <canvas
            ref={cvNode}
            className="absolute inset-0 w-full h-full cursor-default"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
            onClick={handleClick}
          />

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute pointer-events-none z-10 bg-[#1e1630] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 leading-relaxed max-w-[220px]"
              style={{ left: tooltip.x, top: tooltip.y }}
              dangerouslySetInnerHTML={{ __html: tooltip.html }}
            />
          )}

          {/* Leyenda */}
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(NODE_COLOR).map(([tipo, color]) => (
              <div key={tipo} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                {tipo}
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span className="w-4 h-0.5 rounded" style={{ background: EDGE_ANOMALY }} />
              enlace anómalo
            </div>
          </div>
        </div>

        {/* Panel de detalle del nodo seleccionado */}
        {selected && (
          <div className="w-64 border-l border-white/10 bg-[#181220] flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-sm font-semibold text-slate-200">{selected.label}</span>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-500 hover:text-slate-300 text-lg leading-none"
              >×</button>
            </div>

            <div className="px-4 py-3 space-y-2 text-xs border-b border-white/10">
              {[
                ["Tipo",     selected.id_tipo],
                ["IP",       selected.ip ?? "—"],
                ["MAC",      selected.mac ?? "—"],
                ["Crítico",  selected.es_critico ? "Sí" : "No"],
                ["Conexiones", selConns.length],
                ["Tráfico total", selConns.reduce((s, e) => s + e.flow_bytes_s, 0).toLocaleString() + " B/s"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-300">{v}</span>
                </div>
              ))}
            </div>

            {/* Alertas del nodo */}
            <div className="px-4 py-3 flex-1">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                Alertas activas ({selAlerts.length})
              </p>
              {selAlerts.length === 0 ? (
                <p className="text-xs text-green-500/70">Sin alertas activas</p>
              ) : (
                <div className="space-y-2">
                  {selAlerts.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-lg p-2.5 border text-xs"
                      style={{
                        background: (SEV_COLOR[a.id_severidad ?? "Alto"] ?? "#e24b4a") + "15",
                        borderColor: (SEV_COLOR[a.id_severidad ?? "Alto"] ?? "#e24b4a") + "40",
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            background: (SEV_COLOR[a.id_severidad ?? "Alto"] ?? "#e24b4a") + "30",
                            color: SEV_COLOR[a.id_severidad ?? "Alto"] ?? "#e24b4a",
                          }}
                        >
                          {a.id_severidad}
                        </span>
                        <span className="text-slate-500 text-[10px]">{a.protocolo_transport}</span>
                      </div>
                      <p className="text-slate-300 leading-snug">{a.descripcion ?? "Anomalía detectada"}</p>
                      <p className="text-slate-500 mt-1">
                        :{a.puerto_origen} → :{a.puerto_destino}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}