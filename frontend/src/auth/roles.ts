import type { Role } from "../types";

export const ROLE_LABEL: Record<Role, string> = {
  security_analyst: "Analista de Seguridad",
  sys_admin:        "Administrador de Sistemas",
  auditor:          "Directivo / Auditor",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && value in ROLE_LABEL;
}
