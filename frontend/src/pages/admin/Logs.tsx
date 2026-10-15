import { useEffect, useMemo, useState } from "react";
import { adminApi, MODO_MOCK } from "../../api/admin";
import { ApiError } from "../../api/client";
import { DemoBanner } from "../../components/DemoBanner";
import { formatFechaHora } from "../../lib/format";
import type { ComponenteLog, EntradaLog, NivelLog } from "../../types";

// CU-17 / RF38: consulta de logs del sistema (solo lectura)

const COMPONENTES: readonly ComponenteLog[] = ["BD", "API", "Servidor web"];
const NIVELES: readonly NivelLog[] = ["INFO", "WARNING", "ERROR"];

const NIVEL_UI: Record<NivelLog, { color: string; bg: string; border: string }> = {
  INFO:    { color: "#93c5fd", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.3)" },
  WARNING: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" },
  ERROR:   { color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)" },
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "9px", fontWeight: 700, letterSpacing: "0.8px",
  textTransform: "uppercase", color: "var(--txt3)", marginBottom: "4px",
};

const selectStyle: React.CSSProperties = {
  background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "8px",
  padding: "6px 10px", fontSize: "12px", color: "var(--txt)", outline: "none",
};

function esNivel(v: string): v is NivelLog {
  return NIVELES.some(n => n === v);
}

function esComponente(v: string): v is ComponenteLog {
  return COMPONENTES.some(c => c === v);
}

export function Logs() {
  const [logs, setLogs] = useState<EntradaLog[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nivel, setNivel] = useState<NivelLog | "todos">("todos");
  const [componente, setComponente] = useState<ComponenteLog | "todos">("todos");

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    adminApi.listarLogs(nivel === "todos" ? undefined : nivel)
      .then(data => { if (vigente) setLogs(data); })
      .catch(e => { if (vigente) setError(e instanceof ApiError ? e.message : "No se pudieron cargar los logs."); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [nivel]);

  const visibles = useMemo(
    () => logs
      .filter(l => componente === "todos" || l.componente === componente)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [logs, componente],
  );

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
          Logs del sistema
        </h1>
        <p style={{ fontSize: "12px", color: "var(--txt2)", marginTop: "2px" }}>
          Registro de eventos de base de datos, API y servidor web · solo lectura
        </p>
      </div>

      {MODO_MOCK && <DemoBanner />}

      <div
        className="flex flex-wrap items-end gap-3"
        style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px 14px" }}
      >
        <div>
          <label htmlFor="logs-componente" style={labelStyle}>Componente</label>
          <select
            id="logs-componente"
            value={componente}
            onChange={e => setComponente(esComponente(e.target.value) ? e.target.value : "todos")}
            style={selectStyle}
          >
            <option value="todos">Todos</option>
            {COMPONENTES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="logs-nivel" style={labelStyle}>Nivel</label>
          <select
            id="logs-nivel"
            value={nivel}
            onChange={e => setNivel(esNivel(e.target.value) ? e.target.value : "todos")}
            style={selectStyle}
          >
            <option value="todos">Todos</option>
            {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <span className="ml-auto" style={{ fontSize: "11px", color: "var(--txt3)" }}>
          {cargando ? "Cargando..." : <><strong style={{ color: "var(--txt)" }}>{visibles.length}</strong> registros</>}
        </span>
      </div>

      {error ? (
        <div role="alert" style={{ color: "#ef4444", fontSize: "12px", textAlign: "center", padding: "30px 0" }}>{error}</div>
      ) : !cargando && visibles.length === 0 ? (
        <div style={{ color: "var(--txt3)", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
          No hay registros con los filtros seleccionados.
        </div>
      ) : (
        <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "640px", textAlign: "left", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead style={{ background: "var(--bg2)", color: "var(--txt2)" }}>
              <tr>
                <th style={{ padding: "10px 16px", fontWeight: 600, width: "170px" }}>Fecha</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, width: "120px" }}>Componente</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, width: "100px" }}>Nivel</th>
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>Mensaje</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(l => {
                const ui = NIVEL_UI[l.nivel];
                return (
                  <tr key={l.id} style={{ borderTop: "1px solid var(--border)", color: "#fff" }}>
                    <td className="font-mono" style={{ padding: "10px 16px", color: "var(--txt3)" }}>{formatFechaHora(l.timestamp)}</td>
                    <td style={{ padding: "10px 16px", color: "var(--txt2)" }}>{l.componente}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{
                        fontSize: "9px", fontWeight: 700, letterSpacing: "0.6px", padding: "3px 8px", borderRadius: "5px",
                        background: ui.bg, color: ui.color, border: `1px solid ${ui.border}`,
                      }}>
                        {l.nivel}
                      </span>
                    </td>
                    <td className="font-mono" style={{ padding: "10px 16px", fontSize: "11px", wordBreak: "break-word" }}>{l.mensaje}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
