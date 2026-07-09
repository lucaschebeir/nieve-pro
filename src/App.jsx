// src/App.jsx
// App principal conectada a Supabase
// Usa los hooks de useData.js para todas las operaciones reales

import ResetPasswordScreen from "./components/ResetPasswordScreen";
import PlanningView, { PlanningInstructorView } from "./components/PlanningView";
import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "./context/AuthContext";
import LoginScreen from "./components/LoginScreen";
import {
  useStaff, useClients, useClasses,
  useSettlements, useExpenses, useConfig, usePendingBalances, useExtraCommissions
} from "./hooks/useData";
import { supabase } from "./supabase";

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  bg:"#080e1a",surface:"#0c1526",card:"#0f1c32",cardHover:"#132240",
  border:"#1a2e50",borderLight:"#243d6a",
  accent:"#1d6ef5",accentHover:"#1558d0",
  gold:"#f0a500",green:"#0fb981",red:"#e53e3e",orange:"#f97316",
  purple:"#7c5cbf",cyan:"#06b6d4",teal:"#14b8a6",
  text:"#dce8f8",textDim:"#7a96bb",muted:"#3d5478",white:"#ffffff",
};

const PAY_STATUS = {
  reserved:{ label:"Reservado",    color:T.gold   },
  partial: { label:"Pago Parcial", color:T.orange },
  paid:    { label:"Pago Total",   color:T.green  },
};
const INSTR_STATUS = {
  unassigned:{ label:"Sin Instructor", color:T.red,   icon:"⚠" },
  assigned:  { label:"Asignada",       color:T.cyan,  icon:"✓" },
  done:      { label:"Dada",           color:T.green, icon:"★" },
};
const ROLE_LABELS  = { seller:"Vendedor", instructor:"Instructor", both:"Vend.+Instr.", admin:"Admin" };
const ROLE_COLORS  = { seller:T.cyan, instructor:T.purple, both:T.gold, admin:T.green };
const SCENARIO_LABELS = {
  own_class:"Clase Propia", seller_only:"Vendedor Puro",
  instructor_only:"Instructor Puro", seller_and_instructor:"Vend.+Instr."
};
const SCENARIO_COLORS = {
  own_class:T.gold, seller_only:T.cyan,
  instructor_only:T.purple, seller_and_instructor:T.green
};

const today   = new Date().toISOString().split("T")[0];
const daysAgo = n => new Date(Date.now()-n*86400000).toISOString().split("T")[0];
const seasonRange = (offset=0) => { const y=new Date().getFullYear()+offset; return {from:`${y}-05-01`,to:`${y}-10-31`}; };

const fmt     = n => "$"+Number(n||0).toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate = d => { if(!d) return ""; return new Date(d+"T12:00:00").toLocaleDateString("es-AR",{day:"2-digit",month:"short",year:"numeric"}); };

// ─── BASE COMPONENTS ──────────────────────────────────────────────────────────
function Av({name="?",size=36,color=T.accent}){
  const i=name.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  return <div style={{width:size,height:size,borderRadius:"50%",background:`${color}22`,border:`2px solid ${color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.33,fontWeight:800,color,flexShrink:0}}>{i}</div>;
}
function Badge({text,color=T.accent,dot=false,small=false}){
  return <span style={{background:`${color}18`,color,border:`1px solid ${color}40`,padding:small?"1px 7px":"2px 9px",borderRadius:20,fontSize:small?10:11,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>{dot&&<span style={{width:5,height:5,borderRadius:"50%",background:color,display:"inline-block"}}/>}{text}</span>;
}
function PayBadge({status}){
  const s=PAY_STATUS[status]||PAY_STATUS.reserved;
  return <span style={{background:`${s.color}18`,color:s.color,border:`1px solid ${s.color}45`,padding:"2px 9px",borderRadius:20,fontSize:11,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}><span style={{fontSize:9}}>●</span>{s.label}</span>;
}
function InstrBadge({status}){
  const s=INSTR_STATUS[status]||INSTR_STATUS.unassigned;
  return <span style={{background:`${s.color}15`,color:s.color,border:`1px solid ${s.color}40`,padding:"2px 9px",borderRadius:20,fontSize:11,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>{s.icon} {s.label}</span>;
}
function Toggle({value,onChange,disabled=false}){
  return <div onClick={disabled?undefined:()=>onChange(!value)} style={{width:46,height:26,borderRadius:13,background:value?T.green:T.muted,cursor:disabled?"default":"pointer",position:"relative",transition:"background .25s",flexShrink:0,opacity:disabled?.4:1}}><div style={{position:"absolute",top:3,left:value?23:3,width:20,height:20,borderRadius:"50%",background:T.white,transition:"left .25s",boxShadow:"0 2px 6px rgba(0,0,0,.4)"}}/></div>;
}
function Card({children,style={},onClick}){
  const [h,setH]=useState(false);
  return <div onClick={onClick} onMouseEnter={()=>onClick&&setH(true)} onMouseLeave={()=>setH(false)} style={{background:h?T.cardHover:T.card,border:`1px solid ${h?T.borderLight:T.border}`,borderRadius:14,padding:20,transition:"all .18s",cursor:onClick?"pointer":"default",...style}}>{children}</div>;
}
function Inp({label,value,onChange,type="text",placeholder,options,textarea=false,style={},small=false,required=false}){
  const base={background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:8,padding:small?"6px 10px":"9px 13px",fontSize:small?12:13,width:"100%",outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const [f,setF]=useState(false);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:5,...style}}>
      {label&&<label style={{fontSize:11,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em"}}>{label}{required&&<span style={{color:T.red,marginLeft:3}}>*</span>}</label>}
      {options
        ?<select value={value} onChange={e=>onChange(e.target.value)} style={{...base,borderColor:f?T.accent:T.border}} onFocus={()=>setF(true)} onBlur={()=>setF(false)}><option value="">— Seleccionar —</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
        :textarea
          ?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3} style={{...base,borderColor:f?T.accent:T.border,resize:"vertical"}} onFocus={()=>setF(true)} onBlur={()=>setF(false)}/>
          :<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{...base,borderColor:f?T.accent:T.border}} onFocus={()=>setF(true)} onBlur={()=>setF(false)}/>}
    </div>
  );
}
function Btn({children,onClick,variant="primary",size="md",disabled=false,full=false,style={}}){
  const [h,setH]=useState(false);
  const pad=size==="sm"?"6px 12px":size==="lg"?"13px 28px":"9px 18px";
  const fs=size==="sm"?12:size==="lg"?15:13;
  const V={
    primary:{background:h?T.accentHover:T.accent,color:T.white},
    success:{background:h?"#0da872":T.green,color:T.white},
    danger: {background:h?"#c53030":T.red,color:T.white},
    ghost:  {background:h?T.surface:"transparent",color:h?T.text:T.textDim,border:`1px solid ${h?T.borderLight:T.border}`},
    gold:   {background:h?"#d4940a":T.gold,color:"#0a0e18",fontWeight:800},
    teal:   {background:h?"#0d9488":T.teal,color:T.white},
  };
  return <button disabled={disabled} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onClick={disabled?undefined:onClick} style={{border:"none",borderRadius:8,cursor:disabled?"not-allowed":"pointer",fontWeight:600,fontSize:fs,padding:pad,display:"inline-flex",alignItems:"center",gap:6,transition:"all .15s",opacity:disabled?.45:1,width:full?"100%":"auto",justifyContent:"center",fontFamily:"inherit",...V[variant],...style}}>{children}</button>;
}
function Modal({title,children,onClose,width=480}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16}} onClick={onClose}>
      <div style={{background:T.card,border:`1px solid ${T.borderLight}`,borderRadius:16,padding:28,width,maxWidth:"100%",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,.7)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
          <div style={{fontSize:16,fontWeight:800}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.textDim,cursor:"pointer",fontSize:22,lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Stat({label,value,color=T.text,sub,icon}){
  return(
    <div>
      <div style={{fontSize:11,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3}}>{icon&&<span style={{marginRight:4}}>{icon}</span>}{label}</div>
      <div style={{fontSize:23,fontWeight:800,color,fontFamily:"monospace"}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:T.muted,marginTop:2}}>{sub}</div>}
    </div>
  );
}
function TH({children}){return <th style={{padding:"10px 12px",textAlign:"left",fontSize:10,color:T.textDim,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",whiteSpace:"nowrap",background:T.surface,borderBottom:`1px solid ${T.border}`}}>{children}</th>;}
function TD({children,style={}}){return <td style={{padding:"9px 12px",borderBottom:`1px solid ${T.border}18`,verticalAlign:"middle",...style}}>{children}</td>;}
function Empty({text}){return <div style={{textAlign:"center",padding:"36px 20px",color:T.muted,fontSize:13}}>— {text} —</div>;}
function PayBar({amount,paidAmount}){
  const pct=Math.min(100,((+paidAmount/(+amount||1))*100)||0);
  const color=pct>=100?T.green:pct>0?T.orange:T.gold;
  return <div style={{width:"100%",height:4,background:T.border,borderRadius:2,overflow:"hidden",marginTop:3}}><div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:2}}/></div>;
}
function SectionTitle({children}){
  return <div style={{fontSize:11,fontWeight:700,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>{children}</div>;
}
function BackBtn({onClick,label="← Volver"}){
  return <button onClick={onClick} style={{background:"none",border:"none",color:T.accent,fontSize:12,cursor:"pointer",padding:0,fontFamily:"inherit",marginBottom:16,display:"block"}}>{label}</button>;
}
function LoadingSpinner(){
  return(
    <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{width:40,height:40,border:`3px solid ${T.border}`,borderTop:`3px solid ${T.accent}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <div style={{color:T.textDim,fontSize:13}}>Cargando datos...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── DUPLICATE ALERT ──────────────────────────────────────────────────────────
function DuplicateAlert({name,onContinue,onCancel}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,padding:16}}>
      <div style={{background:T.card,border:`2px solid ${T.orange}`,borderRadius:16,padding:28,width:420,maxWidth:"100%",boxShadow:`0 0 40px ${T.orange}33`}}>
        <div style={{fontSize:24,marginBottom:12,textAlign:"center"}}>⚠️</div>
        <div style={{fontSize:16,fontWeight:800,color:T.orange,marginBottom:10,textAlign:"center"}}>¡Cliente duplicado!</div>
        <div style={{fontSize:13,color:T.textDim,textAlign:"center",lineHeight:1.7,marginBottom:20}}>
          Ya existe un cliente con el nombre<br/>
          <strong style={{color:T.text}}>"{name}"</strong>.<br/>
          ¿Es una nueva referencia o el mismo cliente?
        </div>
        <div style={{background:T.surface,borderRadius:8,padding:12,fontSize:12,color:T.muted,marginBottom:20,lineHeight:1.6}}>
          Si es el mismo cliente, cancelá y buscalo en la lista para mantener su vendedor original asignado.
        </div>
        <div style={{display:"flex",gap:10}}>
          <Btn variant="ghost" full onClick={onCancel}>← Verificar cliente</Btn>
          <Btn style={{background:T.orange,color:T.white}} full onClick={onContinue}>Continuar igual</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── CLASS FINANCE MODAL ──────────────────────────────────────────────────────
function ClassFinanceModal({cls,staff,onClose}){
  const seller=staff.find(s=>s.id===cls.sellerId);
  const instr=staff.find(s=>s.id===cls.instructorId);
  return(
    <Modal title="Desglose Financiero" onClose={onClose} width={420}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:T.surface,borderRadius:10,padding:14}}>
          <div style={{fontSize:12,color:T.textDim}}>{fmtDate(cls.classDate)} · {cls.clientName}</div>
          <div style={{fontSize:22,fontWeight:900,fontFamily:"monospace",marginTop:4}}>{fmt(cls.amount)}</div>
          <div style={{fontSize:12,color:PAY_STATUS[cls.paymentStatus]?.color,marginTop:2}}>Cobrado: {fmt(cls.paidAmount)}</div>
          <PayBar amount={cls.amount} paidAmount={cls.paidAmount}/>
        </div>
        {cls.sellerCommission>0&&(
          <div style={{display:"flex",justifyContent:"space-between",background:`${T.cyan}10`,border:`1px solid ${T.cyan}25`,borderRadius:8,padding:"10px 14px"}}>
            <div><div style={{fontSize:12,fontWeight:700,color:T.cyan}}>Comisión Vendedor</div><div style={{fontSize:11,color:T.textDim}}>{seller?.name} · {seller?.commissionPct}%</div></div>
            <div style={{fontFamily:"monospace",fontWeight:800,color:T.cyan,fontSize:16,alignSelf:"center"}}>{fmt(cls.sellerCommission)}</div>
          </div>
        )}
        {cls.instructorEarning>0&&(
          <div style={{display:"flex",justifyContent:"space-between",background:`${T.purple}10`,border:`1px solid ${T.purple}25`,borderRadius:8,padding:"10px 14px"}}>
            <div><div style={{fontSize:12,fontWeight:700,color:T.purple}}>Honorario Instructor</div><div style={{fontSize:11,color:T.textDim}}>{instr?.name} · {cls.instructorHours}h × {fmt(cls.instructorHourlyRate)}/h</div></div>
            <div style={{fontFamily:"monospace",fontWeight:800,color:T.purple,fontSize:16,alignSelf:"center"}}>{fmt(cls.instructorEarning)}</div>
          </div>
        )}
        <div style={{display:"flex",justifyContent:"space-between",background:`${T.green}10`,border:`1px solid ${T.green}25`,borderRadius:8,padding:"10px 14px"}}>
          <div><div style={{fontSize:12,fontWeight:700,color:T.green}}>Ganancia Neta Escuela</div><div style={{fontSize:11,color:T.textDim}}>Monto − comisiones</div></div>
          <div style={{fontFamily:"monospace",fontWeight:800,color:T.green,fontSize:16,alignSelf:"center"}}>{fmt(cls.schoolCut)}</div>
        </div>
        <Badge text={SCENARIO_LABELS[cls.scenario]} color={SCENARIO_COLORS[cls.scenario]}/>
      </div>
    </Modal>
  );
}

