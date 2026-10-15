import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { TrendingUp, TrendingDown, Minus, Search, AlertCircle } from "lucide-react";
import { executiveApi } from "../../api/executive";
import { ApiError } from "../../api/client";
import { DemoBanner } from "../../components/DemoBanner";
import { MODO_MOCK } from "../../api/config";
import { fechaLocalIso, formatFechaCorta } from "../../lib/format";
import type { NivelSeveridad, ResumenEjecutivo } from "../../types";

// CU-21 (resumen ejecutivo) + CU-22 (consulta por rango de fechas).
// Solo agregados: prohibido mostrar IPs, puertos, IDs de alerta o descripciones técnicas (RN07, RN12).

const MSG_RANGO_INVALIDO = "La fecha de inicio no puede ser posterior a la fecha de fin.";
const MSG_FECHAS_VACIAS  = "Seleccione la fecha de inicio y la fecha de fin.";

const SEVERIDADES: readonly NivelSeveridad[] = ["Crítica", "Alta", "Media", "Baja"];

const SEV_COLOR: Record<NivelSeveridad, string> = {
  Crítica: "#dc2626",
  Alta:    "#ef4444",
  Media:   "#f59e0b",
  Baja:    "#10b981",
};

// Serie única de magnitud: un solo tono (acento del tema)
const COLOR_BARRA = "#a78bfa";

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "#241b31",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#e2ddf0",
  fontFamily: "Syne, sans-serif",
};

const panelStyle: React.CSSProperties = {
  background: "var(--bg3)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
};

const etiquetaStyle: React.CSSProperties = {
  fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--txt3)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "8px",
  padding: "6px 10px", fontSize: "12px", color: "var(--txt)", outline: "none", colorScheme: "dark",
};

