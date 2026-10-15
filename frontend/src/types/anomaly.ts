// CU-10: revisión de anomalías no supervisadas
export type EstadoAnomalia = "pendiente" | "amenaza_confirmada" | "falso_positivo";

export type ClasificacionAnomalia = Exclude<EstadoAnomalia, "pendiente">;

export interface Anomalia {
  id:             string;
  timestamp:      string;
  ip_origen:      string;
  dispositivo:    string;
  metrica:        string;  // comportamiento que se desvió
  puntaje:        number;  // 0–1, grado de anomalía según el modelo
  descripcion:    string;
  estado:         EstadoAnomalia;
  justificacion?: string;
}
