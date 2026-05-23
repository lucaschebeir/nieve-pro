import { useState } from "react";
import { supabase } from "../supabase";

const T = {
  bg:"#080e1a", card:"#0f1c32", border:"#1a2e50", borderLight:"#243d6a",
  accent:"#1d6ef5", green:"#0fb981", red:"#e53e3e",
  text:"#dce8f8", textDim:"#7a96bb", surface:"#0c1526",
};

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState("");

  async function handleReset(e) {
    e.preventDefault();
    if (password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    if (password.length < 6)  { setError("Mínimo 6 caracteres"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); return; }
    setDone(true);
    setLoading(false);
    setTimeout(() => window.location.href = "/", 2000);
  }

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",padding:20}}>
      <div style={{background:T.card,border:`1px solid ${T.borderLight}`,borderRadius:20,padding:40,width:380,maxWidth:"100%",boxShadow:"0 24px 80px rgba(0,0,0,0.5)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:28,fontWeight:900,background:"linear-gradient(130deg,#60a5fa 0%,#a78bfa 60%,#f0a500 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>⛷ NIEVE PRO</div>
          <div style={{fontSize:14,color:T.textDim,marginTop:8}}>Creá tu nueva contraseña</div>
        </div>
        {done ? (
          <div style={{background:`${T.green}15`,border:`1px solid ${T.green}40`,borderRadius:10,padding:16,textAlign:"center",color:T.green,fontWeight:700}}>
            ✓ Contraseña actualizada. Redirigiendo...
          </div>
        ) : (
          <form onSubmit={handleReset} style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <label style={{fontSize:11,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em"}}>Nueva contraseña</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required
                style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:8,padding:"10px 14px",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <label style={{fontSize:11,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em"}}>Confirmar contraseña</label>
              <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repetí la contraseña" required
                style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:8,padding:"10px 14px",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            </div>
            {error&&<div style={{background:`${T.red}15`,border:`1px solid ${T.red}40`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.red}}>⚠ {error}</div>}
            <button type="submit" disabled={loading}
              style={{background:loading?"#3d5478":T.accent,color:"#fff",border:"none",borderRadius:8,padding:"12px",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit",marginTop:4}}>
              {loading?"Guardando...":"✓ Cambiar contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
