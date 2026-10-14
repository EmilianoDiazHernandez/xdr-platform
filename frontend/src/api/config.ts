import { apiRequest } from "./client";
import type { Alerta, CorrelatedEvent, IncidentTimeline, TopologyData } from "../types";

export const API_BASE_URL      = import.meta.env.VITE_API_BASE_URL      ?? "http://localhost:8000/api/v1";
export const REPORT_BASE_URL   = import.meta.env.VITE_REPORT_BASE_URL   ?? "http://localhost:8001/api/v1";
export const TOPOLOGY_BASE_URL = import.meta.env.VITE_TOPOLOGY_BASE_URL ?? "http://localhost:8002/api/v1";

// /health vive en la raíz del servicio, no bajo /api/v1
const API_ROOT_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

interface EstadoCapa {
  activa: boolean;
}

export interface HealthResponse {
  capas: {
    red:      EstadoCapa;
    endpoint: EstadoCapa;
    email:    EstadoCapa;
  };
  redis: { activo: boolean };
}

export function fetchAlertas(): Promise<Alerta[]> {
  return apiRequest<Alerta[]>(API_BASE_URL, "/alertas");
}

export function fetchIncidentTimeline(id: string): Promise<IncidentTimeline> {
  return apiRequest<IncidentTimeline>(API_BASE_URL, `/eventos-correlacionados/${encodeURIComponent(id)}/timeline`);
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>(API_ROOT_URL, "/health");
}

export function fetchTopology(): Promise<TopologyData> {
  return apiRequest<TopologyData>(TOPOLOGY_BASE_URL, "/topology");
}

export function fetchEvents(): Promise<CorrelatedEvent[]> {
  return apiRequest<CorrelatedEvent[]>(TOPOLOGY_BASE_URL, "/topology/events");
}

export function fetchNodeAlerts(deviceId: string): Promise<Alerta[]> {
  return apiRequest<Alerta[]>(TOPOLOGY_BASE_URL, `/topology/node_alerts/${encodeURIComponent(deviceId)}`);
}