// ─── CLIENT DETAIL CARD ───────────────────────────────────────────────────────
function ClientDetailCard({client,allClasses,staff,onBack,backLabel,isAdmin=true}){
  const cls=allClasses.sort((a,b)=>b.classDate?.localeCompare(a.classDate));
  const total=cls.reduce((a,c)=>a+c.amount,0);
  const seller=staff.find(s=>s.id===client.sellerId);
  const instrMap={};
  cls.forEach(c=>{ if(c.instructorId){ instrMap[c.instructorId]=(instrMap[c.instructorId]||0)+1; } });
  const instrList=Object.entries(instrMap).map(([id,n])=>({s:staff.find(x=>x.id===id),n})).filter(x=>x.s);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {onBack&&<BackBtn onClick={onBack} label={backLabel||"← Volver"}/>}
      <div style={{display:"flex",gap:14,alignItems:"center"}}>
        <Av name={client.name} size={52} color={T.accent}/>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,fontSize:16}}>{client.name}</div>
          <div style={{display:"flex",gap:12,marginTop:4,flexWrap:"wrap"}}>
            {client.phone&&<span style={{fontSize:12,color:T.textDim}}>📞 {client.phone}</span>}
            {client.email&&<span style={{fontSize:12,color:T.textDim}}>✉ {client.email}</span>}
          </div>
          <div style={{marginTop:6}}>{seller?<Badge text={`Vendedor: ${seller.name}`} color={T.cyan}/>:<Badge text="Escuela" color={T.green}/>}</div>
        </div>
      </div>
      {client.notes&&<div style={{background:T.surface,borderRadius:8,padding:"8px 12px",fontSize:12,color:T.textDim,lineHeight:1.6}}>📝 {client.notes}</div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        {[["Clases",cls.length,T.text],["Gastado",fmt(total),T.green],["Última",cls[0]?fmtDate(cls[0].classDate):"—",T.textDim]].map(([l,v,c])=>(
          <div key={l} style={{background:T.surface,borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
            <div style={{fontSize:10,color:T.muted,textTransform:"uppercase"}}>{l}</div>
            <div style={{fontSize:15,fontWeight:800,color:c,marginTop:3,fontFamily:"monospace"}}>{v}</div>
          </div>
        ))}
      </div>
      {instrList.length>0&&(
        <div style={{background:T.surface,borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:T.textDim,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>
            Instructores en su historial <span style={{fontSize:9,color:T.muted,fontWeight:400,textTransform:"none"}}>— solo referencia</span>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {instrList.map(({s,n})=>(
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,background:`${T.purple}12`,border:`1px solid ${T.purple}30`,borderRadius:8,padding:"6px 12px"}}>
                <Av name={s.name} size={22} color={T.purple}/>
                <div><div style={{fontSize:12,fontWeight:700,color:T.purple}}>{s.name}</div><div style={{fontSize:10,color:T.muted}}>{n} clase(s)</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
      <SectionTitle>Historial de Clases</SectionTitle>
      {cls.length===0?<Empty text="Sin clases"/>:
        cls.map(c=>{
          const instr=staff.find(s=>s.id===c.instructorId);
          return(
            <div key={c.id} style={{background:T.surface,borderRadius:8,padding:"8px 12px",marginBottom:5,fontSize:12,borderLeft:`3px solid ${PAY_STATUS[c.paymentStatus]?.color||T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{color:T.textDim}}>{fmtDate(c.classDate)}</span>
                {instr&&<span style={{color:T.purple,fontSize:11}}>👤 {instr.name}</span>}
                {isAdmin&&<span style={{fontFamily:"monospace",color:T.cyan,fontWeight:700}}>{fmt(c.amount)}</span>}
                <PayBadge status={c.paymentStatus}/>
              </div>
              {c.notes&&<div style={{color:T.muted,fontSize:11,marginTop:3}}>{c.notes}</div>}
              <PayBar amount={c.amount} paidAmount={c.paidAmount}/>
            </div>
          );
        })
      }
    </div>
  );
}

// ─── MODAL: CLASE ──────────────────────────────────────────────────────────────
function ModalClassEdit({data,staff,clients,classes,config,onSave,onClose}){
  const isNew=!data;
  // IDs definidos antes del useState para poder usarlos en el valor inicial
  const _fullDayId = config.rates.find(r=>r.name==="Full Day")?.id;
  const _miniDayId = config.rates.find(r=>r.name==="Mini Day")?.id;
  const _halfDayId = config.rates.find(r=>r.name==="Half Day")?.id;

  function autoHorario(typeId, existing) {
    if(existing) return existing;
    if(!typeId) return "";
    if(typeId===_halfDayId) return ""; // el usuario elige mañana/tarde
    return "09:30";
  }

  const empty={classDate:today,classTypeId:"",classTypeName:"",amount:"550",peopleCount:"1",sellerId:"",instructorId:"",clientId:"",clientName:"",notes:"",reservationAmount:"",paidAmount:"",classDone:false,discipline:"ski",horarioInicio:""};
  const [form,setForm]=useState(data?{...data,amount:String(data.amount),peopleCount:String(data.peopleCount),reservationAmount:String(data.reservationAmount||0),paidAmount:String(data.paidAmount||0),sellerId:data.sellerId||"",instructorId:data.instructorId||"",clientId:data.clientId||"",horarioInicio:autoHorario(data.classTypeId,data.horarioInicio)}:empty);
  const [preview,setPreview]=useState(null);
  const [classDates, setClassDates] = useState(data ? [data.classDate] : [today]);
  const [totalDeposit, setTotalDeposit] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [saving,setSaving]=useState(false);
  const [unavailWarn,setUnavailWarn]=useState([]);

  useEffect(()=>{
    if(!form.instructorId){ setUnavailWarn([]); return; }
    const datesToCheck = classDates;
    supabase.from("instructor_unavailability")
      .select("date,hora_inicio,hora_fin")
      .eq("staff_id",form.instructorId)
      .in("date",datesToCheck)
      .then(({data})=>setUnavailWarn(data||[]));
  },[form.instructorId, classDates.join(","), form.classDate]);

  const sellers=staff.filter(s=>(s.role==="seller"||s.role==="both")&&s.isActive);
  const instructors=staff.filter(s=>(s.role==="instructor"||s.role==="both")&&s.isActive);

  // Grupos existentes del cliente seleccionado (solo para clases nuevas)
  const clientGroups=useMemo(()=>{
    if(!isNew||!form.clientId) return [];
    const seen=new Set();
    const result=[];
    for(const c of (classes||[])){
      if(c.clientId!==form.clientId||!c.groupId||seen.has(c.groupId)) continue;
      seen.add(c.groupId);
      const groupClasses=(classes||[]).filter(x=>x.groupId===c.groupId);
      const dates=groupClasses.map(x=>x.classDate).sort();
      result.push({groupId:c.groupId,label:`${fmtDate(dates[0])}${dates.length>1?` + ${dates.length-1} más`:""} (${groupClasses.length} clase${groupClasses.length!==1?"s":""})`});
    }
    return result;
  },[isNew,form.clientId,classes]);

  const payStatus=form.paidAmount>0?(+form.paidAmount>=(+form.amount)?'paid':'partial'):'reserved';
  const ps=PAY_STATUS[payStatus];
  const saldo=Math.max(0,(+form.amount||0)-(+form.paidAmount||0));

  function set(k,v){
    const next={...form,[k]:v};
    if(k==="classTypeId"){
      const r=config.rates.find(x=>x.id===v);
      if(r){ next.amount=String(r.amount); next.classTypeName=r.name; }
      if(v===_halfDayId) next.horarioInicio=""; // Half Day: el usuario elige mañana/tarde
      else if(v)         next.horarioInicio="09:30"; // todos los demás: default 09:30
    }
    if(k==="clientId"&&v){const cl=clients.find(c=>c.id===v);if(cl){next.clientName=cl.name;if(cl.sellerId&&!next.sellerId)next.sellerId=cl.sellerId;}}
    if(k==="reservationAmount"&&isNew) next.paidAmount=v;
    setForm(next);
    // Preview comisiones
    const ct=config.rates.find(r=>r.id===next.classTypeId);
    const seller=staff.find(s=>s.id===next.sellerId);
    const instr=staff.find(s=>s.id===next.instructorId);
    const scenario=calcScenario(next.sellerId,next.instructorId);
    if(next.amount) setPreview({scenario,seller,instructor:instr,hours:ct?.hours||0,...calcEarnings(+next.amount,scenario,seller,instr,config.schoolCutPct,ct?.hours||0)});
  }

  async function submit(){
    if(!form.amount||!form.clientName) return;
    if(form.classTypeId===_halfDayId&&!form.horarioInicio){ alert("Elegí el turno del Half Day: Mañana o Tarde."); return; }
    setSaving(true);
    try {
      const groupId = selectedGroupId || (isNew && classDates.length > 1 ? crypto.randomUUID() : (data?.groupId || null));
      const depositNum = +totalDeposit || 0;
      const n = classDates.length;
      const base = isNew && n > 1 && totalDeposit ? Math.round(depositNum / n * 100) / 100 : null;
      for (let i = 0; i < classDates.length; i++) {
        const deposit = base !== null
          ? (i === n - 1 ? Math.round((depositNum - base * (n - 1)) * 100) / 100 : base)
          : null;
        const reservationAmount = deposit !== null ? String(deposit) : form.reservationAmount;
        await onSave({...form, id: isNew?undefined:data?.id, classDate: classDates[i], groupId, reservationAmount});
      }
    }
    catch(e){ alert("Error guardando: "+e.message); }
    finally{ setSaving(false); }
  }

  return(
    <Modal title={isNew?"Nueva Clase":"Editar Clase"} onClose={onClose} width={720}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <SectionTitle>Datos de la Clase</SectionTitle>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {classDates.map((d,i)=>(
  <div key={i} style={{display:"flex",gap:8,alignItems:"center"}}>
    <Inp label={classDates.length>1?`Día ${i+1}`:"Fecha"} type="date" value={d} onChange={v=>{const nd=[...classDates];nd[i]=v;setClassDates(nd);}} required style={{flex:1}}/>
    {classDates.length>1&&<button onClick={()=>setClassDates(classDates.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#e53e3e",cursor:"pointer",fontSize:18,padding:"0 4px"}}>×</button>}
  </div>
))}
            <Inp label="Tipo" value={form.classTypeId} onChange={v=>set("classTypeId",v)} options={config.rates.map(r=>({value:r.id,label:`${r.name} — ${fmt(r.amount)}`}))}/>
          </div>
          {/* ── Horario según tipo de clase ── */}
          {form.classTypeId===_fullDayId ? (
            <div style={{background:`${T.accent}10`,border:`1px solid ${T.accent}30`,borderRadius:8,padding:"8px 12px",fontSize:12,color:T.textDim}}>
              🕘 Horario fijo: <strong style={{color:T.text}}>09:30</strong>
            </div>
          ) : form.classTypeId===_halfDayId ? (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div style={{fontSize:11,color:T.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em"}}>Turno</div>
              <div style={{display:"flex",gap:8}}>
                {[["09:30","🌅 Mañana","9:30 – 12:30"],["13:00","🌇 Tarde","13:00 – 16:00"]].map(([val,lbl,rng])=>(
                  <button key={val} onClick={()=>set("horarioInicio",val)} type="button"
                    style={{flex:1,background:form.horarioInicio===val?`${T.purple}25`:`${T.surface}`,
                      border:`2px solid ${form.horarioInicio===val?T.purple:T.border}`,
                      color:form.horarioInicio===val?T.purple:T.textDim,
                      borderRadius:8,padding:"10px 8px",cursor:"pointer",fontFamily:"inherit",
                      fontWeight:form.horarioInicio===val?800:500,transition:"all .15s"}}>
                    <div style={{fontSize:13}}>{lbl}</div>
                    <div style={{fontSize:10,marginTop:2,opacity:.7}}>{rng}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : form.classTypeId ? (
            <Inp label="Horario inicio (opc.)" type="time" value={form.horarioInicio||""} onChange={v=>set("horarioInicio",v)}/>
          ) : null}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Inp label="Monto Total USD" type="number" value={form.amount} onChange={v=>set("amount",v)} required/>
            <Inp label="Personas" type="number" value={form.peopleCount} onChange={v=>set("peopleCount",v)}/>
          </div>
          <Inp label="Cantidad de días" type="number" value={String(classDates.length)} onChange={v=>{
  const n=Math.max(1,+v||1);
  setClassDates(Array.from({length:n},(_,i)=>classDates[i]||today));
}}/>
          <Inp label="Cliente existente (opc.)" value={form.clientId} onChange={v=>{set("clientId",v);setSelectedGroupId(null);}} options={clients.map(c=>({value:c.id,label:c.name}))}/>
          {isNew&&clientGroups.length>0&&(
            <Inp label="Agregar a grupo existente (opc.)" value={selectedGroupId||""} onChange={v=>setSelectedGroupId(v||null)} options={[{value:"",label:"— Nuevo grupo —"},...clientGroups.map(g=>({value:g.groupId,label:g.label}))]}/>
          )}
          <Inp label="Nombre Cliente / Familia" value={form.clientName} onChange={v=>set("clientName",v)} placeholder="Familia Johnson" required/>
          <Inp label="Notas / Teléfono / Familiares" value={form.notes} onChange={v=>set("notes",v)} textarea placeholder="+54 9... | Juan y María"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Inp label="Vendedor" value={form.sellerId} onChange={v=>set("sellerId",v)} options={sellers.map(s=>({value:s.id,label:s.name}))}/>
            <Inp label="Instructor" value={form.instructorId} onChange={v=>set("instructorId",v)} options={instructors.map(s=>({value:s.id,label:s.name}))}/>
          </div>
          {unavailWarn.length>0&&(
            <div style={{background:`${T.orange}14`,border:`1px solid ${T.orange}50`,borderRadius:8,padding:"10px 13px",fontSize:12,color:T.orange,display:"flex",flexDirection:"column",gap:4}}>
              <strong>⚠ Instructor no disponible</strong>
              {unavailWarn.map(r=>(
                <span key={r.date} style={{fontSize:11,color:T.textDim}}>
                  {r.date}{r.hora_inicio?` · ${r.hora_inicio.slice(0,5)}–${r.hora_fin.slice(0,5)}`:" · Todo el día"}
                </span>
              ))}
              <span style={{fontSize:11,color:T.textDim,marginTop:2}}>Podés guardar igual si querés.</span>
            </div>
          )}
<Inp label="Disciplina" value={form.discipline||"ski"} onChange={v=>set("discipline",v)} options={[{value:"ski",label:"🎿 Esquí"},{value:"snowboard",label:"🏂 Snowboard"}]}/>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
  <div style={{display:"flex",alignItems:"center",gap:8}}>
    <input type="checkbox" id="done" checked={form.classDone} onChange={e=>set("classDone",e.target.checked)} style={{accentColor:T.green,width:16,height:16}}/>
    <label htmlFor="done" style={{fontSize:13,color:T.text,cursor:"pointer"}}>Clase ya dada</label>
  </div>
  <div style={{display:"flex",alignItems:"center",gap:8}}>
    <input type="checkbox" id="required" checked={form.isRequired||false} onChange={e=>set("isRequired",e.target.checked)} style={{accentColor:T.orange,width:16,height:16}}/>
    <label htmlFor="required" style={{fontSize:13,color:T.orange,cursor:"pointer",fontWeight:600}}>⚡ Clase Requerida (+$5/h al instructor)</label>
  </div>
</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <SectionTitle>{isNew?"Seña / Primer Pago":"Actualizar Cobro"}</SectionTitle>
          <div style={{background:`${ps.color}15`,border:`1px solid ${ps.color}40`,borderRadius:10,padding:"10px 14px"}}>
            <PayBadge status={payStatus}/>
            <div style={{fontSize:11,color:T.textDim,marginTop:4}}>Saldo pendiente: <strong style={{color:ps.color}}>{fmt(saldo)}</strong></div>
          </div>
          {isNew?(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {classDates.length > 1 ? (
                <>
                  <Inp label={`Seña Total (se divide en ${classDates.length} clases)`} type="number" value={totalDeposit} onChange={v=>setTotalDeposit(v)} placeholder="Ej: 300"/>
                  {totalDeposit && <div style={{fontSize:11,color:T.textDim,background:T.surface,borderRadius:6,padding:"6px 10px"}}>
                    💡 Cada clase recibirá <strong style={{color:T.accent}}>${(+totalDeposit/classDates.length).toFixed(0)}</strong> de seña.
                  </div>}
                </>
              ) : (
                <>
                  <Inp label="Seña / Primer Pago (USD)" type="number" value={form.reservationAmount} onChange={v=>set("reservationAmount",v)} placeholder="Ej: 100, 150, 200..."/>
                  <div style={{fontSize:11,color:T.textDim,background:T.surface,borderRadius:6,padding:"6px 10px"}}>
                    💡 La reserva se crea cuando el cliente abona la seña. El saldo restante se muestra automáticamente.
                  </div>
                </>
              )}
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <Inp label="Seña Original (USD)" type="number" value={form.reservationAmount} onChange={v=>setForm(f=>({...f,reservationAmount:v}))} placeholder="0"/>
              <Inp label="Total Cobrado Hasta Ahora (USD)" type="number" value={form.paidAmount} onChange={v=>setForm(f=>({...f,paidAmount:v}))} placeholder="0"/>
              <div style={{fontSize:11,color:T.textDim,background:T.surface,borderRadius:6,padding:"6px 10px"}}>
                💡 Actualizá cuando el cliente pague el saldo o haga pagos adicionales.
              </div>
            </div>
          )}
          <div style={{background:T.surface,borderRadius:8,padding:12}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:T.textDim,marginBottom:6}}>
              <span>Progreso</span>
              <span style={{color:ps.color,fontWeight:700}}>{Math.min(100,Math.round(((+form.paidAmount||0)/(+form.amount||1))*100))}%</span>
            </div>
            <div style={{width:"100%",height:8,background:T.border,borderRadius:4,overflow:"hidden"}}>
              <div style={{width:`${Math.min(100,((+form.paidAmount||0)/(+form.amount||1))*100)}%`,height:"100%",background:ps.color,borderRadius:4}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T.muted,marginTop:6}}>
              <span>Cobrado: {fmt(+form.paidAmount||0)}</span>
              <span>Saldo: {fmt(saldo)}</span>
            </div>
          </div>
          {preview&&(
            <div style={{background:T.surface,borderRadius:8,padding:12}}>
              <Badge text={SCENARIO_LABELS[preview.scenario]} color={SCENARIO_COLORS[preview.scenario]}/>
              <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:7}}>
                {preview.sellerCommission>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:T.cyan}}>{preview.scenario==="own_class"?"Neto staff":`${preview.seller?.name} (${preview.seller?.commissionPct}%)`}</span><span style={{color:T.cyan,fontFamily:"monospace",fontWeight:700}}>{fmt(preview.sellerCommission)}</span></div>}
                {preview.instructorEarning>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:T.purple}}>{preview.instructor?.name} · {preview.hours}h × {fmt(preview.instructorHourlyRate)}/h</span><span style={{color:T.purple,fontFamily:"monospace",fontWeight:700}}>{fmt(preview.instructorEarning)}</span></div>}
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,borderTop:`1px solid ${T.border}`,paddingTop:7}}><span style={{color:T.green}}>Escuela retiene</span><span style={{color:T.green,fontFamily:"monospace",fontWeight:700}}>{fmt(preview.schoolCut)}</span></div>
              </div>
            </div>
          )}
          <Btn variant={isNew?"primary":"gold"} full disabled={saving} onClick={submit}>{saving?"Guardando...":(isNew?"＋ Registrar Clase":"✓ Guardar Cambios")}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── MODAL: CLIENTE ───────────────────────────────────────────────────────────
function ModalClientEdit({data,staff,clients,onSave,onClose}){
  const [form,setForm]=useState(data?{...data}:{name:"",phone:"",email:"",notes:"",sellerId:""});
  const [showDup,setShowDup]=useState(false);
  const [saving,setSaving]=useState(false);
  const sellers=staff.filter(s=>s.role==="seller"||s.role==="both");

  async function trySave(){
    if(!data){
      const dup=clients.find(c=>c.name.toLowerCase().trim()===form.name.toLowerCase().trim());
      if(dup){setShowDup(true);return;}
    }
    doSave();
  }
  async function doSave(){
    setSaving(true);
    try{ await onSave(form); }
    catch(e){ alert("Error: "+e.message); }
    finally{ setSaving(false); }
  }

  return(
    <>
      {showDup&&<DuplicateAlert name={form.name} onContinue={()=>{setShowDup(false);doSave();}} onCancel={()=>setShowDup(false)}/>}
      <Modal title={data?"Editar Cliente":"Nuevo Cliente"} onClose={onClose}>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <Inp label="Nombre / Familia" value={form.name} onChange={v=>setForm(p=>({...p,name:v}))} required/>
          <Inp label="Teléfono" value={form.phone||""} onChange={v=>setForm(p=>({...p,phone:v}))} placeholder="+54 9 ..."/>
          <Inp label="Email" type="email" value={form.email||""} onChange={v=>setForm(p=>({...p,email:v}))}/>
          <Inp label="Vendedor Asignado (vínculo permanente)" value={form.sellerId||""} onChange={v=>setForm(p=>({...p,sellerId:v}))} options={sellers.map(s=>({value:s.id,label:s.name}))}/>
          <Inp label="Notas (familiares, preferencias, nivel)" value={form.notes||""} onChange={v=>setForm(p=>({...p,notes:v}))} textarea/>
        </div>
        <div style={{fontSize:11,color:T.textDim,background:T.surface,borderRadius:6,padding:"8px 12px",marginTop:12}}>
          ℹ El vendedor asignado tiene vínculo permanente. Los instructores solo aparecen en el historial.
        </div>
        <div style={{display:"flex",gap:10,marginTop:14}}>
          <Btn full disabled={saving} onClick={trySave}>{saving?"Guardando...":"✓ Guardar"}</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        </div>
      </Modal>
    </>
  );
}

// ─── MODAL: STAFF ─────────────────────────────────────────────────────────────
function ModalExtraCommission({staff,onSave,onClose}){
  const [amount,setAmount]=useState("");
  const [desc,setDesc]=useState("");
  const [date,setDate]=useState(today);
  const [saving,setSaving]=useState(false);
  async function submit(){
    if(!amount||!desc) return;
    setSaving(true);
    try{ await onSave(amount,desc,date); }
    catch(e){ alert("Error: "+e.message); }
    finally{ setSaving(false); }
  }
  return(
    <Modal title={`Comisión Extra — ${staff?.name}`} onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:13}}>
        <Inp label="Monto USD" type="number" value={amount} onChange={setAmount} placeholder="Ej: 50, 100..." required/>
        <Inp label="Descripción" value={desc} onChange={setDesc} placeholder="Ej: Venta equipo Rossignol" required/>
        <Inp label="Fecha" type="date" value={date} onChange={setDate}/>
      </div>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <Btn full disabled={saving} onClick={submit}>{saving?"Guardando...":"✓ Registrar Comisión"}</Btn>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
      </div>
    </Modal>
  );
}
function ModalStaffEdit({data,config,onSave,onClose}){
  const [form,setForm]=useState(data?{...data}:{name:"",email:"",phone:"",role:"seller",commissionPct:10,hourlyRate:15,isActive:true,isAdminViewer:false});
  const [saving,setSaving]=useState(false);
  async function submit(){
    setSaving(true);
    try{ await onSave(form); }
    catch(e){ alert("Error: "+e.message); }
    finally{ setSaving(false); }
  }
  return(
    <Modal title={data?"Editar Staff":"Nuevo Staff"} onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:13}}>
        <Inp label="Nombre completo" value={form.name} onChange={v=>setForm(p=>({...p,name:v}))} required/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Inp label="Email" type="email" value={form.email} onChange={v=>setForm(p=>({...p,email:v}))}/>
          <Inp label="Teléfono" value={form.phone||""} onChange={v=>setForm(p=>({...p,phone:v}))}/>
        </div>
        <Inp label="Rol" value={form.role} onChange={v=>setForm(p=>({...p,role:v}))} options={[{value:"seller",label:"Vendedor"},{value:"instructor",label:"Instructor"},{value:"both",label:"Vend. + Instructor"},{value:"admin",label:"Admin"}]}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {(form.role==="seller"||form.role==="both")&&<Inp label="Comisión %" type="number" value={String(form.commissionPct)} onChange={v=>setForm(p=>({...p,commissionPct:+v}))}/>}
          {(form.role==="instructor"||form.role==="both")&&<Inp label="$/hora" type="number" value={String(form.hourlyRate)} onChange={v=>setForm(p=>({...p,hourlyRate:+v}))}/>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
  <div style={{display:"flex",alignItems:"center",gap:10}}>
    <Toggle value={form.isActive} onChange={v=>setForm(p=>({...p,isActive:v}))}/>
    <span style={{fontSize:13,color:T.textDim}}>Cuenta {form.isActive?"habilitada":"inhabilitada"}</span>
  </div>
  <div style={{display:"flex",alignItems:"center",gap:10}}>
    <Toggle value={form.isOwner||false} onChange={v=>setForm(p=>({...p,isOwner:v}))}/>
    <span style={{fontSize:13,color:T.gold}}>⭐ Instructor dueño (cobra 100%)</span>
  </div>
  <div style={{display:"flex",alignItems:"center",gap:10}}>
    <Toggle value={form.isAdminViewer||false} onChange={v=>setForm(p=>({...p,isAdminViewer:v}))}/>
    <span style={{fontSize:13,color:T.cyan}}>👁 Ver app completa sin editar</span>
  </div>
</div>
        {!data&&<div style={{background:`${T.gold}10`,border:`1px solid ${T.gold}30`,borderRadius:8,padding:12,fontSize:12,color:T.textDim,lineHeight:1.7}}>⚠ Después de crear el perfil, creá el usuario en Supabase Authentication con el mismo email y vinculalo con UPDATE staff SET user_id='...'</div>}
      </div>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <Btn full disabled={saving} onClick={submit}>{saving?"Guardando...":"✓ Guardar"}</Btn>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
      </div>
    </Modal>
  );
}

// ─── MODAL: LIQUIDAR ──────────────────────────────────────────────────────────
function ModalSettle({name,staffId,classes,onConfirm,onClose}){
  const [start,setStart]=useState(daysAgo(15));
  const [end,setEnd]=useState(today);
  const [method,setMethod]=useState("Transferencia");
  const [notes,setNotes]=useState("");
  const [saving,setSaving]=useState(false);
  const [showDetail,setShowDetail]=useState(false);
  const toSettle=useMemo(()=>
    (classes||[]).filter(c=>c.classDone&&!c.isSettled&&c.classDate>=start&&c.classDate<=end&&(c.instructorId===staffId||c.sellerId===staffId))
      .sort((a,b)=>a.classDate.localeCompare(b.classDate))
  ,[classes,staffId,start,end]);
  const toSettleWithEarn=useMemo(()=>toSettle.map(c=>{
    const earn=(c.instructorId===staffId&&(c.scenario==="instructor_only"||c.scenario==="seller_and_instructor"))?c.instructorEarning:c.sellerCommission;
    return {...c,earn:earn||0};
  }),[toSettle,staffId]);
  const settleAmount=toSettleWithEarn.reduce((a,c)=>a+c.earn,0);
  async function submit(){
    setSaving(true);
    try{ await onConfirm(staffId,start,end,method,notes); }
    catch(e){ alert("Error: "+e.message); }
    finally{ setSaving(false); }
  }
  return(
    <Modal title={`Liquidar — ${name}`} onClose={onClose} width={480}>
      <div style={{background:`${T.gold}10`,border:`1px solid ${T.gold}30`,borderRadius:10,padding:16,textAlign:"center",marginBottom:16}}>
        <div style={{fontSize:10,color:T.textDim,textTransform:"uppercase"}}>Total a liquidar</div>
        <div style={{fontSize:32,fontWeight:900,color:T.gold,fontFamily:"monospace"}}>{fmt(settleAmount)}</div>
        <button onClick={()=>setShowDetail(p=>!p)} style={{background:"none",border:"none",color:T.accent,fontSize:12,cursor:"pointer",marginTop:4,fontFamily:"inherit"}}>
          {toSettle.length} clase(s) {showDetail?"▲ ocultar":"▼ ver desglose"}
        </button>
      </div>
      {showDetail&&(
        <div style={{maxHeight:220,overflowY:"auto",marginBottom:14,border:`1px solid ${T.border}`,borderRadius:8,fontSize:11}}>
          {toSettleWithEarn.length===0&&<div style={{padding:12,color:T.muted,textAlign:"center"}}>Sin clases en este período</div>}
          {toSettleWithEarn.map((c,i)=>(
            <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 12px",borderBottom:i<toSettleWithEarn.length-1?`1px solid ${T.border}`:"none",background:i%2===0?T.surface:"none"}}>
              <div style={{display:"flex",flexDirection:"column",gap:1}}>
                <span style={{color:T.text,fontWeight:600}}>{c.clientName}</span>
                <span style={{color:T.textDim}}>{fmtDate(c.classDate)} · {c.classTypeName}</span>
              </div>
              <span style={{fontFamily:"monospace",color:T.gold,fontWeight:700}}>{fmt(c.earn)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Inp label="Periodo Inicio" type="date" value={start} onChange={setStart}/>
          <Inp label="Periodo Fin" type="date" value={end} onChange={setEnd}/>
        </div>
        <Inp label="Método" value={method} onChange={setMethod} options={["Transferencia","Efectivo","Cheque","Otro"].map(m=>({value:m,label:m}))}/>
        <Inp label="Notas" value={notes} onChange={setNotes} textarea/>
      </div>
      <div style={{display:"flex",gap:10,marginTop:18}}>
        <Btn variant="gold" full disabled={saving||toSettle.length===0} onClick={submit}>{saving?"Procesando...":"✓ Confirmar Liquidación"}</Btn>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
      </div>
    </Modal>
  );
}

// Helpers para preview de comisiones
function calcScenario(sId,iId){
  if(sId&&iId&&sId===iId) return "own_class";
  if(sId&&iId&&sId!==iId) return "seller_and_instructor";
  if(sId&&!iId) return "seller_only";
  return "instructor_only";
}
function calcEarnings(amount,scenario,seller,instructor,schoolCutPct,hours){
  const amt=+amount||0,hrs=+hours||0;
  if(scenario==="own_class"){const cut=+(amt*(schoolCutPct/100)).toFixed(2);return{sellerCommission:+(amt-cut).toFixed(2),instructorEarning:0,schoolCut:cut,instructorHours:0,instructorHourlyRate:0};}
  if(scenario==="seller_only"){const comm=+(amt*((seller?.commissionPct||10)/100)).toFixed(2);return{sellerCommission:comm,instructorEarning:0,schoolCut:+(amt-comm).toFixed(2),instructorHours:0,instructorHourlyRate:0};}
  if(scenario==="instructor_only"){const rate=+(instructor?.hourlyRate||15),earn=+(hrs*rate).toFixed(2);return{sellerCommission:0,instructorEarning:earn,schoolCut:+(amt-earn).toFixed(2),instructorHours:hrs,instructorHourlyRate:rate};}
  const comm=+(amt*((seller?.commissionPct||10)/100)).toFixed(2),rate=+(instructor?.hourlyRate||15),earn=+(hrs*rate).toFixed(2);
  return{sellerCommission:comm,instructorEarning:earn,schoolCut:+(amt-comm-earn).toFixed(2),instructorHours:hrs,instructorHourlyRate:rate};
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function AdminApp() {
  const { staffProfile, signOut, isAdmin, isViewer, session } = useAuth();
  const { staff, loading: sL, toggleActive, saveStaff } = useStaff();
  const { clients, loading: cL, saveClient } = useClients();
  const { classes, loading: clL, saveClass, deleteClass, updateClassSchedule, groupClasses, ungroupClasses, registerGroupPayment } = useClasses();
  const { settlements, loading: stL, settlePeriod } = useSettlements();
  const { expenses, loading: eL, addExpense } = useExpenses();
  const { extraCommissions, addExtraCommission, settleExtraCommissions, deleteExtraCommission, refetch: refetchExtra } = useExtraCommissions();
  const { config, saveConfig } = useConfig();
  const { getBalance, refetch: refetchBalances } = usePendingBalances();

  // Enriquece classTypeName para clases viejas que tienen classTypeId pero no el nombre guardado
  const enrichedClasses = useMemo(
    () => classes.map(c => ({
      ...c,
      classTypeName: c.classTypeName || config.rates.find(r => r.id === c.classTypeId)?.name || "",
    })),
    [classes, config.rates]
  );

  const [page, setPage] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);

  const showToast = useCallback((msg, type="success") => {
    setToast({msg,type});
    setTimeout(()=>setToast(null),3000);
  }, []);

  const loading = false;

  const pendingBalances = useMemo(() => staff.map(s => getBalance(s.id)), [staff, getBalance]);

  async function handleSaveClass(f) {
    await saveClass(f);
    await refetchBalances();
    showToast(f.id ? "✓ Clase actualizada" : "✓ Clase registrada");
    setModal(null);
  }
  async function handleSaveClient(data) {
    await saveClient(data);
    showToast(data.id ? "✓ Cliente actualizado" : "✓ Cliente creado");
    setModal(null);
  }
  async function handleSaveStaff(data) {
    await saveStaff(data);
    showToast(data.id ? "✓ Staff actualizado" : "✓ Staff creado");
    setModal(null);
  }
  async function handleSettle(staffId, start, end, method, notes) {
    await settlePeriod(staffId, start, end, method, notes);
    await refetchBalances();
    const s = staff.find(x => x.id === staffId);
    showToast(`✓ ${fmt(getBalance(staffId).pendingAmount)} liquidados para ${s?.name}`);
    setModal(null);
  }
  async function handleToggle(id) {
    const s = staff.find(x => x.id === id);
    await toggleActive(id, s.isActive);
  }

  function handleExport() {
    const wb = XLSX.utils.book_new();
    const fecha = new Date().toISOString().split("T")[0];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(classes.map(c => ({
      Fecha: c.classDate, Tipo: c.classTypeName, Cliente: c.clientName,
      Personas: c.peopleCount, Monto: c.amount, Seña: c.reservationAmount,
      Pagado: c.paidAmount, Saldo: c.amount - c.paidAmount,
      "Est.Pago": PAY_STATUS[c.paymentStatus]?.label,
      "Est.Instructor": INSTR_STATUS[c.instructorStatus]?.label,
      Vendedor: staff.find(s=>s.id===c.sellerId)?.name||"Escuela",
      Instructor: staff.find(s=>s.id===c.instructorId)?.name||"",
      Escenario: SCENARIO_LABELS[c.scenario],
      "Comisión Vendedor": c.sellerCommission, "Honorario Instructor": c.instructorEarning,
      "Escuela Retiene": c.schoolCut, Liquidada: c.isSettled?"Sí":"No", Notas: c.notes,
    }))), "Clases");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clients.map(c => {
      const vendedor = staff.find(s=>s.id===c.sellerId);
      const cls = classes.filter(x=>x.clientId===c.id||x.clientName?.toLowerCase()===c.name?.toLowerCase());
      return { Nombre: c.name, Teléfono: c.phone||"", Email: c.email||"",
        Vendedor: vendedor?.name||"Escuela", "Total Clases": cls.length,
        "Total Gastado": cls.reduce((a,x)=>a+x.amount,0),
        "Total Cobrado": cls.reduce((a,x)=>a+x.paidAmount,0),
        "Saldo Pendiente": cls.reduce((a,x)=>a+(x.amount-x.paidAmount),0), Notas: c.notes||"" };
    })), "Clientes");

    staff.forEach(s2 => {
      const hist2 = settlements.filter(st=>st.staffId===s2.id).reduce((a,st)=>a+st.totalEarned,0);
      const misClases2 = classes.filter(c=>c.sellerId===s2.id||c.instructorId===s2.id);
      const misClientes2 = clients.filter(c=>c.sellerId===s2.id);
      const misLiquidaciones2 = settlements.filter(st=>st.staffId===s2.id);
      const aPagar = misClases2.filter(c=>!c.isSettled).reduce((a,c)=>{
        const isPureInstr = c.instructorId===s2.id && c.sellerId!==s2.id;
        return a + (isPureInstr ? c.instructorEarning : c.sellerCommission);
      },0);
      const hojaStaff = [
        [`━━━ ${s2.name.toUpperCase()} ━━━`],
        ["Email", s2.email||"", "Teléfono", s2.phone||""],
        ["Rol", ROLE_LABELS[s2.role], "Activo", s2.isActive?"Sí":"No"],
        ["Comisión %", s2.commissionPct, "Tarifa/hora", s2.hourlyRate],
        ["A Pagar", aPagar, "Total Liquidado", hist2],
        [],
        ["CLASES"],["Fecha","Cliente","Tipo","Monto","Mi Ganancia","Est.Pago","Liquidada"],
        ...misClases2.map(c=>{
          const isPureInstr=c.instructorId===s2.id&&c.sellerId!==s2.id;
          const earn=isPureInstr?c.instructorEarning:c.sellerCommission;
          return[c.classDate,c.clientName,c.classTypeName,c.amount,earn,PAY_STATUS[c.paymentStatus]?.label,c.isSettled?"Sí":"No"];
        }),
        [],
        ["CLIENTES ASIGNADOS"],["Nombre","Teléfono","Email","Clases","Total Gastado"],
        ...misClientes2.map(cl=>{
          const cls2=classes.filter(c=>c.clientId===cl.id||c.clientName?.toLowerCase()===cl.name?.toLowerCase());
          return[cl.name,cl.phone||"",cl.email||"",cls2.length,cls2.reduce((a,c)=>a+c.amount,0)];
        }),
        [],
        ["LIQUIDACIONES"],["Fecha","Periodo","Clases","Monto","Método"],
        ...misLiquidaciones2.map(st=>[st.settledAt,`${st.periodStart} → ${st.periodEnd}`,st.totalClasses,st.totalEarned,st.method]),
      ];
      const nombreHoja = s2.name.substring(0,25).replace(/[^a-zA-Z0-9 ]/g,"").trim();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hojaStaff), nombreHoja);
    });

    // Hoja Escuela: clases y clientes sin vendedor asignado
    const escuelaClases=classes.filter(c=>!c.sellerId);
    const escuelaClientes=clients.filter(c=>!c.sellerId);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["━━━ ESCUELA (sin vendedor asignado) ━━━"],[],
      ["CLASES"],["Fecha","Cliente","Tipo","Monto","Pagado","Saldo","Est.Pago","Instructor","Notas"],
      ...escuelaClases.map(c=>[c.classDate,c.clientName,c.classTypeName,c.amount,c.paidAmount,c.amount-c.paidAmount,PAY_STATUS[c.paymentStatus]?.label,staff.find(s=>s.id===c.instructorId)?.name||"",c.notes||""]),
      [],[`Total clases: ${escuelaClases.length}`],[`Total facturado: ${escuelaClases.reduce((a,c)=>a+c.amount,0)}`],[`Total cobrado: ${escuelaClases.reduce((a,c)=>a+c.paidAmount,0)}`],
      [],
      ["CLIENTES"],["Nombre","Teléfono","Email","Notas"],
      ...escuelaClientes.map(c=>[c.name,c.phone||"",c.email||"",c.notes||""]),
    ]), "Escuela");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(settlements.map(st=>{
      const s=staff.find(x=>x.id===st.staffId);
      return{Fecha:st.settledAt,Staff:s?.name||"","Periodo Inicio":st.periodStart,"Periodo Fin":st.periodEnd,Clases:st.totalClasses,"Total Pagado":st.totalEarned,Método:st.method,Notas:st.notes||""};
    })), "Liquidaciones");

    const {from:xFrom,to:xTo}=seasonRange();
    const xClasses=classes.filter(c=>c.classDate>=xFrom&&c.classDate<=xTo);
    const xExpenses=expenses.filter(e=>e.date>=xFrom&&e.date<=xTo);
    const xIngresosBrutos=xClasses.reduce((a,c)=>c.scenario==="own_class"&&c.schoolCut>0?a:a+c.paidAmount,0);
    const xACobrar=xClasses.reduce((a,c)=>{if(c.scenario==="own_class"&&c.schoolCut>0)return a;return a+(c.amount-c.paidAmount);},0);
    const xTotalFacturado=xClasses.reduce((a,c)=>a+c.amount,0);
    const xTotalComisiones=xClasses.reduce((a,c)=>c.scenario==="own_class"&&c.schoolCut>0?a:a+(c.sellerCommission||0),0);
    const xHonorariosAPagar=xClasses.reduce((a,c)=>a+(c.instructorEarning||0),0);
    const xAportesStaff=xClasses.reduce((a,c)=>c.scenario==="own_class"&&c.schoolCut>0?a+c.schoolCut:a,0);
    const xTotalInstructores=xHonorariosAPagar-xAportesStaff;
    const xTotalGastos=xExpenses.reduce((a,e)=>a+e.amount,0);
    const xNetoFinal=xIngresosBrutos-xTotalComisiones-xTotalInstructores-xTotalGastos;
    const xNetoProyectado=xIngresosBrutos+xACobrar-xTotalComisiones-xTotalInstructores-xTotalGastos;
    const xBonusIona=xNetoProyectado*0.1;
    const xNetoFinal2=xNetoProyectado*0.9;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["RESUMEN FINANCIERO",`Temporada ${xFrom} → ${xTo}`],[],
      ["Total Facturado",xTotalFacturado],["Total Cobrado",xIngresosBrutos],["A Cobrar",xACobrar],[],
      ["Comisiones Vendedores",xTotalComisiones],["Honorarios a Pagar",xHonorariosAPagar],["Aportes Instructores (own class)",xAportesStaff],["Honorarios Neto",xTotalInstructores],["Gastos Operativos",xTotalGastos],[],
      ["NETO FINAL (cobrado)",xNetoFinal],["NETO PROYECTADO",xNetoProyectado],[],
      ["Bonus Iona (10% neto proy.)",xBonusIona],["NETO PROYECTADO FINAL",xNetoFinal2],[],
      ["GASTOS DETALLE"],["Fecha","Descripción","Categoría","Monto"],
      ...xExpenses.map(e=>[e.date,e.description,e.category,e.amount]),
    ]), "Finanzas");

    XLSX.writeFile(wb, `nievepro_${fecha}.xlsx`);
    showToast("✓ Excel exportado");
  }

  if (!session) return <LoginScreen/>;

  // Staff no-admin y no-viewer va directo a su portal personal
  if (!isAdmin && !isViewer) {
    return <StaffPortalPage staffMember={staffProfile} staff={staff} classes={enrichedClasses} settlements={settlements} clients={clients} balance={getBalance(staffProfile?.id)} onSignOut={signOut}/>;
  }

  const NAV = [
    {id:"dashboard",label:"Dashboard",icon:"◈"},
    {id:"planning", label:"Planning", icon:"▦"},
    {id:"classes",  label:"Clases",   icon:"▤"},
    {id:"clients",  label:"Clientes", icon:"♟"},
    {id:"staff",    label:"Staff",    icon:"⚇"},
    {id:"finanzas", label:"Finanzas", icon:"$"},
    {id:"stats",    label:"Estadísticas",icon:"▲"},
    {id:"search",   label:"Buscador", icon:"⌕"},
    {id:"config",   label:"Config",   icon:"⚙"},
  ];

  function goToClient(clientId, clientName) {
    const c = clients.find(x => x.id === clientId || x.name?.toLowerCase() === clientName?.toLowerCase());
    if (c) { setSelectedClientId(c.id); setPage("clients"); }
  }

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
      {/* TOPBAR */}
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:54,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{fontSize:18,fontWeight:900,letterSpacing:"-0.04em",background:"linear-gradient(130deg,#60a5fa 0%,#a78bfa 60%,#f0a500 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>⛷ APEX</div>
          <Badge text={isViewer ? "VIEWER" : "ADMIN"} color={isViewer ? T.purple : T.gold}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="ghost" size="sm" onClick={handleExport}>↓ Excel</Btn>
          {!isViewer && <Btn variant="primary" size="sm" onClick={()=>setModal({type:"class_edit",data:null})}>＋ Nueva Clase</Btn>}
          <Btn variant="ghost" size="sm" onClick={signOut}>Salir</Btn>
        </div>
      </div>
      {/* NAV */}
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"0 24px",display:"flex",overflowX:"auto"}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>{setPage(n.id);setSelectedStaffId(null);setSelectedClientId(null);}} style={{background:"none",border:"none",borderBottom:page===n.id?`2px solid ${T.accent}`:"2px solid transparent",color:page===n.id?T.accent:T.textDim,padding:"12px 16px",cursor:"pointer",fontSize:13,fontWeight:page===n.id?700:500,whiteSpace:"nowrap",transition:"all .15s",fontFamily:"inherit"}}>
            <span style={{marginRight:5,fontSize:11}}>{n.icon}</span>{n.label}
          </button>
        ))}
      </div>
      {/* PAGES */}
      <div style={{padding:24,maxWidth:1360,margin:"0 auto"}}>
        {page==="planning" &&<PlanningView classes={enrichedClasses} staff={staff} isAdmin={true} onUpdate={isViewer?undefined:updateClassSchedule} onEdit={isViewer?undefined:c=>setModal({type:"class_edit",data:c})} onDelete={isViewer?undefined:async(id)=>{await deleteClass(id);showToast("✓ Clase eliminada")}}/>}
        {page==="dashboard"&&<DashboardPage staff={staff} classes={enrichedClasses} settlements={settlements} clients={clients} getBalance={getBalance} onSettle={isViewer?undefined:s=>setModal({type:"settle",data:{staffId:s.id,name:s.name}})} onToggle={isViewer?undefined:handleToggle} onViewStaff={s=>{setSelectedStaffId(s.id);setPage("staff");}}/>}
        {page==="classes"  &&<ClassesPage classes={enrichedClasses} staff={staff} clients={clients} onEdit={isViewer?undefined:c=>setModal({type:"class_edit",data:c})} onNew={isViewer?undefined:()=>setModal({type:"class_edit",data:null})} onClientClick={goToClient} onFinanceClick={c=>setModal({type:"class_finance",data:c})} onDelete={isViewer?undefined:async(id)=>{await deleteClass(id);showToast("✓ Clase eliminada")}} onGroupClasses={isViewer?undefined:groupClasses} onUngroupClasses={isViewer?undefined:ungroupClasses} onGroupPayment={isViewer?undefined:registerGroupPayment}/>}
        {page==="clients"  &&<ClientsPage clients={clients} staff={staff} classes={enrichedClasses} selectedClientId={selectedClientId} onClearSelected={()=>setSelectedClientId(null)} onEdit={isViewer?undefined:c=>setModal({type:"client_edit",data:c})} onNew={isViewer?undefined:()=>setModal({type:"client_edit",data:null})}/>}
        {page==="staff"    &&<StaffPage staff={staff} getBalance={getBalance} settlements={settlements} clients={clients} classes={enrichedClasses} selectedStaffId={selectedStaffId} onClearSelected={()=>setSelectedStaffId(null)} onToggle={isViewer?undefined:handleToggle} onEdit={isViewer?undefined:s=>setModal({type:"staff_edit",data:s})} onNew={isViewer?undefined:()=>setModal({type:"staff_edit",data:null})} onSettle={isViewer?undefined:s=>setModal({type:"settle",data:{staffId:s.id,name:s.name}})} extraCommissions={extraCommissions} onAddExtra={isViewer?undefined:s=>setModal({type:"extra_commission",data:s})} onDeleteExtra={isViewer?undefined:async(id)=>{await deleteExtraCommission(id);showToast("✓ Comisión eliminada");}}/>}
        {page==="finanzas" &&<FinanzasPage classes={enrichedClasses} expenses={expenses} staff={staff} config={config} onAddExpense={isViewer?undefined:addExpense}/>}
        {page==="stats"    &&<EstadisticasPage classes={enrichedClasses} staff={staff} clients={clients} config={config}/>}
        {page==="search"   &&<SearchPage clients={clients} classes={enrichedClasses} staff={staff} onViewClient={c=>{setSelectedClientId(c.id);setPage("clients");}}/>}
        {page==="config"   &&<ConfigPage config={config} onSave={async (c)=>{await saveConfig(c);showToast("✓ Configuración guardada");}} staff={staff} onSaveStaff={handleSaveStaff}/>}
      </div>
      {/* MODALS */}
      {modal?.type==="class_edit"   &&<ModalClassEdit data={modal.data} staff={staff} clients={clients} classes={enrichedClasses} config={config} onSave={handleSaveClass} onClose={()=>setModal(null)}/>}
      {modal?.type==="class_finance"&&<ClassFinanceModal cls={modal.data} staff={staff} onClose={()=>setModal(null)}/>}
      {modal?.type==="settle"       &&<ModalSettle name={modal.data.name} staffId={modal.data.staffId} classes={enrichedClasses} onConfirm={handleSettle} onClose={()=>setModal(null)}/>}
      {modal?.type==="client_edit"  &&<ModalClientEdit data={modal.data} staff={staff} clients={clients} onSave={handleSaveClient} onClose={()=>setModal(null)}/>}
      {modal?.type==="staff_edit"   &&<ModalStaffEdit data={modal.data} config={config} onSave={handleSaveStaff} onClose={()=>setModal(null)}/>}
{modal?.type==="extra_commission"&&<ModalExtraCommission staff={modal.data} onSave={async(amount,desc,date)=>{await addExtraCommission(modal.data.id,amount,desc,date);showToast("✓ Comisión registrada");setModal(null);}} onClose={()=>setModal(null)}/>}
      {toast&&<div style={{position:"fixed",bottom:24,right:24,background:toast.type==="error"?T.red:T.green,color:T.white,padding:"12px 20px",borderRadius:10,fontWeight:700,fontSize:13,boxShadow:"0 8px 40px rgba(0,0,0,.5)",zIndex:999}}>{toast.msg}</div>}
    </div>
  );
}

// ─── PAGES (versiones simplificadas que importan la lógica del simulador) ─────
// Estas páginas son idénticas a las del simulador NieveProApp_v2.jsx
// Solo cambia que reciben datos reales en lugar de mock

function DashboardPage({staff,classes,settlements,clients,getBalance,onSettle,onToggle,onViewStaff}){
  const [season,setSeason]=useState("current");
  const {sfrom,sto}=useMemo(()=>{
    if(season==="current") return {sfrom:seasonRange().from,sto:seasonRange().to};
    if(season==="last")    return {sfrom:seasonRange(-1).from,sto:seasonRange(-1).to};
    return {sfrom:"2000-01-01",sto:"2099-12-31"};
  },[season]);
  const seasonClasses=useMemo(()=>classes.filter(c=>c.classDate>=sfrom&&c.classDate<=sto),[classes,sfrom,sto]);
  const totalPending=staff.reduce((a,s)=>a+getBalance(s.id).pendingAmount,0);
  const totalSettled=settlements.filter(s=>s.settledAt>=sfrom&&s.settledAt<=sto).reduce((a,s)=>a+s.totalEarned,0);
  const unassigned=seasonClasses.filter(c=>!c.isSettled&&c.instructorStatus==="unassigned").length;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:24}}>
      <Card style={{padding:"12px 18px"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:11,color:T.muted,fontWeight:700}}>TEMPORADA:</span>
          {[["current","Esta temporada"],["last","Temporada anterior"],["all","Todo"]].map(([v,l])=>(
            <Btn key={v} variant={season===v?"primary":"ghost"} size="sm" onClick={()=>setSeason(v)}>{l}</Btn>
          ))}
          <span style={{marginLeft:"auto",fontSize:12,color:T.textDim}}><b style={{color:T.text}}>{seasonClasses.length}</b> clases · <span style={{color:T.muted,fontSize:11}}>A pagar staff = siempre pendiente total</span></span>
        </div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14}}>
        <Card><Stat label="A Pagar Staff" value={fmt(totalPending)} color={T.gold} icon="⚠"/></Card>
        <Card><Stat label="Liquidado en período" value={fmt(totalSettled)} color={T.green} icon="✓"/></Card>
        <Card><Stat label="Sin Instructor" value={unassigned} color={T.red} icon="⚠"/></Card>
        <Card><Stat label="Total Staff" value={staff.filter(s=>s.isActive).length} color={T.cyan} sub="activos"/></Card>
      </div>
      <SectionTitle>Cuentas Corrientes</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:14}}>
        {staff.map(s=>{
          const bal=getBalance(s.id);
          const hist=settlements.filter(st=>st.staffId===s.id).reduce((a,h)=>a+h.totalEarned,0);
          const rc=ROLE_COLORS[s.role];
          return(
            <Card key={s.id} style={{opacity:s.isActive?1:.5}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <Av name={s.name} size={40} color={rc}/>
                <div style={{flex:1}}>
                  <button onClick={()=>onViewStaff(s)} style={{background:"none",border:"none",color:T.text,fontWeight:800,fontSize:14,cursor:"pointer",padding:0,fontFamily:"inherit",textDecoration:"underline",textDecorationColor:T.borderLight}}>{s.name}</button>
                  <div style={{display:"flex",gap:5,marginTop:3}}><Badge text={ROLE_LABELS[s.role]} color={rc}/>{!s.isActive&&<Badge text="INACTIVO" color={T.red} dot/>}</div>
                </div>
                <Toggle value={s.isActive} onChange={()=>onToggle(s.id)}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                <div style={{background:`${T.gold}0d`,border:`1px solid ${T.gold}25`,borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:10,color:T.textDim,textTransform:"uppercase"}}>A PAGAR</div>
                  <div style={{fontSize:18,fontWeight:900,color:bal.pendingAmount>0?T.gold:T.muted,fontFamily:"monospace",marginTop:2}}>{fmt(bal.pendingAmount)}</div>
                  <div style={{fontSize:11,color:T.muted}}>{bal.pendingClasses} clase(s)</div>
                </div>
                <div style={{background:`${T.green}0d`,border:`1px solid ${T.green}25`,borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:10,color:T.textDim,textTransform:"uppercase"}}>LIQUIDADO</div>
                  <div style={{fontSize:18,fontWeight:900,color:T.green,fontFamily:"monospace",marginTop:2}}>{fmt(hist)}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn variant="gold" size="sm" disabled={bal.pendingAmount===0||!s.isActive} onClick={()=>onSettle(s)} style={{flex:1}}>✓ Liquidar</Btn>
                <Btn variant="ghost" size="sm" onClick={()=>onViewStaff(s)}>Ficha →</Btn>
              </div>
            </Card>
          );
        })}
      </div>
      <SectionTitle>Últimas Liquidaciones</SectionTitle>
      <Card style={{padding:0,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>{["Staff","Periodo","Clases","Pagado","Método","Fecha"].map(h=><TH key={h}>{h}</TH>)}</tr></thead>
          <tbody>
            {settlements.slice().reverse().slice(0,10).map(st=>{
              const s=staff.find(x=>x.id===st.staffId);
              return(<tr key={st.id}><TD><div style={{display:"flex",alignItems:"center",gap:8}}><Av name={s?.name||"?"} size={26} color={ROLE_COLORS[s?.role]}/><span style={{fontWeight:600,fontSize:13}}>{s?.name}</span></div></TD><TD style={{color:T.textDim,fontSize:12}}>{fmtDate(st.periodStart)} – {fmtDate(st.periodEnd)}</TD><TD style={{fontFamily:"monospace"}}>{st.totalClasses}</TD><TD style={{fontFamily:"monospace",color:T.green,fontWeight:700}}>{fmt(st.totalEarned)}</TD><TD style={{fontSize:12}}>{st.method}</TD><TD style={{fontSize:12,color:T.textDim}}>{fmtDate(st.settledAt)}</TD></tr>);
            })}
            {settlements.length===0&&<tr><td colSpan={6}><Empty text="Sin liquidaciones"/></td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ClassesPage({classes,staff,clients,onEdit,onNew,onClientClick,onFinanceClick,onDelete,onGroupClasses,onUngroupClasses,onGroupPayment}){
  const [payF,setPayF]=useState("all");
  const [instrF,setInstrF]=useState("all");
  const [settF,setSettF]=useState("pending");
  const [search,setSearch]=useState("");
  const [season,setSeason]=useState("current");
  const [customFrom,setCustomFrom]=useState(seasonRange().from);
  const [customTo,setCustomTo]=useState(seasonRange().to);
  const [sortDir,setSortDir]=useState("desc");
  const [selected,setSelected]=useState(new Set());
  const [expandedGroups,setExpandedGroups]=useState(new Set());
  const [groupPayModal,setGroupPayModal]=useState(null); // {groupId, groupClasses}
  const [groupPayAmount,setGroupPayAmount]=useState("");
  const [savingPay,setSavingPay]=useState(false);

  const {sfrom,sto}=useMemo(()=>{
    if(season==="current") return {sfrom:seasonRange().from,sto:seasonRange().to};
    if(season==="last")    return {sfrom:seasonRange(-1).from,sto:seasonRange(-1).to};
    if(season==="custom")  return {sfrom:customFrom,sto:customTo};
    return {sfrom:"2000-01-01",sto:"2099-12-31"};
  },[season,customFrom,customTo]);

  const filtered=useMemo(()=>classes.filter(c=>{
    if(c.classDate<sfrom||c.classDate>sto)return false;
    if(payF!=="all"&&c.paymentStatus!==payF)return false;
    if(instrF!=="all"&&c.instructorStatus!==instrF)return false;
    if(settF==="pending"&&c.isSettled)return false;
    if(settF==="settled"&&!c.isSettled)return false;
    if(search&&!c.clientName?.toLowerCase().includes(search.toLowerCase())&&!c.notes?.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  }),[classes,sfrom,sto,payF,instrF,settF,search]);

  const sorted=useMemo(()=>[...filtered].sort((a,b)=>sortDir==="asc"?a.classDate.localeCompare(b.classDate):b.classDate.localeCompare(a.classDate)),[filtered,sortDir]);

  const {groupMap,ungrouped}=useMemo(()=>{
    const gm={};
    const ug=[];
    for(const c of sorted){
      if(c.groupId){if(!gm[c.groupId])gm[c.groupId]=[];gm[c.groupId].push(c);}
      else ug.push(c);
    }
    return {groupMap:gm,ungrouped:ug};
  },[sorted]);

  const totalM=filtered.reduce((a,c)=>c.scenario==="own_class"&&c.schoolCut>0?a+c.schoolCut:a+c.amount,0);
  const totalC=filtered.reduce((a,c)=>c.scenario==="own_class"&&c.schoolCut>0?a:a+c.paidAmount,0);

  function toggleSelect(id){setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});}
  function toggleGroup(gid){setExpandedGroups(s=>{const n=new Set(s);n.has(gid)?n.delete(gid):n.add(gid);return n;});}

  async function handleGroupSelected(){
    const ids=[...selected];
    if(ids.length<2)return;
    const gid=crypto.randomUUID();
    await onGroupClasses(ids,gid);
    setSelected(new Set());
    setExpandedGroups(s=>new Set([...s,gid]));
  }

  async function handleGroupPayment(){
    if(!groupPayModal||!groupPayAmount)return;
    setSavingPay(true);
    try{await onGroupPayment(groupPayModal.groupClasses,+groupPayAmount);}
    catch(e){alert("Error: "+e.message);}
    finally{setSavingPay(false);setGroupPayModal(null);setGroupPayAmount("");}
  }

  function ClassRow({c,indent=false}){
    const seller=staff.find(s=>s.id===c.sellerId);
    const instr=staff.find(s=>s.id===c.instructorId);
    const staffE=(c.sellerCommission||0)+(c.instructorEarning||0);
    const lb=c.paymentStatus==="reserved"?T.gold:c.paymentStatus==="partial"?T.orange:T.green;
    return(
      <tr style={{borderLeft:`3px solid ${lb}40`,background:indent?`${T.surface}80`:undefined}}>
        <TD style={{fontSize:12,color:T.textDim,whiteSpace:"nowrap",paddingLeft:indent?28:undefined}}>{fmtDate(c.classDate)}</TD>
        <TD><Badge text={c.classTypeName||"—"} color={T.muted} small/><Badge text={c.discipline==="snowboard"?"🏂 Snowboard":"🎿 Esquí"} color={c.discipline==="snowboard"?T.purple:T.cyan} small/></TD>
        <TD><button onClick={()=>onClientClick(c.clientId,c.clientName)} style={{background:"none",border:"none",color:T.accent,fontWeight:700,fontSize:13,cursor:"pointer",padding:0,fontFamily:"inherit",textDecoration:"underline"}}>{c.clientName}</button>{c.notes&&<div style={{fontSize:11,color:T.textDim,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.notes}</div>}</TD>
        <TD><div style={{fontFamily:"monospace",fontWeight:800}}>{fmt(c.amount)}</div><button onClick={()=>onFinanceClick(c)} style={{background:"none",border:"none",color:PAY_STATUS[c.paymentStatus]?.color,fontSize:11,cursor:"pointer",padding:0,fontFamily:"monospace",fontWeight:600,textDecoration:"underline"}}>{fmt(c.paidAmount)} ▸</button><PayBar amount={c.amount} paidAmount={c.paidAmount}/></TD>
        <TD><PayBadge status={c.paymentStatus}/></TD>
        <TD style={{fontSize:12}}>{seller?<div style={{display:"flex",alignItems:"center",gap:6}}><Av name={seller.name} size={22} color={T.cyan}/>{seller.name}</div>:<span style={{color:T.muted}}>—</span>}</TD>
        <TD>{instr?<div><div style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}><Av name={instr.name} size={22} color={T.purple}/>{instr.name}</div><InstrBadge status={c.instructorStatus}/></div>:<InstrBadge status="unassigned"/>}</TD>
        <TD style={{fontFamily:"monospace",color:T.accent,fontWeight:700}}>{fmt(staffE)}</TD>
        <TD style={{fontSize:11,color:T.textDim,whiteSpace:"nowrap"}}>{c.createdAt?fmtDate(c.createdAt):"—"}</TD>
        <TD><Badge text={c.isSettled?"LIQ.":"PEND."} color={c.isSettled?T.muted:T.gold} small dot={!c.isSettled}/></TD>
        <TD><div style={{display:"flex",gap:6}}>{onEdit&&<Btn variant="ghost" size="sm" onClick={()=>onEdit(c)}>✎</Btn>}{onDelete&&<Btn variant="danger" size="sm" onClick={()=>{if(window.confirm("¿Eliminar esta clase?"))onDelete(c.id)}}>✕</Btn>}</div></TD>
      </tr>
    );
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {groupPayModal&&(
        <Modal title="Registrar Pago del Grupo" onClose={()=>{setGroupPayModal(null);setGroupPayAmount("");}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:T.surface,borderRadius:8,padding:"10px 14px",fontSize:12,color:T.textDim}}>
              <strong style={{color:T.text}}>{groupPayModal.groupClasses[0]?.clientName}</strong> · {groupPayModal.groupClasses.length} clases<br/>
              Total: <strong style={{color:T.text}}>{fmt(groupPayModal.groupClasses.reduce((a,c)=>a+c.amount,0))}</strong> · Cobrado: <strong style={{color:T.green}}>{fmt(groupPayModal.groupClasses.reduce((a,c)=>a+c.paidAmount,0))}</strong> · Saldo: <strong style={{color:T.orange}}>{fmt(groupPayModal.groupClasses.reduce((a,c)=>a+(c.amount-c.paidAmount),0))}</strong>
            </div>
            <Inp label="Monto recibido (USD)" type="number" value={groupPayAmount} onChange={v=>setGroupPayAmount(v)} placeholder="Ej: 500" required/>
            <div style={{fontSize:11,color:T.textDim,background:T.surface,borderRadius:6,padding:"6px 10px"}}>Se distribuirá proporcionalmente entre las {groupPayModal.groupClasses.length} clases del grupo.</div>
            <div style={{display:"flex",gap:8}}>
              <Btn full variant="primary" disabled={!groupPayAmount||savingPay} onClick={handleGroupPayment}>{savingPay?"Guardando...":"✓ Registrar Pago"}</Btn>
              <Btn full variant="ghost" onClick={()=>{setGroupPayModal(null);setGroupPayAmount("");}}>Cancelar</Btn>
            </div>
          </div>
        </Modal>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <Card style={{padding:"12px 16px"}}><Stat label="Monto Total" value={fmt(totalM)} color={T.text}/></Card>
        <Card style={{padding:"12px 16px"}}><Stat label="Cobrado" value={fmt(totalC)} color={T.green}/></Card>
        <Card style={{padding:"12px 16px"}}><Stat label="Saldo a Cobrar" value={fmt(totalM-totalC)} color={totalM-totalC>0?T.orange:T.green}/></Card>
      </div>
      <Card style={{padding:"14px 18px"}}>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
          <span style={{fontSize:10,color:T.muted,fontWeight:700}}>TEMPORADA:</span>
          {[["current","Esta temporada"],["last","Temporada anterior"],["all","Todas"],["custom","Personalizado"]].map(([v,l])=>(
            <Btn key={v} variant={season===v?"primary":"ghost"} size="sm" onClick={()=>setSeason(v)}>{l}</Btn>
          ))}
          {season==="custom"&&<>
            <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:7,padding:"5px 10px",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
            <span style={{color:T.muted}}>—</span>
            <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:7,padding:"5px 10px",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
          </>}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Cliente o notas..." style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:7,padding:"7px 12px",fontSize:13,minWidth:180,outline:"none",fontFamily:"inherit"}}/>
          <div style={{display:"flex",gap:4}}><span style={{fontSize:10,color:T.muted,alignSelf:"center"}}>PAGO:</span>{[["all","Todos"],["reserved","Reservado"],["partial","Parcial"],["paid","Pagado"]].map(([v,l])=><Btn key={v} variant={payF===v?"primary":"ghost"} size="sm" onClick={()=>setPayF(v)}>{l}</Btn>)}</div>
          <div style={{display:"flex",gap:4}}><span style={{fontSize:10,color:T.muted,alignSelf:"center"}}>INSTR:</span>{[["all","Todos"],["unassigned","Sin Asignar"],["assigned","Asignada"],["done","Dada"]].map(([v,l])=><Btn key={v} variant={instrF===v?"primary":"ghost"} size="sm" onClick={()=>setInstrF(v)}>{l}</Btn>)}</div>
          <div style={{display:"flex",gap:4}}><span style={{fontSize:10,color:T.muted,alignSelf:"center"}}>ESTADO:</span>{[["pending","Pendientes"],["settled","Liquidadas"],["all","Todas"]].map(([v,l])=><Btn key={v} variant={settF===v?"primary":"ghost"} size="sm" onClick={()=>setSettF(v)}>{l}</Btn>)}</div>
          <Btn variant="primary" size="sm" onClick={onNew} style={{marginLeft:"auto"}}>＋ Nueva</Btn>
        </div>
        {selected.size>=2&&onGroupClasses&&(
          <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:12,color:T.textDim}}>{selected.size} clases seleccionadas</span>
            <Btn variant="primary" size="sm" onClick={handleGroupSelected}>Agrupar seleccionadas</Btn>
            <Btn variant="ghost" size="sm" onClick={()=>setSelected(new Set())}>Cancelar</Btn>
          </div>
        )}
      </Card>
      <Card style={{padding:0,overflow:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:1050}}>
          <thead><tr><TH><button onClick={()=>setSortDir(d=>d==="asc"?"desc":"asc")} style={{background:"none",border:"none",color:T.textDim,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700,padding:0}}>{sortDir==="asc"?"▲":"▼"} Fecha</button></TH><TH>Tipo</TH><TH>Cliente</TH><TH>Monto / Cobrado</TH><TH>Pago</TH><TH>Vendedor</TH><TH>Instructor</TH><TH>Staff Gana</TH><TH>Reserva</TH><TH>Liquid.</TH><TH>Edit.</TH></tr></thead>
          <tbody>
            {Object.entries(groupMap).map(([gid,gclasses])=>{
              const expanded=expandedGroups.has(gid);
              const gTotal=gclasses.reduce((a,c)=>a+c.amount,0);
              const gPaid=gclasses.reduce((a,c)=>a+c.paidAmount,0);
              const gSaldo=gTotal-gPaid;
              const worstStatus=gclasses.some(c=>c.paymentStatus==="reserved")?"reserved":gclasses.some(c=>c.paymentStatus==="partial")?"partial":"paid";
              const lb=worstStatus==="reserved"?T.gold:worstStatus==="partial"?T.orange:T.green;
              const client=gclasses[0];
              return(
                <Fragment key={gid}>
                  <tr style={{background:`${T.accent}08`,borderLeft:`3px solid ${lb}`,cursor:"pointer"}} onClick={()=>toggleGroup(gid)}>
                    <TD style={{fontSize:12,color:T.textDim,whiteSpace:"nowrap"}}>{expanded?"▼":"▶"} {fmtDate(gclasses.reduce((a,c)=>c.classDate<a?c.classDate:a,gclasses[0].classDate))}</TD>
                    <TD><Badge text={`${gclasses.length} días`} color={T.accent} small/></TD>
                    <TD><span style={{color:T.accent,fontWeight:700,fontSize:13}}>{client?.clientName}</span>{client?.notes&&<div style={{fontSize:11,color:T.textDim,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{client.notes}</div>}</TD>
                    <TD>
                      <div style={{fontFamily:"monospace",fontWeight:800}}>{fmt(gTotal)}</div>
                      <div style={{fontFamily:"monospace",fontSize:11,color:T.green}}>{fmt(gPaid)} cobrado</div>
                      <PayBar amount={gTotal} paidAmount={gPaid}/>
                    </TD>
                    <TD><PayBadge status={worstStatus}/></TD>
                    <TD colSpan={3} style={{fontSize:11,color:T.textDim}}>Saldo: <strong style={{color:gSaldo>0?T.orange:T.green}}>{fmt(gSaldo)}</strong></TD>
                    <TD><Badge text={gclasses.every(c=>c.isSettled)?"LIQ.":"PEND."} color={gclasses.every(c=>c.isSettled)?T.muted:T.gold} small dot={!gclasses.every(c=>c.isSettled)}/></TD>
                    <TD onClick={e=>e.stopPropagation()}>
                      <div style={{display:"flex",gap:4}}>
                        {onGroupPayment&&<Btn variant="primary" size="sm" onClick={()=>setGroupPayModal({groupId:gid,groupClasses:gclasses})}>$ Pago</Btn>}
                        {onUngroupClasses&&<Btn variant="ghost" size="sm" onClick={()=>{if(window.confirm("¿Desagrupar estas clases?"))onUngroupClasses(gid)}}>Desagrupar</Btn>}
                      </div>
                    </TD>
                  </tr>
                  {expanded&&gclasses.sort((a,b)=>a.classDate.localeCompare(b.classDate)).map(c=><ClassRow key={c.id} c={c} indent/>)}
                </Fragment>
              );
            })}
            {ungrouped.map(c=>(
              <tr key={c.id} style={{borderLeft:`3px solid ${(c.paymentStatus==="reserved"?T.gold:c.paymentStatus==="partial"?T.orange:T.green)}40`}}>
                <TD style={{fontSize:12,color:T.textDim,whiteSpace:"nowrap"}}>
                  {onGroupClasses&&<input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggleSelect(c.id)} style={{marginRight:6,accentColor:T.accent,cursor:"pointer"}} onClick={e=>e.stopPropagation()}/>}
                  {fmtDate(c.classDate)}
                </TD>
                <TD><Badge text={c.classTypeName||"—"} color={T.muted} small/><Badge text={c.discipline==="snowboard"?"🏂 Snowboard":"🎿 Esquí"} color={c.discipline==="snowboard"?T.purple:T.cyan} small/></TD>
                <TD><button onClick={()=>onClientClick(c.clientId,c.clientName)} style={{background:"none",border:"none",color:T.accent,fontWeight:700,fontSize:13,cursor:"pointer",padding:0,fontFamily:"inherit",textDecoration:"underline"}}>{c.clientName}</button>{c.notes&&<div style={{fontSize:11,color:T.textDim,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.notes}</div>}</TD>
                <TD><div style={{fontFamily:"monospace",fontWeight:800}}>{fmt(c.amount)}</div><button onClick={()=>onFinanceClick(c)} style={{background:"none",border:"none",color:PAY_STATUS[c.paymentStatus]?.color,fontSize:11,cursor:"pointer",padding:0,fontFamily:"monospace",fontWeight:600,textDecoration:"underline"}}>{fmt(c.paidAmount)} ▸</button><PayBar amount={c.amount} paidAmount={c.paidAmount}/></TD>
                <TD><PayBadge status={c.paymentStatus}/></TD>
                <TD style={{fontSize:12}}>{staff.find(s=>s.id===c.sellerId)?<div style={{display:"flex",alignItems:"center",gap:6}}><Av name={staff.find(s=>s.id===c.sellerId).name} size={22} color={T.cyan}/>{staff.find(s=>s.id===c.sellerId).name}</div>:<span style={{color:T.muted}}>—</span>}</TD>
                <TD>{staff.find(s=>s.id===c.instructorId)?<div><div style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}><Av name={staff.find(s=>s.id===c.instructorId).name} size={22} color={T.purple}/>{staff.find(s=>s.id===c.instructorId).name}</div><InstrBadge status={c.instructorStatus}/></div>:<InstrBadge status="unassigned"/>}</TD>
                <TD style={{fontFamily:"monospace",color:T.accent,fontWeight:700}}>{fmt((c.sellerCommission||0)+(c.instructorEarning||0))}</TD>
                <TD><Badge text={c.isSettled?"LIQ.":"PEND."} color={c.isSettled?T.muted:T.gold} small dot={!c.isSettled}/></TD>
                <TD><div style={{display:"flex",gap:6}}>{onEdit&&<Btn variant="ghost" size="sm" onClick={()=>onEdit(c)}>✎</Btn>}{onDelete&&<Btn variant="danger" size="sm" onClick={()=>{if(window.confirm("¿Eliminar esta clase?"))onDelete(c.id)}}>✕</Btn>}</div></TD>
              </tr>
            ))}
            {filtered.length===0&&<tr><td colSpan={10}><Empty text="No hay clases con estos filtros"/></td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ClientsPage({clients,staff,classes,selectedClientId,onClearSelected,onEdit,onNew}){
  const [search,setSearch]=useState("");
  const [viewMode,setViewMode]=useState("grid"); // "grid" | "by_seller"
  const [collapsed,setCollapsed]=useState({}); // sellerId → bool
  const [viewClient,setViewClient]=useState(null);

  // Hooks SIEMPRE antes de cualquier return condicional
  const filtered=useMemo(()=>clients.filter(c=>!search||[c.name,c.phone,c.email,c.notes].some(f=>f?.toLowerCase().includes(search.toLowerCase()))),[clients,search]);

  const sellerGroups=useMemo(()=>{
    const sellers=staff.filter(s=>s.role==="seller"||s.role==="both");
    const groups=[
      {key:"__escuela__",name:"Escuela",color:T.green,clients:[]},
      ...sellers.map(s=>({key:s.id,name:s.name,color:T.cyan,clients:[]})),
    ];
    filtered.forEach(c=>{
      const g=groups.find(x=>x.key===(c.sellerId||"__escuela__"))||groups[0];
      g.clients.push(c);
    });
    return groups.filter(g=>g.clients.length>0);
  },[filtered,staff]);

  function toggleGroup(key){setCollapsed(p=>({...p,[key]:!p[key]}));}

  // Early return DESPUÉS de todos los hooks
  const target=selectedClientId?clients.find(c=>c.id===selectedClientId):null;
  if(target||viewClient){
    const cl=viewClient||target;
    const cls=classes.filter(c=>c.clientId===cl.id||c.clientName?.toLowerCase()===cl.name?.toLowerCase());
    return <Card><ClientDetailCard client={cl} allClasses={cls} staff={staff} onBack={()=>{setViewClient(null);onClearSelected();}} backLabel="← Volver a Clientes" isAdmin/><div style={{marginTop:16}}>{onEdit&&<Btn variant="ghost" size="sm" onClick={()=>onEdit(cl)}>✎ Editar</Btn>}</div></Card>;
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar..." style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:8,padding:"8px 14px",fontSize:13,flex:1,minWidth:160,outline:"none",fontFamily:"inherit"}}/>
        <div style={{display:"flex",gap:4}}>
          <Btn variant={viewMode==="grid"?"primary":"ghost"} size="sm" onClick={()=>setViewMode("grid")}>⊞ Todos</Btn>
          <Btn variant={viewMode==="by_seller"?"primary":"ghost"} size="sm" onClick={()=>setViewMode("by_seller")}>⚇ Por Vendedor</Btn>
        </div>
        {onNew&&<Btn variant="primary" size="sm" onClick={onNew}>＋ Nuevo</Btn>}
        <span style={{fontSize:12,color:T.textDim}}><b style={{color:T.text}}>{filtered.length}</b> clientes</span>
      </div>

      {viewMode==="grid"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
          {filtered.map(c=>{
            const seller=staff.find(s=>s.id===c.sellerId);
            const cls=classes.filter(x=>x.clientId===c.id||x.clientName?.toLowerCase()===c.name?.toLowerCase());
            return(
              <Card key={c.id}>
                <div style={{display:"flex",gap:12,marginBottom:12}}><Av name={c.name} size={44} color={T.accent}/><div style={{flex:1}}><div style={{fontWeight:800,fontSize:14}}>{c.name}</div>{c.phone&&<div style={{fontSize:12,color:T.textDim,marginTop:2}}>📞 {c.phone}</div>}{c.email&&<div style={{fontSize:12,color:T.textDim}}>✉ {c.email}</div>}</div></div>
                {c.notes&&<div style={{fontSize:12,color:T.textDim,background:T.surface,borderRadius:6,padding:"6px 10px",marginBottom:12,lineHeight:1.5,maxHeight:50,overflow:"hidden"}}>{c.notes}</div>}
                <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>{seller?<Badge text={seller.name} color={T.cyan}/>:<Badge text="Escuela" color={T.green}/>}<Badge text={`${cls.length} clase(s)`} color={T.purple}/><Badge text={fmt(cls.reduce((a,c)=>a+c.amount,0))} color={T.green}/></div>
                <div style={{display:"flex",gap:8}}><Btn variant="ghost" size="sm" onClick={()=>setViewClient(c)} style={{flex:1}}>Ver Ficha</Btn>{onEdit&&<Btn variant="ghost" size="sm" onClick={()=>onEdit(c)}>✎</Btn>}</div>
              </Card>
            );
          })}
          {filtered.length===0&&<div style={{gridColumn:"1/-1"}}><Empty text="Sin clientes"/></div>}
        </div>
      )}

      {viewMode==="by_seller"&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {sellerGroups.length===0&&<Empty text="Sin clientes"/>}
          {sellerGroups.map(g=>{
            const open=!collapsed[g.key];
            const total=g.clients.reduce((a,c)=>a+classes.filter(x=>x.clientId===c.id||x.clientName?.toLowerCase()===c.name?.toLowerCase()).reduce((b,x)=>b+x.amount,0),0);
            return(
              <div key={g.key}>
                <button onClick={()=>toggleGroup(g.key)} style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",color:T.text,fontFamily:"inherit",marginBottom:open?8:0}}>
                  <Av name={g.name[0]==="E"&&g.key==="__escuela__"?"Esc":g.name} size={32} color={g.color}/>
                  <div style={{flex:1,textAlign:"left"}}>
                    <div style={{fontWeight:800,fontSize:14,color:g.color}}>{g.name}</div>
                    <div style={{fontSize:11,color:T.textDim}}>{g.clients.length} cliente(s) · {fmt(total)}</div>
                  </div>
                  <span style={{color:T.muted,fontSize:16}}>{open?"▲":"▼"}</span>
                </button>
                {open&&(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10,paddingLeft:8,borderLeft:`2px solid ${g.color}30`}}>
                    {g.clients.map(c=>{
                      const cls=classes.filter(x=>x.clientId===c.id||x.clientName?.toLowerCase()===c.name?.toLowerCase());
                      return(
                        <Card key={c.id} style={{padding:"12px 14px"}}>
                          <div style={{display:"flex",gap:10,marginBottom:8}}>
                            <Av name={c.name} size={36} color={T.accent}/>
                            <div style={{flex:1}}>
                              <div style={{fontWeight:800,fontSize:13}}>{c.name}</div>
                              {c.phone&&<div style={{fontSize:11,color:T.textDim}}>📞 {c.phone}</div>}
                            </div>
                          </div>
                          {c.notes&&<div style={{fontSize:11,color:T.textDim,background:T.surface,borderRadius:5,padding:"4px 8px",marginBottom:8,maxHeight:36,overflow:"hidden"}}>{c.notes}</div>}
                          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                            <Badge text={`${cls.length} clase(s)`} color={T.purple} small/>
                            <Badge text={fmt(cls.reduce((a,c)=>a+c.amount,0))} color={T.green} small/>
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <Btn variant="ghost" size="sm" onClick={()=>setViewClient(c)} style={{flex:1}}>Ver Ficha</Btn>
                            {onEdit&&<Btn variant="ghost" size="sm" onClick={()=>onEdit(c)}>✎</Btn>}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StaffPage({staff,getBalance,settlements,clients,classes,extraCommissions,selectedStaffId,onClearSelected,onToggle,onEdit,onNew,onSettle,onAddExtra,onDeleteExtra}){
  const [viewId,setViewId]=useState(selectedStaffId||null);
  const [staffTab,setStaffTab]=useState("pending");
  const [selClient,setSelClient]=useState(null);
  const viewStaff=viewId?staff.find(s=>s.id===viewId):null;
  if(viewStaff){
    const bal=getBalance(viewStaff.id);
    const myClasses=classes.filter(c=>c.sellerId===viewStaff.id||c.instructorId===viewStaff.id).sort((a,b)=>b.classDate?.localeCompare(a.classDate));
    const pendingPast=myClasses.filter(c=>!c.isSettled&&c.classDone).reduce((a,c)=>{
      const earn=(c.instructorId===viewStaff.id&&(c.scenario==="instructor_only"||c.scenario==="seller_and_instructor"))?c.instructorEarning:c.sellerCommission;
      return a+(earn||0);
    },0);
    const mySettlements=settlements.filter(s=>s.staffId===viewStaff.id);
    const myClients=clients.filter(c=>c.sellerId===viewStaff.id);
    const isSeller=viewStaff.role==="seller"||viewStaff.role==="both";
    const tabs=[["pending","Pendientes"],["history","Historial"],["settlements","Liquidaciones"],...(isSeller?[["clients",`Cartera (${myClients.length})`]]:[])] ;
    return(
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <BackBtn onClick={()=>{setViewId(null);onClearSelected();}} label="← Volver a Staff"/>
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
            <Av name={viewStaff.name} size={56} color={ROLE_COLORS[viewStaff.role]}/>
            <div style={{flex:1}}>
              <div style={{fontSize:20,fontWeight:900}}>{viewStaff.name}</div>
              <div style={{display:"flex",gap:8,marginTop:5,flexWrap:"wrap"}}>
                <Badge text={ROLE_LABELS[viewStaff.role]} color={ROLE_COLORS[viewStaff.role]}/>
                {viewStaff.role!=="instructor"&&<Badge text={`${viewStaff.commissionPct}% comisión`} color={T.cyan}/>}
                {viewStaff.role!=="seller"&&viewStaff.role!=="admin"&&<Badge text={`${fmt(viewStaff.hourlyRate)}/hora`} color={T.purple}/>}
              </div>
              <div style={{fontSize:12,color:T.textDim,marginTop:6}}>📞 {viewStaff.phone} · ✉ {viewStaff.email}</div>
            </div>
            <div style={{display:"flex",gap:8,flexDirection:"column",alignItems:"flex-end"}}>
              <Toggle value={viewStaff.isActive} onChange={()=>onToggle(viewStaff.id)}/>
              <Btn variant="ghost" size="sm" onClick={()=>onEdit(viewStaff)}>✎ Editar</Btn>
<Btn variant="teal" size="sm" onClick={()=>onAddExtra(viewStaff)}>＋ Comisión</Btn>
<Btn variant="gold" size="sm" disabled={pendingPast===0} onClick={()=>onSettle(viewStaff)}>✓ Liquidar</Btn>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${isSeller?4:3},1fr)`,gap:10,marginBottom:16}}>
            {[["A Pagar",fmt(pendingPast),T.gold],["Liquidado",fmt(mySettlements.reduce((a,s)=>a+s.totalEarned,0)),T.green],["Clases",myClasses.length,T.text],...(isSeller?[["Clientes",myClients.length,T.cyan]]:[])].map(([l,v,c])=>(
              <div key={l} style={{background:T.surface,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                <div style={{fontSize:10,color:T.textDim,textTransform:"uppercase"}}>{l}</div>
                <div style={{fontSize:20,fontWeight:900,color:c,fontFamily:"monospace",marginTop:4}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:3,background:T.surface,borderRadius:8,padding:4,marginBottom:14}}>
            {tabs.map(([v,l])=>(<button key={v} onClick={()=>{setStaffTab(v);setSelClient(null);}} style={{flex:1,background:staffTab===v?T.card:"none",border:"none",color:staffTab===v?T.text:T.textDim,padding:"7px 0",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>))}
          </div>
          <div style={{maxHeight:380,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
            {staffTab==="pending"&&(
  <div style={{display:"flex",flexDirection:"column",gap:5}}>
    {myClasses.filter(c=>!c.isSettled).map(c=>{
      const earn=(c.instructorId===viewStaff.id&&(c.scenario==="instructor_only"||c.scenario==="seller_and_instructor"))?c.instructorEarning:c.sellerCommission;
      return(<div key={c.id} style={{background:T.surface,borderRadius:8,padding:"10px 14px",fontSize:12,borderLeft:`3px solid ${PAY_STATUS[c.paymentStatus]?.color||T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <span style={{color:T.textDim}}>{fmtDate(c.classDate)}</span>
          <span style={{fontWeight:700,flex:1,paddingLeft:8}}>{c.clientName}</span>
          <PayBadge status={c.paymentStatus}/>
          <span style={{fontFamily:"monospace",color:T.cyan,fontWeight:700}}>→ {fmt(earn)}</span>
        </div>
        {c.notes&&<div style={{color:T.muted,fontSize:11,marginTop:3}}>{c.notes}</div>}
      </div>);
    })}
    {extraCommissions.filter(e=>e.staffId===viewStaff.id&&!e.isSettled).map(e=>(
      <div key={e.id} style={{background:T.surface,borderRadius:8,padding:"10px 14px",fontSize:12,borderLeft:`3px solid ${T.teal}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <span style={{color:T.textDim}}>{fmtDate(e.date)}</span>
          <span style={{fontWeight:700,flex:1,paddingLeft:8}}>{e.description}</span>
          <Badge text="COMISIÓN EXTRA" color={T.teal} small/>
          <span style={{fontFamily:"monospace",color:T.teal,fontWeight:700}}>→ {fmt(e.amount)}</span>
          <button onClick={()=>{if(window.confirm("¿Eliminar esta comisión?"))onDeleteExtra(e.id)}} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>
        </div>
      </div>
    ))}
    {myClasses.filter(c=>!c.isSettled).length===0&&extraCommissions.filter(e=>e.staffId===viewStaff.id&&!e.isSettled).length===0&&<Empty text="Sin pendientes"/>}
  </div>
)}
            {staffTab==="history"&&(myClasses.filter(c=>c.isSettled).length===0?<Empty text="Sin historial"/>:myClasses.filter(c=>c.isSettled).map(c=>{const earn=c.instructorId===viewStaff.id&&c.scenario!=="own_class"?c.instructorEarning:c.sellerCommission;return(<div key={c.id} style={{background:T.surface,borderRadius:8,padding:"10px 14px",fontSize:12,display:"flex",gap:10,alignItems:"center",borderLeft:`3px solid ${T.muted}`}}><span style={{color:T.textDim}}>{fmtDate(c.classDate)}</span><span style={{flex:1,fontWeight:600}}>{c.clientName}</span><span style={{fontFamily:"monospace",color:T.green,fontWeight:700}}>{fmt(earn)}</span></div>);})) }
            {staffTab==="settlements"&&(mySettlements.length===0?<Empty text="Sin liquidaciones"/>:mySettlements.map(s=>(<div key={s.id} style={{background:T.surface,borderRadius:8,padding:"10px 14px",fontSize:12,display:"flex",gap:10,alignItems:"center"}}><span style={{color:T.textDim,whiteSpace:"nowrap"}}>{fmtDate(s.settledAt)}</span><span style={{flex:1}}>{fmtDate(s.periodStart)} → {fmtDate(s.periodEnd)}</span><span style={{fontFamily:"monospace",color:T.green,fontWeight:700}}>{fmt(s.totalEarned)}</span><Badge text={s.method} color={T.accent} small/></div>)))}
            {staffTab==="clients"&&!selClient&&(myClients.length===0?<Empty text="Sin clientes"/>:myClients.map(cl=>{const cls=classes.filter(c=>c.clientId===cl.id||c.clientName?.toLowerCase()===cl.name?.toLowerCase());return(<div key={cl.id} onClick={()=>setSelClient(cl)} style={{background:T.surface,borderRadius:8,padding:"10px 14px",cursor:"pointer",borderLeft:`3px solid ${T.cyan}`,display:"flex",gap:12,alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background=T.cardHover} onMouseLeave={e=>e.currentTarget.style.background=T.surface}><Av name={cl.name} size={34} color={T.accent}/><div style={{flex:1}}><div style={{fontWeight:700}}>{cl.name}</div>{cl.phone&&<div style={{fontSize:11,color:T.textDim}}>📞 {cl.phone}</div>}</div><div style={{textAlign:"right"}}><div style={{fontFamily:"monospace",color:T.green,fontWeight:700}}>{fmt(cls.reduce((a,c)=>a+c.amount,0))}</div><div style={{fontSize:11,color:T.muted}}>{cls.length} clase(s)</div></div><span style={{color:T.textDim,fontSize:18}}>›</span></div>);})) }
            {staffTab==="clients"&&selClient&&<ClientDetailCard client={selClient} allClasses={classes.filter(c=>c.clientId===selClient.id||c.clientName?.toLowerCase()===selClient.name?.toLowerCase())} staff={staff} onBack={()=>setSelClient(null)} backLabel="← Cartera" isAdmin/>}
          </div>
        </Card>
      </div>
    );
  }
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"flex-end"}}><Btn variant="primary" size="sm" onClick={onNew}>＋ Nuevo Staff</Btn></div>
      <Card style={{padding:0,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>{["","Nombre","Rol","Comisión","$/hora","Clientes","A Pagar","Liquidado","Acciones"].map(h=><TH key={h}>{h}</TH>)}</tr></thead>
          <tbody>
            {staff.map(s=>{
              const bal=getBalance(s.id);
              const hist=settlements.filter(st=>st.staffId===s.id).reduce((a,st)=>a+st.totalEarned,0);
              const myC=clients.filter(c=>c.sellerId===s.id).length;
              const rc=ROLE_COLORS[s.role];
              return(<tr key={s.id} style={{opacity:s.isActive?1:.5}}>
                <TD><Av name={s.name} size={32} color={rc}/></TD>
                <TD><button onClick={()=>setViewId(s.id)} style={{background:"none",border:"none",color:T.accent,fontWeight:700,fontSize:13,cursor:"pointer",padding:0,fontFamily:"inherit",textDecoration:"underline"}}>{s.name}</button><div style={{fontSize:11,color:T.textDim}}>{s.email}</div></TD>
                <TD><Badge text={ROLE_LABELS[s.role]} color={rc}/></TD>
                <TD style={{fontFamily:"monospace",fontSize:13}}>{s.role!=="instructor"?`${s.commissionPct}%`:"—"}</TD>
                <TD style={{fontFamily:"monospace",fontSize:13}}>{s.role!=="seller"&&s.role!=="admin"?`${fmt(s.hourlyRate)}/h`:"—"}</TD>
                <TD style={{fontFamily:"monospace",color:T.cyan}}>{myC||"—"}</TD>
                <TD style={{fontFamily:"monospace",color:bal.pendingAmount>0?T.gold:T.muted,fontWeight:700}}>{fmt(bal.pendingAmount)}</TD>
                <TD style={{fontFamily:"monospace",color:T.green}}>{fmt(hist)}</TD>
                <TD><div style={{display:"flex",gap:6}}><Btn variant="ghost" size="sm" onClick={()=>setViewId(s.id)}>Ficha</Btn><Btn variant="ghost" size="sm" onClick={()=>onEdit(s)}>✎</Btn><Btn variant="gold" size="sm" disabled={bal.pendingAmount===0||!s.isActive} onClick={()=>onSettle(s)}>$</Btn></div></TD>
              </tr>);
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function DesgloseNeto({ingresosBrutos,aCobrar,totalComisiones,honorariosAPagar,aportesStaff,totalInstructores,totalGastos,netosFinal,netoProyectado,filteredClasses,staff,estimatedInstrCost,unassignedClasses,defaultHourlyRate}){
  const [expanded,setExpanded]=useState(null);
  const toggle=k=>setExpanded(p=>p===k?null:k);

  const byVendedor=useMemo(()=>{
    const m={};
    filteredClasses.forEach(c=>{
      if(!c.sellerCommission) return;
      if(c.scenario==="own_class"&&c.schoolCut>0) return; // staff own_class: excluido
      const k=c.sellerId||"__escuela__";
      if(!m[k]){const s=staff.find(x=>x.id===k);m[k]={name:s?.name||"Escuela",amount:0,clases:0};}
      m[k].amount+=c.sellerCommission; m[k].clases++;
    });
    return Object.values(m).sort((a,b)=>b.amount-a.amount);
  },[filteredClasses,staff]);

  const byInstructor=useMemo(()=>{
    const m={};
    filteredClasses.forEach(c=>{
      const earn=c.instructorEarning||0;
      const k=c.instructorId||"__unassigned__";
      if(!m[k]){const s=staff.find(x=>x.id===k);m[k]={name:s?.name||(k==="__unassigned__"?"Sin asignar (estimado)":"?"),amount:0,clases:0,estimated:k==="__unassigned__"};}
      if(k==="__unassigned__"){
        const hours=c.instructorHours||0;
        m[k].amount+=hours*defaultHourlyRate;
      } else {
        m[k].amount+=earn;
      }
      m[k].clases++;
    });
    return Object.values(m).sort((a,b)=>b.amount-a.amount);
  },[filteredClasses,staff,defaultHourlyRate]);

  const byAportes=useMemo(()=>{
    const m={};
    filteredClasses.forEach(c=>{
      if(c.scenario!=="own_class"||c.schoolCut<=0) return;
      const k=c.instructorId||"__?__";
      if(!m[k]){const s=staff.find(x=>x.id===k);m[k]={name:s?.name||"?",amount:0,clases:0};}
      m[k].amount+=c.schoolCut; m[k].clases++;
    });
    return Object.values(m).sort((a,b)=>b.amount-a.amount);
  },[filteredClasses,staff]);

  const byVendedorACobrar=useMemo(()=>{
    const m={};
    filteredClasses.forEach(c=>{
      if(c.scenario==="own_class"&&c.schoolCut>0) return;
      const pending=c.amount-c.paidAmount;
      if(pending<=0) return;
      const k=c.sellerId||"__escuela__";
      if(!m[k]){const s=staff.find(x=>x.id===k);m[k]={name:s?.name||"Escuela",amount:0,clases:0};}
      m[k].amount+=pending; m[k].clases++;
    });
    return Object.values(m).sort((a,b)=>b.amount-a.amount);
  },[filteredClasses,staff]);

  const rows=[
    {key:"cobrado",   label:"Cobrado",                        value:ingresosBrutos,  color:T.green,  sign:"+"},
    {key:"acobrar",   label:"+ A cobrar",                     value:aCobrar,         color:T.orange, sign:"+", expandable:true},
    {key:"comisiones",label:"Comisiones vendedores",          value:totalComisiones, color:T.cyan,   sign:"−", expandable:true},
    {key:"honorarios",label:"Honorarios instructores (neto)",value:totalInstructores,color:T.purple, sign:"−", expandable:true},
    {key:"gastos",    label:"Gastos operativos",              value:totalGastos,     color:T.orange, sign:"−"},
    {key:"neto",      label:"── NETO FINAL (cobrado)",        value:netosFinal,      color:T.gold,   sign:"=", highlight:true},
    {key:"proyectado",label:"── NETO PROYECTADO",             value:netoProyectado,  color:T.teal,   sign:"=", highlight:true},
  ];

  return(
    <Card>
      <SectionTitle>Desglose Neto</SectionTitle>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {rows.map(r=>(
          <div key={r.key}>
            <div
              onClick={r.expandable?()=>toggle(r.key):undefined}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:r.highlight?`${r.color}10`:T.surface,borderRadius:7,border:r.highlight?`1px solid ${r.color}30`:"none",cursor:r.expandable?"pointer":"default"}}
            >
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:12,color:r.highlight?r.color:T.textDim,fontWeight:r.highlight?700:400}}>{r.label}</span>
                {r.expandable&&<span style={{fontSize:10,color:T.muted}}>{expanded===r.key?"▲":"▼"}</span>}
              </div>
              <div style={{display:"flex",gap:8}}><span style={{fontSize:11,color:T.muted}}>{r.sign}</span><span style={{fontFamily:"monospace",color:r.color,fontWeight:700}}>{fmt(r.value)}</span></div>
            </div>
            {r.expandable&&expanded===r.key&&(
              <div style={{margin:"2px 0 4px",padding:"8px 12px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:7,fontSize:11}}>
                {(r.key==="comisiones"?byVendedor:r.key==="acobrar"?byVendedorACobrar:byInstructor).map((d,i)=>{
                  const list=r.key==="comisiones"?byVendedor:r.key==="acobrar"?byVendedorACobrar:byInstructor;
                  return(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:i<list.length-1?`1px solid ${T.border}`:"none"}}>
                    <span style={{color:d.estimated?T.orange:T.textDim}}>{d.name}{d.estimated?" ⚠":""}  <span style={{color:T.muted}}>({d.clases} clase{d.clases!==1?"s":""})</span></span>
                    <span style={{fontFamily:"monospace",color:d.estimated?T.orange:r.color,fontWeight:600}}>{fmt(d.amount)}</span>
                  </div>
                );})}
                {(r.key==="comisiones"?byVendedor:r.key==="acobrar"?byVendedorACobrar:byInstructor).length===0&&<span style={{color:T.muted}}>Sin datos</span>}
                {r.key==="honorarios"&&byAportes.length>0&&(
                  <>
                    <div style={{margin:"6px 0 4px",borderTop:`1px solid ${T.border}`,paddingTop:6,color:T.muted,fontSize:10}}>Aportes own class (descuento)</div>
                    {byAportes.map((d,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:i<byAportes.length-1?`1px solid ${T.border}`:"none"}}>
                        <span style={{color:T.textDim}}>{d.name}  <span style={{color:T.muted}}>({d.clases} clase{d.clases!==1?"s":""})</span></span>
                        <span style={{fontFamily:"monospace",color:T.green,fontWeight:600}}>−{fmt(d.amount)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function FinanzasPage({classes,expenses,staff,config,onAddExpense}){
  const [newExp,setNewExp]=useState({amount:"",description:"",category:"general",date:today});
  const [saving,setSaving]=useState(false);
  const [season,setSeason]=useState("current");
  const [customFrom,setCustomFrom]=useState(seasonRange().from);
  const [customTo,setCustomTo]=useState(seasonRange().to);
  const {sfrom,sto}=useMemo(()=>{
    if(season==="current") return {sfrom:seasonRange().from,sto:seasonRange().to};
    if(season==="last")    return {sfrom:seasonRange(-1).from,sto:seasonRange(-1).to};
    if(season==="custom")  return {sfrom:customFrom,sto:customTo};
    return {sfrom:"2000-01-01",sto:"2099-12-31"};
  },[season,customFrom,customTo]);
  const filteredClasses=useMemo(()=>classes.filter(c=>c.classDate>=sfrom&&c.classDate<=sto),[classes,sfrom,sto]);
  const filteredExpenses=useMemo(()=>expenses.filter(e=>e.date>=sfrom&&e.date<=sto),[expenses,sfrom,sto]);
  const defaultHourlyRate=40;
  const unassignedClasses=filteredClasses.filter(c=>!c.instructorId&&c.scenario!=="own_class");
  const estimatedInstrCost=unassignedClasses.reduce((a,c)=>{
    const hours=c.instructorHours||config.rates.find(r=>r.id===c.classTypeId)?.hours||0;
    return a+hours*defaultHourlyRate;
  },0);
  const ingresosBrutos=filteredClasses.reduce((a,c)=>{
    if(c.scenario==="own_class"&&c.schoolCut>0) return a; // staff own_class: excluido (va en aportes)
    return a+c.paidAmount;
  },0);
  const aCobrar=filteredClasses.reduce((a,c)=>{
    if(c.scenario==="own_class"&&c.schoolCut>0) return a;
    return a+(c.amount-c.paidAmount);
  },0);
  const ingresosProyectados=ingresosBrutos+aCobrar;
  const totalComisiones=filteredClasses.reduce((a,c)=>{
    if(c.scenario==="own_class"&&c.schoolCut>0) return a; // staff own_class: excluido
    return a+(c.sellerCommission||0);
  },0);
  const honorariosAPagar=filteredClasses.reduce((a,c)=>a+(c.instructorEarning||0),0)+estimatedInstrCost;
  const aportesStaff=filteredClasses.reduce((a,c)=>c.scenario==="own_class"&&c.schoolCut>0?a+c.schoolCut:a,0);
  const totalInstructores=honorariosAPagar-aportesStaff;
  const totalGastos=filteredExpenses.reduce((a,e)=>a+e.amount,0);
  const netosAntes=ingresosBrutos-totalComisiones-totalInstructores;
  const netosFinal=netosAntes-totalGastos;
  const netoProyectado=ingresosProyectados-totalComisiones-totalInstructores-totalGastos;
  async function addExp(){
    if(!newExp.amount||!newExp.description)return;
    setSaving(true);
    try{await onAddExpense({amount:+newExp.amount,description:newExp.description,category:newExp.category,date:newExp.date||today});setNewExp({amount:"",description:"",category:"general",date:today});}
    finally{setSaving(false);}
  }
  return(
    <div style={{display:"flex",flexDirection:"column",gap:24}}>
      <Card style={{padding:"12px 18px"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:11,color:T.muted,fontWeight:700}}>TEMPORADA:</span>
          {[["current","Esta temporada"],["last","Temporada anterior"],["all","Todo"],["custom","Personalizado"]].map(([v,l])=>(
            <Btn key={v} variant={season===v?"primary":"ghost"} size="sm" onClick={()=>setSeason(v)}>{l}</Btn>
          ))}
          {season==="custom"&&<>
            <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:7,padding:"5px 10px",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
            <span style={{color:T.muted}}>—</span>
            <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:7,padding:"5px 10px",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
          </>}
          <span style={{marginLeft:"auto",fontSize:12,color:T.textDim}}><b style={{color:T.text}}>{filteredClasses.length}</b> clases en el período</span>
        </div>
      </Card>
      <div style={{background:`${T.teal}0a`,border:`1px solid ${T.teal}30`,borderRadius:10,padding:"10px 16px",fontSize:12,color:T.textDim}}>🔒 Módulo exclusivo del administrador.</div>
      {unassignedClasses.length>0&&<div style={{background:`${T.orange}10`,border:`1px solid ${T.orange}40`,borderRadius:10,padding:"10px 16px",fontSize:12,color:T.orange}}>⚠ <b>{unassignedClasses.length} clase{unassignedClasses.length!==1?"s":""} sin instructor</b> — se estimó un costo de <b>{fmt(estimatedInstrCost)}</b> ({fmt(defaultHourlyRate)}/h × horas de cada tipo). El neto se ajustará cuando se asignen.</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14}}>
        <Card><Stat label="Cobrado" value={fmt(ingresosBrutos)} color={T.green} icon="↑"/></Card>
        <Card><Stat label="A Cobrar" value={fmt(aCobrar)} color={aCobrar>0?T.orange:T.muted} icon="◑"/></Card>
        <Card><Stat label="Comisiones Vendedores" value={fmt(totalComisiones)} color={T.cyan} icon="→"/></Card>
        <Card><Stat label="Honorarios Instructores" value={fmt(totalInstructores)} color={T.purple} icon="→" sub={aportesStaff>0?`incl. aportes −${fmt(aportesStaff)}`:undefined}/></Card>
        <Card><Stat label="Gastos Operativos" value={fmt(totalGastos)} color={T.orange} icon="↓"/></Card>
        <Card style={{background:`${T.gold}08`,borderColor:`${T.gold}40`}}><Stat label="Neto Final" value={fmt(netosFinal)} color={T.gold} icon="★" sub="sobre lo cobrado"/></Card>
        <Card style={{background:`${T.teal}08`,borderColor:`${T.teal}40`}}><Stat label="Neto Proyectado" value={fmt(netoProyectado)} color={T.teal} icon="◎" sub="si se cobra todo"/></Card>
        <Card style={{background:`${T.purple}08`,borderColor:`${T.purple}40`}}><Stat label="Bonus Iona (10%)" value={fmt(netoProyectado*0.1)} color={T.purple} icon="◈" sub="informativo · sobre neto proyectado"/></Card>
        <Card style={{background:`${T.teal}12`,borderColor:`${T.teal}60`}}><Stat label="Neto Proyectado Final" value={fmt(netoProyectado*0.9)} color={T.teal} icon="★" sub="después de bonus Iona"/></Card>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,alignItems:"start"}}>
        <Card>
          <SectionTitle>Registrar Gasto</SectionTitle>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Inp label="Monto USD" type="number" value={newExp.amount} onChange={v=>setNewExp(p=>({...p,amount:v}))} placeholder="0" required/>
              <Inp label="Categoría" value={newExp.category} onChange={v=>setNewExp(p=>({...p,category:v}))} options={["general","mantenimiento","logística","materiales","salarios","otros"].map(c=>({value:c,label:c.charAt(0).toUpperCase()+c.slice(1)}))}/>
            </div>
            <Inp label="Fecha" type="date" value={newExp.date} onChange={v=>setNewExp(p=>({...p,date:v}))} required/>
            <Inp label="Descripción" value={newExp.description} onChange={v=>setNewExp(p=>({...p,description:v}))} placeholder="Ej: Mantenimiento tablas, Combustible..." required/>
            <Btn variant="teal" full disabled={saving} onClick={addExp}>{saving?"Guardando...":"＋ Registrar Gasto"}</Btn>
          </div>
        </Card>
        <DesgloseNeto
          ingresosBrutos={ingresosBrutos} aCobrar={aCobrar}
          totalComisiones={totalComisiones} honorariosAPagar={honorariosAPagar} aportesStaff={aportesStaff} totalInstructores={totalInstructores}
          totalGastos={totalGastos} netosFinal={netosFinal} netoProyectado={netoProyectado}
          filteredClasses={filteredClasses} staff={staff}
          estimatedInstrCost={estimatedInstrCost} unassignedClasses={unassignedClasses}
          defaultHourlyRate={defaultHourlyRate}
        />
      </div>
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"14px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between"}}>
          <SectionTitle>Registro de Gastos</SectionTitle>
          <span style={{fontSize:12,color:T.textDim}}>Total: <b style={{color:T.orange}}>{fmt(totalGastos)}</b></span>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>{["Fecha","Descripción","Categoría","Monto"].map(h=><TH key={h}>{h}</TH>)}</tr></thead>
          <tbody>
            {filteredExpenses.slice().reverse().map(e=>(<tr key={e.id}><TD style={{fontSize:12,color:T.textDim}}>{fmtDate(e.date)}</TD><TD style={{fontWeight:600}}>{e.description}</TD><TD><Badge text={e.category} color={T.orange} small/></TD><TD style={{fontFamily:"monospace",color:T.orange,fontWeight:700}}>{fmt(e.amount)}</TD></tr>))}
            {filteredExpenses.length===0&&<tr><td colSpan={4}><Empty text="Sin gastos"/></td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SearchPage({clients,classes,staff,onViewClient}){
  const [q,setQ]=useState("");
  const [results,setResults]=useState([]);
  const [searched,setSearched]=useState(false);
  function doSearch(query=q){
    if(!query.trim())return;
    const ql=query.toLowerCase();
    const found=new Map();
    clients.forEach(c=>{if([c.name,c.phone,c.email,c.notes].some(f=>f?.toLowerCase().includes(ql)))found.set(c.id,c);});
    classes.forEach(c=>{if(c.clientName?.toLowerCase().includes(ql)||c.notes?.toLowerCase().includes(ql)){const ex=clients.find(cl=>cl.name?.toLowerCase()===c.clientName?.toLowerCase());if(ex&&!found.has(ex.id))found.set(ex.id,ex);}});
    setResults([...found.values()]);setSearched(true);
  }
  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <Card>
        <div style={{fontSize:16,fontWeight:800,marginBottom:16}}>Buscador Global</div>
        <div style={{display:"flex",gap:10}}>
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch()} placeholder="Nombre, teléfono, email, notas..." style={{flex:1,background:T.surface,border:`2px solid ${T.borderLight}`,color:T.text,borderRadius:10,padding:"11px 16px",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
          <Btn onClick={()=>doSearch()} size="lg">⌕ Buscar</Btn>
        </div>
      </Card>
      {searched&&results.map(r=>{
        const seller=staff.find(s=>s.id===r.sellerId);
        const cls=classes.filter(c=>c.clientId===r.id||c.clientName?.toLowerCase()===r.name?.toLowerCase());
        return(
          <Card key={r.id}>
            <div style={{display:"flex",gap:14}}>
              <Av name={r.name} size={48} color={T.accent}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:15}}>{r.name}</div>
                <div style={{display:"flex",gap:12,marginTop:4,flexWrap:"wrap"}}>
                  {r.phone&&<span style={{fontSize:12,color:T.textDim}}>📞 {r.phone}</span>}
                  {r.email&&<span style={{fontSize:12,color:T.textDim}}>✉ {r.email}</span>}
                </div>
                <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                  <div style={{background:`${T.accent}12`,border:`1px solid ${T.accent}25`,borderRadius:8,padding:"6px 12px",fontSize:12}}>
                    Vendedor: <strong style={{color:seller?T.cyan:T.green}}>{seller?seller.name:"Escuela"}</strong>
                    {seller&&<span style={{color:T.textDim}}> · {seller.commissionPct}%</span>}
                  </div>
                  {cls.length>0&&<div style={{background:`${T.green}10`,border:`1px solid ${T.green}25`,borderRadius:8,padding:"6px 12px",fontSize:12}}>{cls.length} clase(s) · <strong style={{color:T.green}}>{fmt(cls.reduce((a,c)=>a+c.amount,0))}</strong></div>}
                </div>
              </div>
              <Btn variant="ghost" size="sm" onClick={()=>onViewClient(r)}>Ver Ficha →</Btn>
            </div>
          </Card>
        );
      })}
      {searched&&results.length===0&&<Card><Empty text="Sin resultados"/></Card>}
    </div>
  );
}

function ConfigPage({config,onSave,staff,onSaveStaff}){
  const [rates,setRates]=useState(config.rates);
  const [defComm,setDefComm]=useState(String(config.defaultCommissionPct));
  const [schoolCut,setSchoolCut]=useState(String(config.schoolCutPct));
  const [saving,setSaving]=useState(false);
  async function save(){setSaving(true);try{await onSave({...config,rates,defaultCommissionPct:+defComm,schoolCutPct:+schoolCut});}finally{setSaving(false);}  }
  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        <Card>
          <SectionTitle>Tarifas y Horas</SectionTitle>
          {rates.map(r=>(<div key={r.id} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
            <input value={r.name} onChange={e=>setRates(p=>p.map(x=>x.id===r.id?{...x,name:e.target.value}:x))} style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:7,padding:"7px 10px",fontSize:13,outline:"none"}}/>
            <input type="number" value={r.amount} onChange={e=>setRates(p=>p.map(x=>x.id===r.id?{...x,amount:+e.target.value}:x))} style={{width:75,background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:7,padding:"7px 10px",fontSize:13,outline:"none"}}/>
            <span style={{fontSize:11,color:T.muted}}>USD</span>
            <input type="number" value={r.hours} onChange={e=>setRates(p=>p.map(x=>x.id===r.id?{...x,hours:+e.target.value}:x))} style={{width:50,background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:7,padding:"7px 10px",fontSize:13,outline:"none"}}/>
            <span style={{fontSize:11,color:T.muted}}>h</span>
          </div>))}
        </Card>
        <Card>
          <SectionTitle>Porcentajes</SectionTitle>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Inp label="% Comisión por defecto" type="number" value={defComm} onChange={setDefComm}/>
            <Inp label="% Escuela en Clase Propia" type="number" value={schoolCut} onChange={setSchoolCut}/>
          </div>
        </Card>
        <Btn variant="success" full disabled={saving} onClick={save}>{saving?"Guardando...":"✓ Guardar Configuración"}</Btn>
      </div>
      <Card>
        <SectionTitle>Tasas Individuales del Staff</SectionTitle>
        {staff.map(s=>(<div key={s.id} style={{borderBottom:`1px solid ${T.border}`,paddingBottom:14,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><Av name={s.name} size={30} color={ROLE_COLORS[s.role]}/><div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{s.name}</div><div style={{fontSize:11,color:T.textDim}}>{ROLE_LABELS[s.role]}</div></div></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {(s.role==="seller"||s.role==="both")&&<Inp label="Comisión %" type="number" value={String(s.commissionPct)} onChange={v=>onSaveStaff({...s,commissionPct:+v})} small/>}
            {(s.role==="instructor"||s.role==="both")&&<Inp label="$/hora" type="number" value={String(s.hourlyRate)} onChange={v=>onSaveStaff({...s,hourlyRate:+v})} small/>}
          </div>
        </div>))}
      </Card>
    </div>
  );
}

// ─── STAFF PORTAL (vista del staff logueado) ──────────────────────────────────
function StaffPortalPage({ staffMember, staff, classes, settlements, clients, balance, onSignOut }) {
  const myClasses = classes
    .filter(c => c.sellerId === staffMember?.id || c.instructorId === staffMember?.id)
    .sort((a, b) => b.classDate?.localeCompare(a.classDate));
  const mySettlements = settlements.filter(s => s.staffId === staffMember?.id);
  const myClients = clients.filter(c => c.sellerId === staffMember?.id);
  const isSeller = staffMember?.role === "seller" || staffMember?.role === "both";
  const isInstructor = staffMember?.role === "instructor" || staffMember?.role === "both";
  const rc = ROLE_COLORS[staffMember?.role] || T.accent;
  const tabs = [
    ...(isInstructor ? [["agenda", "Mi Agenda"]] : []),
    ["pending", "Mis Clases"],
    ["history", "Historial"],
    ["settlements", "Liquidaciones"],
    ...(isSeller ? [["clients", "Mis Clientes"]] : []),
  ];
  const [tab, setTab] = useState("pending");
  const [selClient, setSelClient] = useState(null);

  const pendingClasses  = myClasses.filter(c => !c.isSettled);
  const settledClasses  = myClasses.filter(c => c.isSettled);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Av name={staffMember?.name || "?"} size={36} color={rc} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{staffMember?.name}</div>
            <div style={{ fontSize: 11, color: T.textDim }}>{ROLE_LABELS[staffMember?.role]} · Solo tus datos</div>
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={async()=>{await supabase.auth.resetPasswordForEmail(staffMember?.email);alert("Te mandamos un email para cambiar tu contraseña");}}>🔑 Cambiar contraseña</Btn>
        <Btn variant="ghost" size="sm" onClick={onSignOut}>← Salir</Btn>
      </div>

      <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
          <Card style={{ background: `${T.gold}0d`, borderColor: `${T.gold}25` }}>
            <Stat label="A Cobrar" value={fmt(balance?.pendingAmount || 0)} color={T.gold} sub={`${balance?.pendingClasses || 0} clase(s)`} />
          </Card>
          <Card>
            <Stat label="Liquidado" value={fmt(mySettlements.reduce((a, s) => a + s.totalEarned, 0))} color={T.green} />
          </Card>
          <Card>
            <Stat label="Mis Clases" value={myClasses.length} color={T.cyan} />
          </Card>
          {isSeller && (
            <Card>
              <Stat label="Mis Clientes" value={myClients.length} color={T.accent} sub={`${staffMember?.commission_pct || staffMember?.commissionPct || 0}% comisión`} />
            </Card>
          )}
          {isInstructor && (
            <Card>
              <Stat label="Tarifa/hora" value={fmt(staffMember?.hourly_rate || staffMember?.hourlyRate || 0)} color={T.purple} />
            </Card>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, background: T.surface, borderRadius: 8, padding: 4, marginBottom: 20, width: "fit-content" }}>
          {tabs.map(([v, l]) => (
            <button
              key={v}
              onClick={() => { setTab(v); setSelClient(null); }}
              style={{ background: tab === v ? T.card : "none", border: "none", color: tab === v ? T.text : T.textDim, padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: tab === v ? 700 : 500, cursor: "pointer", fontFamily: "inherit" }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Tab: Clases Pendientes */}
        {tab === "pending" && (
          <Card style={{ padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  {["Fecha", "Cliente", "Tipo", isSeller ? "Monto" : "Horas", "Est. Pago", "Mi Ganancia"].map(h => <TH key={h}>{h}</TH>)}
                </tr>
              </thead>
              <tbody>
                {pendingClasses.map(c => {
                  const isPureInstr = c.instructorId === staffMember?.id && c.sellerId !== staffMember?.id;
                  const earn = isPureInstr ? c.instructorEarning : c.sellerCommission;
                  const ps = PAY_STATUS[c.paymentStatus];
                  return (
                    <tr key={c.id} style={{ borderLeft: `3px solid ${ps?.color || T.border}40` }}>
                      <TD style={{ fontSize: 12, color: T.textDim }}>{fmtDate(c.classDate)}</TD>
                      <TD style={{ fontWeight: 700 }}>{c.clientName}</TD>
                      <TD><Badge text={c.classTypeName || "—"} color={T.muted} small /></TD>
                      <TD>
                        {isPureInstr ? (
                          <div>
                            <div style={{ fontFamily: "monospace", color: T.purple, fontWeight: 700 }}>{c.instructorHours}h</div>
                            <div style={{ fontSize: 11, color: T.textDim }}>{fmt(c.instructorHourlyRate)}/h</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontFamily: "monospace", fontWeight: 700 }}>{fmt(c.amount)}</div>
                            <PayBar amount={c.amount} paidAmount={c.paidAmount} />
                          </div>
                        )}
                      </TD>
                      <TD><PayBadge status={c.paymentStatus} /></TD>
                      <TD style={{ fontFamily: "monospace", color: T.cyan, fontWeight: 800 }}>{fmt(earn)}</TD>
                    </tr>
                  );
                })}
                {pendingClasses.length === 0 && (
                  <tr><td colSpan={6}><Empty text="Sin clases pendientes" /></td></tr>
                )}
              </tbody>
            </table>
          </Card>
        )}

        {/* Tab: Historial */}
        {tab === "history" && (
          <Card style={{ padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Fecha", "Cliente", "Tipo", "Ganado"].map(h => <TH key={h}>{h}</TH>)}
                </tr>
              </thead>
              <tbody>
                {settledClasses.map(c => {
                  const isPureInstr = c.instructorId === staffMember?.id && c.sellerId !== staffMember?.id;
                  const earn = isPureInstr ? c.instructorEarning : c.sellerCommission;
                  return (
                    <tr key={c.id}>
                      <TD style={{ fontSize: 12, color: T.textDim }}>{fmtDate(c.classDate)}</TD>
                      <TD style={{ fontWeight: 700 }}>{c.clientName}</TD>
                      <TD><Badge text={c.classTypeName || "—"} color={T.muted} small /></TD>
                      <TD style={{ fontFamily: "monospace", color: T.green, fontWeight: 700 }}>{fmt(earn)}</TD>
                    </tr>
                  );
                })}
                {settledClasses.length === 0 && (
                  <tr><td colSpan={4}><Empty text="Sin historial" /></td></tr>
                )}
              </tbody>
            </table>
          </Card>
        )}

        {/* Tab: Liquidaciones */}
        {tab === "settlements" && (
          <Card style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Periodo", "Clases", "Cobrado", "Método"].map(h => <TH key={h}>{h}</TH>)}
                </tr>
              </thead>
              <tbody>
                {mySettlements.length === 0 && (
                  <tr><td colSpan={4}><Empty text="Sin liquidaciones" /></td></tr>
                )}
                {mySettlements.map(s => (
                  <tr key={s.id}>
                    <TD style={{ fontSize: 12, color: T.textDim }}>{fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}</TD>
                    <TD style={{ fontFamily: "monospace" }}>{s.totalClasses}</TD>
                    <TD style={{ fontFamily: "monospace", color: T.green, fontWeight: 800 }}>{fmt(s.totalEarned)}</TD>
                    <TD style={{ fontSize: 12 }}>{s.method}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Tab: Mis Clientes */}
        {tab === "clients" && !selClient && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: `${T.accent}0d`, border: `1px solid ${T.accent}25`, borderRadius: 10, padding: "10px 16px", fontSize: 12, color: T.textDim }}>
              🔒 Tus clientes asignados de forma permanente. Tu comisión está protegida.
            </div>
            {myClients.length === 0
              ? <Empty text="Sin clientes asignados" />
              : myClients.map(cl => {
                  const cls = classes.filter(c => c.clientId === cl.id || c.clientName?.toLowerCase() === cl.name?.toLowerCase());
                  const total = cls.reduce((a, c) => a + c.amount, 0);
                  return (
                    <Card key={cl.id} onClick={() => setSelClient(cl)} style={{ cursor: "pointer" }}>
                      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <Av name={cl.name} size={46} color={T.accent} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: 15 }}>{cl.name}</div>
                          {cl.phone && <div style={{ fontSize: 12, color: T.textDim }}>📞 {cl.phone}</div>}
                          {cl.notes && (
                            <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, background: T.surface, borderRadius: 6, padding: "4px 8px" }}>
                              {cl.notes}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "monospace", color: T.green, fontWeight: 900, fontSize: 15 }}>{fmt(total)}</div>
                          <div style={{ fontSize: 11, color: T.muted }}>{cls.length} clase(s)</div>
                        </div>
                        <span style={{ color: T.textDim, fontSize: 20 }}>›</span>
                      </div>
                    </Card>
                  );
                })
            }
          </div>
        )}

        {tab === "clients" && selClient && (
          <Card>
            <ClientDetailCard
              client={selClient}
              allClasses={classes.filter(c => c.clientId === selClient.id || c.clientName?.toLowerCase() === selClient.name?.toLowerCase())}
              staff={staff}
              onBack={() => setSelClient(null)}
              backLabel="← Mis Clientes"
              isAdmin={false}
            />
          </Card>
        )}

        {/* Tab: Mi Agenda — solo visible para instructores, filtra por su propio id */}
        {tab === "agenda" && (
          <PlanningInstructorView classes={classes} staffMember={staffMember} staff={staff} />
        )}
      </div>
    </div>
  );
}

// ─── ESTADÍSTICAS ─────────────────────────────────────────────────────────────
function EstadisticasPage({classes,staff,clients,config}){
  const [period,setPeriod]=useState("month");
  const [customFrom,setCustomFrom]=useState(daysAgo(30));
  const [customTo,setCustomTo]=useState(today);
  const [selectedSeller,setSelectedSeller]=useState(null);

  const {from,to}=useMemo(()=>{
    if(period==="month"){
      const n=new Date(),y=n.getFullYear(),m=String(n.getMonth()+1).padStart(2,"0");
      return {from:`${y}-${m}-01`,to:today};
    }
    if(period==="last_month"){
      const n=new Date();
      const f=new Date(n.getFullYear(),n.getMonth()-1,1);
      const l=new Date(n.getFullYear(),n.getMonth(),0);
      return {from:f.toISOString().split("T")[0],to:l.toISOString().split("T")[0]};
    }
    if(period==="custom") return {from:customFrom,to:customTo};
    return {from:"2000-01-01",to:"2099-12-31"};
  },[period,customFrom,customTo]);

  const fil=useMemo(()=>classes.filter(c=>c.classDate>=from&&c.classDate<=to),[classes,from,to]);

  const totalAmount=fil.reduce((a,c)=>a+c.amount,0);
  const totalCobrado=fil.reduce((a,c)=>a+c.paidAmount,0);
  const schoolNet=fil.reduce((a,c)=>a+c.schoolCut,0);

  const byType=useMemo(()=>{
    const m={};
    fil.forEach(c=>{const k=c.classTypeName||config.rates.find(r=>r.id===c.classTypeId)?.name||"Sin tipo";if(!m[k])m[k]={count:0,amount:0,school:0};m[k].count++;m[k].amount+=c.amount;m[k].school+=c.schoolCut;});
    return Object.entries(m).sort((a,b)=>b[1].count-a[1].count);
  },[fil]);

  const byDisc=useMemo(()=>{
    const m={ski:{label:"Esquí",count:0,amount:0},snowboard:{label:"Snowboard",count:0,amount:0}};
    fil.forEach(c=>{const k=c.discipline==="snowboard"?"snowboard":"ski";m[k].count++;m[k].amount+=c.amount;});
    return Object.entries(m);
  },[fil]);

  const bySeller=useMemo(()=>{
    const m={"__escuela__":{name:"Escuela",color:T.green,count:0,amount:0,school:0}};
    fil.forEach(c=>{
      const k=c.sellerId||"__escuela__";
      if(!m[k]){const s=staff.find(x=>x.id===k);m[k]={name:s?.name||"?",color:T.cyan,count:0,amount:0,school:0};}
      m[k].count++;m[k].amount+=c.amount;m[k].school+=c.schoolCut;
    });
    return Object.entries(m).sort((a,b)=>b[1].count-a[1].count);
  },[fil,staff]);

  const byInstr=useMemo(()=>{
    const m={"__none__":{name:"Sin asignar",count:0,amount:0,earning:0}};
    fil.forEach(c=>{
      const k=c.instructorId||"__none__";
      if(!m[k]){const s=staff.find(x=>x.id===k);m[k]={name:s?.name||"?",count:0,amount:0,earning:0};}
      m[k].count++;m[k].amount+=c.amount;m[k].earning+=(c.instructorEarning||0);
    });
    return Object.entries(m).sort((a,b)=>b[1].count-a[1].count);
  },[fil,staff]);

  const sellerDetail=useMemo(()=>{
    if(!selectedSeller) return null;
    const sc=fil.filter(c=>(c.sellerId||"__escuela__")===selectedSeller);
    const sellerId=selectedSeller==="__escuela__"?null:selectedSeller;
    const bt={};
    sc.forEach(c=>{const k=c.classTypeName||"Sin tipo";if(!bt[k])bt[k]={count:0,amount:0,school:0};bt[k].count++;bt[k].amount+=c.amount;bt[k].school+=c.schoolCut;});
    return {
      total:sc.length,
      byType:Object.entries(bt).sort((a,b)=>b[1].count-a[1].count),
      propias:sc.filter(c=>c.instructorId&&c.instructorId===sellerId).length,
      conOtro:sc.filter(c=>c.instructorId&&c.instructorId!==sellerId).length,
      sinInstr:sc.filter(c=>!c.instructorId).length,
      cobradas:sc.filter(c=>c.paymentStatus==="paid").length,
      senadas:sc.filter(c=>c.paymentStatus==="partial").length,
      pendientes:sc.filter(c=>c.paymentStatus==="pending").length,
      ski:sc.filter(c=>c.discipline!=="snowboard").length,
      snowboard:sc.filter(c=>c.discipline==="snowboard").length,
      amount:sc.reduce((a,c)=>a+c.amount,0),
      school:sc.reduce((a,c)=>a+c.schoolCut,0),
    };
  },[selectedSeller,fil]);

  const maxType=byType[0]?.[1].count||1;
  const maxSeller=bySeller[0]?.[1].count||1;

  function Bar({pct,color}){
    return <div style={{height:5,background:T.border,borderRadius:3,overflow:"hidden",marginTop:4}}><div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:3,transition:"width .3s"}}/></div>;
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {/* Filtro */}
      <Card style={{padding:"12px 18px"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:11,color:T.muted,fontWeight:700}}>PERÍODO:</span>
          {[["month","Este mes"],["last_month","Mes anterior"],["all","Todo"],["custom","Personalizado"]].map(([v,l])=>(
            <Btn key={v} variant={period===v?"primary":"ghost"} size="sm" onClick={()=>setPeriod(v)}>{l}</Btn>
          ))}
          {period==="custom"&&<>
            <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:7,padding:"5px 10px",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
            <span style={{color:T.muted}}>—</span>
            <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,borderRadius:7,padding:"5px 10px",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
          </>}
          <span style={{marginLeft:"auto",fontSize:12,color:T.textDim}}><b style={{color:T.text}}>{fil.length}</b> clases en el período</span>
        </div>
      </Card>

      {/* Resumen */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
        <Card style={{padding:"12px 16px"}}><Stat label="Total Clases" value={fil.length} color={T.text} icon="▤"/></Card>
        <Card style={{padding:"12px 16px"}}><Stat label="Facturado" value={fmt(totalAmount)} color={T.text}/></Card>
        <Card style={{padding:"12px 16px"}}><Stat label="Cobrado" value={fmt(totalCobrado)} color={T.green}/></Card>
        <Card style={{padding:"12px 16px"}}><Stat label="Pendiente" value={fmt(totalAmount-totalCobrado)} color={totalAmount-totalCobrado>0?T.orange:T.green}/></Card>
        <Card style={{padding:"12px 16px"}}><Stat label="Neto Escuela" value={fmt(schoolNet)} color={T.gold} icon="★"/></Card>
      </div>

      {/* Disciplinas */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {byDisc.map(([k,d])=>(
          <Card key={k} style={{padding:"12px 16px",background:k==="snowboard"?`${T.purple}0a`:undefined,borderColor:k==="snowboard"?`${T.purple}30`:undefined}}>
            <Stat label={d.label} value={d.count} color={k==="snowboard"?T.purple:T.cyan} sub={`${fmt(d.amount)} facturado`} icon={k==="snowboard"?"🏂":"🎿"}/>
          </Card>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}}>
        {/* Por tipo */}
        <Card>
          <SectionTitle>Por Tipo de Clase</SectionTitle>
          {byType.length===0?<Empty text="Sin clases"/>:byType.map(([name,d])=>(
            <div key={name} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:1,gap:6}}>
                <span style={{fontWeight:600}}>{name}</span>
                <span style={{color:T.textDim,textAlign:"right"}}>{d.count} clase(s)</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                <span style={{color:T.textDim}}>Facturado: <span style={{fontFamily:"monospace",color:T.text}}>{fmt(d.amount)}</span></span>
                <span style={{color:T.textDim}}>Escuela: <span style={{fontFamily:"monospace",color:T.gold}}>{fmt(d.school)}</span></span>
              </div>
              <Bar pct={(d.count/maxType)*100} color={T.accent}/>
            </div>
          ))}
        </Card>

        {/* Por vendedor */}
        <Card>
          <SectionTitle>Por Vendedor / Origen</SectionTitle>
          {bySeller.length===0?<Empty text="Sin clases"/>:bySeller.map(([k,d])=>{
            const isOpen=selectedSeller===k;
            return(
              <div key={k}>
                <div
                  onClick={()=>setSelectedSeller(isOpen?null:k)}
                  style={{marginBottom:isOpen?0:12,cursor:"pointer",padding:"8px 10px",borderRadius:8,background:isOpen?`${T.border}60`:"transparent",transition:"background .15s"}}
                >
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:1,gap:6}}>
                    <span style={{fontWeight:600,color:d.color}}>{d.name}</span>
                    <span style={{color:T.textDim,display:"flex",gap:8,alignItems:"center"}}>
                      <span>{d.count} clase(s)</span>
                      <span style={{fontSize:10,color:T.muted}}>{isOpen?"▲":"▼"}</span>
                    </span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                    <span style={{color:T.textDim}}>Facturado: <span style={{fontFamily:"monospace",color:T.text}}>{fmt(d.amount)}</span></span>
                    <span style={{color:T.textDim}}>Escuela: <span style={{fontFamily:"monospace",color:T.gold}}>{fmt(d.school)}</span></span>
                  </div>
                  <Bar pct={(d.count/maxSeller)*100} color={d.color}/>
                </div>
                {isOpen&&sellerDetail&&(
                  <div style={{margin:"4px 0 12px",padding:"12px 14px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,fontSize:12}}>
                    {/* Por tipo */}
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Tipos de clase</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {sellerDetail.byType.map(([name,dt])=>(
                          <div key={name} style={{background:`${T.accent}15`,border:`1px solid ${T.accent}30`,borderRadius:6,padding:"3px 8px",fontSize:11}}>
                            <span style={{fontWeight:600}}>{name}</span>
                            <span style={{color:T.textDim,marginLeft:5}}>{dt.count} · {fmt(dt.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Propias vs otro instructor */}
                    {k!=="__escuela__"&&(
                      <div style={{marginBottom:10}}>
                        <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Instructor</div>
                        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                          {sellerDetail.propias>0&&<span style={{color:T.purple}}>★ {sellerDetail.propias} propia{sellerDetail.propias!==1?"s":""}</span>}
                          {sellerDetail.conOtro>0&&<span style={{color:T.textDim}}>↗ {sellerDetail.conOtro} con otro instructor</span>}
                          {sellerDetail.sinInstr>0&&<span style={{color:T.muted}}>— {sellerDetail.sinInstr} sin asignar</span>}
                        </div>
                      </div>
                    )}
                    {/* Cobro */}
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Estado de cobro</div>
                      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                        {sellerDetail.cobradas>0&&<span style={{color:T.green}}>✓ {sellerDetail.cobradas} cobrada{sellerDetail.cobradas!==1?"s":""}</span>}
                        {sellerDetail.senadas>0&&<span style={{color:T.orange}}>◑ {sellerDetail.senadas} con seña</span>}
                        {sellerDetail.pendientes>0&&<span style={{color:T.red}}>○ {sellerDetail.pendientes} pendiente{sellerDetail.pendientes!==1?"s":""}</span>}
                      </div>
                    </div>
                    {/* Disciplina */}
                    <div>
                      <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Disciplina</div>
                      <div style={{display:"flex",gap:10}}>
                        {sellerDetail.ski>0&&<span style={{color:T.cyan}}>🎿 {sellerDetail.ski} esquí</span>}
                        {sellerDetail.snowboard>0&&<span style={{color:T.purple}}>🏂 {sellerDetail.snowboard} snowboard</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </div>

      {/* Por instructor */}
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"14px 16px",borderBottom:`1px solid ${T.border}`}}><SectionTitle>Por Instructor</SectionTitle></div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr><TH>Instructor</TH><TH>Clases</TH><TH>Facturado</TH><TH>Honorarios</TH></tr></thead>
          <tbody>
            {byInstr.map(([k,d])=>(
              <tr key={k}>
                <TD style={{fontWeight:600,color:k==="__none__"?T.muted:T.text}}>{k==="__none__"?"—":d.name}</TD>
                <TD style={{fontFamily:"monospace"}}>{d.count}</TD>
                <TD style={{fontFamily:"monospace",color:T.green}}>{fmt(d.amount)}</TD>
                <TD style={{fontFamily:"monospace",color:T.purple}}>{fmt(d.earning)}</TD>
              </tr>
            ))}
            {byInstr.length===0&&<tr><td colSpan={4}><Empty text="Sin clases"/></td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { session, staffProfile, isRecovery, loading } = useAuth();
  if (isRecovery) return <ResetPasswordScreen/>;
  if (loading) return <div style={{minHeight:"100vh",background:"#080e1a",display:"flex",alignItems:"center",justifyContent:"center",color:"#3d5478",fontSize:13}}>Cargando...</div>;
  if (!session) return <LoginScreen/>;
  if (!staffProfile) return <div style={{minHeight:"100vh",background:"#080e1a",display:"flex",alignItems:"center",justifyContent:"center",color:"white"}}>Cargando perfil...</div>;
  return <AdminApp/>;
}