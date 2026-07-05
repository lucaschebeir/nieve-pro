// src/components/PlanningView.jsx
// Módulo de Planning — grilla semanal (admin) y agenda diaria (instructor)

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
} from "@dnd-kit/core";

// ─── THEME (mismo que App.jsx) ────────────────────────────────────────────────
const T = {
  bg:"#080e1a", surface:"#0c1526", card:"#0f1c32", cardHover:"#132240",
  border:"#1a2e50", borderLight:"#243d6a",
  accent:"#1d6ef5", accentHover:"#1558d0",
  gold:"#f0a500", green:"#0fb981", red:"#e53e3e", orange:"#f97316",
  purple:"#7c5cbf", cyan:"#06b6d4", teal:"#14b8a6",
  text:"#dce8f8", textDim:"#7a96bb", muted:"#3d5478", white:"#ffffff",
};

// ─── CONSTANTES DE HORARIO ────────────────────────────────────────────────────
const DAY_START_MIN = 9 * 60 + 30;   // 9:30
const DAY_END_MIN   = 17 * 60;        // 17:00
const DAY_SPAN_MIN  = DAY_END_MIN - DAY_START_MIN; // 450 min

// Duración en minutos por tipo de clase (lookup por ID)
const CLASS_DURATIONS = {
  "b31212c9-f92d-4536-abe9-52a233985a79": 420, // Full Day  9:30-16:30
  "e498e156-1668-4b5d-b0f8-fec47def2948": 270, // Mini Day  9:30-14:00
  "1ae8e449-40ac-444a-b524-220f81e150c6": 180, // Half Day  3hs
  "1e71732f-a418-44d4-8a4c-34b721aeec04": 120, // 2 Horas
  "44deac8a-0fcc-45c7-bd46-feb14be29eb5": 180, // Grupal    3hs
};
// Fallback por nombre (para clases con class_type_id vacío en BD)
const DURATION_BY_NAME = {
  "Full Day": 420, "Mini Day": 270, "Half Day": 180, "2 Horas": 120, "Clase Grupal": 180,
};

// Horarios fijos para tipos que no tienen flexibilidad
const FIXED_START = {
  "b31212c9-f92d-4536-abe9-52a233985a79": "09:30", // Full Day
};

// Half Day IDs para detectarlo
const HALF_DAY_ID = "1ae8e449-40ac-444a-b524-220f81e150c6";

function classDuration(cls) {
  return CLASS_DURATIONS[cls.classTypeId]
    ?? DURATION_BY_NAME[cls.classTypeName]
    ?? 120;
}

function timeToMin(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function minToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function fmtTime(timeStr) {
  if (!timeStr) return "";
  return timeStr.slice(0, 5);
}

function snapTo30(min) {
  return Math.round(min / 30) * 30;
}

// Clamp para que la clase quede dentro del día
function clampStart(startMin, durationMin) {
  const maxStart = DAY_END_MIN - durationMin;
  return Math.max(DAY_START_MIN, Math.min(startMin, maxStart));
}

// Detecta si dos clases se superponen
function overlaps(aStart, aDur, bStart, bDur) {
  return aStart < bStart + bDur && aStart + aDur > bStart;
}

// ─── SEMANA HELPERS ───────────────────────────────────────────────────────────
function getWeekDays(anchor) {
  // Lunes de la semana de anchor
  const d = new Date(anchor);
  const dow = d.getDay(); // 0=dom
  const diff = (dow === 0 ? -6 : 1 - dow);
  d.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day.toISOString().split("T")[0];
  });
}

function fmtWeekRange(days) {
  const opts = { day: "numeric", month: "short" };
  const a = new Date(days[0] + "T12:00:00").toLocaleDateString("es-AR", opts);
  const b = new Date(days[6] + "T12:00:00").toLocaleDateString("es-AR", opts);
  return `${a} – ${b}`;
}

function fmtDayHeader(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric" });
}

function addWeeks(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().split("T")[0];
}

function addMonths(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split("T")[0];
}

function getMonthGrid(anchorDate) {
  const d = new Date(anchorDate + "T12:00:00");
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = firstDay.getDay(); // 0=Dom
  const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1;
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = new Date(year, month, i + 1);
    return day.toISOString().split("T")[0];
  });
  const monthLabel = firstDay.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return { days, leadingBlanks, monthLabel };
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function todayStr() { return new Date().toISOString().split("T")[0]; }

// ─── COLORES POR TIPO ─────────────────────────────────────────────────────────
const TYPE_COLORS = {
  "b31212c9-f92d-4536-abe9-52a233985a79": T.accent,   // Full Day
  "e498e156-1668-4b5d-b0f8-fec47def2948": T.teal,     // Mini Day
  "1ae8e449-40ac-444a-b524-220f81e150c6": T.purple,   // Half Day
  "1e71732f-a418-44d4-8a4c-34b721aeec04": T.gold,     // 2 Horas
  "44deac8a-0fcc-45c7-bd46-feb14be29eb5": T.green,    // Grupal
};
function classColor(cls) {
  if (!cls.instructorId) return T.red;
  return TYPE_COLORS[cls.classTypeId] ?? T.muted;
}

function assignLanes(classes) {
  const sorted = [...classes].sort((a, b) => timeToMin(a.horarioInicio) - timeToMin(b.horarioInicio));
  const laneEnds = [];
  const result = sorted.map(cls => {
    const start = timeToMin(cls.horarioInicio);
    const end = start + classDuration(cls);
    const lane = laneEnds.findIndex(e => e <= start);
    if (lane === -1) { laneEnds.push(end); return { cls, lane: laneEnds.length - 1 }; }
    laneEnds[lane] = end;
    return { cls, lane };
  });
  return { assignments: result, laneCount: laneEnds.length };
}

function DiscBadge({ discipline, size = 9 }) {
  const isSb = discipline === "snowboard";
  return (
    <span style={{ background: isSb ? T.orange : T.accent, color: T.white,
      fontSize: size, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
      whiteSpace: "nowrap", flexShrink: 0 }}>
      {isSb ? "🏂 Snowboard" : "🎿 Ski"}
    </span>
  );
}

// ─── COMPONENTES BASE ─────────────────────────────────────────────────────────
function Av({ name = "?", size = 28, color = T.accent }) {
  const i = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `${color}22`,
      border: `2px solid ${color}55`, display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: size * 0.33, fontWeight: 800, color, flexShrink: 0 }}>
      {i}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", size = "md", disabled = false, style = {} }) {
  const [h, setH] = useState(false);
  const pad = size === "sm" ? "5px 11px" : "8px 16px";
  const fs = size === "sm" ? 12 : 13;
  const V = {
    primary: { background: h ? T.accentHover : T.accent, color: T.white },
    ghost:   { background: h ? T.surface : "transparent", color: h ? T.text : T.textDim, border: `1px solid ${h ? T.borderLight : T.border}` },
    danger:  { background: h ? "#c53030" : T.red, color: T.white },
  };
  return (
    <button disabled={disabled} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      onClick={disabled ? undefined : onClick}
      style={{ border: "none", borderRadius: 7, cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 600, fontSize: fs, padding: pad, display: "inline-flex", alignItems: "center",
        gap: 5, transition: "all .15s", opacity: disabled ? 0.45 : 1, fontFamily: "inherit",
        ...V[variant], ...style }}>
      {children}
    </button>
  );
}

