import { useEffect, useMemo, useState } from "react";
import { Download, FilterX } from "lucide-react";
import { fetchEvents, fetchAlertas, fetchIncidentTimeline } from "../api/config";
import { CorrelatedEvent, Alerta, AttackFlowStep, IncidentTimeline, NivelSeveridad, TimelineItem } from "../types";
import { fechaDe, formatFechaHora, sufijoArchivo } from "../lib/format";
import { generarCsv } from "../lib/csv";
import { descargarBlob } from "../lib/download";

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

/* ─── Pasos del timeline: TimelineItem (API) o AttackFlowStep (attack_flow local) ─── */

type PasoTimeline = TimelineItem | AttackFlowStep;

interface PasoNormalizado {
  vector:              string;
  descripcion?:        string;
  severidad:           string | number;
  timestamp?:          string;
  mitre_tactic?:       string | null;
  mitre_technique_id?: string | null;
  mitre_software_id?:  string | null;
  destino?:            string | null;
  file_hash?:          string | null;
}

function esTimelineItem(paso: PasoTimeline): paso is TimelineItem {
  return "step_order" in paso;
}

// Unifica los campos alternos: descripcion|description, vector|layer, ip_destino|dest_ip
function normalizarPaso(paso: PasoTimeline): PasoNormalizado {
  const comunes = {
    severidad:          paso.severidad || "Media",
    timestamp:          paso.timestamp,
    mitre_tactic:       paso.mitre_tactic,
    mitre_technique_id: paso.mitre_technique_id,
    mitre_software_id:  paso.mitre_software_id,
    file_hash:          paso.file_hash,
  };
  if (esTimelineItem(paso)) {
    return { ...comunes, vector: paso.vector || "Desconocido", descripcion: paso.descripcion, destino: paso.ip_destino };
  }
  return { ...comunes, vector: paso.vector || paso.layer || "Desconocido", descripcion: paso.description, destino: paso.dest_ip };
}

/* ─── Filtros de alertas individuales (CU-06) ─── */

const FILTROS_KEY = "xdr.filtros.alertas";
const SEVERIDADES: readonly NivelSeveridad[] = ["Crítica", "Alta", "Media", "Baja"];

interface FiltrosAlertas {
  severidad: NivelSeveridad | "todas";
  ip:        string;
  desde:     string; // YYYY-MM-DD o ""
  hasta:     string;
}

const FILTROS_VACIOS: FiltrosAlertas = { severidad: "todas", ip: "", desde: "", hasta: "" };

function esSeveridadFiltro(v: unknown): v is FiltrosAlertas["severidad"] {
  return v === "todas" || SEVERIDADES.some(s => s === v);
}

function leerFiltros(): FiltrosAlertas {
  try {
    const raw = sessionStorage.getItem(FILTROS_KEY);
    if (!raw) return FILTROS_VACIOS;
    const p: unknown = JSON.parse(raw);
    if (typeof p !== "object" || p === null) return FILTROS_VACIOS;
    const v = p as Record<string, unknown>;
    return {
      severidad: esSeveridadFiltro(v.severidad) ? v.severidad : "todas",
      ip:        typeof v.ip === "string" ? v.ip : "",
      desde:     typeof v.desde === "string" ? v.desde : "",
      hasta:     typeof v.hasta === "string" ? v.hasta : "",
    };
  } catch {
    return FILTROS_VACIOS;
  }
}

function guardarFiltros(f: FiltrosAlertas): void {
  try {
    sessionStorage.setItem(FILTROS_KEY, JSON.stringify(f));
  } catch {
    // Almacenamiento no disponible: los filtros solo duran mientras la vista esté montada
  }
}

const MSG_RANGO_INVALIDO = "La fecha de inicio no puede ser posterior a la fecha de fin.";
const MSG_SIN_RESULTADOS = "No se encontraron alertas con los criterios seleccionados.";
const MSG_SIN_EXPORTAR   = "Sin alertas para exportar con los filtros actuales.";

const CSV_ENCABEZADOS = ["ID", "IP origen", "IP destino", "protocolo", "timestamp", "severidad", "descripción"] as const;

const filtroLabelStyle: React.CSSProperties = {
  display: "block", fontSize: "9px", fontWeight: 700, letterSpacing: "0.8px",
  textTransform: "uppercase", color: "var(--txt3)", marginBottom: "4px",
};

