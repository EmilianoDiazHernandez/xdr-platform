import { useEffect, useState } from "react";
import { KPICards }     from "../components/KPICards";
import { StatusPanel }  from "../components/StatusPanel";
import { AlertList }    from "../components/AlertList";
import { AlertChart }   from "../components/AlertChart";
import { Alerta, EstadoServicio, CorrelatedEvent, EstadoReporte, PageId } from "../types";
import { fetchAlertas, fetchHealth, fetchEvents, REPORT_BASE_URL } from "../api/config";
import { apiBlob, REPORT_TIMEOUT_MS } from "../api/client";
import { generarCsv } from "../lib/csv";
import { descargarBlob } from "../lib/download";
import { sufijoArchivo } from "../lib/format";
import { Download, Loader2, CheckCircle, AlertCircle } from "lucide-react";

const CSV_ENCABEZADOS = ["ID", "IP origen", "IP destino", "protocolo", "timestamp", "severidad", "descripción"] as const;

export function Home({ onNavegar }: { onNavegar?: (pagina: PageId, param?: string) => void }) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [servicios, setServicios] = useState<EstadoServicio[]>([]);
  const [estadoReporte, setEstadoReporte] = useState<EstadoReporte>("listo");
  const [formatoReporte, setFormatoReporte] = useState<"PDF" | "CSV">("PDF");

  useEffect(() => {
    async function cargarDatos() {
      try {
        const dataAlertas = await fetchAlertas();
        
        let generalEventAlerts: Alerta[] = [];
        try {
          const events: CorrelatedEvent[] = await fetchEvents();
          generalEventAlerts = events
            .filter(e => e.status === "Abierto")
            .map(e => ({
              id: e.id,
              ip_origen: e.target_node,
              timestamp: e.last_update.replace("T", " ").split(".")[0],
              severidad: e.severity >= 3 ? "Alta" : (e.severity === 2 ? "Media" : "Baja"),
              descripcion: `[EVENTO GENERAL] Ataque detectado con ${e.attack_flow?.length || 0} paso(s).`,
              isGeneralEvent: true
            }));
        } catch (err) {
          console.warn("Could not fetch events:", err);
        }
        
        setAlertas([...generalEventAlerts, ...dataAlertas]);

        const health = await fetchHealth();
        const servs: EstadoServicio[] = [
          { nombre: "Capa Red", activo: health.capas.red.activa, ultima_verificacion: new Date().toISOString() },
          { nombre: "Capa Endpoint", activo: health.capas.endpoint.activa, ultima_verificacion: new Date().toISOString() },
          { nombre: "Capa Email", activo: health.capas.email.activa, ultima_verificacion: new Date().toISOString() },
          { nombre: "Redis Fusion", activo: health.redis.activo, ultima_verificacion: new Date().toISOString() },
        ];
        setServicios(servs);
      } catch (e) {
        console.error("Error cargando dashboard:", e);
      }
    }

    cargarDatos();
    const interval = setInterval(cargarDatos, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleDescargarReporte = async () => {
    if (estadoReporte === "generando") return;
    setEstadoReporte("generando");
    try {
      // Nombre de descarga según RF15: ALERTAS-YYYYMMDD-HHmm.<ext>
      const nombre = `ALERTAS-${sufijoArchivo(new Date())}.${formatoReporte.toLowerCase()}`;
      if (formatoReporte === "PDF") {
        const blob = await apiBlob(REPORT_BASE_URL, "/reports/generate?n_alertas=50", {
          method: "POST",
          timeoutMs: REPORT_TIMEOUT_MS,
        });
        descargarBlob(blob, nombre);
      } else {
        // CSV generado en el cliente con las alertas individuales cargadas (sin eventos agregados)
        const filas = alertas
          .filter(a => !a.isGeneralEvent)
          .map(a => [a.id, a.ip_origen, a.ip_destino, a.protocolo, a.timestamp, a.severidad, a.descripcion]);
        if (filas.length === 0) throw new Error("Sin alertas para exportar");
        descargarBlob(generarCsv(CSV_ENCABEZADOS, filas), nombre);
      }

      setEstadoReporte("exito");
    } catch (e) {
      console.error("Error generando reporte:", e);
      setEstadoReporte("error");
    } finally {
      setTimeout(() => setEstadoReporte("listo"), 3500);
    }
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5 max-w-7xl mx-auto w-full">
      {/* Encabezado contextual con botón de exportación */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">
            Panel de Control
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Monitoreo unificado y detección forense multi-capa en tiempo real
          </p>
        </div>

        {/* Controles de Exportación de Reporte Forense */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-lg p-1 shadow-sm">
          <div className="flex items-center bg-slate-950 rounded-md p-0.5 border border-slate-800/80">
            <button
              type="button"
              onClick={() => setFormatoReporte("PDF")}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
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
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                formatoReporte === "CSV"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              CSV
            </button>
          </div>

          <button
            type="button"
            onClick={handleDescargarReporte}
            disabled={estadoReporte === "generando"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all disabled:opacity-50"
            title="Generar y descargar reporte con los datos actuales"
          >
            {estadoReporte === "generando" && <Loader2 size={13} className="animate-spin" />}
            {estadoReporte === "exito" && <CheckCircle size={13} className="text-emerald-300" />}
            {estadoReporte === "error" && <AlertCircle size={13} className="text-red-300" />}
            {estadoReporte === "listo" && <Download size={13} />}
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
      </div>

      {/* Fila 1: KPIs Principales (4 columnas simétricas) */}
      <KPICards alertas={alertas} />

      {/* Fila 2: Estado de Sensores y Servicios (4 columnas simétricas alineadas) */}
      <StatusPanel servicios={servicios} />

      {/* Fila 3: Alertas Recientes + Gráficas Forenses (Emparejadas simétricamente en altura) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <AlertList alertas={alertas} onNavegar={onNavegar} />
        <AlertChart alertas={alertas} />
      </div>
    </div>
  );
}
