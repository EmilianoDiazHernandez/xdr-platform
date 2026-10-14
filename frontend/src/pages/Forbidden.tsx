import { ShieldX, ArrowLeft } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { defaultPageFor } from "../auth/permissions";
import type { PageId } from "../types";

interface ForbiddenProps {
  onVolver: (pagina: PageId) => void;
}

export function Forbidden({ onVolver }: ForbiddenProps) {
  const { session } = useAuth();
  if (!session) return null;

  return (
    <div
      className="flex flex-col items-center justify-center p-8 text-center"
      style={{ flex: 1, minHeight: "100%", gap: "12px" }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: "48px", height: "48px", borderRadius: "10px",
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
        }}
      >
        <ShieldX size={22} style={{ color: "#ef4444" }} />
      </div>
      <p style={{ fontSize: "20px", fontWeight: 800, color: "var(--txt)" }}>Acceso denegado (403)</p>
      <p style={{ fontSize: "12px", color: "var(--txt3)", maxWidth: "340px" }}>
        Tu rol no tiene permisos para ver esta sección.
      </p>
      <button
        onClick={() => onVolver(defaultPageFor(session.user.role))}
        className="flex items-center gap-2"
        style={{
          marginTop: "8px",
          padding: "8px 14px",
          borderRadius: "8px",
          fontSize: "12px",
          fontWeight: 700,
          fontFamily: "Syne, sans-serif",
          border: "none",
          color: "#fff",
          background: "#7c3aed",
          cursor: "pointer",
        }}
      >
        <ArrowLeft size={14} />
        Volver a mi vista principal
      </button>
    </div>
  );
}
