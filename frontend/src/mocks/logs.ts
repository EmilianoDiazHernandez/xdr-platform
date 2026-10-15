// SOLO DESARROLLO — datos de demostración para CU-17 hasta que exista GET /logs.
import type { EntradaLog } from "../types";

export const logsMock: EntradaLog[] = [
  { id: "log-0001", timestamp: "2026-10-15T09:58:12Z", componente: "API",          nivel: "INFO",    mensaje: "GET /api/v1/alertas 200 (34 ms)" },
  { id: "log-0002", timestamp: "2026-10-15T09:57:40Z", componente: "BD",           nivel: "WARNING", mensaje: "Consulta lenta en hipertabla alertas (1.8 s)" },
  { id: "log-0003", timestamp: "2026-10-15T09:55:03Z", componente: "Servidor web", nivel: "INFO",    mensaje: "Recarga de configuración completada" },
  { id: "log-0004", timestamp: "2026-10-15T09:52:47Z", componente: "API",          nivel: "ERROR",   mensaje: "Timeout al consultar Redis (fusión de capas)" },
  { id: "log-0005", timestamp: "2026-10-15T09:50:19Z", componente: "BD",           nivel: "INFO",    mensaje: "Compresión automática de chunks completada" },
  { id: "log-0006", timestamp: "2026-10-15T09:47:31Z", componente: "API",          nivel: "WARNING", mensaje: "Token rechazado: firma inválida (401)" },
  { id: "log-0007", timestamp: "2026-10-15T09:44:08Z", componente: "Servidor web", nivel: "ERROR",   mensaje: "502 Bad Gateway hacia api-topology" },
  { id: "log-0008", timestamp: "2026-10-15T09:40:55Z", componente: "API",          nivel: "INFO",    mensaje: "POST /api/v1/reports/generate 200 (2.4 s)" },
  { id: "log-0009", timestamp: "2026-10-15T09:36:22Z", componente: "BD",           nivel: "ERROR",   mensaje: "Conexión rechazada: límite de conexiones alcanzado" },
  { id: "log-0010", timestamp: "2026-10-15T09:31:10Z", componente: "Servidor web", nivel: "WARNING", mensaje: "Certificado TLS expira en 14 días" },
  { id: "log-0011", timestamp: "2026-10-15T09:27:45Z", componente: "API",          nivel: "INFO",    mensaje: "Inicio de sesión exitoso (rol sys_admin)" },
  { id: "log-0012", timestamp: "2026-10-15T09:20:03Z", componente: "BD",           nivel: "INFO",    mensaje: "Respaldo incremental completado" },
];
