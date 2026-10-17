import { EstadoAlerta, DisposicionAlerta } from "../types";

export const API_BASE_URL = "http://localhost:8000/api/v1";
export const REPORT_BASE_URL = "http://localhost:8001/api/v1";
export const TOPOLOGY_BASE_URL = "http://localhost:8002/api/v1";

export async function fetchAlertas() {
  const r = await fetch(`${API_BASE_URL}/alertas`);
  if (!r.ok) throw new Error("Error al obtener alertas");
  return r.json();
}

/**
 * Actualiza el ciclo de vida de una alerta (Estado y Disposición condicional).
 * Función mock lista para desacoplarse y conectarse con endpoints de Spring Boot / FastAPI.
 */
export async function updateAlertStatus(
  id: number | string,
  status: EstadoAlerta,
  disposition?: DisposicionAlerta
): Promise<{ success: boolean; id: number | string; status: EstadoAlerta; disposition?: DisposicionAlerta }> {
  // Nota de integración futura para Spring Boot / FastAPI:
  /*
  const response = await fetch(`${API_BASE_URL}/alertas/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, disposition }),
  });
  if (!response.ok) throw new Error("Error al actualizar el estado de la alerta en el backend");
  return response.json();
  */

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        id,
        status,
        disposition,
      });
    }, 100);
  });
}

export async function fetchIncidentTimeline(id: string) {
  const r = await fetch(`${API_BASE_URL}/eventos-correlacionados/${id}/timeline`);
  if (!r.ok) throw new Error("Error al obtener la línea de tiempo del incidente");
  return r.json();
}

export async function fetchHealth() {
  const r = await fetch("http://localhost:8000/health");
  if (!r.ok) throw new Error("Error al obtener health");
  return r.json();
}

export async function fetchTopology() {
  const r = await fetch(`${TOPOLOGY_BASE_URL}/topology`);
  if (!r.ok) throw new Error("Error al obtener topología");
  return r.json();
}

export async function fetchEvents() {
  const r = await fetch(`${TOPOLOGY_BASE_URL}/topology/events`);
  if (!r.ok) throw new Error("Error al obtener eventos");
  return r.json();
}

export async function fetchNodeAlerts(deviceId: string) {
  const response = await fetch(`${TOPOLOGY_BASE_URL}/topology/node_alerts/${deviceId}`);
  if (!response.ok) throw new Error("Error fetching node alerts");
  return response.json();
}
