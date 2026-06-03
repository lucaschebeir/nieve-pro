// src/components/LoginScreen.jsx
// Pantalla de login para todo el staff

import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const T = {
  bg:"#080e1a", card:"#0f1c32", border:"#1a2e50", borderLight:"#243d6a",
  accent:"#1d6ef5", green:"#0fb981", red:"#e53e3e",
  text:"#dce8f8", textDim:"#7a96bb", muted:"#3d5478", surface:"#0c1526",
};

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError("Email o contraseña incorrectos. Verificá tus datos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: T.bg, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif", padding: 20,
    }}>
      <div style={{
        background: T.card, border: `1px solid ${T.borderLight}`,
        borderRadius: 20, padding: 40, width: 380, maxWidth: "100%",
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontSize: 32, marginBottom: 8,
            background: "linear-gradient(130deg,#60a5fa 0%,#a78bfa 60%,#f0a500 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontWeight: 900, letterSpacing: "-0.04em",
          }}>
            ⛷ APEX
          </div>
          <div style={{ fontSize: 13, color: T.textDim }}>
            Ingresá con tu cuenta de staff
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, color: T.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              style={{
                background: T.surface, border: `1px solid ${T.border}`,
                color: T.text, borderRadius: 8, padding: "10px 14px",
                fontSize: 14, outline: "none", fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, color: T.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                background: T.surface, border: `1px solid ${T.border}`,
                color: T.text, borderRadius: 8, padding: "10px 14px",
                fontSize: 14, outline: "none", fontFamily: "inherit",
              }}
            />
          </div>

          {error && (
            <div style={{
              background: `${T.red}15`, border: `1px solid ${T.red}40`,
              borderRadius: 8, padding: "10px 14px", fontSize: 13, color: T.red,
            }}>
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? T.muted : T.accent,
              color: "#fff", border: "none", borderRadius: 8,
              padding: "12px", fontSize: 15, fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit", marginTop: 4,
            }}
          >
            {loading ? "Ingresando..." : "→ Ingresar"}
          </button>
        </form>

        <div style={{ marginTop: 24, fontSize: 12, color: T.muted, textAlign: "center", lineHeight: 1.6 }}>
          ¿Olvidaste tu contraseña? Contactá al administrador<br/>para que restablezca tu acceso.
        </div>
      </div>
    </div>
  );
}
