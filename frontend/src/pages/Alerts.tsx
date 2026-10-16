import { useEffect, useState, useMemo } from "react";
import { fetchAlertas, updateAlertStatus } from "../api/config";
import { Alerta, EstadoAlerta, DisposicionAlerta, PageId } from "../types";
import { getSeverityStyle, getVectorStyle, formatTimestamp } from "../lib/design-tokens";
import { fechaDe, sufijoArchivo } from "../lib/format";
import { generarCsv } from "../lib/csv";
import { descargarBlob } from "../lib/download";
import { Search, Filter, ArrowUpRight, ShieldAlert, RefreshCw, Download } from "lucide-react";
import { AlertStatusDropdown } from "../components/AlertStatusDropdown";
import { DispositionModal } from "../components/DispositionModal";

/* ─── Filtros persistentes (CU-06) y exportación CSV (CU-12) ─── */

const FILTROS_KEY = "xdr.filtros.alertas";

const MSG_RANGO_INVALIDO = "La fecha de inicio no puede ser posterior a la fecha de fin.";
const MSG_SIN_RESULTADOS = "No se encontraron alertas con los criterios seleccionados.";
const MSG_SIN_EXPORTAR   = "Sin alertas para exportar con los filtros actuales.";

const CSV_ENCABEZADOS = ["ID", "IP origen", "IP destino", "protocolo", "timestamp", "severidad", "descripción"] as const;

interface FiltrosGuardados {
  busqueda:  string;
  severidad: string; // "todas" | "crítica" | "alta" | "media" | "baja"
  desde:     string; // YYYY-MM-DD o ""
  hasta:     string;
}

const FILTROS_VACIOS: FiltrosGuardados = { busqueda: "", severidad: "todas", desde: "", hasta: "" };

function leerFiltros(): FiltrosGuardados {
  try {
    const raw = sessionStorage.getItem(FILTROS_KEY);
    if (!raw) return FILTROS_VACIOS;
    const p: unknown = JSON.parse(raw);
    if (typeof p !== "object" || p === null) return FILTROS_VACIOS;
    const v = p as Record<string, unknown>;
    const texto = (x: unknown, def: string) => (typeof x === "string" ? x : def);
    return {
      busqueda:  texto(v.busqueda, ""),
      severidad: texto(v.severidad, "todas"),
      desde:     texto(v.desde, ""),
      hasta:     texto(v.hasta, ""),
    };
  } catch {
    return FILTROS_VACIOS;
  }
}

function guardarFiltros(f: FiltrosGuardados): void {
  try {
    sessionStorage.setItem(FILTROS_KEY, JSON.stringify(f));
  } catch {
    // Almacenamiento no disponible: los filtros solo duran mientras la vista esté montada
  }
}

