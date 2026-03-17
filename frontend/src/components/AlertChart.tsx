import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend,
} from "recharts";
import { Alerta } from "../types";

const COLORES: Record<string, string> = {
  Alta:  "#ef4444",
  Media: "#f59e0b",
  Baja:  "#10b981",
};

const PANEL_STYLE: React.CSSProperties = {
  background: "var(--bg3)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  overflow: "hidden",
};

const HEADER_STYLE: React.CSSProperties = {
  borderBottom: "1px solid var(--border)",
};

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "#241b31",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#e2ddf0",
  fontFamily: "Syne, sans-serif",
};

// Genera datos de ataques por hora para las últimas 12 horas
function generarDatosTiempo(alertas: Alerta[]) {
  const ahora = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const hora = new Date(ahora);
    hora.setHours(hora.getHours() - (11 - i));
    hora.setMinutes(0, 0, 0);
    const label = hora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

    // Simula distribución realista con los datos mock
    const base = alertas.length;
    const factor = Math.sin((i / 11) * Math.PI) * 0.6 + 0.4;
    return {
      hora: label,
      Alta:  Math.round((base * 0.25 * factor * (0.7 + Math.random() * 0.6))),
      Media: Math.round((base * 0.35 * factor * (0.7 + Math.random() * 0.6))),
      Baja:  Math.round((base * 0.40 * factor * (0.7 + Math.random() * 0.6))),
    };
  });
}

interface AlertChartProps {
  alertas: Alerta[];
}

export function AlertChart({ alertas }: AlertChartProps) {
  // Distribución por severidad (barras)
  const barData = ["Alta", "Media", "Baja"].map(sev => ({
    severidad: sev,
    cantidad: alertas.filter(a => a.severidad === sev).length,
  }));

  // Ataques vs tiempo (líneas)
  const lineData = generarDatosTiempo(alertas);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* 1 — Ataques vs Tiempo */}
      <div style={PANEL_STYLE}>
        <div className="flex items-center justify-between px-4 py-3" style={HEADER_STYLE}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>
            Ataques vs tiempo
          </span>
          <span style={{ fontSize: "10px", color: "var(--txt3)" }}>
            Últimas 12 horas
          </span>
        </div>
        <div style={{ padding: "12px 16px 8px" }}>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="hora"
                tick={{ fontSize: 9, fill: "#64748b", fontFamily: "Syne, sans-serif" }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#64748b", fontFamily: "Syne, sans-serif" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "rgba(255,255,255,0.08)" }} />
              <Legend
                wrapperStyle={{ fontSize: "10px", color: "var(--txt2)", paddingTop: "4px" }}
                iconSize={8}
              />
              <Line type="monotone" dataKey="Alta"  stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="Media" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="Baja"  stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2 — Distribución por severidad */}
      <div style={PANEL_STYLE}>
        <div className="flex items-center justify-between px-4 py-3" style={HEADER_STYLE}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>
            Distribución por severidad
          </span>
        </div>
        <div style={{ padding: "12px 16px 8px" }}>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={barData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="severidad"
                tick={{ fontSize: 10, fill: "#64748b", fontFamily: "Syne, sans-serif" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b", fontFamily: "Syne, sans-serif" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                {barData.map(entry => (
                  <Cell key={entry.severidad} fill={COLORES[entry.severidad]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex gap-4 mt-1">
            {barData.map(d => (
              <div key={d.severidad} className="flex items-center gap-1">
                <span style={{
                  width: "6px", height: "6px", borderRadius: "50%",
                  background: COLORES[d.severidad], display: "inline-block",
                }} />
                <span style={{ fontSize: "10px", color: "var(--txt2)" }}>
                  {d.severidad}: {d.cantidad}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
