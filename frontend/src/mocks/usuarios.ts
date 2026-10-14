// SOLO DESARROLLO — almacén en memoria compartido por el mock de auth (T2) y el de usuarios (T5).
// Las contraseñas en claro existen únicamente para el modo mock; nunca en producción.
import type { Role } from "../types";

export interface UsuarioMock {
  id:        string;
  nombre:    string;
  correo:    string;
  role:      Role;
  activo:    boolean;
  password:  string;
  creado_en: string;
}

const PASSWORD_DEMO = "Demo1234!";

export const usuariosMock: UsuarioMock[] = [
  { id: "u-001", nombre: "Analista 01",       correo: "analista_01@xdr.local",     role: "security_analyst", activo: true,  password: PASSWORD_DEMO, creado_en: "2026-01-15T09:00:00Z" },
  { id: "u-002", nombre: "Admin Sistema",     correo: "admin_sistema@xdr.local",   role: "sys_admin",        activo: true,  password: PASSWORD_DEMO, creado_en: "2026-01-15T09:05:00Z" },
  { id: "u-003", nombre: "Auditor Externo",   correo: "auditor_externo@xdr.local", role: "auditor",          activo: true,  password: PASSWORD_DEMO, creado_en: "2026-01-15T09:10:00Z" },
  { id: "u-004", nombre: "Usuario Inactivo",  correo: "inactivo@xdr.local",        role: "security_analyst", activo: false, password: PASSWORD_DEMO, creado_en: "2026-02-01T12:00:00Z" },
];
