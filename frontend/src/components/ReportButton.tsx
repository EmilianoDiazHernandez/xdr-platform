import { useState } from "react";
import { Download, Loader, CheckCircle, XCircle } from "lucide-react";
import { EstadoReporte } from "../types";

export function ReportButton() {
  const [estado, setEstado] = useState<EstadoReporte>("listo");
  const [formato, setFormato] = useState<"PDF" | "CSV">("PDF");

  const handleGenerar = async () => {
    if (estado === "generando") return;
    setEstado("generando");
    try {
      // C1: simulado — C2: llamada real a FastAPI localhost:8000/api/reportes/generar
      await new Promise(res => setTimeout(res, 2500));
      setEstado("exito");
    } catch {
      setEstado("error");
    } finally {
      setTimeout(() => setEstado("listo"), 4000);
    }
  };

  const config: Record<EstadoReporte, { label: string; Icon: React.ElementType; style: React.CSSProperties }> = {
    listo:     { label: `Generar reporte ${formato}`, Icon: Download,     style: { background: "#7c3aed", color: "#fff", cursor: "pointer" } },
    generando: { label: "Generando...",               Icon: Loader,       style: { background: "#4f46e5", color: "#fff", cursor: "default", opacity: 0.8 } },
    exito:     { label: "Reporte generado",           Icon: CheckCircle,  style: { background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)", cursor: "default" } },
    error:     { label: "Error al generar",           Icon: XCircle,      style: { background: "rgba(239,68,68,0.15)",  color: "#ef4444",  border: "1px solid rgba(239,68,68,0.3)",  cursor: "default" } },
  };

  const { label, Icon, style } = config[estado];

  return (
    <div
      style={{
        background: "var(--bg3)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "16px",
      }}
    >
      <p style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "12px" }}>
        Generar reporte
      </p>

      {/* Format selector */}
      <div className="flex gap-2 mb-3">
        {(["PDF", "CSV"] as const).map(fmt => (
          <button
            key={fmt}
            onClick={() => setFormato(fmt)}
            style={{
              flex: 1,
              padding: "6px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 600,
              fontFamily: "Syne, sans-serif",
              cursor: "pointer",
              transition: "all 0.15s",
              background: formato === fmt ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${formato === fmt ? "rgba(124,58,237,0.3)" : "rgba(255,255,255,0.12)"}`,
              color: formato === fmt ? "#c4b5fd" : "var(--txt2)",
            }}
          >
            {fmt}
          </button>
        ))}
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerar}
        disabled={estado === "generando"}
        className="flex items-center justify-center gap-2 w-full"
        style={{
          padding: "10px",
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: 700,
          fontFamily: "Syne, sans-serif",
          border: "none",
          transition: "background 0.15s",
          ...style,
        }}
      >
        <Icon
          size={15}
          style={{ flexShrink: 0, animation: estado === "generando" ? "spin 1s linear infinite" : "none" }}
        />
        {label}
      </button>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
