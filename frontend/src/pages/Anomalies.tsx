import { useState } from "react";
import { Info, ShieldAlert, ShieldCheck, Radar, CheckCircle } from "lucide-react";
import { anomaliasMock } from "../mocks/anomalias";
import { formatFechaHora } from "../lib/format";
import type { Anomalia, ClasificacionAnomalia, EstadoAnomalia } from "../types";

// CU-10: Revisar y clasificar anomalías no supervisadas.
// Datos de demostración hasta que exista el endpoint de backend.

const ESTADO_UI: Record<EstadoAnomalia, { label: string; color: string; bg: string; border: string }> = {
  pendiente:          { label: "Pendiente",          color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" },
  amenaza_confirmada: { label: "Amenaza confirmada", color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)" },
  falso_positivo:     { label: "Falso positivo",     color: "#10b981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)" },
};

const OPCIONES: readonly { valor: ClasificacionAnomalia; Icon: typeof ShieldAlert }[] = [
  { valor: "amenaza_confirmada", Icon: ShieldAlert },
  { valor: "falso_positivo",     Icon: ShieldCheck },
];

function colorPuntaje(p: number): string {
  if (p >= 0.85) return "#ef4444";
  if (p >= 0.7) return "#f59e0b";
  return "#10b981";
}

function EstadoBadge({ estado }: { estado: EstadoAnomalia }) {
  const ui = ESTADO_UI[estado];
  return (
    <span style={{
      fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px",
      padding: "3px 8px", borderRadius: "5px", background: ui.bg, color: ui.color, border: `1px solid ${ui.border}`,
      flexShrink: 0,
    }}>
      {ui.label}
    </span>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg3)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
};

const etiquetaStyle: React.CSSProperties = {
  fontSize: "9px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase",
  color: "var(--txt3)", display: "block", marginBottom: "4px",
};

export function Anomalies() {
  const [anomalias, setAnomalias] = useState<Anomalia[]>(anomaliasMock);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(anomaliasMock[0]?.id ?? null);
  const [clasificacion, setClasificacion] = useState<ClasificacionAnomalia | null>(null);
  const [justificacion, setJustificacion] = useState("");
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  const seleccionada = anomalias.find(a => a.id === seleccionadaId) ?? null;
  const pendientes = anomalias.filter(a => a.estado === "pendiente").length;
  // RN09: la justificación es obligatoria
  const puedeRegistrar = clasificacion !== null && justificacion.trim() !== "";

  const seleccionar = (id: string) => {
    setSeleccionadaId(id);
    setClasificacion(null);
    setJustificacion("");
    setConfirmacion(null);
  };

  const registrar = () => {
    if (!seleccionada || !clasificacion || !puedeRegistrar) return;
    const texto = justificacion.trim();
    setAnomalias(prev => prev.map(a =>
      a.id === seleccionada.id ? { ...a, estado: clasificacion, justificacion: texto } : a,
    ));
    setConfirmacion(`Clasificación registrada: ${ESTADO_UI[clasificacion].label}.`);
    setClasificacion(null);
    setJustificacion("");
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
          Anomalías detectadas
        </h1>
        <p style={{ fontSize: "12px", color: "var(--txt2)", marginTop: "2px" }}>
          Comportamientos atípicos identificados por el modelo no supervisado · {pendientes} pendiente(s) de revisión
        </p>
      </div>

      {/* Banner de demostración */}
      <div
        role="note"
        className="flex items-center gap-2"
        style={{
          padding: "8px 12px", borderRadius: "8px", fontSize: "12px",
          background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", color: "#93c5fd",
        }}
      >
        <Info size={14} style={{ flexShrink: 0 }} />
        Datos de demostración — pendiente endpoint de backend
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-[14px] items-start">
        {/* Lista */}
        <div style={{ ...cardStyle, overflow: "hidden" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Anomalías</span>
            <span style={{ fontSize: "10px", color: "var(--txt3)" }}>{anomalias.length} registros</span>
          </div>
          <div style={{ padding: "8px", maxHeight: "520px", overflowY: "auto" }} className="custom-scrollbar">
            {anomalias.map(a => {
              const activa = a.id === seleccionadaId;
              return (
                <button
                  key={a.id}
                  onClick={() => seleccionar(a.id)}
                  className="w-full flex items-center gap-3 text-left"
                  style={{
                    padding: "8px 10px", marginBottom: "4px", borderRadius: "7px", cursor: "pointer",
                    background: activa ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${activa ? "rgba(124,58,237,0.3)" : "rgba(255,255,255,0.05)"}`,
                    borderLeft: `3px solid ${colorPuntaje(a.puntaje)}`,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{ fontSize: "11px", fontWeight: 600, color: activa ? "#c4b5fd" : "#fff" }}>
                      {a.metrica}
                    </p>
                    <p className="font-mono truncate" style={{ fontSize: "10px", color: "var(--txt3)", marginTop: "2px" }}>
                      {a.dispositivo} · {a.ip_origen} · {formatFechaHora(a.timestamp)}
                    </p>
                  </div>
                  <EstadoBadge estado={a.estado} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Detalle + clasificación */}
        <div style={{ ...cardStyle, padding: "16px" }}>
          {!seleccionada ? (
            <div className="flex flex-col items-center justify-center" style={{ padding: "40px 0", gap: "8px", color: "var(--txt3)" }}>
              <Radar size={22} />
              <p style={{ fontSize: "12px" }}>Seleccione una anomalía para revisarla</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{seleccionada.metrica}</p>
                  <p className="font-mono" style={{ fontSize: "10px", color: "var(--txt3)", marginTop: "2px" }}>{seleccionada.id}</p>
                </div>
                <EstadoBadge estado={seleccionada.estado} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span style={etiquetaStyle}>Dispositivo</span>
                  <span style={{ fontSize: "12px", color: "var(--txt)" }}>{seleccionada.dispositivo}</span>
                </div>
                <div>
                  <span style={etiquetaStyle}>IP origen</span>
                  <span className="font-mono" style={{ fontSize: "12px", color: "var(--txt)" }}>{seleccionada.ip_origen}</span>
                </div>
                <div>
                  <span style={etiquetaStyle}>Detectada</span>
                  <span className="font-mono" style={{ fontSize: "12px", color: "var(--txt)" }}>{formatFechaHora(seleccionada.timestamp)}</span>
                </div>
                <div>
                  <span style={etiquetaStyle}>Puntaje de anomalía</span>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: colorPuntaje(seleccionada.puntaje) }}>
                    {(seleccionada.puntaje * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div>
                <span style={etiquetaStyle}>Descripción</span>
                <p style={{ fontSize: "12px", color: "var(--txt2)", lineHeight: 1.5 }}>{seleccionada.descripcion}</p>
              </div>

              {seleccionada.estado !== "pendiente" && seleccionada.justificacion && (
                <div style={{ padding: "10px 12px", borderRadius: "8px", background: "var(--bg2)", border: "1px solid var(--border)" }}>
                  <span style={etiquetaStyle}>Justificación registrada</span>
                  <p style={{ fontSize: "12px", color: "var(--txt2)", lineHeight: 1.5 }}>{seleccionada.justificacion}</p>
                </div>
              )}

              {confirmacion && (
                <div
                  role="status"
                  className="flex items-center gap-2"
                  style={{
                    padding: "8px 10px", borderRadius: "8px", fontSize: "12px",
                    background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981",
                  }}
                >
                  <CheckCircle size={14} />
                  {confirmacion}
                </div>
              )}

              {seleccionada.estado === "pendiente" && (
                <div className="flex flex-col gap-3" style={{ borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                  <span style={etiquetaStyle}>Clasificación</span>
                  <div className="flex flex-wrap gap-2">
                    {OPCIONES.map(({ valor, Icon }) => {
                      const ui = ESTADO_UI[valor];
                      const activa = clasificacion === valor;
                      return (
                        <button
                          key={valor}
                          onClick={() => setClasificacion(valor)}
                          aria-pressed={activa}
                          className="flex items-center gap-2"
                          style={{
                            flex: 1, minWidth: "150px", justifyContent: "center",
                            padding: "8px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                            background: activa ? ui.bg : "rgba(255,255,255,0.04)",
                            border: `1px solid ${activa ? ui.border : "rgba(255,255,255,0.12)"}`,
                            color: activa ? ui.color : "var(--txt2)",
                          }}
                        >
                          <Icon size={14} />
                          {ui.label}
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <label htmlFor="anomalia-justificacion" style={etiquetaStyle}>Justificación (obligatoria)</label>
                    <textarea
                      id="anomalia-justificacion"
                      rows={3}
                      value={justificacion}
                      onChange={e => setJustificacion(e.target.value)}
                      placeholder="Describa la evidencia que sustenta la clasificación"
                      style={{
                        width: "100%", resize: "vertical", background: "var(--bg2)", border: "1px solid var(--border)",
                        borderRadius: "8px", padding: "8px 10px", fontSize: "12px", color: "var(--txt)", outline: "none",
                      }}
                    />
                  </div>

                  <button
                    onClick={registrar}
                    disabled={!puedeRegistrar}
                    style={{
                      padding: "10px", borderRadius: "8px", fontSize: "13px", fontWeight: 700,
                      fontFamily: "Syne, sans-serif", border: "none", color: "#fff", background: "#7c3aed",
                      cursor: puedeRegistrar ? "pointer" : "default", opacity: puedeRegistrar ? 1 : 0.5,
                    }}
                  >
                    Registrar clasificación
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