const filtroInputStyle: React.CSSProperties = {
  background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "8px",
  padding: "6px 10px", fontSize: "12px", color: "var(--txt)", outline: "none", colorScheme: "dark",
};

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

  const items: PasoTimeline[] = timelineData?.timeline && timelineData.timeline.length > 0
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
              {items.map((paso, i) => {
                const step = normalizarPaso(paso);
                const vs = getVectorStyle(step.vector);
                const stepSev = step.severidad;

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
                        {step.descripcion}
                      </p>

                      {/* Metadatos adicionales forenses */}
                      {(step.destino || step.file_hash) && (
                        <div style={{ fontSize: "11px", color: "var(--txt3)", display: "flex", gap: "12px", flexWrap: "wrap", borderTop: "1px dashed var(--border)", paddingTop: "6px" }}>
                          {step.destino && (
                            <span>Destino: <strong style={{ color: "#e2e8f0" }}>{step.destino}</strong></span>
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
  const [filtros, setFiltros] = useState<FiltrosAlertas>(leerFiltros);
  const [avisoExportar, setAvisoExportar] = useState<string | null>(null);

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

  useEffect(() => {
    guardarFiltros(filtros);
  }, [filtros]);

  useEffect(() => {
    if (!avisoExportar) return;
    const t = setTimeout(() => setAvisoExportar(null), 4000);
    return () => clearTimeout(t);
  }, [avisoExportar]);

  const rangoInvalido = filtros.desde !== "" && filtros.hasta !== "" && filtros.desde > filtros.hasta;

  const alertasFiltradas = useMemo(() => {
    const ip = filtros.ip.trim().toLowerCase();
    return alertas.filter(al => {
      if (filtros.severidad !== "todas" && al.severidad !== filtros.severidad) return false;
      if (ip && !al.ip_origen.toLowerCase().includes(ip)) return false;
      // Con un rango inválido no se aplica el filtro de fechas
      if (!rangoInvalido) {
        const dia = fechaDe(al.timestamp);
        if (filtros.desde && dia < filtros.desde) return false;
        if (filtros.hasta && dia > filtros.hasta) return false;
      }
      return true;
    });
  }, [alertas, filtros, rangoInvalido]);

  const hayFiltros = filtros.severidad !== "todas" || filtros.ip !== "" || filtros.desde !== "" || filtros.hasta !== "";

  const actualizarFiltro = <K extends keyof FiltrosAlertas>(campo: K, valor: FiltrosAlertas[K]) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  };

  const handleExportarCsv = () => {
    if (alertasFiltradas.length === 0) {
      setAvisoExportar(MSG_SIN_EXPORTAR);
      return;
    }
    const filas = alertasFiltradas.map(al => [
      al.id, al.ip_origen, al.ip_destino, al.protocolo, al.timestamp, al.severidad, al.descripcion,
    ]);
    descargarBlob(generarCsv(CSV_ENCABEZADOS, filas), `ALERTAS-${sufijoArchivo(new Date())}.csv`);
  };

  // Abiertos primero, luego por fecha de actualización descendente
  const eventosOrdenados = [...eventos].sort((a, b) => {
    if (a.status === "Abierto" && b.status !== "Abierto") return -1;
    if (b.status === "Abierto" && a.status !== "Abierto") return 1;
    return new Date(b.last_update).getTime() - new Date(a.last_update).getTime();
  });

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

      {/* Barra de filtros + exportación (solo alertas individuales) */}
      {tab === "aislados" && !loading && (
        <div
          style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px 14px" }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="filtro-severidad" style={filtroLabelStyle}>Severidad</label>
              <select
                id="filtro-severidad"
                value={filtros.severidad}
                onChange={e => { if (esSeveridadFiltro(e.target.value)) actualizarFiltro("severidad", e.target.value); }}
                style={filtroInputStyle}
              >
                <option value="todas">Todas</option>
                {SEVERIDADES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="filtro-ip" style={filtroLabelStyle}>IP origen</label>
              <input
                id="filtro-ip"
                type="text"
                placeholder="p. ej. 192.168."
                value={filtros.ip}
                onChange={e => actualizarFiltro("ip", e.target.value)}
                style={{ ...filtroInputStyle, width: "150px", fontFamily: "JetBrains Mono, monospace" }}
              />
            </div>
            <div>
              <label htmlFor="filtro-desde" style={filtroLabelStyle}>Desde</label>
              <input
                id="filtro-desde"
                type="date"
                value={filtros.desde}
                onChange={e => actualizarFiltro("desde", e.target.value)}
                style={filtroInputStyle}
              />
            </div>
            <div>
              <label htmlFor="filtro-hasta" style={filtroLabelStyle}>Hasta</label>
              <input
                id="filtro-hasta"
                type="date"
                value={filtros.hasta}
                onChange={e => actualizarFiltro("hasta", e.target.value)}
                style={filtroInputStyle}
              />
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setFiltros(FILTROS_VACIOS)}
                disabled={!hayFiltros}
                className="flex items-center gap-1.5"
                style={{
                  padding: "6px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 600,
                  background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--txt2)",
                  cursor: hayFiltros ? "pointer" : "default", opacity: hayFiltros ? 1 : 0.5,
                }}
              >
                <FilterX size={13} />
                Limpiar
              </button>
              <button
                onClick={handleExportarCsv}
                className="flex items-center gap-1.5"
                style={{
                  padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                  fontFamily: "Syne, sans-serif", background: "#7c3aed", border: "none", color: "#fff", cursor: "pointer",
                }}
              >
                <Download size={13} />
                Exportar CSV
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginTop: "10px" }}>
            <span style={{ fontSize: "11px", color: "var(--txt3)" }}>
              Mostrando <strong style={{ color: "var(--txt)" }}>{alertasFiltradas.length}</strong> de {alertas.length} alertas
            </span>
            {rangoInvalido && (
              <span role="alert" style={{ fontSize: "11px", color: "#f59e0b" }}>{MSG_RANGO_INVALIDO}</span>
            )}
            {avisoExportar && (
              <span role="status" style={{ fontSize: "11px", color: "#f59e0b" }}>{avisoExportar}</span>
            )}
          </div>
        </div>
      )}

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
              eventosOrdenados.map(ev => (
                <AccordionEvent
                  key={ev.id}
                  event={ev}
                  startExpanded={eventoSeleccionado === ev.id}
                />
              ))
            )}
          </div>
        ) : alertasFiltradas.length === 0 && alertas.length > 0 ? (
          <div style={{ color: "var(--txt3)", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
            {MSG_SIN_RESULTADOS}
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
                {alertasFiltradas.map((al, idx) => {
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
                      <td style={{ padding: "10px 16px", color: "var(--txt3)", fontFamily: "monospace" }}>{formatFechaHora(al.timestamp)}</td>
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
