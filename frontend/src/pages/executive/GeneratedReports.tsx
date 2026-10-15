import { useEffect, useState } from "react";
import { Download, FileText, Loader, AlertCircle } from "lucide-react";
import { executiveApi } from "../../api/executive";
import { ApiError } from "../../api/client";
import { MODO_MOCK } from "../../api/config";
import { DemoBanner } from "../../components/DemoBanner";
import { descargarBlob } from "../../lib/download";
import { formatFechaHora } from "../../lib/format";
import type { ReporteGenerado } from "../../types";

// CU-20: consulta y descarga de reportes generados

const MSG_SIN_REPORTES = "Sin reportes generados.";

export function GeneratedReports() {
  const [reportes, setReportes] = useState<ReporteGenerado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    executiveApi.listarReportes()
      .then(data => {
        if (!vigente) return;
        setReportes([...data].sort((a, b) => b.fecha.localeCompare(a.fecha)));
      })
      .catch(e => { if (vigente) setError(e instanceof ApiError ? e.message : "No se pudieron cargar los reportes."); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, []);

  const descargar = async (r: ReporteGenerado) => {
    if (descargando) return;
    setDescargando(r.nombre);
    setError(null);
    try {
      descargarBlob(await executiveApi.descargarReporte(r), r.nombre);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo descargar el reporte.");
    } finally {
      setDescargando(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
          Reportes
        </h1>
        <p style={{ fontSize: "12px", color: "var(--txt2)", marginTop: "2px" }}>
          Reportes de seguridad generados por la plataforma, del más reciente al más antiguo
        </p>
      </div>

      {MODO_MOCK && <DemoBanner />}

      {error && (
        <div role="alert" className="flex items-center gap-2" style={{
          padding: "8px 10px", borderRadius: "8px", fontSize: "12px",
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444",
        }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {cargando ? (
        <div style={{ color: "var(--txt3)", fontSize: "13px" }}>Cargando reportes...</div>
      ) : reportes.length === 0 && !error ? (
        <div
          className="flex flex-col items-center justify-center"
          style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "10px", padding: "40px 0", gap: "8px", color: "var(--txt3)" }}
        >
          <FileText size={22} />
          <p style={{ fontSize: "13px" }}>{MSG_SIN_REPORTES}</p>
        </div>
      ) : (
        <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
          {reportes.map((r, i) => {
            const activo = descargando === r.nombre;
            return (
              <div
                key={r.nombre}
                className="flex items-center gap-3"
                style={{ padding: "12px 16px", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
              >
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: "32px", height: "32px", borderRadius: "8px",
                    background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.3)",
                  }}
                >
                  <FileText size={15} style={{ color: "#c4b5fd" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono truncate" style={{ fontSize: "12px", fontWeight: 600, color: "var(--txt)" }}>{r.nombre}</p>
                  <p style={{ fontSize: "10px", color: "var(--txt3)", marginTop: "2px" }}>Generado: {formatFechaHora(r.fecha)}</p>
                </div>
                <button
                  onClick={() => descargar(r)}
                  disabled={descargando !== null}
                  className="flex items-center gap-1.5 flex-shrink-0"
                  aria-label={`Descargar ${r.nombre}`}
                  style={{
                    padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                    fontFamily: "Syne, sans-serif", border: "none", color: "#fff", background: "#7c3aed",
                    cursor: descargando ? "default" : "pointer", opacity: descargando && !activo ? 0.5 : 1,
                  }}
                >
                  {activo ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={13} />}
                  <span className="hidden sm:inline">{activo ? "Descargando..." : "Descargar"}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