export function Alerts({
  onNavegar,
  eventoSeleccionado: _eventoSeleccionado,
}: {
  onNavegar?: (pagina: PageId, param?: string) => void;
  eventoSeleccionado?: string | null;
} = {}) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [inicial] = useState(leerFiltros);
  const [busqueda, setBusqueda] = useState(inicial.busqueda);
  const [filtroSeveridad, setFiltroSeveridad] = useState<string>(inicial.severidad);
  const [filtroVector, setFiltroVector] = useState<string>("todos");
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [avisoExportar, setAvisoExportar] = useState<string | null>(null);

  useEffect(() => {
    guardarFiltros({ busqueda, severidad: filtroSeveridad, desde, hasta });
  }, [busqueda, filtroSeveridad, desde, hasta]);

  useEffect(() => {
    if (!avisoExportar) return;
    const t = setTimeout(() => setAvisoExportar(null), 4000);
    return () => clearTimeout(t);
  }, [avisoExportar]);

  const rangoInvalido = desde !== "" && hasta !== "" && desde > hasta;
  const hayFiltros = busqueda !== "" || filtroSeveridad !== "todas" || filtroVector !== "todos" || desde !== "" || hasta !== "";

  const restablecerFiltros = () => {
    setBusqueda("");
    setFiltroSeveridad("todas");
    setFiltroVector("todos");
    setDesde("");
    setHasta("");
  };

  // Estado local para persistir el ciclo de vida sin que el polling de 3s lo sobreescriba
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string | number, { estado: EstadoAlerta; disposicion?: DisposicionAlerta }>
  >({});
  const [resolvingAlert, setResolvingAlert] = useState<Alerta | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const alData = await fetchAlertas();
        setAlertas(alData);
      } catch (e) {
        console.error("Error loading alerts page data", e);
      }
      setLoading(false);
    }
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fusión reactiva de alertas con su estado de ciclo de vida
  const alertasConEstado = useMemo(() => {
    return alertas.map((al) => {
      const override = statusOverrides[al.id];
      return {
        ...al,
        estado: override?.estado ?? al.estado ?? "Nueva/Abierta",
        disposicion: override?.disposicion ?? al.disposicion,
      };
    });
  }, [alertas, statusOverrides]);

  // Manejador del ciclo de vida (preparado para backend Spring Boot / FastAPI)
  const handleStatusChange = async (
    id: number | string,
    nuevoEstado: EstadoAlerta,
    nuevaDisposicion?: DisposicionAlerta
  ) => {
    // Actualización reactiva optimista
    setStatusOverrides((prev) => ({
      ...prev,
      [id]: { estado: nuevoEstado, disposicion: nuevaDisposicion },
    }));

    try {
      await updateAlertStatus(id, nuevoEstado, nuevaDisposicion);
    } catch (err) {
      console.error("Error al persistir estado en backend:", err);
    }
  };

  // Filtrado reactivo en tiempo real
  const alertasFiltradas = useMemo(() => {
    return alertasConEstado.filter((al) => {
      // Filtro de severidad
      if (filtroSeveridad !== "todas") {
        const sevStyle = getSeverityStyle(al.severidad);
        if (sevStyle.label.toLowerCase() !== filtroSeveridad.toLowerCase()) {
          return false;
        }
      }

      // Filtro de vector
      if (filtroVector !== "todos") {
        const vecStyle = getVectorStyle(al.vector_origen || al.descripcion);
        if (!vecStyle.label.toLowerCase().includes(filtroVector.toLowerCase())) {
          return false;
        }
      }

      // Filtro por rango de fechas (con un rango inválido no se aplica)
      if (!rangoInvalido) {
        const dia = fechaDe(al.timestamp);
        if (desde && dia < desde) return false;
        if (hasta && dia > hasta) return false;
      }

      // Filtro de texto libre (IP, descripción, técnica MITRE, software, estado o disposición)
      if (busqueda.trim()) {
        const query = busqueda.toLowerCase().trim();
        const matchesIp = (al.ip_origen || "").toLowerCase().includes(query);
        const matchesDesc = (al.descripcion || "").toLowerCase().includes(query);
        const matchesMitre = (al.mitre_technique_id || "").toLowerCase().includes(query);
        const matchesTool = (al.mitre_software_id || "").toLowerCase().includes(query);
        const matchesEstado = (al.estado || "").toLowerCase().includes(query);
        const matchesDisp = (al.disposicion || "").toLowerCase().includes(query);
        return matchesIp || matchesDesc || matchesMitre || matchesTool || matchesEstado || matchesDisp;
      }

      return true;
    });
  }, [alertasConEstado, filtroSeveridad, filtroVector, busqueda, desde, hasta, rangoInvalido]);

  const handleExportarCsv = () => {
    if (alertasFiltradas.length === 0) {
      setAvisoExportar(MSG_SIN_EXPORTAR);
      return;
    }
    const filas = alertasFiltradas.map(al => [
      al.id, al.ip_origen, al.ip_destino, al.protocolo, al.timestamp, al.severidad, al.descripcion,
    ]);
    descargarBlob(generarCsv(CSV_ENCABEZADOS, filas), `ALERTAS-${sufijoArchivo(new Date())}.csv`);
  };

  const conteoSeveridades = useMemo(() => {
    return {
      todas: alertas.length,
      critica: alertas.filter(a => getSeverityStyle(a.severidad).label === "CRÍTICA").length,
      alta: alertas.filter(a => getSeverityStyle(a.severidad).label === "ALTA").length,
      media: alertas.filter(a => getSeverityStyle(a.severidad).label === "MEDIA").length,
      baja: alertas.filter(a => getSeverityStyle(a.severidad).label === "BAJA").length,
    };
  }, [alertas]);

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4 max-w-7xl mx-auto w-full h-full min-h-0">
      {/* Encabezado contextual */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-800/60 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
            <span>Detecciones y Alertas Individuales</span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {alertas.length} registros
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Telemetría granular multi-capa: Red (Zeek), Endpoint (Sysmon/EDR) y Correo sincronizados con AlienVault OTX
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          {loading && <RefreshCw size={13} className="animate-spin text-indigo-400" />}
          <span className="font-mono text-[11px]">Sincronización activa</span>
        </div>
      </div>

      {/* Barra de herramientas: Búsqueda rápida + Pestañas de severidad */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 flex-shrink-0 bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
        {/* Input de Búsqueda */}
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por IP, técnica MITRE, descripción o tool..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Píldoras de Filtro por Severidad */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 custom-scrollbar">
          <button
            onClick={() => setFiltroSeveridad("todas")}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
              filtroSeveridad === "todas"
                ? "bg-slate-800 text-white border-slate-700 shadow-sm"
                : "bg-slate-950/60 text-slate-400 border-slate-800/60 hover:text-slate-200"
            }`}
          >
            Todas ({conteoSeveridades.todas})
          </button>
          <button
            onClick={() => setFiltroSeveridad("crítica")}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
              filtroSeveridad === "crítica"
                ? "bg-red-500/20 text-red-300 border-red-500/40 shadow-sm"
                : "bg-slate-950/60 text-slate-400 border-slate-800/60 hover:text-red-400"
            }`}
          >
            Crítica ({conteoSeveridades.critica})
          </button>
          <button
            onClick={() => setFiltroSeveridad("alta")}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
              filtroSeveridad === "alta"
                ? "bg-orange-500/20 text-orange-300 border-orange-500/40 shadow-sm"
                : "bg-slate-950/60 text-slate-400 border-slate-800/60 hover:text-orange-400"
            }`}
          >
            Alta ({conteoSeveridades.alta})
          </button>
          <button
            onClick={() => setFiltroSeveridad("media")}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
              filtroSeveridad === "media"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm"
                : "bg-slate-950/60 text-slate-400 border-slate-800/60 hover:text-amber-400"
            }`}
          >
            Media ({conteoSeveridades.media})
          </button>
          <button
            onClick={() => setFiltroSeveridad("baja")}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
              filtroSeveridad === "baja"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm"
                : "bg-slate-950/60 text-slate-400 border-slate-800/60 hover:text-emerald-400"
            }`}
          >
            Baja ({conteoSeveridades.baja})
          </button>
        </div>
      </div>

      {/* Rango de fechas + exportación CSV */}
      <div className="flex flex-wrap items-end gap-3 flex-shrink-0 bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
        <div>
          <label htmlFor="filtro-desde" className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Desde
          </label>
          <input
            id="filtro-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
          />
        </div>
        <div>
          <label htmlFor="filtro-hasta" className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Hasta
          </label>
          <input
            id="filtro-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          {rangoInvalido && (
            <span role="alert" className="text-xs text-amber-400">{MSG_RANGO_INVALIDO}</span>
          )}
          {avisoExportar && (
            <span role="status" className="text-xs text-amber-400">{avisoExportar}</span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {hayFiltros && (
            <button
              onClick={restablecerFiltros}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border bg-slate-950/60 text-slate-400 border-slate-800/60 hover:text-slate-200 transition-colors"
            >
              Restablecer filtros
            </button>
          )}
          <button
            onClick={handleExportarCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors"
          >
            <Download size={13} />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Tabla de Alertas de Alta Densidad SOC */}
      <div className="flex-1 min-h-0 bg-slate-900/90 border border-slate-800/80 rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs table-auto">
            <thead className="sticky top-0 bg-slate-950/95 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider z-10">
              <tr>
                <th className="py-2.5 px-3.5 w-44 font-semibold">Estado</th>
                <th className="py-2.5 px-3.5 w-28 font-semibold">Vector</th>
                <th className="py-2.5 px-3.5 w-36 font-semibold">IP / Host</th>
                <th className="py-2.5 px-3.5 max-w-[420px] w-[380px] font-semibold">Descripción del Evento</th>
                <th className="py-2.5 px-3.5 w-28 font-semibold">Técnica</th>
                <th className="py-2.5 px-3.5 w-28 font-semibold">Software</th>
                <th className="py-2.5 px-3.5 w-24 font-semibold">Severidad</th>
                <th className="py-2.5 px-3.5 w-36 font-semibold">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {alertasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <Filter size={24} className="opacity-40" />
                      <p className="text-xs">{MSG_SIN_RESULTADOS}</p>
                      {hayFiltros && (
                        <button
                          onClick={restablecerFiltros}
                          className="text-xs text-indigo-400 hover:underline mt-1"
                        >
                          Restablecer filtros
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                alertasFiltradas.map((al, idx) => {
                  const vs = getVectorStyle(al.vector_origen || al.descripcion);
                  const ss = getSeverityStyle(al.severidad);

                  return (
                    <tr
                      key={al.id || idx}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Estado del Ciclo de Vida (Ubicado antes de Vector) */}
                      <td className="py-2 px-3.5 whitespace-nowrap">
                        <AlertStatusDropdown
                          estado={al.estado}
                          disposicion={al.disposicion}
                          onSelectStatus={(nuevoEstado) => {
                            if (nuevoEstado === "Resuelta") {
                              setResolvingAlert(al);
                            } else {
                              handleStatusChange(al.id, nuevoEstado);
                            }
                          }}
                        />
                      </td>

                      {/* Vector de ataque */}
                      <td className="py-2 px-3.5 whitespace-nowrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${vs.badgeClass}`}>
                          {vs.label}
                        </span>
                      </td>

                      {/* IP con link interactivo a Topología */}
                      <td className="py-2 px-3.5 whitespace-nowrap">
                        {al.ip_origen ? (
                          <button
                            type="button"
                            onClick={() => onNavegar && onNavegar("topologia", al.ip_origen)}
                            className="inline-flex items-center gap-1 font-mono text-sky-400 hover:text-sky-300 hover:underline bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 px-1.5 py-0.5 rounded transition-colors text-[11px]"
                            title={`Ver activo ${al.ip_origen} en el mapa de Topología`}
                          >
                            <span>{al.ip_origen}</span>
                            <ArrowUpRight size={11} className="opacity-70" />
                          </button>
                        ) : (
                          <span className="text-slate-600 font-mono">-</span>
                        )}
                      </td>

                      {/* Descripción con límite de ancho y soporte para palabras largas continuas */}
                      <td className="py-2 px-3.5 text-slate-200 max-w-[420px] w-[380px]">
                        <p className="leading-relaxed text-xs break-words [overflow-wrap:anywhere] break-all whitespace-normal">
                          {al.descripcion}
                        </p>
                      </td>

                      {/* Técnica MITRE */}
                      <td className="py-2 px-3.5 whitespace-nowrap">
                        {al.mitre_technique_id ? (
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            {al.mitre_technique_id}
                          </span>
                        ) : (
                          <span className="text-slate-600 font-mono text-[11px]">-</span>
                        )}
                      </td>

                      {/* Tool/Software MITRE */}
                      <td className="py-2 px-3.5 whitespace-nowrap">
                        {al.mitre_software_id ? (
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-pink-500/15 text-pink-300 border border-pink-500/30">
                            {al.mitre_software_id}
                          </span>
                        ) : (
                          <span className="text-slate-600 font-mono text-[11px]">-</span>
                        )}
                      </td>

                      {/* Severidad */}
                      <td className="py-2 px-3.5 whitespace-nowrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${ss.badgeClass}`}>
                          {ss.label}
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="py-2 px-3.5 whitespace-nowrap font-mono text-[11px] text-slate-400">
                        {formatTimestamp(al.timestamp)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pie de tabla con resumen */}
        <div className="py-2 px-4 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400 font-mono flex-shrink-0">
          <span>
            Mostrando {alertasFiltradas.length} de {alertas.length} detecciones
          </span>
          <div className="flex items-center gap-1.5 text-slate-500">
            <ShieldAlert size={12} className="text-indigo-400" />
            <span>XDR Engine Active</span>
          </div>
        </div>
      </div>

      {/* Modal de Disposición Condicional (Exclusivo para estado 'Resuelta') */}
      <DispositionModal
        isOpen={Boolean(resolvingAlert)}
        alerta={resolvingAlert}
        onClose={() => setResolvingAlert(null)}
        onConfirm={(disposicion) => {
          if (resolvingAlert) {
            handleStatusChange(resolvingAlert.id, "Resuelta", disposicion);
          }
        }}
      />
    </div>
  );
}