function Tendencia({ pct }: { pct: number }) {
  // Más incidentes que el periodo anterior es desfavorable
  const ui = pct > 0
    ? { Icon: TrendingUp,   color: "var(--red)",   texto: "Aumento" }
    : pct < 0
      ? { Icon: TrendingDown, color: "var(--green)", texto: "Disminución" }
      : { Icon: Minus,        color: "var(--txt2)",  texto: "Sin cambio" };
  const { Icon } = ui;
  return (
    <div style={{ ...panelStyle, padding: "14px 16px" }}>
      <p style={{ ...etiquetaStyle, marginBottom: "6px" }}>Tendencia</p>
      <div className="flex items-center gap-2">
        <Icon size={22} style={{ color: ui.color }} aria-hidden="true" />
        <span style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-1px", color: "var(--txt)", lineHeight: 1 }}>
          {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
        </span>
      </div>
      <p style={{ fontSize: "10px", color: "var(--txt3)", marginTop: "4px" }}>
        {ui.texto} vs. periodo anterior
      </p>
    </div>
  );
}

export function ExecutiveSummary() {
  const [inicio, setInicio] = useState(() => fechaLocalIso(new Date(), -29));
  const [fin, setFin] = useState(() => fechaLocalIso());
  const [resumen, setResumen] = useState<ResumenEjecutivo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const consultaActual = useRef(0);

  const consultar = useCallback(async (desde: string, hasta: string) => {
    // Validación previa: con un rango inválido no se ejecuta la consulta (CU-22)
    if (!desde || !hasta) { setErrorValidacion(MSG_FECHAS_VACIAS); return; }
    if (desde > hasta) { setErrorValidacion(MSG_RANGO_INVALIDO); return; }
    setErrorValidacion(null);
    setError(null);
    setCargando(true);
    const id = ++consultaActual.current;
    try {
      const data = await executiveApi.obtenerResumen(desde, hasta);
      if (id === consultaActual.current) setResumen(data);
    } catch (e) {
      if (id === consultaActual.current) {
        setError(e instanceof ApiError ? e.message : "No se pudo obtener el resumen ejecutivo.");
      }
    } finally {
      if (id === consultaActual.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    consultar(inicio, fin);
    // Solo la consulta inicial; las siguientes las dispara el botón
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultar]);

  const total = resumen ? SEVERIDADES.reduce((acc, s) => acc + resumen.totalesPorSeveridad[s], 0) : 0;
  const top = resumen?.topTiposAtaque.slice(0, 3) ?? [];

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
          Resumen ejecutivo
        </h1>
        <p style={{ fontSize: "12px", color: "var(--txt2)", marginTop: "2px" }}>
          Panorama agregado de la seguridad de la organización
          {resumen && <> · {formatFechaCorta(resumen.periodo.inicio)} – {formatFechaCorta(resumen.periodo.fin)}</>}
        </p>
      </div>

      {MODO_MOCK && <DemoBanner />}

      {/* Filtro de periodo (una fila, sobre los gráficos) */}
      <form
        onSubmit={e => { e.preventDefault(); consultar(inicio, fin); }}
        className="flex flex-wrap items-end gap-3"
        style={{ ...panelStyle, padding: "12px 14px" }}
      >
        <div>
          <label htmlFor="ejecutivo-inicio" style={{ ...etiquetaStyle, display: "block", fontSize: "9px", marginBottom: "4px" }}>Fecha de inicio</label>
          <input id="ejecutivo-inicio" type="date" value={inicio} onChange={e => setInicio(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="ejecutivo-fin" style={{ ...etiquetaStyle, display: "block", fontSize: "9px", marginBottom: "4px" }}>Fecha de fin</label>
          <input id="ejecutivo-fin" type="date" value={fin} onChange={e => setFin(e.target.value)} style={inputStyle} />
        </div>
        <button
          type="submit"
          disabled={cargando}
          className="flex items-center gap-2"
          style={{
            padding: "7px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
            fontFamily: "Syne, sans-serif", border: "none", color: "#fff", background: "#7c3aed",
            cursor: cargando ? "default" : "pointer", opacity: cargando ? 0.7 : 1,
          }}
        >
          <Search size={13} />
          {cargando ? "Consultando..." : "Consultar"}
        </button>
        {errorValidacion && (
          <span role="alert" className="flex items-center gap-1.5" style={{ fontSize: "12px", color: "#f59e0b" }}>
            <AlertCircle size={13} />
            {errorValidacion}
          </span>
        )}
      </form>

      {error && (
        <div role="alert" style={{ color: "#ef4444", fontSize: "12px", textAlign: "center", padding: "20px 0" }}>{error}</div>
      )}

      {resumen && !error && (
        <>
          {/* Totales por severidad + tendencia */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div style={{ ...panelStyle, padding: "14px 16px" }}>
              <p style={{ ...etiquetaStyle, marginBottom: "6px" }}>Total incidentes</p>
              <p style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-1px", color: "#fff", lineHeight: 1 }}>{total}</p>
              <p style={{ fontSize: "10px", color: "var(--txt3)", marginTop: "4px" }}>En el periodo</p>
            </div>
            {SEVERIDADES.map(s => (
              <div key={s} style={{ ...panelStyle, padding: "14px 16px", borderLeft: `3px solid ${SEV_COLOR[s]}` }}>
                <p style={{ ...etiquetaStyle, marginBottom: "6px" }}>{s}</p>
                <p style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-1px", color: "var(--txt)", lineHeight: 1 }}>
                  {resumen.totalesPorSeveridad[s]}
                </p>
                <p style={{ fontSize: "10px", color: "var(--txt3)", marginTop: "4px" }}>
                  {total > 0 ? `${Math.round((resumen.totalesPorSeveridad[s] / total) * 100)}% del total` : "—"}
                </p>
              </div>
            ))}
            <Tendencia pct={resumen.tendenciaPct} />
          </div>

          {/* Top 3 tipos de ataque */}
          <div style={{ ...panelStyle, overflow: "hidden" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Principales tipos de ataque</span>
              <span style={{ fontSize: "10px", color: "var(--txt3)" }}>Top 3 del periodo</span>
            </div>
            <div style={{ padding: "12px 16px" }}>
              {top.length === 0 ? (
                <p style={{ fontSize: "12px", color: "var(--txt3)", textAlign: "center", padding: "20px 0" }}>
                  Sin ataques registrados en el periodo.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={top.length * 48 + 16}>
                  <BarChart data={top} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }} barSize={20}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="tipo"
                      width={150}
                      tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "Syne, sans-serif" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      formatter={(valor) => [valor, "Incidentes"]}
                    />
                    <Bar dataKey="total" fill={COLOR_BARRA} fillOpacity={0.85} radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="total" position="right" style={{ fontSize: 11, fill: "#e2e8f0", fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