// ─── MODAL HALF DAY ───────────────────────────────────────────────────────────
function HalfDayModal({ onChoose, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 600, padding: 16 }}>
      <div style={{ background: T.card, border: `1px solid ${T.borderLight}`, borderRadius: 16,
        padding: 28, width: 360, maxWidth: "100%", boxShadow: "0 24px 80px rgba(0,0,0,.7)" }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>¿Qué turno es este Half Day?</div>
        <div style={{ fontSize: 13, color: T.textDim, marginBottom: 20 }}>
          Elegí el horario de inicio para esta clase.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => onChoose("09:30")}
            style={{ flex: 1, background: `${T.purple}18`, border: `1px solid ${T.purple}50`,
              color: T.purple, borderRadius: 10, padding: "14px 10px", cursor: "pointer",
              fontWeight: 700, fontSize: 13, fontFamily: "inherit" }}>
            🌅 Mañana<br/><span style={{ fontSize: 11, fontWeight: 400 }}>9:30 – 12:30</span>
          </button>
          <button onClick={() => onChoose("13:00")}
            style={{ flex: 1, background: `${T.orange}18`, border: `1px solid ${T.orange}50`,
              color: T.orange, borderRadius: 10, padding: "14px 10px", cursor: "pointer",
              fontWeight: 700, fontSize: 13, fontFamily: "inherit" }}>
            🌇 Tarde<br/><span style={{ fontSize: 11, fontWeight: 400 }}>13:00 – 16:00</span>
          </button>
        </div>
        <button onClick={onCancel} style={{ marginTop: 14, background: "none", border: "none",
          color: T.textDim, fontSize: 12, cursor: "pointer", width: "100%", fontFamily: "inherit" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── DRAGGABLE CLASS CHIP (tarjeta arrastrable en pending/unassigned) ─────────
function DraggableChip({ cls, color, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cls.id, data: { cls } });
  const dur = classDuration(cls);
  const durLabel = dur % 60 === 0 ? `${dur/60}hs` : `${Math.floor(dur/60)}h${dur%60}m`;
  return (
    <div ref={setNodeRef}
      style={{ background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 7,
        padding: "5px 9px 5px 9px", fontSize: 11, opacity: isDragging ? 0.35 : 1,
        display: "flex", flexDirection: "column", gap: 2, minWidth: 100,
        touchAction: "none", position: "relative", paddingRight: 42 }}>
      <div {...listeners} {...attributes} style={{ cursor: "grab" }}>
        <span style={{ fontWeight: 700, color, whiteSpace: "nowrap", overflow: "hidden",
          textOverflow: "ellipsis", maxWidth: 120, display: "block" }}>{cls.clientName}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
          <span style={{ color: T.textDim, fontSize: 10 }}>{cls.classTypeName || "—"} · {durLabel}</span>
          <DiscBadge discipline={cls.discipline} />
        </div>
      </div>
      {/* Botones — stopPropagation en pointerDown para no activar drag */}
      <div style={{ position: "absolute", top: 3, right: 3, display: "flex", gap: 2 }}>
        {onEdit && (
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onEdit(cls)}
            style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer",
              fontSize: 12, padding: "1px 3px", lineHeight: 1, borderRadius: 4 }}
            title="Editar">✎</button>
        )}
        {onDelete && (
          <button onPointerDown={e => e.stopPropagation()}
            onClick={() => { if(window.confirm(`¿Eliminar clase de ${cls.clientName}?`)) onDelete(cls.id); }}
            style={{ background: "none", border: "none", color: T.red, cursor: "pointer",
              fontSize: 12, padding: "1px 3px", lineHeight: 1, borderRadius: 4 }}
            title="Eliminar">✕</button>
        )}
      </div>
    </div>
  );
}

