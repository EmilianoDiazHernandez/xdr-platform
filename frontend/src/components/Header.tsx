import { useEffect, useState } from "react";
import { Menu, Shield, Download, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { REPORT_BASE_URL } from "../api/config";
import { EstadoReporte } from "../types";

interface HeaderProps {
  titulo: string;
  onToggleSidebar?: () => void;
}

export function Header({ titulo, onToggleSidebar }: HeaderProps) {
  const [ahora, setAhora] = useState(new Date());
  const [estadoReporte, setEstadoReporte] = useState<EstadoReporte>("listo");
  const [formatoReporte, setFormatoReporte] = useState<"PDF" | "CSV">("PDF");

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hora = ahora.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const handleDescargarReporte = async () => {
    if (estadoReporte === "generando") return;
    setEstadoReporte("generando");
    try {
      const response = await fetch(`${REPORT_BASE_URL}/reports/generate?n_alertas=50`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Error en el servidor");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `XDR-Report-${Date.now()}.${formatoReporte.toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);

      setEstadoReporte("exito");
    } catch (e) {
      console.error("Error generando reporte:", e);
      setEstadoReporte("error");
    } finally {
      setTimeout(() => setEstadoReporte("listo"), 3500);
    }
  };

  return (
    <header className="flex items-center justify-between flex-shrink-0 px-4 sm:px-6 h-12 bg-slate-900/95 border-b border-slate-800/80 backdrop-blur z-20">
      {/* Lado izquierdo: Botón Menú + Migas de pan contextuales */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors"
            aria-label="Abrir menú de navegación"
            title="Desplegar menú lateral"
          >
            <Menu size={16} />
          </button>
        )}

        <div className="flex items-center gap-2 text-xs truncate">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Shield size={14} className="text-indigo-400 flex-shrink-0" />
            <span className="hidden sm:inline font-medium">Consola SOC</span>
          </div>
          <span className="text-slate-600">/</span>
          <span className="font-semibold text-slate-100 truncate">{titulo}</span>
        </div>
      </div>

      {/* Lado derecho: Acciones rápidas + Monitoreo en vivo + Reloj */}
      <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0">
        {/* Selector de formato y botón de exportación rápido */}
        <div className="hidden md:flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setFormatoReporte("PDF")}
            className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
              formatoReporte === "PDF"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() => setFormatoReporte("CSV")}
            className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
              formatoReporte === "CSV"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            CSV
          </button>

          <button
            type="button"
            onClick={handleDescargarReporte}
            disabled={estadoReporte === "generando"}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30 transition-all disabled:opacity-50"
            title="Exportar reporte forense con las últimas alertas"
          >
            {estadoReporte === "generando" && <Loader2 size={13} className="animate-spin text-indigo-400" />}
            {estadoReporte === "exito" && <CheckCircle size={13} className="text-emerald-400" />}
            {estadoReporte === "error" && <AlertCircle size={13} className="text-red-400" />}
            {estadoReporte === "listo" && <Download size={13} className="text-indigo-400" />}
            <span>
              {estadoReporte === "generando"
                ? "Generando..."
                : estadoReporte === "exito"
                ? "Descargado"
                : estadoReporte === "error"
                ? "Error"
                : `Exportar ${formatoReporte}`}
            </span>
          </button>
        </div>

        {/* Indicador de transmisión en tiempo real */}
        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="hidden xs:inline uppercase">Live Engine</span>
        </div>

        {/* Reloj digital de precisión SOC */}
        <div className="flex items-center px-2.5 py-1 rounded-md bg-slate-950/70 border border-slate-800 text-slate-300 font-mono text-xs">
          <span>{hora}</span>
        </div>
      </div>
    </header>
  );
}
