import { useEffect, useState } from "react";
import { KPICards }     from "../components/KPICards";
import { StatusPanel }  from "../components/StatusPanel";
import { AlertList }    from "../components/AlertList";
import { AlertChart }   from "../components/AlertChart";
import { Alerta, EstadoServicio, CorrelatedEvent, PageId } from "../types";
import { fetchAlertas, fetchHealth, fetchEvents } from "../api/config";

export function Home({ onNavegar }: { onNavegar?: (pagina: PageId, param?: string) => void }) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [servicios, setServicios] = useState<EstadoServicio[]>([]);

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
    const interval = setInterval(cargarDatos, 2000); // Polling cada 2s para tiempo real
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">

      {/* Título */}
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
          Panel de Control
        </h1>
        <p style={{ fontSize: "12px", color: "var(--txt2)", marginTop: "2px" }}>
          Monitoreo en tiempo real · Plataforma XDR · ESCOM IPN
        </p>
      </div>

      {/* KPIs */}
      <KPICards alertas={alertas} />

      {/* Estado de servicios */}
      <StatusPanel servicios={servicios} />

      {/* Alertas + Gráficas lado a lado en desktop, apiladas en pantallas pequeñas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[14px] items-start">
        <AlertList alertas={alertas} onNavegar={onNavegar} />
        <AlertChart alertas={alertas} />
      </div>

    </div>
  );
}
