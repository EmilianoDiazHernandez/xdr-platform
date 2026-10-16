export * from "./auth";
export * from "./anomaly";
export * from "./admin";
export * from "./executive";

export type NivelSeveridad = "Crítica" | "Alta" | "Media" | "Baja";

export type EstadoAlerta =
  | "Nueva/Abierta"
  | "En investigación/Pendiente"
  | "Escalada"
  | "Resuelta";

export type DisposicionAlerta =
  | "Falso positivo"
  | "Verdadero positivo - Mitigado"
  | "Verdadero positivo - Benigno";

export interface Alerta {
  id:          number | string;
  ip_origen:   string;
  ip_destino?: string;
  protocolo?:  string;
  timestamp:   string;
  severidad:   NivelSeveridad;
  descripcion: string;
  mitre_technique_id?: string;
  mitre_tactic?: string;
  mitre_software_id?: string;
  vector_origen?: string;
  id_evento_correlacionado?: string;
  isGeneralEvent?: boolean;
  estado?: EstadoAlerta;
  disposicion?: DisposicionAlerta;
}

export interface EstadoServicio {
  nombre:               string;
  activo:               boolean;
  desconocido?:         boolean; // el servicio no respondió y no se puede afirmar su estado
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
  layer?: string;
  vector?: string;
  description?: string;
  severidad?: number;
  timestamp?: string;
  probabilidad?: number;
  mitre_technique_id?: string;
  mitre_tactic?: string;
  mitre_software_id?: string;
  dest_ip?: string;
  file_hash?: string;
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

export interface TimelineItem {
  id_alerta?: number | null;
  step_order: number;
  timestamp: string;
  vector: string;
  descripcion: string;
  mitre_tactic?: string | null;
  mitre_technique_id?: string | null;
  mitre_software_id?: string | null;
  severidad: string;
  ip_origen?: string | null;
  ip_destino?: string | null;
  file_hash?: string | null;
}

// Mismo shape que KillChainStepResponse del backend
export interface KillChainStep {
  id_alerta?:          number | null;
  timestamp:           string;
  vector:              string;
  severidad:           string;
  mitre_tactic?:       string | null;
  mitre_technique_id?: string | null;
  descripcion:         string;
}

// Alerta cruda de un activo (GET /topology/node_alerts/{id})
export interface NodeAlert {
  tipo_deteccion?: string;
  tipo_ataque?:    string;
  id_severidad?:   number | string;
  descripcion?:    string;
  time:            string;
}

export interface IncidentTimeline {
  id_evento_correlacionado: string;
  id_dispositivo_origen: string;
  fecha_inicio: string;
  fecha_actualizacion: string;
  estado: string;
  severidad_global: number;
  probabilidad_global: number;
  id_campana?: string | null;
  total_pasos: number;
  vectores_involucrados: string[];
  timeline: TimelineItem[];
}