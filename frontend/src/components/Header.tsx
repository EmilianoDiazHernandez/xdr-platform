import { useEffect, useState } from "react";

export function Header({ titulo }: { titulo: string }) {
  const [ahora, setAhora] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hora = ahora.toLocaleTimeString("es-MX", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <div
      className="flex items-center justify-between flex-shrink-0 px-6"
      style={{
        height: "52px",
        background: "rgba(24,18,32,0.8)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2" style={{ fontSize: "12px" }}>
        <span style={{ color: "var(--txt3)" }}>XDR Platform</span>
        <span style={{ color: "var(--txt3)", fontSize: "10px" }}>›</span>
        <span style={{ color: "var(--txt)", fontWeight: 600 }}>{titulo}</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        {/* Live pill */}
        <div
          className="flex items-center gap-2"
          style={{
            background: "var(--green-bg)",
            border: "1px solid rgba(16,185,129,0.2)",
            borderRadius: "20px",
            padding: "4px 10px",
            fontSize: "9px",
            fontWeight: 700,
            color: "var(--green)",
            textTransform: "uppercase",
            letterSpacing: "0.8px",
          }}
        >
          <span
            style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: "var(--green)",
              animation: "xdr-pulse 2s infinite",
            }}
          />
          Live
        </div>
        {/* Clock */}
        <span
          className="font-mono"
          style={{ fontSize: "11px", color: "var(--txt3)" }}
        >
          {hora}
        </span>
      </div>

      <style>{`
        @keyframes xdr-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
