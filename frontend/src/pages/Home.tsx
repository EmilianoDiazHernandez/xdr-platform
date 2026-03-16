import { KPICards }     from "../components/KPICards";
import { StatusPanel }  from "../components/StatusPanel";
import { AlertList }    from "../components/AlertList";
import { ReportButton } from "../components/ReportButton";
import { AlertChart }   from "../components/AlertChart";
import { ALERTAS_MOCK, SERVICIOS_MOCK } from "../mocks/alertas";

export function Home() {
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
      <KPICards alertas={ALERTAS_MOCK} />

      {/* Estado de servicios */}
      <StatusPanel servicios={SERVICIOS_MOCK} />

      {/* Alertas + Gráficas lado a lado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", alignItems: "start" }}>
        <AlertList alertas={ALERTAS_MOCK} />
        <AlertChart alertas={ALERTAS_MOCK} />
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
