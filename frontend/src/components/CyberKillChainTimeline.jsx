import React from "react";

/**
 * CyberKillChainTimeline
 * Visualización cronológica de la progresión táctica (Cyber Kill Chain)
 * utilizando Tailwind CSS puro sin dependencias complejas.
 *
 * @param {Object} props
 * @param {Array} props.timeline - Arreglo de pasos validados (KillChainStepResponse)
 */
export function CyberKillChainTimeline({ timeline = [] }) {
  if (!timeline || timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900/60 rounded-xl border border-slate-800">
        <svg
          className="w-10 h-10 text-slate-600 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <p className="text-sm font-semibold text-slate-300">
          Sin eventos tácticos registrados
        </p>
        <p className="text-xs text-slate-500 mt-1">
          No hay alertas asociadas a una cadena de ataque activa para este incidente.
        </p>
      </div>
    );
  }

  // Clases dinámicas de Tailwind según el vector
  const getVectorStyles = (vector = "") => {
    const v = vector.toLowerCase();
    if (v.includes("email")) {
      return {
        dotBg: "bg-blue-500 ring-blue-950",
        badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
        label: "Email",
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ),
      };
    }
    if (v.includes("endpoint")) {
      return {
        dotBg: "bg-purple-500 ring-purple-950",
        badge: "bg-purple-500/15 text-purple-400 border-purple-500/30",
        label: "Endpoint",
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ),
      };
    }
    // Default Network
    return {
      dotBg: "bg-emerald-500 ring-emerald-950",
      badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      label: "Network",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      ),
    };
  };

  // Clases dinámicas de Tailwind según la severidad
  const getSeverityStyles = (severidad = "") => {
    const s = severidad.toLowerCase();
    if (s.includes("crítica") || s.includes("critica")) {
      return {
        cardBorder: "border-l-4 border-l-red-500 border-red-500/30 bg-red-950/10",
        badge: "bg-red-500/20 text-red-400 border-red-500/30",
      };
    }
    if (s.includes("alta")) {
      return {
        cardBorder: "border-l-4 border-l-orange-500 border-orange-500/30 bg-orange-950/10",
        badge: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      };
    }
    if (s.includes("media")) {
      return {
        cardBorder: "border-l-4 border-l-amber-500 border-amber-500/30 bg-amber-950/10",
        badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      };
    }
    // Baja
    return {
      cardBorder: "border-l-4 border-l-emerald-500 border-emerald-500/30 bg-emerald-950/10",
      badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    };
  };

  return (
    <div className="w-full py-2">
      {/* Contenedor relativo con línea vertical continua */}
      <div className="relative pl-6 sm:pl-8 ml-3 sm:ml-4 border-l-2 border-slate-700/80 space-y-6">
        {timeline.map((step, index) => {
          const vectorStyles = getVectorStyles(step.vector);
          const severityStyles = getSeverityStyles(step.severidad);
          const formattedTime = step.timestamp
            ? step.timestamp.replace("T", " ").split(".")[0]
            : "";

          return (
            <div key={step.id_alerta || index} className="relative group">
              {/* Punto indicador sobre la línea continua */}
              <div
                className={`absolute -left-[31px] sm:-left-[39px] mt-1.5 flex h-6 w-6 items-center justify-center rounded-full text-white font-mono text-xs font-bold ring-4 transition-transform group-hover:scale-110 ${vectorStyles.dotBg}`}
              >
                {index + 1}
              </div>

              {/* Tarjeta del paso táctico */}
              <div
                className={`p-4 rounded-xl border backdrop-blur-sm transition-all hover:bg-slate-800/40 ${severityStyles.cardBorder}`}
              >
                {/* Encabezado: MITRE ATT&CK Tactic + Technique + Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Táctica MITRE destacada */}
                    {step.mitre_tactic ? (
                      <span className="text-xs font-bold text-white tracking-wide uppercase bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700">
                        {step.mitre_tactic}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded">
                        Táctica N/A
                      </span>
                    )}

                    {/* Técnica MITRE */}
                    {step.mitre_technique_id && (
                      <span className="text-xs font-mono font-bold text-violet-400 bg-violet-500/15 px-2 py-0.5 rounded border border-violet-500/30">
                        {step.mitre_technique_id}
                      </span>
                    )}

                    {/* Vector de ataque */}
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${vectorStyles.badge}`}
                    >
                      {vectorStyles.icon}
                      {vectorStyles.label}
                    </span>
                  </div>

                  {/* Severidad y Timestamp */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${severityStyles.badge}`}
                    >
                      {step.severidad}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {formattedTime}
                    </span>
                  </div>
                </div>

                {/* Cuerpo: Descripción del evento */}
                <p className="text-xs text-slate-200 leading-relaxed break-words">
                  {step.descripcion}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CyberKillChainTimeline;
