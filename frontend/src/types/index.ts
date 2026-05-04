export type NivelSeveridad = "Alta" | "Media" | "Baja";

export interface Alerta {
  id:          number;
  ip_origen:   string;
  timestamp:   string;
  severidad:   NivelSeveridad;
  descripcion: string;
}

export interface EstadoServicio {
  nombre:               string;
  activo:               boolean;
  ultima_verificacion:  string;
}

export type EstadoReporte = "listo" | "generando" | "exito" | "error";