export type NivelSeveridad = "Alta" | "Media" | "Baja";

export interface Alerta {
  id:          number | string;
  ip_origen:   string;
  timestamp:   string;
  severidad:   NivelSeveridad;
  descripcion: string;
  isGeneralEvent?: boolean;
}

export interface EstadoServicio {
  nombre:               string;
  activo:               boolean;
  ultima_verificacion:  string;
}

export type EstadoReporte = "listo" | "generando" | "exito" | "error";

export interface TopologyNode {
  id:       string;
  ip:       string;
  label:    string;
  type:     string;
  mac:      string;
  critical: boolean;
}

export interface TopologyEdge {
  source:    string;
  target:    string;
  weight:    number;
  last_seen: string;
  risk:      number;
}

export interface TopologyData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  stats: {
    total_nodes: number;
    total_edges: number;
  };
}

export interface AttackFlowStep {
  layer: string;
  description: string;
  severidad: number;
  timestamp: string;
  probabilidad?: number;
}

export interface CorrelatedEvent {
  id: string;
  target_node: string;
  start_time: string;
  last_update: string;
  status: string;
  severity: number;
  probability: number;
  attack_flow: AttackFlowStep[];
}