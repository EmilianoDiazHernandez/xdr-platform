export type NivelSeveridad = "Alta" | "Media" | "Baja";

export interface Alerta {
  id:          number;
  ip_origen:   string;
  timestamp:   string;
  severidad:   NivelSeveridad;
  descripcion: string;
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