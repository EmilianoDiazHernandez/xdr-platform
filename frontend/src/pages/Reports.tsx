import { FileText } from "lucide-react";
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-[14px] items-start">
        <div
          style={{
            background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "16px",
          }}
        >
          <div className="flex items-center gap-2" style={{ marginBottom: "10px" }}>
            <FileText size={15} style={{ color: "#c4b5fd" }} />
            <p style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Contenido del reporte</p>
          </div>
          <p style={{ fontSize: "12px", color: "var(--txt2)", lineHeight: 1.6 }}>
            El reporte se genera en formato PDF con las 50 alertas más recientes registradas por la
            plataforma: identificador, dirección IP de origen, fecha y hora de detección, nivel de
            severidad y descripción del evento. El archivo se descarga automáticamente con el nombre
            <code style={{ color: "#c4b5fd", margin: "0 4px", fontSize: "11px" }}>ALERTAS-AAAAMMDD-HHmm.pdf</code>
            para facilitar su archivo y trazabilidad.
          </p>
          <p style={{ fontSize: "11px", color: "var(--txt3)", marginTop: "10px" }}>
            Para exportar únicamente un subconjunto de alertas, aplique filtros en la vista
            Alertas y use la opción «Exportar CSV».
          </p>
        </div>

        <ReportButton />
      </div>
    </div>
  );
}