// ─── DRAGGABLE CLASS BLOCK (bloque en la línea de tiempo) ────────────────────
function ClassBlock({ cls, pxPerMin, color, onEdit, onDelete, blockTop, blockHeight, alwaysShowBadge }) {
  const startMin = timeToMin(cls.horarioInicio);
  const dur = classDuration(cls);
  const left = (startMin - DAY_START_MIN) * pxPerMin;
  const width = Math.max(dur * pxPerMin - 3, 24);
  const endStr = fmtTime(minToTime(startMin + dur));

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cls.id, data: { cls } });

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      title={`${cls.clientName} · ${fmtTime(cls.horarioInicio)} – ${endStr}`}
      style={{ position: "absolute", left, width,
        top: blockTop ?? 5, ...(blockHeight ? { height: blockHeight } : { bottom: 5 }),
        background: `${color}22`, border: `2px solid ${color}80`, borderRadius: 8,
        cursor: "grab", opacity: isDragging ? 0.3 : 1, overflow: "hidden",
        padding: "5px 7px", boxSizing: "border-box", touchAction: "none",
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color, whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis", paddingRight: onEdit ? 16 : 0 }}>
        {cls.clientName}
      </div>
      {width > 70 && (
        <div style={{ fontSize: 10, color: T.textDim, whiteSpace: "nowrap" }}>
          {fmtTime(cls.horarioInicio)} – {endStr}
        </div>
      )}
      {(width > 110 || alwaysShowBadge) && (
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "nowrap", overflow: "hidden" }}>
          {cls.classTypeName && (
            <span style={{ fontSize: 9, color: T.white, opacity: 0.85, whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis" }}>{cls.classTypeName}</span>
          )}
          <DiscBadge discipline={cls.discipline} size={8} />
        </div>
      )}
      {cls.notes && (
        <div style={{ fontSize: 9, color: T.textDim, marginTop: 1,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" }}>
          {cls.notes}
        </div>
      )}
      {/* Botones editar / eliminar */}
      {(onEdit || onDelete) && (
        <div style={{ position: "absolute", top: 3, right: 3, display: "flex", gap: 2 }}>
          {onEdit && (
            <button onPointerDown={e => e.stopPropagation()} onClick={() => onEdit(cls)}
              style={{ background: `${color}30`, border: "none", color, cursor: "pointer",
                fontSize: 10, padding: "1px 4px", lineHeight: 1, borderRadius: 3 }}
              title="Editar">✎</button>
          )}
          {onDelete && (
            <button onPointerDown={e => e.stopPropagation()}
              onClick={() => { if(window.confirm(`¿Eliminar clase de ${cls.clientName}?`)) onDelete(cls.id); }}
              style={{ background: `${T.red}30`, border: "none", color: T.red, cursor: "pointer",
                fontSize: 10, padding: "1px 4px", lineHeight: 1, borderRadius: 3 }}
              title="Eliminar">✕</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DROPPABLE TIMELINE AREA ──────────────────────────────────────────────────
function TimelineDropArea({ instrId, date, children, height = 80 }) {
  const dropId = `timeline-${instrId}-${date}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId, data: { instrId, date, type: "timeline" } });
  return (
    <div ref={setNodeRef} id={dropId}
      style={{ position: "relative", height, flex: 1,
        background: isOver ? `${T.accent}10` : `${T.surface}30`,
        border: isOver ? `1px dashed ${T.accent}70` : `1px solid ${T.border}50`,
        borderRadius: 8, transition: "background .15s", overflow: "visible" }}>
      {children}
    </div>
  );
}


// ─── TIME AXIS HEADER ─────────────────────────────────────────────────────────
function TimeAxisHeader({ pxPerMin }) {
  const slots = [];
  for (let min = Math.ceil(DAY_START_MIN / 60) * 60; min <= DAY_END_MIN; min += 60) {
    slots.push(minToTime(min));
  }
  return (
    <div style={{ position: "relative", height: 22, marginLeft: 140 }}>
      {slots.map(t => {
        const left = (timeToMin(t) - DAY_START_MIN) * pxPerMin;
        return (
          <span key={t} style={{ position: "absolute", left, transform: "translateX(-50%)",
            fontSize: 9, color: T.muted, fontWeight: 600, whiteSpace: "nowrap" }}>
            {t}
          </span>
        );
      })}
    </div>
  );
}

// ─── MODAL INDISPONIBILIDAD ───────────────────────────────────────────────────
function UnavailModal({ instrName, onConfirm, onCancel }) {
  const [mode, setMode] = useState("full");
  const [horaInicio, setHoraInicio] = useState("09:30");
  const [horaFin, setHoraFin]       = useState("16:30");

  const PRESETS = [
    { id: "full",      label: "Todo el día",  sub: "9:30 – 16:30" },
    { id: "morning",   label: "🌅 Mañana",    sub: "9:30 – 13:00" },
    { id: "afternoon", label: "🌇 Tarde",      sub: "13:00 – 16:30" },
    { id: "custom",    label: "Personalizado", sub: "elegí los horarios" },
  ];

  function resolve() {
    if (mode === "full")      return { horaInicio: null, horaFin: null };
    if (mode === "morning")   return { horaInicio: "09:30", horaFin: "13:00" };
    if (mode === "afternoon") return { horaInicio: "13:00", horaFin: "16:30" };
    return { horaInicio, horaFin };
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 700, padding: 16 }}>
      <div style={{ background: T.card, border: `1px solid ${T.borderLight}`, borderRadius: 16,
        padding: 24, width: 340, maxWidth: "100%", boxShadow: "0 24px 80px rgba(0,0,0,.7)" }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
          🚫 No disponible — {instrName}
        </div>
        <div style={{ fontSize: 12, color: T.textDim, marginBottom: 16 }}>
          Elegí el rango horario de la indisponibilidad.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => setMode(p.id)}
              style={{ display: "flex", alignItems: "center", gap: 10,
                background: mode === p.id ? `${T.red}18` : T.surface,
                border: `1.5px solid ${mode === p.id ? T.red : T.border}`,
                borderRadius: 9, padding: "10px 14px", cursor: "pointer",
                fontFamily: "inherit", textAlign: "left" }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%",
                border: `2px solid ${mode === p.id ? T.red : T.muted}`,
                background: mode === p.id ? T.red : "transparent", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700,
                  color: mode === p.id ? T.red : T.text }}>{p.label}</div>
                <div style={{ fontSize: 10, color: T.textDim }}>{p.sub}</div>
              </div>
            </button>
          ))}
        </div>

        {mode === "custom" && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Desde</div>
              <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)}
                style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: 7, padding: "7px 10px", color: T.text, fontSize: 13,
                  fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 16 }}>→</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Hasta</div>
              <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)}
                style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: 7, padding: "7px 10px", color: T.text, fontSize: 13,
                  fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="danger" style={{ flex: 1 }} onClick={() => onConfirm(resolve())}>
            Marcar no disponible
          </Btn>
          <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── BLOQUE DE INDISPONIBILIDAD EN TIMELINE ───────────────────────────────────
function UnavailBlock({ horaInicio, horaFin, pxPerMin }) {
  const startMin = timeToMin(horaInicio);
  const endMin   = timeToMin(horaFin);
  const left  = (startMin - DAY_START_MIN) * pxPerMin;
  const width = Math.max((endMin - startMin) * pxPerMin - 2, 30);
  return (
    <div style={{ position: "absolute", left, width, top: 4, bottom: 4, zIndex: 1,
      background: `repeating-linear-gradient(-45deg,${T.red}14,${T.red}14 5px,transparent 5px,transparent 11px)`,
      border: `1px solid ${T.red}50`, borderRadius: 7, pointerEvents: "none",
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: T.red,
        background: T.card, padding: "1px 6px", borderRadius: 3,
        border: `1px solid ${T.red}40` }}>
        {fmtTime(horaInicio)} – {fmtTime(horaFin)}
      </span>
    </div>
  );
}

// ─── INSTRUCTOR ROW ───────────────────────────────────────────────────────────
function InstructorRow({ instr, date, classes, pxPerMin, onEdit, onDelete, unavailData, onSetUnavail, onClearUnavail }) {
  const onTimeline = classes.filter(c => c.horarioInicio);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]       = useState(false);

  const isUnavail  = !!unavailData;
  const isFullDay  = isUnavail && !unavailData.horaInicio;
  const hasRange   = isUnavail && !!unavailData.horaInicio;

  async function handleClear() {
    setSaving(true);
    try { await onClearUnavail(); } finally { setSaving(false); }
  }

  async function handleConfirm({ horaInicio, horaFin }) {
    setShowModal(false);
    setSaving(true);
    try { await onSetUnavail(horaInicio, horaFin); } finally { setSaving(false); }
  }

  function btnLabel() {
    if (saving) return "…";
    if (!isUnavail) return "Disponible";
    if (isFullDay) return "✗ Todo el día";
    return `✗ ${fmtTime(unavailData.horaInicio)}–${fmtTime(unavailData.horaFin)}`;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
      borderBottom: `1px solid ${T.border}30`, opacity: isUnavail ? 0.75 : 1 }}>

      {/* Label */}
      <div style={{ width: 132, flexShrink: 0, display: "flex", flexDirection: "column",
        alignItems: "flex-start", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Av name={instr.name} size={28} color={isUnavail ? T.muted : T.purple} />
          <span style={{ fontSize: 12, fontWeight: 700,
            color: isUnavail ? T.muted : T.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {instr.name.split(" ")[0]}
          </span>
        </div>
        <button
          disabled={saving}
          onClick={isUnavail ? handleClear : () => setShowModal(true)}
          style={{
            background: isUnavail ? `${T.red}20` : `${T.muted}18`,
            border: `1px solid ${isUnavail ? T.red : T.border}`,
            color: isUnavail ? T.red : T.textDim,
            borderRadius: 5, fontSize: 10, padding: "2px 6px",
            cursor: saving ? "wait" : "pointer", fontFamily: "inherit",
            fontWeight: 600, lineHeight: 1.4, maxWidth: 128,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
          title={isUnavail ? "Click para quitar" : "Click para marcar no disponible"}>
          {btnLabel()}
        </button>
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, position: "relative" }}>
        {isFullDay && (
          <div style={{ position: "absolute", inset: 0, zIndex: 2, borderRadius: 8, pointerEvents: "none",
            background: `repeating-linear-gradient(-45deg,${T.red}08,${T.red}08 6px,transparent 6px,transparent 14px)`,
            border: `1px solid ${T.red}30`,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.red,
              background: T.card, padding: "2px 8px", borderRadius: 4,
              border: `1px solid ${T.red}40` }}>No disponible todo el día</span>
          </div>
        )}
        <TimelineDropArea instrId={instr.id} date={date} pxPerMin={pxPerMin}>
          {hasRange && (
            <UnavailBlock
              horaInicio={unavailData.horaInicio}
              horaFin={unavailData.horaFin}
              pxPerMin={pxPerMin}
            />
          )}
          {onTimeline.map(c => (
            <ClassBlock key={c.id} cls={c} pxPerMin={pxPerMin} color={classColor(c)} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </TimelineDropArea>
      </div>

      {showModal && (
        <UnavailModal
          instrName={instr.name.split(" ")[0]}
          onConfirm={handleConfirm}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ─── UNASSIGNED BUCKET ────────────────────────────────────────────────────────
function UnassignedBucket({ classes, date, onEdit, onDelete }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `unassigned-${date}`,
    data: { type: "unassigned", date },
  });
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.red, textTransform: "uppercase",
        letterSpacing: "0.08em", marginBottom: 8 }}>
        ⚠ Sin Instructor ({classes.length})
      </div>
      <div ref={setNodeRef}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 12px",
          background: isOver ? `${T.red}08` : T.surface,
          border: `1px dashed ${isOver ? T.red : T.border}`, borderRadius: 10, minHeight: 48 }}>
        {classes.length === 0
          ? <span style={{ fontSize: 11, color: T.muted }}>— Todas las clases tienen instructor asignado —</span>
          : classes.map(c => <DraggableChip key={c.id} cls={c} color={T.red} onEdit={onEdit} onDelete={onDelete} />)
        }
      </div>
    </div>
  );
}

// ─── DRAG OVERLAY PREVIEW ─────────────────────────────────────────────────────
function DragPreview({ cls }) {
  if (!cls) return null;
  const color = classColor(cls);
  return (
    <div style={{ background: `${color}30`, border: `1.5px solid ${color}`, borderRadius: 8,
      padding: "6px 12px", fontSize: 11, fontWeight: 700, color, pointerEvents: "none",
      boxShadow: "0 8px 24px rgba(0,0,0,.5)", maxWidth: 160 }}>
      {cls.clientName}<br/>
      <span style={{ fontWeight: 400, color: T.textDim }}>{cls.classTypeName}</span>
    </div>
  );
}

// ─── PLANNING ADMIN VIEW ──────────────────────────────────────────────────────
function PlanningAdminView({ classes, staff, onUpdate, onEdit, onDelete, initialDate }) {
  const [anchorDate, setAnchorDate] = useState(initialDate || todayStr());
  const [selectedDate, setSelectedDate] = useState(initialDate || todayStr());
  const [halfDayPending, setHalfDayPending] = useState(null);
  const [activeCls, setActiveCls] = useState(null);
  const [overlapWarn, setOverlapWarn] = useState(null);

  const weekDays = getWeekDays(anchorDate);
  const instructors = staff.filter(s => s.role === "instructor" || s.role === "both");

  // Clases del día seleccionado
  const dayClasses = classes.filter(c => c.classDate === selectedDate);
  const unassigned = dayClasses.filter(c => !c.instructorId);
  const byInstructor = id => dayClasses.filter(c => c.instructorId === id);

  // px por minuto — ancho fijo del timeline
  const TIMELINE_W = 980;
  const pxPerMin = TIMELINE_W / DAY_SPAN_MIN;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const pointerXRef = useRef(null);

  // ── Indisponibilidad de instructores ──────────────────────────────────────────
  // Map<"staffId_date", { horaInicio: string|null, horaFin: string|null }>
  const [unavailMap, setUnavailMap] = useState(new Map());

  useEffect(() => {
    if (!weekDays.length) return;
    supabase
      .from("instructor_unavailability")
      .select("staff_id, date, hora_inicio, hora_fin")
      .in("date", weekDays)
      .then(({ data }) => {
        if (data) setUnavailMap(new Map(
          data.map(r => [`${r.staff_id}_${r.date}`, {
            horaInicio: r.hora_inicio ? r.hora_inicio.slice(0, 5) : null,
            horaFin:    r.hora_fin    ? r.hora_fin.slice(0, 5)    : null,
          }])
        ));
      });
  }, [weekDays.join(",")]);

  async function setUnavailability(staffId, date, horaInicio, horaFin) {
    const key = `${staffId}_${date}`;
    const { error } = await supabase.from("instructor_unavailability")
      .upsert({ staff_id: staffId, date, hora_inicio: horaInicio || null, hora_fin: horaFin || null },
               { onConflict: "staff_id,date" });
    if (error) { alert("Error guardando disponibilidad: " + error.message); return; }
    setUnavailMap(m => new Map([...m, [key, { horaInicio: horaInicio || null, horaFin: horaFin || null }]]));
  }

  async function clearUnavailability(staffId, date) {
    const key = `${staffId}_${date}`;
    const { error } = await supabase.from("instructor_unavailability").delete()
      .eq("staff_id", staffId).eq("date", date);
    if (error) { alert("Error: " + error.message); return; }
    setUnavailMap(m => { const n = new Map(m); n.delete(key); return n; });
  }

  function handleDragStart({ active }) {
    const cls = classes.find(c => c.id === active.id);
    setActiveCls(cls ?? null);
  }

  function handleDragMove({ activatorEvent, delta }) {
    // Coordenada X actual del puntero en la pantalla
    const originX = activatorEvent?.clientX ?? 0;
    pointerXRef.current = originX + (delta?.x ?? 0);
  }

  function handleDragEnd({ active, over }) {
    setActiveCls(null);
    if (!over) return;

    const cls = classes.find(c => c.id === active.id);
    if (!cls) return;

    const { instrId, date, type } = over.data.current ?? {};

    if (type === "unassigned") {
      onUpdate(cls.id, { instructorId: null, horarioInicio: null });
      return;
    }

    if (type === "timeline") {
      const timelineEl = document.getElementById(`timeline-${instrId}-${date}`);
      const rect = timelineEl?.getBoundingClientRect();
      let startMin = DAY_START_MIN;

      if (rect && pointerXRef.current != null) {
        const offsetX = pointerXRef.current - rect.left;
        const rawMin = DAY_START_MIN + offsetX / pxPerMin;
        startMin = snapTo30(clampStart(rawMin, classDuration(cls)));
      }

      applyTimelineDrop(cls, instrId, startMin);
    }
  }

  // Separado para poder llamarlo tanto desde DnD como desde el modal de HalfDay
  function applyTimelineDrop(cls, instrId, startMin) {
    const dur = classDuration(cls);

    // Advertencia si el instructor está marcado no disponible
    const unavail = unavailMap.get(`${instrId}_${selectedDate}`);
    if (unavail) {
      const rangeLabel = unavail.horaInicio
        ? `${unavail.horaInicio}–${unavail.horaFin}`
        : "todo el día";
      const instr = instructors.find(i => i.id === instrId);
      const ok = window.confirm(
        `⚠ ${instr?.name ?? "Este instructor"} está marcado como no disponible (${rangeLabel}) para este día.\n\n¿Asignar la clase igual?`
      );
      if (!ok) return;
    }

    // Si el tipo tiene inicio fijo, lo usamos
    if (FIXED_START[cls.classTypeId]) {
      const fixedMin = timeToMin(FIXED_START[cls.classTypeId]);
      resolveAndSave(cls, instrId, fixedMin, dur);
      return;
    }

    // Half Day sin horario → preguntar
    if (cls.classTypeId === HALF_DAY_ID && !cls.horarioInicio) {
      setHalfDayPending({ cls, instrId });
      return;
    }

    // Primera asignación y ya tiene horario definido → respetar el horario existente
    const resolvedStart = (!cls.instructorId && cls.horarioInicio)
      ? timeToMin(cls.horarioInicio)
      : snapTo30(clampStart(startMin, dur));
    resolveAndSave(cls, instrId, resolvedStart, dur);
  }

  function resolveAndSave(cls, instrId, startMin, dur) {
    if (!onUpdate) return;
    // Chequeo de superposición
    const others = dayClasses.filter(c =>
      c.id !== cls.id &&
      c.instructorId === instrId &&
      c.horarioInicio
    );
    const conflict = others.find(o =>
      overlaps(startMin, dur, timeToMin(o.horarioInicio), classDuration(o))
    );

    if (conflict) {
      setOverlapWarn(`Superposición con ${conflict.clientName} (${fmtTime(conflict.horarioInicio)})`);
      setTimeout(() => setOverlapWarn(null), 3500);
      return;
    }

    onUpdate(cls.id, {
      instructorId: instrId,
      horarioInicio: minToTime(startMin),
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
      {/* WEEK NAV */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Btn variant="ghost" size="sm" onClick={() => setAnchorDate(d => addWeeks(d, -1))}>← Semana anterior</Btn>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{fmtWeekRange(weekDays)}</span>
        <Btn variant="ghost" size="sm" onClick={() => setAnchorDate(d => addWeeks(d, 1))}>Semana siguiente →</Btn>
        <Btn variant="ghost" size="sm" onClick={() => { const t = todayStr(); setAnchorDate(t); setSelectedDate(t); }}
          style={{ marginLeft: "auto" }}>Hoy</Btn>
      </div>

      {/* DAY TABS */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: T.surface,
        borderRadius: 8, padding: 4, width: "fit-content" }}>
        {weekDays.map(d => (
          <button key={d} onClick={() => setSelectedDate(d)}
            style={{ background: selectedDate === d ? T.card : "none", border: "none",
              color: selectedDate === d ? T.accent : T.textDim,
              borderBottom: selectedDate === d ? `2px solid ${T.accent}` : "2px solid transparent",
              padding: "7px 14px", borderRadius: 6, fontSize: 12,
              fontWeight: selectedDate === d ? 700 : 500, cursor: "pointer", fontFamily: "inherit",
              position: "relative" }}>
            {fmtDayHeader(d)}
            {/* Punto si hay clases ese día */}
            {classes.filter(c => c.classDate === d).length > 0 && (
              <span style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5,
                borderRadius: "50%", background: T.accent }} />
            )}
          </button>
        ))}
      </div>

      {/* OVERLAP WARNING */}
      {overlapWarn && (
        <div style={{ background: `${T.red}18`, border: `1px solid ${T.red}50`, borderRadius: 8,
          padding: "10px 16px", fontSize: 13, color: T.red, marginBottom: 12, fontWeight: 600 }}>
          ⚠ {overlapWarn} — movimiento cancelado
        </div>
      )}

      {/* GRILLA */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: "16px 20px", overflowX: "auto" }}>
        <div style={{ minWidth: TIMELINE_W + 148 }}>
          <TimeAxisHeader pxPerMin={pxPerMin} />
          <div style={{ marginTop: 6 }}>
            {/* Fila sin asignar — solo clases con horario definido, en carriles */}
            {(() => {
              const withTime = unassigned.filter(c => c.horarioInicio);
              if (withTime.length === 0) return null;
              const LANE_H = 72;
              const { assignments, laneCount } = assignLanes(withTime);
              const rowH = laneCount * LANE_H + 8;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                  borderBottom: `1px solid ${T.border}30` }}>
                  <div style={{ width: 132, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.red }}>⚠ Sin asignar</span>
                  </div>
                  <TimelineDropArea instrId={null} date={selectedDate} height={rowH}>
                    {assignments.map(({ cls, lane }) => (
                      <ClassBlock key={cls.id} cls={cls} pxPerMin={pxPerMin} color={T.red}
                        onEdit={onEdit} onDelete={onDelete}
                        blockTop={4 + lane * LANE_H} blockHeight={LANE_H - 4}
                        alwaysShowBadge />
                    ))}
                  </TimelineDropArea>
                </div>
              );
            })()}
            {instructors.map(instr => (
              <InstructorRow
                key={instr.id}
                instr={instr}
                date={selectedDate}
                classes={byInstructor(instr.id)}
                pxPerMin={pxPerMin}
                onEdit={onEdit}
                onDelete={onDelete}
                unavailData={unavailMap.get(`${instr.id}_${selectedDate}`)}
                onSetUnavail={(hi, hf) => setUnavailability(instr.id, selectedDate, hi, hf)}
                onClearUnavail={() => clearUnavailability(instr.id, selectedDate)}
              />
            ))}
            {instructors.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 0", color: T.muted, fontSize: 13 }}>
                — Sin instructores activos —
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CHIPS — clases sin asignar y sin horario */}
      {unassigned.filter(c => !c.horarioInicio).length > 0 && (
        <UnassignedBucket classes={unassigned.filter(c => !c.horarioInicio)} date={selectedDate} onEdit={onEdit} onDelete={onDelete} />
      )}

      {/* HALF DAY MODAL */}
      {halfDayPending && (
        <HalfDayModal
          onChoose={time => {
            const { cls, instrId } = halfDayPending;
            setHalfDayPending(null);
            resolveAndSave(cls, instrId, timeToMin(time), classDuration(cls));
          }}
          onCancel={() => setHalfDayPending(null)}
        />
      )}

      {/* DRAG OVERLAY */}
      <DragOverlay dropAnimation={null}>
        {activeCls ? <DragPreview cls={activeCls} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── PLANNING INSTRUCTOR VIEW ─────────────────────────────────────────────────
const PAY_INFO = {
  reserved: { label: "Señado",      color: T.gold   },
  partial:  { label: "Pago Parcial", color: T.orange },
  paid:     { label: "Pago Total",   color: T.green  },
};

export function PlanningInstructorView({ classes, staffMember, staff = [] }) {
  const [anchorDate, setAnchorDate] = useState(todayStr());
  const [unavailByDate, setUnavailByDate] = useState(new Map());
  const [groupMatesMap, setGroupMatesMap] = useState({});

  useEffect(() => {
    if (!staffMember?.id) return;
    const myGroupIds = [...new Set(
      classes.filter(c => c.instructorId === staffMember.id && c.groupId).map(c => c.groupId)
    )];
    if (myGroupIds.length === 0) { setGroupMatesMap({}); return; }
    Promise.all(
      myGroupIds.map(gid =>
        supabase
          .rpc("get_group_instructor_names", { p_group_id: gid, p_exclude_staff_id: staffMember.id })
          .then(({ data }) => [gid, (data || []).filter(Boolean)])
      )
    ).then(entries => {
      setGroupMatesMap(Object.fromEntries(entries.filter(([, v]) => v.length > 0)));
    });
  }, [staffMember?.id, classes]);

  const weekDays = getWeekDays(anchorDate);

  useEffect(() => {
    if (!staffMember?.id) return;
    supabase
      .from("instructor_unavailability")
      .select("date, hora_inicio, hora_fin")
      .eq("staff_id", staffMember.id)
      .then(({ data }) => {
        if (data) setUnavailByDate(new Map(
          data.map(r => [r.date, {
            horaInicio: r.hora_inicio ? r.hora_inicio.slice(0, 5) : null,
            horaFin:    r.hora_fin    ? r.hora_fin.slice(0, 5)    : null,
          }])
        ));
      });
  }, [staffMember?.id]);

  function AgendaCard({ c }) {
    const color    = classColor(c);
    const startMin = timeToMin(c.horarioInicio);
    const endStr   = startMin != null ? fmtTime(minToTime(startMin + classDuration(c))) : null;
    const isOwn    = c.scenario === "own_class";
    const pay      = PAY_INFO[c.paymentStatus] ?? PAY_INFO.reserved;
    const groupMates = c.groupId ? (groupMatesMap[c.groupId] || []) : [];
    return (
      <div style={{ background: T.card, border: `1px solid ${T.border}`,
        borderLeft: `4px solid ${color}`, borderRadius: 12, padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "monospace", fontWeight: 900, color, fontSize: 16 }}>
            {c.horarioInicio
              ? `${fmtTime(c.horarioInicio)}${endStr ? ` – ${endStr}` : ""}`
              : "⏳ Horario sin confirmar"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {c.classTypeName && (
            <span style={{ background: `${color}18`, color, border: `1px solid ${color}40`,
              padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
              {c.classTypeName}
            </span>
          )}
          <span style={{ background: `${pay.color}18`, color: pay.color,
            border: `1px solid ${pay.color}40`, padding: "2px 8px",
            borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
            {pay.label}
          </span>
          {isOwn && (
            <span style={{ background: `${T.gold}18`, color: T.gold,
              border: `1px solid ${T.gold}40`, padding: "2px 8px",
              borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
              ⭐ Propia
            </span>
          )}
          {c.isRequired && (
            <span style={{ background: `${T.orange}18`, color: T.orange,
              border: `1px solid ${T.orange}40`, padding: "2px 8px",
              borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
              ⚡ Requerida
            </span>
          )}
          <span style={{ fontSize: 10, color: T.textDim, padding: "2px 4px" }}>
            {c.discipline === "snowboard" ? "🏂 Snowboard" : "🎿 Esquí"}
          </span>
        </div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15 }}>{c.clientName}</div>
          {c.peopleCount > 1 && (
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>👥 {c.peopleCount} personas</div>
          )}
        </div>
        {c.notes && (
          <div style={{ fontSize: 12, color: T.textDim, background: T.surface,
            borderRadius: 8, padding: "8px 11px", lineHeight: 1.6,
            borderLeft: `2px solid ${T.borderLight}` }}>
            📝 {c.notes}
          </div>
        )}
        {c.horarioInicio && (
          <div style={{ fontSize: 11, color: T.muted }}>
            Duración: {Math.round(classDuration(c) / 60 * 10) / 10}hs
          </div>
        )}
        {groupMates.length > 0 && (
          <div style={{ fontSize: 11, color: T.cyan, background: `${T.cyan}10`,
            border: `1px solid ${T.cyan}30`, borderRadius: 7, padding: "5px 10px" }}>
            👥 Instructores en esta reserva: {groupMates.join(", ")}
          </div>
        )}
      </div>
    );
  }

  function DaySection({ d }) {
    const today   = todayStr();
    const isToday = d === today;
    const isPast  = d < today;
    const unavail = unavailByDate.get(d);
    const dayClasses = classes
      .filter(c => c.instructorId === staffMember?.id && c.classDate === d)
      .sort((a, b) => (timeToMin(a.horarioInicio) ?? 0) - (timeToMin(b.horarioInicio) ?? 0));
    const label = new Date(d + "T12:00:00").toLocaleDateString("es-AR",
      { weekday: "long", day: "numeric", month: "long" });

    return (
      <div style={{ borderBottom: `1px solid ${T.border}30`, paddingBottom: 16, marginBottom: 16,
        opacity: isPast ? 0.55 : 1 }}>
        {/* Encabezado del día */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 4, height: 28, borderRadius: 2,
            background: isToday ? T.accent : dayClasses.length > 0 ? T.green : T.border }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, textTransform: "capitalize",
              color: isToday ? T.accent : T.text }}>
              {label}
              {isToday && (
                <span style={{ marginLeft: 8, background: T.accent, color: T.white,
                  fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                  verticalAlign: "middle" }}>HOY</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 1 }}>
              {dayClasses.length === 0 && !unavail
                ? "Sin clases"
                : `${dayClasses.length} clase${dayClasses.length !== 1 ? "s" : ""}`}
            </div>
          </div>
        </div>

        {/* Banner no disponible */}
        {unavail && (
          <div style={{ background: `${T.red}14`, border: `1px solid ${T.red}40`,
            borderRadius: 8, padding: "8px 12px", marginBottom: 10,
            display: "flex", alignItems: "center", gap: 8 }}>
            <span>🚫</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.red }}>No disponible</span>
            <span style={{ fontSize: 11, color: T.textDim }}>
              {unavail.horaInicio
                ? `${fmtTime(unavail.horaInicio)} – ${fmtTime(unavail.horaFin)}`
                : "todo el día"}
            </span>
          </div>
        )}

        {/* Clases */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dayClasses.map(c => <AgendaCard key={c.id} c={c} />)}
        </div>
      </div>
    );
  }

  const totalSemana = weekDays.reduce((acc, d) =>
    acc + classes.filter(c => c.instructorId === staffMember?.id && c.classDate === d).length, 0);

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      {/* Navegación semanal */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Btn variant="ghost" size="sm" onClick={() => setAnchorDate(d => addWeeks(d, -1))}>←</Btn>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{fmtWeekRange(weekDays)}</div>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => setAnchorDate(d => addWeeks(d, 1))}>→</Btn>
        <Btn variant="ghost" size="sm" onClick={() => setAnchorDate(todayStr())}>Hoy</Btn>
      </div>
      <div style={{ fontSize: 11, color: T.textDim, textAlign: "center", marginBottom: 20 }}>
        {totalSemana === 0 ? "Sin clases esta semana" : `${totalSemana} clase${totalSemana !== 1 ? "s" : ""} esta semana`}
      </div>

      {/* 7 días */}
      {weekDays.map(d => <DaySection key={d} d={d} />)}
    </div>
  );
}

// ─── PLANNING WEEK OVERVIEW (admin) ──────────────────────────────────────────
function DraggableWeekCard({ c, onEdit, color: colorProp }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id, data: { cls: c } });
  const color = colorProp ?? T.red;
  const startMin = timeToMin(c.horarioInicio);
  const endStr = startMin != null ? fmtTime(minToTime(startMin + classDuration(c))) : null;
  return (
    <div ref={setNodeRef}
      style={{ background: `${color}14`, border: `1px solid ${color}40`,
        borderLeft: `3px solid ${color}`, borderRadius: 5, padding: "3px 6px",
        fontSize: 10, opacity: isDragging ? 0.35 : 1, touchAction: "none",
        position: "relative", marginBottom: 3 }}>
      <div {...listeners} {...attributes} style={{ cursor: "grab" }}>
        {c.horarioInicio && (
          <div style={{ color: T.textDim, fontSize: 9 }}>
            {fmtTime(c.horarioInicio)}{endStr ? `–${endStr}` : ""}
          </div>
        )}
        <div style={{ fontWeight: 700, color: T.text, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.clientName || "—"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap", marginTop: 1 }}>
          <span style={{ color: T.white, fontSize: 9 }}>{c.classTypeName || "—"}</span>
          <DiscBadge discipline={c.discipline} size={8} />
        </div>
      </div>
      {onEdit && (
        <button onPointerDown={e => e.stopPropagation()} onClick={() => onEdit(c)}
          style={{ position: "absolute", top: 2, right: 2, background: "none", border: "none",
            color: T.textDim, cursor: "pointer", fontSize: 11, padding: "1px 3px" }}>✎</button>
      )}
    </div>
  );
}

function DroppableWeekCell({ instrId, date, children, unavailData }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `week-drop-${instrId}-${date}`,
    data: { instrId, date },
  });
  const isFullDay = unavailData && !unavailData.horaInicio;
  const hasRange  = unavailData && !!unavailData.horaInicio;
  return (
    <div ref={setNodeRef} style={{ minHeight: 52, position: "relative",
      background: isOver ? `${T.accent}12` : T.card,
      outline: isOver ? `1px dashed ${T.accent}60` : "none",
      opacity: unavailData ? 0.75 : 1,
      transition: "background .15s" }}>
      {isFullDay && (
        <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
          background: `repeating-linear-gradient(-45deg,${T.red}08,${T.red}08 6px,transparent 6px,transparent 14px)`,
          border: `1px solid ${T.red}20`, borderRadius: 0,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.red,
            background: T.card, padding: "1px 6px", borderRadius: 4,
            border: `1px solid ${T.red}40` }}>✗ No disponible</span>
        </div>
      )}
      {hasRange && (
        <div style={{ padding: "2px 4px" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.red,
            background: `${T.red}15`, border: `1px solid ${T.red}30`,
            borderRadius: 4, padding: "1px 5px", display: "inline-block" }}>
            ✗ {fmtTime(unavailData.horaInicio)}–{fmtTime(unavailData.horaFin)}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

function WeekCell({ classes, onEdit, showInstructor, staff, draggable }) {
  const sorted = [...classes].sort((a, b) => (timeToMin(a.horarioInicio) ?? 9999) - (timeToMin(b.horarioInicio) ?? 9999));
  return (
    <div style={{ padding: 4, display: "flex", flexDirection: "column", gap: 3, minHeight: 52 }}>
      {sorted.map(c => {
        const color = classColor(c);
        if (draggable) return <DraggableWeekCard key={c.id} c={c} onEdit={onEdit} color={color} />;
        const startMin = timeToMin(c.horarioInicio);
        const endStr = startMin != null ? fmtTime(minToTime(startMin + classDuration(c))) : null;
        const instr = showInstructor ? staff.find(s => s.id === c.instructorId) : null;
        return (
          <div key={c.id} onClick={() => onEdit && onEdit(c)}
            style={{ background: `${color}14`, border: `1px solid ${color}30`,
              borderLeft: `3px solid ${color}`, borderRadius: 5, padding: "3px 6px",
              cursor: onEdit ? "pointer" : "default", fontSize: 10 }}>
            {c.horarioInicio && (
              <div style={{ color: T.textDim, fontSize: 9 }}>
                {fmtTime(c.horarioInicio)}{endStr ? `–${endStr}` : ""}
              </div>
            )}
            <div style={{ fontWeight: 700, color: T.text, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.clientName || "—"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap", marginTop: 1 }}>
              <span style={{ color: T.white, fontSize: 9 }}>{c.classTypeName || "—"}</span>
              <DiscBadge discipline={c.discipline} size={8} />
            </div>
            {instr && <div style={{ color: T.textDim, fontSize: 9 }}>👤 {instr.name}</div>}
          </div>
        );
      })}
    </div>
  );
}

function PlanningWeekOverview({ classes, staff, onEdit, onUpdate, initialDate, onDateChange, onSwitchToDay }) {
  const [anchorDate, setAnchorDateRaw] = useState(initialDate ?? todayStr());
  const [activeCls, setActiveCls] = useState(null);
  const [unavailMap, setUnavailMap] = useState(new Map());

  function setAnchorDate(fn) {
    setAnchorDateRaw(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      onDateChange?.(next);
      return next;
    });
  }
  const weekDays = getWeekDays(anchorDate);
  const today = todayStr();

  useEffect(() => {
    supabase
      .from("instructor_unavailability")
      .select("staff_id, date, hora_inicio, hora_fin")
      .in("date", weekDays)
      .then(({ data }) => {
        const m = new Map();
        (data || []).forEach(r => m.set(`${r.staff_id}_${r.date}`, {
          horaInicio: r.hora_inicio ? r.hora_inicio.slice(0, 5) : null,
          horaFin:    r.hora_fin    ? r.hora_fin.slice(0, 5)    : null,
        }));
        setUnavailMap(m);
      });
  }, [weekDays[0]]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const instructors = useMemo(() => {
    const weekClasses = classes.filter(c => weekDays.includes(c.classDate));
    const activeInstr = staff.filter(s => (s.role === "instructor" || s.role === "both") && s.isActive);
    const extraIds = weekClasses
      .filter(c => c.instructorId && !activeInstr.find(s => s.id === c.instructorId))
      .map(c => c.instructorId)
      .filter((id, i, arr) => arr.indexOf(id) === i);
    const extra = extraIds.map(id => staff.find(s => s.id === id)).filter(Boolean);
    return [...activeInstr, ...extra];
  }, [staff, classes, weekDays]);

  const hasUnassigned = useMemo(() =>
    classes.some(c => weekDays.includes(c.classDate) && !c.instructorId),
  [classes, weekDays]);

  function handleDragEnd({ active, over }) {
    setActiveCls(null);
    if (!over || !onUpdate) return;
    const { instrId, date } = over.data.current ?? {};
    const cls = active.data.current?.cls;
    if (!cls || !instrId || !date) return;
    if (cls.classDate !== date) return;
    const unavail = unavailMap.get(`${instrId}_${date}`);
    if (unavail) {
      const instr = staff.find(s => s.id === instrId);
      const rangeLabel = unavail.horaInicio ? `${unavail.horaInicio}–${unavail.horaFin}` : "todo el día";
      const ok = window.confirm(
        `⚠ ${instr?.name ?? "Este instructor"} está marcado como no disponible (${rangeLabel}) para este día.\n\n¿Asignar la clase igual?`
      );
      if (!ok) return;
    }
    onUpdate(cls.id, { instructorId: instrId });
  }

  const COL = `140px repeat(7, minmax(110px, 1fr))`;

  return (
    <DndContext sensors={sensors} onDragStart={({ active }) => setActiveCls(active.data.current?.cls ?? null)} onDragEnd={handleDragEnd}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Btn variant="ghost" size="sm" onClick={() => setAnchorDate(d => addWeeks(d, -1))}>← Anterior</Btn>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1, textAlign: "center" }}>{fmtWeekRange(weekDays)}</span>
        <Btn variant="ghost" size="sm" onClick={() => setAnchorDate(d => addWeeks(d, 1))}>Siguiente →</Btn>
        <Btn variant="ghost" size="sm" onClick={() => setAnchorDate(todayStr())}>Hoy</Btn>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: COL, gap: 1, minWidth: 900, background: T.border, borderRadius: 10, overflow: "hidden" }}>
          {/* Header */}
          <div style={{ background: T.surface, padding: "8px 10px" }} />
          {weekDays.map(d => {
            const isToday = d === today;
            const cnt = classes.filter(c => c.classDate === d).length;
            return (
              <div key={d} onClick={() => onSwitchToDay?.(d)}
                style={{ background: isToday ? `${T.accent}20` : T.surface, padding: "7px 8px", textAlign: "center",
                  cursor: onSwitchToDay ? "pointer" : "default" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: isToday ? T.accent : T.text, textTransform: "capitalize" }}>
                  {fmtDayHeader(d)}
                  {isToday && <span style={{ marginLeft: 4, background: T.accent, color: "#fff", fontSize: 8, padding: "1px 4px", borderRadius: 10 }}>HOY</span>}
                </div>
                <div style={{ fontSize: 9, color: T.textDim }}>{cnt > 0 ? `${cnt} clase(s)` : "—"}</div>
              </div>
            );
          })}

          {/* Fila sin asignar — draggable */}
          {hasUnassigned && (
            <>
              <div style={{ background: `${T.red}10`, padding: "8px 10px", display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.red }}>⚠ Sin asignar</span>
              </div>
              {weekDays.map(d => {
                const cls = classes.filter(c => c.classDate === d && !c.instructorId);
                return (
                  <div key={d} style={{ background: cls.length ? `${T.red}06` : T.card, padding: 4 }}>
                    {cls.map(c => <DraggableWeekCard key={c.id} c={c} onEdit={onEdit} />)}
                  </div>
                );
              })}
            </>
          )}

          {/* Filas por instructor — droppable */}
          {instructors.map(instr => {
            const hasAny = weekDays.some(d => classes.some(c => c.classDate === d && c.instructorId === instr.id));
            return (
              <>
                <div key={`h-${instr.id}`} style={{ background: T.card, padding: "8px 10px", display: "flex", alignItems: "center", opacity: hasAny ? 1 : 0.4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{instr.name}</span>
                </div>
                {weekDays.map(d => {
                  const cls = classes.filter(c => c.classDate === d && c.instructorId === instr.id);
                  return (
                    <DroppableWeekCell key={d} instrId={instr.id} date={d} unavailData={unavailMap.get(`${instr.id}_${d}`)}>
                      <WeekCell classes={cls} onEdit={onEdit} staff={staff} draggable />
                    </DroppableWeekCell>
                  );
                })}
              </>
            );
          })}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeCls ? <DragPreview cls={activeCls} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── PLANNING MONTH OVERVIEW (admin) ─────────────────────────────────────────
function PlanningMonthOverview({ classes, staff, onEdit, onSwitchToDay }) {
  const [anchorDate, setAnchorDate] = useState(todayStr());
  const { days, leadingBlanks, monthLabel } = getMonthGrid(anchorDate);
  const today = todayStr();
  const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Btn variant="ghost" size="sm" onClick={() => setAnchorDate(d => addMonths(d, -1))}>← Anterior</Btn>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.text, flex: 1, textAlign: "center", textTransform: "capitalize" }}>{monthLabel}</span>
        <Btn variant="ghost" size="sm" onClick={() => setAnchorDate(d => addMonths(d, 1))}>Siguiente →</Btn>
        <Btn variant="ghost" size="sm" onClick={() => setAnchorDate(todayStr())}>Hoy</Btn>
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", background: T.surface,
          borderBottom: `1px solid ${T.border}` }}>
          {DOW.map(l => (
            <div key={l} style={{ padding: "8px 6px", fontSize: 10, fontWeight: 700,
              color: T.textDim, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.07em" }}>{l}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`b${i}`} style={{ minHeight: 90, background: `${T.bg}60`,
              borderTop: `1px solid ${T.border}`, borderLeft: `1px solid ${T.border}` }} />
          ))}
          {days.map(d => {
            const dayClasses = classes
              .filter(c => c.classDate === d)
              .sort((a, b) => (timeToMin(a.horarioInicio) ?? 9999) - (timeToMin(b.horarioInicio) ?? 9999));
            const isToday = d === today;
            const isPast = d < today;
            return (
              <div key={d} onClick={() => onSwitchToDay(d)}
                style={{ minHeight: 90, padding: 5, borderTop: `1px solid ${T.border}`,
                  borderLeft: `1px solid ${T.border}`,
                  background: isToday ? `${T.accent}08` : "transparent",
                  opacity: isPast ? 0.6 : 1, cursor: "pointer" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%",
                  background: isToday ? T.accent : "none", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: isToday ? 700 : 500,
                  color: isToday ? T.white : T.textDim, marginBottom: 3 }}>
                  {parseInt(d.split("-")[2])}
                </div>
                {dayClasses.slice(0, 3).map(c => {
                  const color = classColor(c);
                  return (
                    <div key={c.id}
                      onClick={e => { e.stopPropagation(); onEdit && onEdit(c); }}
                      style={{ background: `${color}18`, borderLeft: `2px solid ${color}`,
                        borderRadius: 4, padding: "2px 5px", fontSize: 10, fontWeight: 600,
                        color, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap", cursor: onEdit ? "pointer" : "default" }}>
                      {c.horarioInicio ? `${fmtTime(c.horarioInicio)} ` : ""}
                      {c.clientName}
                    </div>
                  );
                })}
                {dayClasses.length > 3 && (
                  <div style={{ fontSize: 10, color: T.muted, padding: "1px 4px" }}>+{dayClasses.length - 3} más</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── EXPORT PRINCIPAL ─────────────────────────────────────────────────────────
export default function PlanningView({ classes, staff, isAdmin, staffProfile, onUpdate, onEdit, onDelete }) {
  const [viewType, setViewType] = useState("day"); // "day" | "week" | "month"
  const [sharedDate, setSharedDate] = useState(todayStr());

  function switchToDay(date) {
    setSharedDate(date);
    setViewType("day");
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>▦ Planning</div>
        {isAdmin && (
          <>
            <span style={{ background: `${T.accent}18`, color: T.accent,
              border: `1px solid ${T.accent}40`, padding: "2px 10px",
              borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
              Vista Admin
            </span>
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {[["day","Día"],["week","Semana"],["month","Mes"]].map(([v,l]) => (
                <Btn key={v} variant={viewType===v?"primary":"ghost"} size="sm" onClick={() => setViewType(v)}>{l}</Btn>
              ))}
            </div>
          </>
        )}
      </div>

      {isAdmin ? (
        <>
          {viewType === "day"   && <PlanningAdminView key={sharedDate} classes={classes} staff={staff} onUpdate={onUpdate} onEdit={onEdit} onDelete={onDelete} initialDate={sharedDate} />}
          {viewType === "week"  && <PlanningWeekOverview classes={classes} staff={staff} onEdit={onEdit} onUpdate={onUpdate} initialDate={sharedDate} onDateChange={setSharedDate} onSwitchToDay={switchToDay} />}
          {viewType === "month" && <PlanningMonthOverview classes={classes} staff={staff} onEdit={onEdit} onSwitchToDay={switchToDay} />}
        </>
      ) : (
        <PlanningInstructorView classes={classes} staffMember={staffProfile} />
      )}
    </div>
  );
}
