import { Alerta, EstadoServicio } from "../types";

export const ALERTAS_MOCK: Alerta[] = [
  { id: 1, ip_origen: "192.168.1.45", timestamp: "2026-03-10 08:12:33", severidad: "Alta", descripcion: "Posible intrusión detectada en el segmento de red" },
  { id: 2, ip_origen: "192.168.1.102", timestamp: "2026-03-10 08:10:11", severidad: "Alta", descripcion: "Posible intrusión detectada en el segmento de red" },
  { id: 3, ip_origen: "192.168.1.78", timestamp: "2026-03-10 08:08:55", severidad: "Media", descripcion: "Comportamiento anómalo identificado en el host" },
  { id: 4, ip_origen: "192.168.1.200", timestamp: "2026-03-10 08:05:20", severidad: "Baja", descripcion: "Actividad inusual de bajo riesgo detectada" },
  { id: 5, ip_origen: "192.168.1.33", timestamp: "2026-03-10 08:03:44", severidad: "Media", descripcion: "Comportamiento anómalo identificado en el host" },
  { id: 6, ip_origen: "192.168.1.91", timestamp: "2026-03-10 08:01:10", severidad: "Alta", descripcion: "Posible intrusión detectada en el segmento de red" },
  { id: 7, ip_origen: "192.168.1.150", timestamp: "2026-03-10 07:58:30", severidad: "Baja", descripcion: "Actividad inusual de bajo riesgo detectada" },
  { id: 8, ip_origen: "192.168.1.67", timestamp: "2026-03-10 07:55:12", severidad: "Media", descripcion: "Comportamiento anómalo identificado en el host" },
  { id: 9, ip_origen: "192.168.1.14", timestamp: "2026-03-10 07:52:05", severidad: "Baja", descripcion: "Actividad inusual de bajo riesgo detectada" },
  { id: 10, ip_origen: "192.168.1.88", timestamp: "2026-03-10 07:49:33", severidad: "Alta", descripcion: "Posible intrusión detectada en el segmento de red" },
];

export const SERVICIOS_MOCK: EstadoServicio[] = [
  { nombre: "Recolector de tráfico", activo: true, ultima_verificacion: "2026-03-10 08:12:00" },
  { nombre: "Base de datos", activo: true, ultima_verificacion: "2026-03-10 08:12:00" },
  { nombre: "Motor de detección", activo: true, ultima_verificacion: "2026-03-10 08:10:45" },
  { nombre: "Generador de reportes", activo: true, ultima_verificacion: "2026-03-10 08:12:00" },
];