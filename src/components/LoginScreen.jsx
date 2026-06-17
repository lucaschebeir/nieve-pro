// src/components/LoginScreen.jsx
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const T = {
  bg:"#080e1a", card:"#0f1c32", border:"#1a2e50", borderLight:"#243d6a",
  accent:"#1d6ef5", green:"#0fb981", red:"#e53e3e", orange:"#f97316",
  text:"#dce8f8", textDim:"#7a96bb", muted:"#3d5478", surface:"#0c1526",
};

const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 15 * 60 * 1000; // 15 minutos
const STORAGE_KEY   = "apex_login_lockout";

function getLockoutState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { attempts: 0, lockedUntil: null };
    return JSON.parse(raw);
  } catch {
    return { attempts: 0, lockedUntil: null };
  }
}

function saveLockoutState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearLockoutState() {
  localStorage.removeItem(STORAGE_KEY);
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [attempts, setAttempts] = useState(() => getLockoutState().attempts);
  const [lockedUntil, setLockedUntil] = useState(() => getLockoutState().lockedUntil);
  const [remaining, setRemaining] = useState(0); // segundos restantes

  // Countdown ticker
  useEffect(() => {
    if (!lockedUntil) return;
    function tick() {
      const secs = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (secs <= 0) {
        setLockedUntil(null);
        setAttempts(0);
        clearLockoutState();
        setRemaining(0);
      } else {
        setRemaining(secs);
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const isLocked = lockedUntil && Date.now() < lockedUntil;

  function fmtRemaining(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (isLocked) return;
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      clearLockoutState();
    } catch {
      const prev = getLockoutState();
      const newAttempts = prev.attempts + 1;
      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        saveLockoutState({ attempts: newAttempts, lockedUntil: until });
        setAttempts(newAttempts);
        setLockedUntil(until);
        setError("");
      } else {
        saveLockoutState({ attempts: newAttempts, lockedUntil: null });
        setAttempts(newAttempts);
        const left = MAX_ATTEMPTS - newAttempts;
        setError(`Email o contraseña incorrectos. ${left} intento${left !== 1 ? "s" : ""} restante${left !== 1 ? "s" : ""}.`);
      }
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
              disabled={isLocked}
              style={{
                background: T.surface, border: `1px solid ${isLocked ? T.muted : T.border}`,
                color: isLocked ? T.muted : T.text, borderRadius: 8, padding: "10px 14px",
                fontSize: 14, outline: "none", fontFamily: "inherit", opacity: isLocked ? 0.5 : 1,
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
              disabled={isLocked}
              style={{
                background: T.surface, border: `1px solid ${isLocked ? T.muted : T.border}`,
                color: isLocked ? T.muted : T.text, borderRadius: 8, padding: "10px 14px",
                fontSize: 14, outline: "none", fontFamily: "inherit", opacity: isLocked ? 0.5 : 1,
              }}
            />
          </div>

          {/* Lockout banner */}
          {isLocked && (
            <div style={{
              background: `${T.orange}15`, border: `1px solid ${T.orange}50`,
              borderRadius: 8, padding: "12px 14px", fontSize: 13, color: T.orange,
              textAlign: "center", lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🔒 Demasiados intentos fallidos</div>
              <div style={{ fontSize: 12, color: T.textDim }}>
                Podés volver a intentar en <strong style={{ color: T.orange, fontFamily: "monospace" }}>{fmtRemaining(remaining)}</strong>
              </div>
            </div>
          )}

          {/* Error normal */}
          {!isLocked && error && (
            <div style={{
              background: `${T.red}15`, border: `1px solid ${T.red}40`,
              borderRadius: 8, padding: "10px 14px", fontSize: 13, color: T.red,
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Intentos restantes warning (sin lockout aún) */}
          {!isLocked && attempts > 0 && !error && (
            <div style={{ fontSize: 11, color: T.muted, textAlign: "center" }}>
              {MAX_ATTEMPTS - attempts} intento{MAX_ATTEMPTS - attempts !== 1 ? "s" : ""} restante{MAX_ATTEMPTS - attempts !== 1 ? "s" : ""} antes del bloqueo
            </div>
          )}

          <button
            type="submit"
            disabled={loading || isLocked}
            style={{
              background: isLocked ? T.muted : loading ? T.muted : T.accent,
              color: "#fff", border: "none", borderRadius: 8,
              padding: "12px", fontSize: 15, fontWeight: 700,
              cursor: loading || isLocked ? "not-allowed" : "pointer",
              fontFamily: "inherit", marginTop: 4,
            }}
          >
            {isLocked ? `🔒 Bloqueado (${fmtRemaining(remaining)})` : loading ? "Ingresando..." : "→ Ingresar"}
          </button>
        </form>

        <div style={{ marginTop: 24, fontSize: 12, color: T.muted, textAlign: "center", lineHeight: 1.6 }}>
          ¿Olvidaste tu contraseña? Contactá al administrador<br/>para que restablezca tu acceso.
        </div>
      </div>
    </div>
  );
}
