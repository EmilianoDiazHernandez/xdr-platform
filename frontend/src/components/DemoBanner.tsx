import { Info } from "lucide-react";

// Aviso para vistas alimentadas con datos mock mientras no existe el endpoint de backend
export function DemoBanner({ texto = "Datos de demostración — pendiente endpoint de backend" }: { texto?: string }) {
  return (
    <div
      role="note"
      className="flex items-center gap-2"
      style={{
        padding: "8px 12px", borderRadius: "8px", fontSize: "12px",
        background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", color: "#93c5fd",
      }}
    >
      <Info size={14} style={{ flexShrink: 0 }} />
      {texto}
    </div>
  );
}
