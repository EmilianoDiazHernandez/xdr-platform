export const API_BASE_URL = "http://localhost:8000/api/v1";
export const REPORT_BASE_URL = "http://localhost:8001/api/v1";

export async function fetchAlertas() {
  const r = await fetch(`${API_BASE_URL}/alertas`);
  if (!r.ok) throw new Error("Error al obtener alertas");
  return r.json();
}

export async function fetchHealth() {
  const r = await fetch("http://localhost:8000/health");
  if (!r.ok) throw new Error("Error al obtener health");
  return r.json();
}
