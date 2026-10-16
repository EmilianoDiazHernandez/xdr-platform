import { apiRequest, type ApiRequestInit } from "./client";
import type {
  Alerta, CorrelatedEvent, DisposicionAlerta, EstadoAlerta, IncidentTimeline, KillChainStep, NodeAlert, TopologyData,
} from "../types";

export const API_BASE_URL      = import.meta.env.VITE_API_BASE_URL      ?? "http://localhost:8000/api/v1";
export const REPORT_BASE_URL   = import.meta.env.VITE_REPORT_BASE_URL   ?? "http://localhost:8001/api/v1";
export const TOPOLOGY_BASE_URL = import.meta.env.VITE_TOPOLOGY_BASE_URL ?? "http://localhost:8002/api/v1";

// Adaptadores mock (SOLO DESARROLLO) salvo que VITE_AUTH_MODE=api
export const MODO_MOCK = import.meta.env.VITE_AUTH_MODE !== "api";

// /health vive en la raíz de cada servicio, no bajo /api/v1
const raizDe = (url: string) => url.replace(/\/api\/v1\/?$/, "");
export const API_ROOT_URL      = raizDe(API_BASE_URL);
export const REPORT_ROOT_URL   = raizDe(REPORT_BASE_URL);
export const TOPOLOGY_ROOT_URL = raizDe(TOPOLOGY_BASE_URL);

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

export interface ActualizacionEstadoAlerta {
  success:      boolean;
  id:           number | string;
  status:       EstadoAlerta;
  disposition?: DisposicionAlerta;
}

/**
 * Actualiza el ciclo de vida de una alerta (Estado y Disposición condicional).
 * Función mock lista para desacoplarse y conectarse con endpoints de Spring Boot / FastAPI.
 * Integración futura: PATCH {API_BASE_URL}/alertas/{id}/status con { status, disposition }
 * vía apiRequest (inyecta el token y centraliza errores).
 */
export async function updateAlertStatus(
  id: number | string,
  status: EstadoAlerta,
  disposition?: DisposicionAlerta,
): Promise<ActualizacionEstadoAlerta> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, id, status, disposition });
    }, 100);
  });
}

export function fetchAlertas(): Promise<Alerta[]> {
  return apiRequest<Alerta[]>(API_BASE_URL, "/alertas");
}

export function fetchIncidentTimeline(id: string): Promise<IncidentTimeline> {
  return apiRequest<IncidentTimeline>(API_BASE_URL, `/eventos-correlacionados/${encodeURIComponent(id)}/timeline`);
}

function isKillChainStep(value: unknown): value is KillChainStep {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.timestamp === "string" && typeof v.vector === "string"
      && typeof v.severidad === "string" && typeof v.descripcion === "string";
}

// El endpoint de timeline puede responder con la lista de pasos o con el objeto
// IncidentTimeline ({ timeline: [...] }); aquí se normalizan ambas formas.
export async function fetchKillChain(id: string): Promise<KillChainStep[]> {
  const data = await apiRequest<unknown>(API_BASE_URL, `/eventos-correlacionados/${encodeURIComponent(id)}/timeline`);
  const pasos: unknown =
    typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>).timeline
      : data;
  return Array.isArray(pasos) ? pasos.filter(isKillChainStep) : [];
}

export function fetchHealth(init?: ApiRequestInit): Promise<HealthResponse> {
  return apiRequest<HealthResponse>(API_ROOT_URL, "/health", init);
}

export function fetchTopology(): Promise<TopologyData> {
  return apiRequest<TopologyData>(TOPOLOGY_BASE_URL, "/topology");
}

export function fetchEvents(): Promise<CorrelatedEvent[]> {
  return apiRequest<CorrelatedEvent[]>(TOPOLOGY_BASE_URL, "/topology/events");
}

export function fetchNodeAlerts(deviceId: string): Promise<NodeAlert[]> {
  return apiRequest<NodeAlert[]>(TOPOLOGY_BASE_URL, `/topology/node_alerts/${encodeURIComponent(deviceId)}`);
}
