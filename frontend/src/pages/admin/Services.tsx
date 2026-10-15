import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { StatusPanel } from "../../components/StatusPanel";
import { verificarServicios } from "../../api/admin";
import type { EstadoServicio } from "../../types";

// CU-16 / RF37: estado de servicios de la plataforma
export function Services() {
  const [servicios, setServicios] = useState<EstadoServicio[]>([]);
  const [cargando, setCargando] = useState(true);

  const actualizar = useCallback(async () => {
    setCargando(true);
    // verificarServicios nunca rechaza: cada servicio se resuelve por separado (allSettled)
    setServicios(await verificarServicios());
    setCargando(false);
  }, []);

  useEffect(() => {
    actualizar();
  }, [actualizar]);

  const online = servicios.filter(s => !s.desconocido && s.activo).length;
  const offline = servicios.filter(s => !s.desconocido && !s.activo).length;
  const desconocidos = servicios.filter(s => s.desconocido).length;
  const ultima = servicios[0]?.ultima_verificacion;

  const resumen = [
    { label: "Online",      valor: online,       color: "var(--green)" },
    { label: "Offline",     valor: offline,      color: "var(--red)" },
    { label: "Desconocido", valor: desconocidos, color: "#f59e0b" },
  ];

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
            Estado de servicios
          </h1>
          <p style={{ fontSize: "12px", color: "var(--txt2)", marginTop: "2px" }}>
            Disponibilidad de los componentes de la plataforma XDR
            {ultima && !cargando && <> · Última verificación: <span className="font-mono">{new Date(ultima).toLocaleTimeString("es-MX")}</span></>}
          </p>
        </div>
        <button
          onClick={actualizar}
          disabled={cargando}
          className="flex items-center gap-2"
          style={{
            padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
            fontFamily: "Syne, sans-serif", border: "none", color: "#fff", background: "#7c3aed",
            cursor: cargando ? "default" : "pointer", opacity: cargando ? 0.7 : 1,
          }}
        >
          <RefreshCw size={14} style={{ animation: cargando ? "spin 1s linear infinite" : "none" }} />
          {cargando ? "Verificando..." : "Actualizar"}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {resumen.map(r => (
          <div
            key={r.label}
            style={{
              background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "10px",
              padding: "10px 16px", minWidth: "120px",
            }}
          >
            <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--txt3)" }}>
              {r.label}
            </span>
            <p style={{ fontSize: "20px", fontWeight: 800, color: r.color }}>{cargando ? "–" : r.valor}</p>
          </div>
        ))}
      </div>

      {servicios.length > 0 && <StatusPanel servicios={servicios} />}

      <p style={{ fontSize: "11px", color: "var(--txt3)" }}>
        «Desconocido» indica que el servicio no respondió en 2 segundos o que su estado depende de otro servicio sin respuesta.
      </p>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
