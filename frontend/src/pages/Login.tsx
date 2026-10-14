import { useState, type FormEvent } from "react";
import { Shield, Mail, Lock, LogIn, Loader, AlertCircle, CheckCircle } from "lucide-react";
import { useAuth, MSG_LOGOUT } from "../auth/AuthContext";
import { AuthError } from "../auth/authService";
import { ApiError } from "../api/client";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg2)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "10px 12px 10px 36px",
  fontSize: "13px",
  color: "var(--txt)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.8px",
  textTransform: "uppercase",
  color: "var(--txt3)",
  marginBottom: "6px",
};

export function Login() {
  const { login, aviso } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeEnviar = usuario.trim() !== "" && password !== "" && !cargando;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!puedeEnviar) return;
    setCargando(true);
    setError(null);
    try {
      await login(usuario, password);
    } catch (err) {
      if (err instanceof AuthError || err instanceof ApiError) setError(err.message);
      else setError("No se pudo iniciar sesión. Intente de nuevo.");
      setPassword("");
      setCargando(false);
    }
  };

  const avisoVisible = !error && aviso;
  const avisoExito = aviso === MSG_LOGOUT;

  return (
    <div
      className="flex items-center justify-center w-full px-4"
      style={{ minHeight: "100vh", background: "var(--bg)" }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: "380px",
          background: "var(--bg3)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          padding: "28px 24px",
        }}
      >
        {/* Marca */}
        <div className="flex items-center gap-3" style={{ marginBottom: "24px" }}>
          <div
            className="flex items-center justify-center"
            style={{
              width: "36px", height: "36px", borderRadius: "8px",
              background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)",
            }}
          >
            <Shield size={18} style={{ color: "#c4b5fd" }} />
          </div>
          <div>
            <p style={{ fontSize: "14px", fontWeight: 800, color: "var(--txt)" }}>XDR Platform</p>
            <p style={{ fontSize: "10px", color: "var(--txt3)", letterSpacing: "0.8px", textTransform: "uppercase" }}>
              TT 2026-B139
            </p>
          </div>
        </div>

        <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--txt)", marginBottom: "16px" }}>
          Iniciar sesión
        </p>

        {avisoVisible && (
          <div
            role="status"
            className="flex items-center gap-2"
            style={{
              marginBottom: "14px", padding: "8px 10px", borderRadius: "8px", fontSize: "12px",
              background: avisoExito ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
              border: `1px solid ${avisoExito ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
              color: avisoExito ? "#10b981" : "#f59e0b",
            }}
          >
            {avisoExito ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {aviso}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2"
            style={{
              marginBottom: "14px", padding: "8px 10px", borderRadius: "8px", fontSize: "12px",
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444",
            }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: "14px" }}>
            <label htmlFor="login-usuario" style={labelStyle}>Correo o usuario</label>
            <div className="relative">
              <Mail size={14} className="absolute" style={{ left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--txt3)" }} />
              <input
                id="login-usuario"
                type="text"
                autoComplete="username"
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                disabled={cargando}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label htmlFor="login-password" style={labelStyle}>Contraseña</label>
            <div className="relative">
              <Lock size={14} className="absolute" style={{ left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--txt3)" }} />
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={cargando}
                style={inputStyle}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!puedeEnviar}
            className="flex items-center justify-center gap-2 w-full"
            style={{
              padding: "10px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 700,
              fontFamily: "Syne, sans-serif",
              border: "none",
              color: "#fff",
              background: "#7c3aed",
              cursor: puedeEnviar ? "pointer" : "default",
              opacity: puedeEnviar ? 1 : 0.5,
              transition: "opacity 0.15s",
            }}
          >
            {cargando
              ? <Loader size={15} style={{ animation: "spin 1s linear infinite" }} />
              : <LogIn size={15} />}
            {cargando ? "Verificando..." : "Ingresar"}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
