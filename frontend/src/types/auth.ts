// Roles canónicos (fuente de verdad: database/auth-db/init-scripts/01_auth_schema.sql)
export type Role = "security_analyst" | "sys_admin" | "auditor";

export interface SessionUser {
  id:     string;
  nombre: string;
  correo: string;
  role:   Role;
}

export interface Session {
  token: string;
  exp:   number; // epoch en milisegundos
  user:  SessionUser;
}

// Identificadores de página (matriz de acceso §3 de TASKS_CLAUDE_CODE.md)
export type PageId =
  | "inicio"
  | "topologia"
  | "alertas"
  | "anomalias"
  | "reportes"
  | "admin-usuarios"
  | "admin-servicios"
  | "admin-logs"
  | "ejecutivo"
  | "reportes-generados";
