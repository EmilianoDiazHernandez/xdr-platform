import { useEffect, useState } from "react";
import { fetchEvents, fetchAlertas, fetchIncidentTimeline } from "../api/config";
import { CorrelatedEvent, Alerta, AttackFlowStep, IncidentTimeline, TimelineItem } from "../types";

const SEV_COLOR: Record<number | string, string> = {
  3: "#ef4444", 2: "#f59e0b", 1: "#10b981",
  Alta: "#ef4444", Media: "#f59e0b", Baja: "#10b981", Crítica: "#dc2626",
};

const SEV_BG: Record<number | string, string> = {
  3: "rgba(239,68,68,0.1)", 2: "rgba(245,158,11,0.1)", 1: "rgba(16,185,129,0.1)",
  Alta: "rgba(239,68,68,0.1)", Media: "rgba(245,158,11,0.1)", Baja: "rgba(16,185,129,0.1)", Crítica: "rgba(220,38,38,0.15)",
};

const SEV_TEXT: Record<number, string> = {
  3: "ALTA", 2: "MEDIA", 1: "BAJA", 4: "CRÍTICA"
};

const VECTOR_STYLE: Record<string, { bg: string, color: string, border: string, label: string }> = {
  Red: { bg: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", border: "#0284c7", label: "RED / ZEEK" },
  Network: { bg: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", border: "#0284c7", label: "RED / ZEEK" },
  Endpoint: { bg: "rgba(192, 132, 252, 0.15)", color: "#c084fc", border: "#9333ea", label: "ENDPOINT / EDR" },
  Email: { bg: "rgba(251, 146, 60, 0.15)", color: "#fb923c", border: "#ea580c", label: "EMAIL / OSINT" },
};

function getVectorStyle(vectorName: string = "") {
  return VECTOR_STYLE[vectorName] || {
    bg: "rgba(148, 163, 184, 0.15)",
    color: "#94a3b8",
    border: "#64748b",
    label: vectorName.toUpperCase() || "DESCONOCIDO"
  };
}

function AccordionEvent({ event, startExpanded }: { event: CorrelatedEvent, startExpanded: boolean }) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [timelineData, setTimelineData] = useState<IncidentTimeline | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  useEffect(() => {
    if (expanded && !timelineData) {
      setLoadingTimeline(true);
      fetchIncidentTimeline(event.id)
        .then((data: IncidentTimeline) => {
          setTimelineData(data);
          setLoadingTimeline(false);
        })
        .catch((err) => {
          console.warn("[TIMELINE] No se pudo cargar timeline desde API, usando attack_flow local:", err);
          setLoadingTimeline(false);
        });
    }
  }, [expanded, event.id, timelineData]);

  const items: Array<TimelineItem | AttackFlowStep> = timelineData?.timeline && timelineData.timeline.length > 0
    ? timelineData.timeline
    : (event.attack_flow || []);

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
            <div className="flex items-center gap-2">
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff", margin: 0 }}>
                Evento Correlacionado en {event.target_node}
              </h3>
              {timelineData?.vectores_involucrados && timelineData.vectores_involucrados.map(v => {
                const vs = getVectorStyle(v);
                return (
                  <span key={v} style={{
                    background: vs.bg, color: vs.color, border: `1px solid ${vs.border}`,
                    padding: "2px 6px", borderRadius: "4px", fontSize: "9px", fontWeight: 700
                  }}>
                    {vs.label}
                  </span>
                );
              })}
            </div>
            <span style={{ fontSize: "11px", color: "var(--txt3)" }}>
              ID: {event.id} • Iniciado: {event.start_time.replace("T", " ").split(".")[0]}
              {event.probability ? ` • Probabilidad: ${(event.probability * 100).toFixed(1)}%` : ""}
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
          <div className="flex justify-between items-center mb-3">
            <h4 style={{ fontSize: "12px", fontWeight: 600, color: "var(--txt2)", margin: 0, textTransform: "uppercase" }}>
              Línea de Tiempo Forense Multi-Vector ({items.length} eventos cronológicos)
            </h4>
            {loadingTimeline && (
              <span style={{ fontSize: "11px", color: "var(--txt3)" }}>Sincronizando timeline...</span>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ color: "var(--txt3)", fontSize: "12px", padding: "12px 0", textAlign: "center" }}>
              No hay pasos secuenciales registrados en este incidente.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", position: "relative" }}>
              {items.map((step: any, i: number) => {
                const vectorName = step.vector || step.layer || "Desconocido";
                const vs = getVectorStyle(vectorName);
                const stepSev = step.severidad || "Media";

                return (
                  <div key={i} className="flex gap-4 items-start relative">
                    {/* Linea vertical conectora */}
                    {i !== items.length - 1 && (
                      <div style={{ position: "absolute", left: "15px", top: "28px", bottom: "-16px", width: "2px", background: "var(--border)" }} />
                    )}
                    
                    {/* Circulo del step */}
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "50%",
                      background: vs.bg,
                      border: `2px solid ${vs.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "12px", fontWeight: "bold", color: vs.color,
                      zIndex: 1
                    }}>
                      {i + 1}
                    </div>
                    
                    {/* Detalle */}
                    <div style={{ flex: 1, background: "var(--bg3)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span style={{
                            background: vs.bg, color: vs.color, border: `1px solid ${vs.border}`,
                            padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold", letterSpacing: "0.5px"
                          }}>
                            {vs.label}
                          </span>
                          
                          {step.mitre_tactic && (
                            <span style={{ background: "rgba(255,255,255,0.06)", color: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", fontSize: "10px" }}>
                              {step.mitre_tactic}
                            </span>
                          )}

                          {step.mitre_technique_id && (
                            <span style={{ background: "rgba(167, 139, 250, 0.15)", color: "#a78bfa", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>
                              {step.mitre_technique_id}
                            </span>
                          )}

                          {step.mitre_software_id && (
                            <span style={{ background: "rgba(236, 72, 153, 0.15)", color: "#f472b6", border: "1px solid rgba(236, 72, 153, 0.4)", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>
                              TOOL: {step.mitre_software_id}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span style={{
                            background: SEV_BG[stepSev] || "var(--bg3)", color: SEV_COLOR[stepSev] || "#fff",
                            padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold"
                          }}>
                            {stepSev}
                          </span>
                          <span style={{ fontSize: "10px", color: "var(--txt3)", fontFamily: "monospace" }}>
                            {step.timestamp ? step.timestamp.replace("T", " ").split(".")[0] : ""}
                          </span>
                        </div>
                      </div>

                      <p style={{ fontSize: "12px", color: "#f1f5f9", margin: "0 0 6px 0", lineHeight: 1.4 }}>
                        {step.descripcion || step.description}
                      </p>

                      {/* Metadatos adicionales forenses */}
                      {(step.ip_destino || step.dest_ip || step.file_hash) && (
                        <div style={{ fontSize: "11px", color: "var(--txt3)", display: "flex", gap: "12px", flexWrap: "wrap", borderTop: "1px dashed var(--border)", paddingTop: "6px" }}>
                          {(step.ip_destino || step.dest_ip) && (
                            <span>Destino: <strong style={{ color: "#e2e8f0" }}>{step.ip_destino || step.dest_ip}</strong></span>
                          )}
                          {step.file_hash && (
                            <span>Hash: <code style={{ color: "#38bdf8" }}>{step.file_hash.substring(0, 16)}...</code></span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
    <div className="p-4 sm:p-6 flex flex-col gap-5 h-full">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
          Explorador de Alertas y Cronología Multi-Vector
        </h1>
        <p style={{ fontSize: "12px", color: "var(--txt2)", marginTop: "2px" }}>
          Correlación forense multi-capa: Red (Zeek), Endpoint (Sysmon/EDR) y Email integrados con AlienVault OTX y MITRE ATT&CK
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 sm:gap-4 overflow-x-auto text-nowrap" style={{ borderBottom: "1px solid var(--border)" }}>
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
          Incidentes Correlacionados ({eventos.length})
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
          Alertas Individuales ({alertas.length})
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" }} className="custom-scrollbar">
        {loading ? (
          <div style={{ color: "var(--txt3)", fontSize: "13px" }}>Cargando datos del XDR...</div>
        ) : tab === "correlacionados" ? (
          <div className="flex flex-col">
            {eventos.length === 0 ? (
              <div style={{ color: "var(--txt3)", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
                No hay incidentes correlacionados abiertos.
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
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "8px", overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: "750px", textAlign: "left", borderCollapse: "collapse", fontSize: "12px", tableLayout: "fixed" }}>
              <thead style={{ background: "var(--bg2)", color: "var(--txt2)" }}>
                <tr>
                  <th style={{ padding: "10px 16px", fontWeight: 600, width: "110px" }}>Vector</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, width: "120px" }}>IP / Host</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600 }}>Descripción</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, width: "130px" }}>Técnica</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, width: "110px" }}>Software</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, width: "90px" }}>Severidad</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, width: "140px" }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {alertas.map((al, idx) => {
                  const vs = getVectorStyle(al.vector_origen || (al.descripcion?.includes("Correo") ? "Email" : al.descripcion?.includes("Proceso") ? "Endpoint" : "Red"));
                  return (
                    <tr key={idx} style={{ borderTop: "1px solid var(--border)", color: "#fff" }}>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ background: vs.bg, color: vs.color, border: `1px solid ${vs.border}`, padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>
                          {vs.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", color: "var(--txt3)" }}>{al.ip_origen}</td>
                      <td style={{ padding: "10px 16px", wordWrap: "break-word", whiteSpace: "normal", overflowWrap: "break-word" }}>{al.descripcion}</td>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                        {al.mitre_technique_id ? (
                          <span style={{ background: "rgba(167, 139, 250, 0.15)", color: "#a78bfa", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold" }}>
                            {al.mitre_technique_id}
                          </span>
                        ) : <span style={{ color: "var(--txt3)", fontSize: "11px" }}>-</span>}
                      </td>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                        {al.mitre_software_id ? (
                          <span style={{ background: "rgba(236, 72, 153, 0.15)", color: "#f472b6", border: "1px solid rgba(236, 72, 153, 0.4)", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>
                            {al.mitre_software_id}
                          </span>
                        ) : <span style={{ color: "var(--txt3)", fontSize: "11px" }}>-</span>}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ 
                          background: SEV_BG[al.severidad], color: SEV_COLOR[al.severidad],
                          padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold", textTransform: "uppercase"
                        }}>
                          {al.severidad}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", color: "var(--txt3)", fontFamily: "monospace" }}>{al.timestamp.replace("T", " ").split(".")[0]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
