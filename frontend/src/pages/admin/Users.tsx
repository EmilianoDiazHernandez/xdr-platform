import { useCallback, useEffect, useState, type FormEvent } from "react";
import { UserPlus, Pencil, UserX, UserCheck, X, Loader, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi, AdminError, MODO_MOCK, MSG_CORREO_DUPLICADO } from "../../api/admin";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { ROLE_LABEL, isRole } from "../../auth/roles";
import { DemoBanner } from "../../components/DemoBanner";
import { fechaDe } from "../../lib/format";
import type { CambiosUsuario, Role, UsuarioAdmin } from "../../types";

// CU-15 / RF36: gestión de usuarios. No existe borrado físico: se desactiva la cuenta.

const ROLES = Object.keys(ROLE_LABEL).filter(isRole);

const MSG_NOMBRE      = "El nombre es obligatorio.";
const MSG_CORREO      = "Ingrese un correo electrónico válido.";
const MSG_PASSWORD    = "La contraseña debe tener al menos 8 caracteres.";
const MSG_ROL         = "Seleccione un rol.";
const MSG_CREADO      = "Usuario registrado correctamente.";
const MSG_ACTUALIZADO = "Usuario actualizado correctamente.";
const MSG_DESACTIVADO = "Usuario desactivado correctamente.";
const MSG_ACTIVADO    = "Usuario activado correctamente.";

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

interface Formulario {
  nombre:   string;
  correo:   string;
  role:     Role | "";
  password: string;
}

type ErroresFormulario = Partial<Record<keyof Formulario, string>>;

type Modal = { modo: "crear" } | { modo: "editar"; usuario: UsuarioAdmin };

const FORM_VACIO: Formulario = { nombre: "", correo: "", role: "", password: "" };

function mensajeDeError(e: unknown, porDefecto: string): string {
  return e instanceof AdminError || e instanceof ApiError ? e.message : porDefecto;
}

/* ─── Estilos compartidos ─── */

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.8px",
  textTransform: "uppercase", color: "var(--txt3)", marginBottom: "6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "8px",
  padding: "8px 10px", fontSize: "13px", color: "var(--txt)", outline: "none",
};

const errorCampoStyle: React.CSSProperties = { fontSize: "11px", color: "#ef4444", marginTop: "4px" };

const botonSecundario: React.CSSProperties = {
  padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
  background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--txt2)", cursor: "pointer",
};

function botonPrimario(habilitado: boolean): React.CSSProperties {
  return {
    padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
    fontFamily: "Syne, sans-serif", border: "none", color: "#fff", background: "#7c3aed",
    cursor: habilitado ? "pointer" : "default", opacity: habilitado ? 1 : 0.6,
  };
}

const botonAccion: React.CSSProperties = {
  padding: "5px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
  background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--txt2)",
};

/* ─── Modal crear / editar ─── */

interface UsuarioModalProps {
  modal:      Modal;
  usuarios:   UsuarioAdmin[];
  idPropio:   string;
  onCerrar:   () => void;
  onGuardado: (usuario: UsuarioAdmin, mensaje: string) => void;
}

