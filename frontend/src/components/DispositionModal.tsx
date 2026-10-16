import { useState } from "react";
import { Alerta, DisposicionAlerta } from "../types";
import { CheckCircle2, X, ShieldAlert, Check } from "lucide-react";

interface DispositionModalProps {
  isOpen: boolean;
  alerta: Alerta | null;
  onClose: () => void;
  onConfirm: (disposition: DisposicionAlerta) => void;
}

const DISPOSICIONES: {
  valor: DisposicionAlerta;
  titulo: string;
  descripcion: string;
  tag: string;
  badgeClass: string;
}[] = [
  {
    valor: "Falso positivo",
    titulo: "Falso positivo",
    descripcion: "Detección errónea o tráfico normal catalogado incorrectamente como amenaza.",
    tag: "FP",
    badgeClass: "bg-slate-800 text-slate-300 border-slate-700",
  },
  {
    valor: "Verdadero positivo - Mitigado",
    titulo: "Verdadero positivo - Mitigado",
    descripcion: "Incidente real confirmado que ya fue contenido, remediado o bloqueado.",
    tag: "TP-MITIGADO",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  {
    valor: "Verdadero positivo - Benigno",
    titulo: "Verdadero positivo - Benigno",
    descripcion: "Actividad real esperada o autorizada (ej. pruebas de seguridad, tareas de administración).",
    tag: "TP-BENIGNO",
    badgeClass: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  },
];

export function DispositionModal({
  isOpen,
  alerta,
  onClose,
  onConfirm,
}: DispositionModalProps) {
  const [seleccion, setSeleccion] = useState<DisposicionAlerta | null>(
    alerta?.disposicion || null
  );

  if (!isOpen || !alerta) return null;

  const handleConfirm = () => {
    if (seleccion) {
      onConfirm(seleccion);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-5 flex flex-col gap-4 text-slate-200 animate-in zoom-in-95"
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 tracking-wide">
                Resolución de Alerta SOC
              </h2>
              <p className="text-xs text-slate-400">
                Selecciona la disposición técnica requerida para marcar como <strong className="text-emerald-400">Resuelta</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 p-1 rounded-md transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Resumen contextual de la alerta */}
        <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 text-xs flex flex-col gap-1.5 font-mono">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <ShieldAlert size={12} className="text-indigo-400" />
              <span>ID #{alerta.id}</span>
            </div>
            <span className="text-sky-400">{alerta.ip_origen || "Host desconocido"}</span>
          </div>
          <p className="text-slate-300 font-sans line-clamp-2 text-xs">
            {alerta.descripcion}
          </p>
        </div>

        {/* Opciones de disposición obligatorias */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-mono uppercase text-slate-400 font-semibold tracking-wider">
            Disposición Requerida *
          </label>
          <div className="flex flex-col gap-2">
            {DISPOSICIONES.map((opcion) => {
              const isSelected = seleccion === opcion.valor;
              return (
                <div
                  key={opcion.valor}
                  onClick={() => setSeleccion(opcion.valor)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    isSelected
                      ? "bg-slate-800/90 border-emerald-500/60 ring-1 ring-emerald-500/40"
                      : "bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700"
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-100">
                        {opcion.titulo}
                      </span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${opcion.badgeClass}`}>
                        {opcion.tag}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {opcion.descripcion}
                    </p>
                  </div>

                  <div className="mt-0.5 flex-shrink-0">
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500 text-slate-950"
                          : "border-slate-700 bg-slate-900"
                      }`}
                    >
                      {isSelected && <Check size={11} strokeWidth={3} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 border border-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!seleccion}
            onClick={handleConfirm}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              seleccion
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm cursor-pointer"
                : "bg-slate-800 text-slate-500 border border-slate-800 cursor-not-allowed"
            }`}
          >
            <CheckCircle2 size={13} />
            <span>Confirmar Resolución</span>
          </button>
        </div>
      </div>
    </div>
  );
}
