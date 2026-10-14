import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { registerTokenGetter, registerUnauthorizedHandler } from "../api/client";
import { authService } from "./authService";
import { isRole } from "./roles";
import type { Session } from "../types";

const STORAGE_KEY = "xdr.session";

export const MSG_LOGOUT = "Sesión cerrada correctamente.";
export const MSG_EXPIRADA = "Su sesión ha expirado. Inicie sesión nuevamente.";

interface AuthContextValue {
  session:         Session | null;
  isAuthenticated: boolean;
  aviso:           string | null; // mensaje informativo para la pantalla de Login
  login:           (email: string, password: string) => Promise<void>;
  logout:          () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.token !== "string" || typeof v.exp !== "number") return false;
  if (typeof v.user !== "object" || v.user === null) return false;
  const u = v.user as Record<string, unknown>;
  return typeof u.id === "string" && typeof u.nombre === "string" && typeof u.correo === "string" && isRole(u.role);
}

function leerSesion(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSession(parsed) || parsed.exp <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function guardarSesion(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Almacenamiento no disponible (modo privado, etc.): la sesión vive solo en memoria
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(leerSesion);
  const [aviso, setAviso] = useState<string | null>(null);

  // Ref para que el cliente HTTP lea siempre el token vigente sin depender de React
  const sessionRef = useRef<Session | null>(session);
  sessionRef.current = session;

  const cerrarLocal = useCallback((mensaje: string) => {
    guardarSesion(null);
    setSession(null);
    setAviso(mensaje);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const nueva = await authService.login(email, password);
    guardarSesion(nueva);
    setAviso(null);
    setSession(nueva);
  }, []);

  const logout = useCallback(async () => {
    const actual = sessionRef.current;
    if (actual) await authService.logout(actual.token);
    cerrarLocal(MSG_LOGOUT);
  }, [cerrarLocal]);

  // Registro en el cliente HTTP
  useEffect(() => {
    registerTokenGetter(() => sessionRef.current?.token ?? null);
    registerUnauthorizedHandler(() => {
      if (sessionRef.current) cerrarLocal(MSG_EXPIRADA);
    });
    return () => {
      registerTokenGetter(() => null);
      registerUnauthorizedHandler(() => {});
    };
  }, [cerrarLocal]);

  // Cierre automático al expirar (RN11)
  useEffect(() => {
    if (!session) return;
    const restante = session.exp - Date.now();
    if (restante <= 0) {
      cerrarLocal(MSG_EXPIRADA);
      return;
    }
    // setTimeout admite como máximo ~24.8 días; 8 h está muy por debajo
    const t = setTimeout(() => cerrarLocal(MSG_EXPIRADA), restante);
    return () => clearTimeout(t);
  }, [session, cerrarLocal]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, isAuthenticated: session !== null, aviso, login, logout }),
    [session, aviso, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
