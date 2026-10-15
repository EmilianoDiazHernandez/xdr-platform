// API del Administrador de Sistemas (CU-15, CU-16, CU-17).
// SOLO DESARROLLO (adaptador mock) — el adaptador "api" sigue el contrato objetivo del backend.
import { apiRequest, ApiError } from "./client";
import { API_BASE_URL, MODO_MOCK, REPORT_ROOT_URL, TOPOLOGY_ROOT_URL, fetchHealth } from "./config";
import { usuariosMock } from "../mocks/usuarios";
import { logsMock } from "../mocks/logs";
import type { CambiosUsuario, EntradaLog, EstadoServicio, NivelLog, NuevoUsuario, UsuarioAdmin } from "../types";

export const MSG_CORREO_DUPLICADO = "El correo ya está registrado.";

export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

export interface AdminApi {
  listarUsuarios(): Promise<UsuarioAdmin[]>;
  crearUsuario(datos: NuevoUsuario): Promise<UsuarioAdmin>;
  actualizarUsuario(id: string, cambios: CambiosUsuario): Promise<UsuarioAdmin>;
  listarLogs(nivel?: NivelLog): Promise<EntradaLog[]>;
}

/* ─── Adaptador mock (comparte almacén con el mock de auth) ─── */

const latencia = () => new Promise(r => setTimeout(r, 300));

function sinPassword(u: (typeof usuariosMock)[number]): UsuarioAdmin {
  return { id: u.id, nombre: u.nombre, correo: u.correo, role: u.role, activo: u.activo, creado_en: u.creado_en };
}

function correoEnUso(correo: string, exceptoId?: string): boolean {
  return usuariosMock.some(u => u.correo === correo && u.id !== exceptoId);
}

const mockAdapter: AdminApi = {
  async listarUsuarios() {
    await latencia();
    return usuariosMock.map(sinPassword);
  },

  async crearUsuario(datos) {
    await latencia();
    const correo = datos.correo.trim().toLowerCase();
    if (correoEnUso(correo)) throw new AdminError(MSG_CORREO_DUPLICADO);
    const nuevo = {
      id:        `u-${Date.now().toString(36)}`,
      nombre:    datos.nombre.trim(),
      correo,
      role:      datos.role,
      activo:    true,
      password:  datos.password,
      creado_en: new Date().toISOString(),
    };
    usuariosMock.push(nuevo);
    return sinPassword(nuevo);
  },

  async actualizarUsuario(id, cambios) {
    await latencia();
    const usuario = usuariosMock.find(u => u.id === id);
    if (!usuario) throw new AdminError("El usuario no existe.");
    if (cambios.correo !== undefined) {
      const correo = cambios.correo.trim().toLowerCase();
      if (correoEnUso(correo, id)) throw new AdminError(MSG_CORREO_DUPLICADO);
      usuario.correo = correo;
    }
    if (cambios.nombre !== undefined)   usuario.nombre = cambios.nombre.trim();
    if (cambios.role !== undefined)     usuario.role = cambios.role;
    if (cambios.activo !== undefined)   usuario.activo = cambios.activo;
    if (cambios.password !== undefined) usuario.password = cambios.password;
    return sinPassword(usuario);
  },

  async listarLogs(nivel) {
    await latencia();
    return logsMock.filter(l => !nivel || l.nivel === nivel);
  },
};

/* ─── Adaptador api (contrato objetivo) ─── */

async function conErroresAdmin<T>(peticion: Promise<T>): Promise<T> {
  try {
    return await peticion;
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) throw new AdminError(MSG_CORREO_DUPLICADO);
    throw e;
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

const apiAdapter: AdminApi = {
  listarUsuarios() {
    return apiRequest<UsuarioAdmin[]>(API_BASE_URL, "/admin/users");
  },

  crearUsuario(datos) {
    return conErroresAdmin(apiRequest<UsuarioAdmin>(API_BASE_URL, "/admin/users", {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify(datos),
    }));
  },

  actualizarUsuario(id, cambios) {
    return conErroresAdmin(apiRequest<UsuarioAdmin>(API_BASE_URL, `/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(cambios),
    }));
  },

  listarLogs(nivel) {
    const query = nivel ? `?level=${encodeURIComponent(nivel)}` : "";
    return apiRequest<EntradaLog[]>(API_BASE_URL, `/logs${query}`);
  },
};

export { MODO_MOCK };

export const adminApi: AdminApi = MODO_MOCK ? mockAdapter : apiAdapter;

/* ─── CU-16: estado de servicios (fuentes reales en ambos modos) ─── */

const HEALTH_TIMEOUT_MS = 2_000;

function respondioOk(valor: unknown): boolean {
  return typeof valor === "object" && valor !== null && (valor as Record<string, unknown>).status === "ok";
}

export async function verificarServicios(): Promise<EstadoServicio[]> {
  const [ml, topologia, reportes] = await Promise.allSettled([
    fetchHealth({ timeoutMs: HEALTH_TIMEOUT_MS }),
    apiRequest<unknown>(TOPOLOGY_ROOT_URL, "/health", { timeoutMs: HEALTH_TIMEOUT_MS }),
    apiRequest<unknown>(REPORT_ROOT_URL, "/health", { timeoutMs: HEALTH_TIMEOUT_MS }),
  ]);
  const ahora = new Date().toISOString();

  // Sin respuesta de api-ml no se puede afirmar el estado de las capas ni de Redis
  const mlOk = ml.status === "fulfilled";
  const capa = (activa: boolean | undefined) =>
    mlOk ? { activo: activa === true } : { activo: false, desconocido: true };

  return [
    { nombre: "API ML",          activo: mlOk, ultima_verificacion: ahora },
    { nombre: "Capa Red",        ...capa(mlOk ? ml.value.capas?.red?.activa : undefined),      ultima_verificacion: ahora },
    { nombre: "Capa Endpoint",   ...capa(mlOk ? ml.value.capas?.endpoint?.activa : undefined), ultima_verificacion: ahora },
    { nombre: "Capa Email",      ...capa(mlOk ? ml.value.capas?.email?.activa : undefined),    ultima_verificacion: ahora },
    { nombre: "Redis Fusion",    ...capa(mlOk ? ml.value.redis?.activo : undefined),           ultima_verificacion: ahora },
    {
      nombre: "API Topología",
      activo: topologia.status === "fulfilled" && respondioOk(topologia.value),
      ultima_verificacion: ahora,
    },
    reportes.status === "fulfilled" && respondioOk(reportes.value)
      ? { nombre: "API Reportes", activo: true, ultima_verificacion: ahora }
      : { nombre: "API Reportes", activo: false, desconocido: true, ultima_verificacion: ahora },
  ];
}