function UsuarioModal({ modal, usuarios, idPropio, onCerrar, onGuardado }: UsuarioModalProps) {
  const editando = modal.modo === "editar" ? modal.usuario : null;
  const [form, setForm] = useState<Formulario>(
    editando ? { nombre: editando.nombre, correo: editando.correo, role: editando.role, password: "" } : FORM_VACIO,
  );
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const esPropio = editando?.id === idPropio;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !guardando) onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar, guardando]);

  const validar = (): ErroresFormulario => {
    const e: ErroresFormulario = {};
    const correo = form.correo.trim().toLowerCase();
    if (form.nombre.trim() === "") e.nombre = MSG_NOMBRE;
    if (!CORREO_RE.test(correo)) e.correo = MSG_CORREO;
    else if (usuarios.some(u => u.correo === correo && u.id !== editando?.id)) e.correo = MSG_CORREO_DUPLICADO;
    if (form.role === "") e.role = MSG_ROL;
    // En creación la contraseña es obligatoria; en edición solo se valida si se escribe una nueva
    if ((!editando || form.password !== "") && form.password.length < PASSWORD_MIN) e.password = MSG_PASSWORD;
    return e;
  };

  const actualizar = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
    setErrores(prev => ({ ...prev, [campo]: undefined }));
  };

  const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (guardando) return;
    const e = validar();
    setErrores(e);
    setErrorGeneral(null);
    if (Object.values(e).some(Boolean) || form.role === "") return;

    setGuardando(true);
    try {
      if (!editando) {
        const creado = await adminApi.crearUsuario({
          nombre: form.nombre.trim(), correo: form.correo.trim().toLowerCase(), role: form.role, password: form.password,
        });
        onGuardado(creado, MSG_CREADO);
      } else {
        const cambios: CambiosUsuario = {};
        const correo = form.correo.trim().toLowerCase();
        if (form.nombre.trim() !== editando.nombre) cambios.nombre = form.nombre.trim();
        if (correo !== editando.correo) cambios.correo = correo;
        if (!esPropio && form.role !== editando.role) cambios.role = form.role;
        if (form.password !== "") cambios.password = form.password;
        const actualizado = Object.keys(cambios).length > 0
          ? await adminApi.actualizarUsuario(editando.id, cambios)
          : editando;
        onGuardado(actualizado, MSG_ACTUALIZADO);
      }
    } catch (err) {
      const msg = mensajeDeError(err, "No se pudo guardar el usuario.");
      if (msg === MSG_CORREO_DUPLICADO) setErrores(prev => ({ ...prev, correo: msg }));
      else setErrorGeneral(msg);
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget && !guardando) onCerrar(); }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="usuario-modal-titulo"
        className="w-full max-w-md"
        style={{ background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--txt)", borderRadius: "10px" }}
      >
        <form onSubmit={handleSubmit} noValidate>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle id="usuario-modal-titulo" style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
              {editando ? "Editar usuario" : "Nuevo usuario"}
            </CardTitle>
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {errorGeneral && (
              <div role="alert" className="flex items-center gap-2" style={{
                padding: "8px 10px", borderRadius: "8px", fontSize: "12px",
                background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444",
              }}>
                <AlertCircle size={14} />
                {errorGeneral}
              </div>
            )}

            <div>
              <label htmlFor="usuario-nombre" style={labelStyle}>Nombre</label>
              <input id="usuario-nombre" type="text" value={form.nombre} disabled={guardando}
                onChange={e => actualizar("nombre", e.target.value)} style={inputStyle} />
              {errores.nombre && <p style={errorCampoStyle}>{errores.nombre}</p>}
            </div>

            <div>
              <label htmlFor="usuario-correo" style={labelStyle}>Correo</label>
              <input id="usuario-correo" type="email" autoComplete="off" value={form.correo} disabled={guardando}
                onChange={e => actualizar("correo", e.target.value)} style={inputStyle} />
              {errores.correo && <p style={errorCampoStyle}>{errores.correo}</p>}
            </div>

            <div>
              <label htmlFor="usuario-rol" style={labelStyle}>Rol</label>
              <select
                id="usuario-rol"
                value={form.role}
                disabled={guardando || esPropio}
                onChange={e => actualizar("role", isRole(e.target.value) ? e.target.value : "")}
                style={inputStyle}
              >
                <option value="">Seleccione un rol</option>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              {esPropio && <p style={{ fontSize: "11px", color: "var(--txt3)", marginTop: "4px" }}>No puede cambiar su propio rol.</p>}
              {errores.role && <p style={errorCampoStyle}>{errores.role}</p>}
            </div>

            <div>
              <label htmlFor="usuario-password" style={labelStyle}>
                {editando ? "Nueva contraseña (opcional)" : "Contraseña"}
              </label>
              <input id="usuario-password" type="password" autoComplete="new-password" value={form.password} disabled={guardando}
                onChange={e => actualizar("password", e.target.value)} style={inputStyle} />
              {errores.password && <p style={errorCampoStyle}>{errores.password}</p>}
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            <button type="button" onClick={onCerrar} disabled={guardando} style={botonSecundario}>Cancelar</button>
            <button type="submit" disabled={guardando} className="flex items-center gap-2" style={botonPrimario(!guardando)}>
              {guardando && <Loader size={14} style={{ animation: "spin 1s linear infinite" }} />}
              {editando ? "Guardar cambios" : "Registrar usuario"}
            </button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

/* ─── Página ─── */

export function Users() {
  const { session } = useAuth();
  const idPropio = session?.user.id ?? "";
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setUsuarios(await adminApi.listarUsuarios());
    } catch (e) {
      setError(mensajeDeError(e, "No se pudieron cargar los usuarios."));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const reemplazar = (u: UsuarioAdmin) =>
    setUsuarios(prev => prev.some(p => p.id === u.id) ? prev.map(p => (p.id === u.id ? u : p)) : [...prev, u]);

  const handleGuardado = (u: UsuarioAdmin, mensaje: string) => {
    reemplazar(u);
    setModal(null);
    setAviso(mensaje);
  };

  const cerrarModal = useCallback(() => setModal(null), []);

  const cambiarEstado = async (u: UsuarioAdmin) => {
    const activar = !u.activo;
    const pregunta = activar
      ? `¿Activar la cuenta de ${u.nombre}?`
      : `¿Desactivar la cuenta de ${u.nombre}? No podrá iniciar sesión.`;
    if (!window.confirm(pregunta)) return;
    setCambiandoId(u.id);
    setError(null);
    try {
      reemplazar(await adminApi.actualizarUsuario(u.id, { activo: activar }));
      setAviso(activar ? MSG_ACTIVADO : MSG_DESACTIVADO);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo cambiar el estado del usuario."));
    } finally {
      setCambiandoId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
            Usuarios
          </h1>
          <p style={{ fontSize: "12px", color: "var(--txt2)", marginTop: "2px" }}>
            Alta, edición y desactivación de cuentas de la plataforma
          </p>
        </div>
        <button onClick={() => setModal({ modo: "crear" })} className="flex items-center gap-2" style={botonPrimario(true)}>
          <UserPlus size={14} />
          Nuevo usuario
        </button>
      </div>

      {MODO_MOCK && <DemoBanner />}

      {aviso && (
        <div role="status" className="flex items-center gap-2" style={{
          padding: "8px 10px", borderRadius: "8px", fontSize: "12px",
          background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981",
        }}>
          <CheckCircle size={14} />
          {aviso}
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-2" style={{
          padding: "8px 10px", borderRadius: "8px", fontSize: "12px",
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444",
        }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {cargando ? (
        <div style={{ color: "var(--txt3)", fontSize: "13px" }}>Cargando usuarios...</div>
      ) : (
        <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "760px", textAlign: "left", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead style={{ background: "var(--bg2)", color: "var(--txt2)" }}>
              <tr>
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>Nombre</th>
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>Correo</th>
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>Rol</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, width: "100px" }}>Estado</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, width: "110px" }}>Creado</th>
                <th style={{ padding: "10px 16px", fontWeight: 600, width: "190px" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => {
                const esPropio = u.id === idPropio;
                const cambiando = cambiandoId === u.id;
                return (
                  <tr key={u.id} style={{ borderTop: "1px solid var(--border)", color: "#fff", opacity: u.activo ? 1 : 0.6 }}>
                    <td style={{ padding: "10px 16px", fontWeight: 600 }}>
                      {u.nombre}
                      {esPropio && <span style={{ marginLeft: "6px", fontSize: "10px", color: "var(--txt3)", fontWeight: 400 }}>(usted)</span>}
                    </td>
                    <td className="font-mono" style={{ padding: "10px 16px", color: "var(--txt2)", fontSize: "11px" }}>{u.correo}</td>
                    <td style={{ padding: "10px 16px", color: "var(--txt2)" }}>{ROLE_LABEL[u.role]}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{
                        fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px",
                        padding: "3px 8px", borderRadius: "5px",
                        background: u.activo ? "var(--green-bg)" : "var(--red-bg)",
                        color: u.activo ? "var(--green)" : "var(--red)",
                        border: `1px solid ${u.activo ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                      }}>
                        {u.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="font-mono" style={{ padding: "10px 16px", color: "var(--txt3)" }}>{fechaDe(u.creado_en)}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setModal({ modo: "editar", usuario: u })}
                          className="flex items-center gap-1"
                          style={{ ...botonAccion, cursor: "pointer" }}
                        >
                          <Pencil size={12} />
                          Editar
                        </button>
                        <button
                          onClick={() => cambiarEstado(u)}
                          disabled={esPropio || cambiando}
                          title={esPropio ? "No puede desactivar su propia cuenta" : undefined}
                          className="flex items-center gap-1"
                          style={{
                            ...botonAccion,
                            color: u.activo ? "#fca5a5" : "#6ee7b7",
                            cursor: esPropio || cambiando ? "default" : "pointer",
                            opacity: esPropio ? 0.4 : 1,
                          }}
                        >
                          {u.activo ? <UserX size={12} /> : <UserCheck size={12} />}
                          {u.activo ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <UsuarioModal
          modal={modal}
          usuarios={usuarios}
          idPropio={idPropio}
          onCerrar={cerrarModal}
          onGuardado={handleGuardado}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
