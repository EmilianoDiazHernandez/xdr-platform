import type { Role } from "./auth";

/* ─── CU-15 / RF36: gestión de usuarios ─── */

export interface UsuarioAdmin {
  id:        string;
  nombre:    string;
  correo:    string;
  role:      Role;
  activo:    boolean;
  creado_en: string;
}

export interface NuevoUsuario {
  nombre:   string;
  correo:   string;
  role:     Role;
  password: string;
}

// PATCH parcial; no existe borrado físico, solo activo=false
export interface CambiosUsuario {
  nombre?:   string;
  correo?:   string;
  role?:     Role;
  activo?:   boolean;
  password?: string;
}

/* ─── CU-17 / RF38: logs del sistema ─── */

export type NivelLog = "INFO" | "WARNING" | "ERROR";
export type ComponenteLog = "BD" | "API" | "Servidor web";

export interface EntradaLog {
  id:         string;
  timestamp:  string;
  componente: ComponenteLog;
  nivel:      NivelLog;
  mensaje:    string;
}
