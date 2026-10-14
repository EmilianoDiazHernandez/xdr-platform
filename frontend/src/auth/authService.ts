// SOLO DESARROLLO (adaptador mock) — el adaptador "api" es el que se usa contra el backend real.
import { apiRequest, ApiError } from "../api/client";
import { API_BASE_URL } from "../api/config";
import { usuariosMock } from "../mocks/usuarios";
import { isRole } from "./roles";
import type { Session } from "../types";

// Expiración máxima de sesión: 8 h (RNF19 / RN11)
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000;

export const MSG_CREDENCIALES = "Credenciales incorrectas.";
// Mensaje genérico para cuenta inactiva: no revela el estado de la cuenta (RN10)
export const MSG_ACCESO_DENEGADO = "Acceso denegado. Contacte al administrador.";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthAdapter {
  login(email: string, password: string): Promise<Session>;
  logout(token: string): Promise<void>;
}

/* ─── Adaptador mock ──────────────────────────────────────────────────── */

function tokenOpaco(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "mock." + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

const mockAdapter: AuthAdapter = {
  async login(email, password) {
    await new Promise(r => setTimeout(r, 400)); // simula latencia de red

    const id = email.trim().toLowerCase();
    // Acepta el correo completo o solo el nombre de usuario (parte local)
    const usuario = usuariosMock.find(u => u.correo === id || u.correo.split("@")[0] === id);

    if (!usuario || usuario.password !== password) throw new AuthError(MSG_CREDENCIALES);
    if (!usuario.activo) throw new AuthError(MSG_ACCESO_DENEGADO);

    return {
      token: tokenOpaco(),
      exp:   Date.now() + SESSION_MAX_MS,
      user:  { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, role: usuario.role },
    };
  },

  async logout() {
    // Nada que invalidar en el servidor
  },
};

/* ─── Adaptador api (contrato OpenAPI, Apéndice A) ────────────────────── */

interface LoginResponse {
  access_token: string;
  token_type:   string;
  role:         string;
}

function isLoginResponse(value: unknown): value is LoginResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.access_token === "string" && typeof v.token_type === "string" && typeof v.role === "string";
}

// Decodifica el payload de un JWT (base64url) sin verificar firma; la verificación es del backend.
function decodeJwtPayload(token: string): Record<string, unknown> {
  const partes = token.split(".");
  if (partes.length !== 3) return {};
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const apiAdapter: AuthAdapter = {
  async login(email, password) {
    let data: unknown;
    try {
      data = await apiRequest<unknown>(API_BASE_URL, "/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw new AuthError(MSG_CREDENCIALES);
      if (e instanceof ApiError && e.status === 403) throw new AuthError(MSG_ACCESO_DENEGADO);
      throw e;
    }

    if (!isLoginResponse(data) || !isRole(data.role)) {
      throw new AuthError("Respuesta de autenticación inválida.");
    }

    const payload = decodeJwtPayload(data.access_token);
    const ahora = Date.now();
    const limite = ahora + SESSION_MAX_MS;
    // exp del JWT viene en segundos; nunca se excede el máximo de 8 h
    const exp = typeof payload.exp === "number" ? Math.min(payload.exp * 1000, limite) : limite;

    const nombre = typeof payload.nombre === "string" ? payload.nombre
                 : typeof payload.name === "string"   ? payload.name
                 : email;

    return {
      token: data.access_token,
      exp,
      user: {
        id:     typeof payload.sub === "string" ? payload.sub : email,
        nombre,
        correo: email,
        role:   data.role,
      },
    };
  },

  async logout(token) {
    try {
      await apiRequest<unknown>(API_BASE_URL, "/auth/logout", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // El endpoint puede no existir aún; la sesión local se limpia de todos modos
    }
  },
};

export const authService: AuthAdapter =
  import.meta.env.VITE_AUTH_MODE === "api" ? apiAdapter : mockAdapter;
