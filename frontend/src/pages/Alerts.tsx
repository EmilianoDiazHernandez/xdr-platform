import { useEffect, useState } from "react";
import { fetchEvents, fetchAlertas } from "../api/config";
import { CorrelatedEvent, Alerta, AttackFlowStep } from "../types";

const SEV_COLOR: Record<number | string, string> = {
  3: "#ef4444", 2: "#f59e0b", 1: "#10b981",
  Alta: "#ef4444", Media: "#f59e0b", Baja: "#10b981",
};

const SEV_BG: Record<number | string, string> = {
  3: "rgba(239,68,68,0.1)", 2: "rgba(245,158,11,0.1)", 1: "rgba(16,185,129,0.1)",
  Alta: "rgba(239,68,68,0.1)", Media: "rgba(245,158,11,0.1)", Baja: "rgba(16,185,129,0.1)",
};

const SEV_TEXT: Record<number, string> = {
  3: "ALTA", 2: "MEDIA", 1: "BAJA"
};

function AccordionEvent({ event, startExpanded }: { event: CorrelatedEvent, startExpanded: boolean }) {
  const [expanded, setExpanded] = useState(startExpanded);

  return (
    <div style={{
      background: "var(--bg3)",
      border: `1px solid ${expanded ? SEV_COLOR[event.severity] : "var(--border)"}`,
      borderRadius: "8px",
      marginBottom: "12px",
      overflow: "hidden",
      transition: "border 0.2s"
    }}>
      {/* Header Row */}
      <div 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between"
        style={{
          padding: "12px 16px",
          cursor: "pointer",
          background: expanded ? "rgba(255,255,255,0.03)" : "transparent",
          borderLeft: `4px solid ${SEV_COLOR[event.severity]}`
        }}
      >
        <div className="flex items-center gap-4">
          <div style={{
            background: SEV_BG[event.severity], color: SEV_COLOR[event.severity],
            padding: "4px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold"
          }}>
            {SEV_TEXT[event.severity] || "DESC"}
          </div>
          <div>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff", margin: 0 }}>
              Evento Correlacionado en {event.target_node}
            </h3>
            <span style={{ fontSize: "11px", color: "var(--txt3)" }}>
              ID: {event.id} • Iniciado: {event.start_time.replace("T", " ").split(".")[0]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span style={{ 
            fontSize: "11px", fontWeight: 600,
            color: event.status === "Abierto" ? "#ef4444" : "var(--txt3)" 
          }}>
            {event.status}
          </span>
          <span style={{ color: "var(--txt3)", fontSize: "12px", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            ▼
          </span>
        </div>
      </div>

      {/* Expanded Content (Timeline) */}
      {expanded && (
        <div style={{ padding: "16px", borderTop: "1px solid var(--border)", background: "var(--bg2)" }}>
          <h4 style={{ fontSize: "12px", fontWeight: 600, color: "var(--txt2)", marginBottom: "12px", textTransform: "uppercase" }}>
            Secuencia de Ataque ({event.attack_flow?.length || 0} pasos)
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", position: "relative" }}>
            {event.attack_flow?.map((step: AttackFlowStep, i: number) => (
              <div key={i} className="flex gap-4 items-start relative">
                {/* Linea vertical conectora */}
                {i !== event.attack_flow.length - 1 && (
                  <div style={{ position: "absolute", left: "15px", top: "24px", bottom: "-16px", width: "2px", background: "var(--border)" }} />
                )}
                
                {/* Circulo del step */}
                <div style={{
                  width: "32px", height: "32px", borderRadius: "50%",
                  background: SEV_BG[step.severidad] || "var(--bg3)",
                  border: `2px solid ${SEV_COLOR[step.severidad] || "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "12px", fontWeight: "bold", color: "#fff",
                  zIndex: 1
                }}>
                  {i + 1}
                </div>
                
                {/* Detalle */}
                <div style={{ flex: 1, background: "var(--bg3)", padding: "10px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                  <div className="flex justify-between items-center mb-1">
                    <span style={{ fontSize: "10px", color: "var(--txt3)", textTransform: "uppercase", fontWeight: "bold", letterSpacing: "1px" }}>
                      Vector: {step.vector}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--txt3)", fontFamily: "monospace" }}>
                      {step.timestamp.replace("T", " ").split(".")[0]}
                    </span>
                  </div>
                  <p style={{ fontSize: "12px", color: "#fff", margin: 0 }}>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Alerts({ eventoSeleccionado }: { eventoSeleccionado: string | null }) {
  const [tab, setTab] = useState<"correlacionados" | "aislados">("correlacionados");
  const [eventos, setEventos] = useState<CorrelatedEvent[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [evData, alData] = await Promise.all([fetchEvents(), fetchAlertas()]);
        setEventos(evData);
        setAlertas(alData);
      } catch (e) {
        console.error("Error loading alerts page data", e);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px", height: "100%" }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
          Explorador de Alertas
        </h1>
        <p style={{ fontSize: "12px", color: "var(--txt2)", marginTop: "2px" }}>
          Análisis detallado de eventos correlacionados y detecciones individuales
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={() => setTab("correlacionados")}
          style={{
            padding: "8px 16px",
            color: tab === "correlacionados" ? "#fff" : "var(--txt3)",
            borderBottom: tab === "correlacionados" ? "2px solid #a78bfa" : "2px solid transparent",
            background: "none", borderTop: "none", borderLeft: "none", borderRight: "none",
            fontWeight: 600, fontSize: "13px", cursor: "pointer"
          }}
        >
          Eventos Correlacionados ({eventos.length})
        </button>
        <button
          onClick={() => setTab("aislados")}
          style={{
            padding: "8px 16px",
            color: tab === "aislados" ? "#fff" : "var(--txt3)",
            borderBottom: tab === "aislados" ? "2px solid #3b82f6" : "2px solid transparent",
            background: "none", borderTop: "none", borderLeft: "none", borderRight: "none",
            fontWeight: 600, fontSize: "13px", cursor: "pointer"
          }}
        >
          Alertas Aisladas ({alertas.length})
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" }} className="custom-scrollbar">
        {loading ? (
          <div style={{ color: "var(--txt3)", fontSize: "13px" }}>Cargando datos...</div>
        ) : tab === "correlacionados" ? (
          <div className="flex flex-col">
            {eventos.length === 0 ? (
              <div style={{ color: "var(--txt3)", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
                No hay eventos correlacionados registrados.
              </div>
            ) : (
              // Order: Open first, then by date descending
              eventos.sort((a, b) => {
                if (a.status === "Abierto" && b.status !== "Abierto") return -1;
                if (b.status === "Abierto" && a.status !== "Abierto") return 1;
                return new Date(b.last_update).getTime() - new Date(a.last_update).getTime();
              }).map(ev => (
                <AccordionEvent 
                  key={ev.id} 
                  event={ev} 
                  startExpanded={eventoSeleccionado === ev.id}
                />
              ))
            )}
          </div>
        ) : (
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" }}>
            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead style={{ background: "var(--bg2)", color: "var(--txt2)" }}>
                <tr>
                  <th style={{ padding: "10px 16px", fontWeight: 600 }}>IP Origen</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600 }}>Descripción</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600 }}>Severidad</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600 }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {alertas.map((al, idx) => (
                  <tr key={idx} style={{ borderTop: "1px solid var(--border)", color: "#fff" }}>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace", color: "var(--txt3)" }}>{al.ip_origen}</td>
                    <td style={{ padding: "10px 16px" }}>{al.descripcion}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ 
                        background: SEV_BG[al.severidad], color: SEV_COLOR[al.severidad],
                        padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold", textTransform: "uppercase"
                      }}>
                        {al.severidad}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--txt3)" }}>{al.timestamp.replace("T", " ").split(".")[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
