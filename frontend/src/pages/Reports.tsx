import { ReportButton } from "../components/ReportButton";

// CU-08: Generar reporte PDF de alertas
export function Reports() {
  return (
    <div className="p-4 sm:p-6 flex flex-col gap-5">
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
          Reportes PDF
        </h1>
        <p style={{ fontSize: "12px", color: "var(--txt2)", marginTop: "2px" }}>
          Generación de reportes de alertas para documentación y seguimiento de incidentes
        </p>
      </div>

      <div className="w-full sm:w-[320px]">
        <ReportButton />
      </div>
    </div>
  );
}
