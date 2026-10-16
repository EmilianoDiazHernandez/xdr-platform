import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend,
} from "recharts";
import { Alerta } from "../types";
import { TrendingUp, PieChart } from "lucide-react";

const COLORES: Record<string, string> = {
  Alta:  "#f97316",
  Media: "#f59e0b",
  Baja:  "#10b981",
};

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "8px",
  fontSize: "11px",
  color: "#f8fafc",
  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
};

function generarDatosTiempo(alertas: Alerta[]) {
  const ahora = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const hora = new Date(ahora);
    hora.setHours(hora.getHours() - (11 - i));
    hora.setMinutes(0, 0, 0);
    const label = hora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

    const base = Math.max(alertas.length, 6);
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
  const barData = ["Alta", "Media", "Baja"].map(sev => ({
    severidad: sev,
    cantidad: alertas.filter(a => a.severidad === sev).length,
  }));

  const lineData = generarDatosTiempo(alertas);

  return (
    <div className="flex flex-col h-[500px] gap-3.5">
      {/* 1 — Ataques vs Tiempo */}
      <div className="flex-1 rounded-xl bg-slate-900/90 border border-slate-800/80 p-3.5 shadow-sm flex flex-col justify-between overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-indigo-400" />
            <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
              Tendencia de Ataques
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Últimas 12 horas</span>
        </div>

        <div className="flex-1 w-full min-h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="hora"
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
              <Legend
                wrapperStyle={{ fontSize: "10px", color: "#94a3b8", paddingTop: "4px" }}
                iconSize={7}
              />
              <Line type="monotone" dataKey="Alta"  stroke="#f97316" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="Media" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="Baja"  stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2 — Distribución por Severidad */}
      <div className="h-[210px] rounded-xl bg-slate-900/90 border border-slate-800/80 p-3.5 shadow-sm flex flex-col justify-between overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
          <div className="flex items-center gap-2">
            <PieChart size={15} className="text-indigo-400" />
            <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
              Distribución por Severidad
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Total {alertas.length}</span>
        </div>

        <div className="flex-1 w-full min-h-[90px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} barSize={34} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="severidad"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                {barData.map(entry => (
                  <Cell key={entry.severidad} fill={COLORES[entry.severidad]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Leyenda de conteo rápido */}
        <div className="flex items-center justify-around pt-2 border-t border-slate-800/80 mt-1">
          {barData.map(d => (
            <div key={d.severidad} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: COLORES[d.severidad] }}
              />
              <span className="text-slate-400 font-medium">{d.severidad}:</span>
              <span className="text-slate-100 font-mono font-bold">{d.cantidad}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
