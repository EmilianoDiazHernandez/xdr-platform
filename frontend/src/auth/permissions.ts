// Matriz de acceso ÚNICA del frontend (roles × páginas).
// Ocultar vistas aquí es UX, no seguridad: el control real es el HTTP 403 del backend (RN06, RN07, RN12).
import {
  LayoutDashboard,
  Network,
  Bell,
  CalendarDays,
  Radar,
  FileText,
  Users,
  Server,
  ScrollText,
  BarChart3,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";
import type { PageId, Role } from "../types";

export const ACCESS: Record<PageId, readonly Role[]> = {
  "inicio":             ["security_analyst"],
  "topologia":          ["security_analyst"],
  "alertas":            ["security_analyst"],
  "eventos":            ["security_analyst"],
  "anomalias":          ["security_analyst"],
  "reportes":           ["security_analyst"],
  "admin-usuarios":     ["sys_admin"],
  "admin-servicios":    ["sys_admin"],
  "admin-logs":         ["sys_admin"],
  "ejecutivo":          ["auditor"],
  "reportes-generados": ["auditor"],
};

const DEFAULT_PAGE: Record<Role, PageId> = {
  security_analyst: "inicio",
  sys_admin:        "admin-servicios",
  auditor:          "ejecutivo",
};

export function canAccess(role: Role, page: PageId): boolean {
  return ACCESS[page].includes(role);
}

export function defaultPageFor(role: Role): PageId {
  return DEFAULT_PAGE[role];
}

export interface MenuItem {
  id:    PageId;
  label: string;
  Icon:  LucideIcon;
}

export interface MenuSection {
  section: string;
  items:   MenuItem[];
}

export const MENU_BY_ROLE: Record<Role, MenuSection[]> = {
  security_analyst: [
    {
      section: "General",
      items: [
        { id: "inicio",    label: "Inicio",    Icon: LayoutDashboard },
        { id: "topologia", label: "Topología", Icon: Network },
      ],
    },
    {
      section: "Detección",
      items: [
        { id: "alertas",   label: "Alertas",                    Icon: Bell },
        { id: "eventos",   label: "Incidentes Correlacionados", Icon: CalendarDays },
        { id: "anomalias", label: "Anomalías",                  Icon: Radar },
      ],
    },
    {
      section: "Reportes",
      items: [
        { id: "reportes", label: "Reportes PDF", Icon: FileText },
      ],
    },
  ],
  sys_admin: [
    {
      section: "Administración",
      items: [
        { id: "admin-usuarios",  label: "Usuarios",            Icon: Users },
        { id: "admin-servicios", label: "Estado de servicios", Icon: Server },
        { id: "admin-logs",      label: "Logs del sistema",    Icon: ScrollText },
      ],
    },
  ],
  auditor: [
    {
      section: "Ejecutivo",
      items: [
        { id: "ejecutivo",          label: "Resumen ejecutivo", Icon: BarChart3 },
        { id: "reportes-generados", label: "Reportes",          Icon: FolderOpen },
      ],
    },
  ],
};
