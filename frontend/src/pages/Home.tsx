import { useEffect, useState } from "react";
import { KPICards }     from "../components/KPICards";
import { StatusPanel }  from "../components/StatusPanel";
import { AlertList }    from "../components/AlertList";
import { ReportButton } from "../components/ReportButton";
import { AlertChart }   from "../components/AlertChart";
import { Alerta, EstadoServicio } from "../types";
import { fetchAlertas, fetchHealth } from "../api/config";

export function Home() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [servicios, setServicios] = useState<EstadoServicio[]>([]);

  useEffect(() => {
    async function cargarDatos() {
      try {
        const dataAlertas = await fetchAlertas();
        setAlertas(dataAlertas);

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
    const interval = setInterval(cargarDatos, 10000); // Polling cada 10s
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

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

      {/* Alertas + Gráficas lado a lado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", alignItems: "start" }}>
        <AlertList alertas={alertas} />
        <AlertChart alertas={alertas} />
      </div>

      {/* Botón de reporte al fondo */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ width: "260px" }}>
          <ReportButton />
        </div>
      </div>

    </div>
  );
}
