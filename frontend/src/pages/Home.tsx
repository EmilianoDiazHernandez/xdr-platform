import { KPICards }     from "../components/KPICards";
import { StatusPanel }  from "../components/StatusPanel";
import { AlertList }    from "../components/AlertList";
import { ReportButton } from "../components/ReportButton";
import { AlertChart }   from "../components/AlertChart";
import { ALERTAS_MOCK, SERVICIOS_MOCK } from "../mocks/alertas";
import { useState, useEffect } from "react";
import { Alerta } from "../types";

export function Home() {
  const [alertas, setAlertas] = useState<Alerta[]>(ALERTAS_MOCK);

  useEffect(() => {
    const fetchAlertas = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/v1/alertas");
        if (response.ok) {
          const data = await response.json();
          setAlertas(data);
        }
      } catch (error) {
        console.error("Error fetching alertas:", error);
      }
    };

    fetchAlertas();
    const interval = setInterval(fetchAlertas, 5000);
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
      <StatusPanel servicios={SERVICIOS_MOCK} />

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
