// src/components/PlanningView.jsx
// Módulo de Planning — grilla semanal (admin) y agenda diaria (instructor)

import { useState, useRef, useCallback } from "react";
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
const DAY_END_MIN   = 16 * 60 + 30;  // 16:30
const DAY_SPAN_MIN  = DAY_END_MIN - DAY_START_MIN; // 420 min

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
  "e498e156-1668-4b5d-b0f8-fec47def2948": "09:30", // Mini Day
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

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

const todayStr = new Date().toISOString().split("T")[0];

// ─── COLORES POR TIPO ─────────────────────────────────────────────────────────
const TYPE_COLORS = {
  "b31212c9-f92d-4536-abe9-52a233985a79": T.accent,   // Full Day
  "e498e156-1668-4b5d-b0f8-fec47def2948": T.teal,     // Mini Day
  "1ae8e449-40ac-444a-b524-220f81e150c6": T.purple,   // Half Day
  "1e71732f-a418-44d4-8a4c-34b721aeec04": T.gold,     // 2 Horas
  "44deac8a-0fcc-45c7-bd46-feb14be29eb5": T.green,    // Grupal
};
function classColor(cls) {
  return TYPE_COLORS[cls.classTypeId] ?? T.muted;
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
function DraggableChip({ cls, color }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cls.id, data: { cls } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      style={{ background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 7,
        padding: "5px 9px", fontSize: 11, cursor: "grab", opacity: isDragging ? 0.35 : 1,
        display: "flex", flexDirection: "column", gap: 2, minWidth: 90, touchAction: "none" }}>
      <span style={{ fontWeight: 700, color, whiteSpace: "nowrap", overflow: "hidden",
        textOverflow: "ellipsis", maxWidth: 120 }}>{cls.clientName}</span>
      <span style={{ color: T.textDim }}>{cls.classTypeName || "—"}</span>
    </div>
  );
}

// ─── DRAGGABLE CLASS BLOCK (bloque en la línea de tiempo) ────────────────────
function ClassBlock({ cls, pxPerMin, color }) {
  const startMin = timeToMin(cls.horarioInicio);
  const dur = classDuration(cls);
  const left = (startMin - DAY_START_MIN) * pxPerMin;
  const width = Math.max(dur * pxPerMin - 3, 24);
  const endStr = fmtTime(minToTime(startMin + dur));

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cls.id, data: { cls } });

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      title={`${cls.clientName} · ${fmtTime(cls.horarioInicio)} – ${endStr}`}
      style={{ position: "absolute", left, width, top: 5, bottom: 5,
        background: `${color}22`, border: `2px solid ${color}80`, borderRadius: 8,
        cursor: "grab", opacity: isDragging ? 0.3 : 1, overflow: "hidden",
        padding: "5px 7px", boxSizing: "border-box", touchAction: "none",
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color, whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis" }}>{cls.clientName}</div>
      {width > 70 && (
        <div style={{ fontSize: 10, color: T.textDim, whiteSpace: "nowrap" }}>
          {fmtTime(cls.horarioInicio)} – {endStr}
        </div>
      )}
      {width > 110 && cls.classTypeName && (
        <div style={{ fontSize: 9, color, opacity: 0.7, whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis" }}>{cls.classTypeName}</div>
      )}
    </div>
  );
}

// ─── DROPPABLE TIMELINE AREA ──────────────────────────────────────────────────
function TimelineDropArea({ instrId, date, children }) {
  const dropId = `timeline-${instrId}-${date}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId, data: { instrId, date, type: "timeline" } });
  return (
    <div ref={setNodeRef} id={dropId}
      style={{ position: "relative", height: 80, flex: 1,
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
  for (let min = DAY_START_MIN; min <= DAY_END_MIN; min += 60) {
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

// ─── INSTRUCTOR ROW ───────────────────────────────────────────────────────────
function InstructorRow({ instr, date, classes, pxPerMin }) {
  const onTimeline = classes.filter(c => c.horarioInicio);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 96, padding: "6px 0",
      borderBottom: `1px solid ${T.border}30` }}>
      {/* Label */}
      <div style={{ width: 132, flexShrink: 0, display: "flex", alignItems: "center", gap: 7 }}>
        <Av name={instr.name} size={28} color={T.purple} />
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{instr.name.split(" ")[0]}</span>
      </div>

      {/* Timeline */}
      <TimelineDropArea instrId={instr.id} date={date} pxPerMin={pxPerMin}>
        {onTimeline.map(c => (
          <ClassBlock key={c.id} cls={c} pxPerMin={pxPerMin} color={classColor(c)} />
        ))}
      </TimelineDropArea>
    </div>
  );
}

// ─── UNASSIGNED BUCKET ────────────────────────────────────────────────────────
function UnassignedBucket({ classes, date }) {
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
          : classes.map(c => <DraggableChip key={c.id} cls={c} color={T.red} />)
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
function PlanningAdminView({ classes, staff, onUpdate }) {
  const [anchorDate, setAnchorDate] = useState(todayStr);
  const [selectedDate, setSelectedDate] = useState(todayStr);
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
  // Guardamos la posición X del puntero durante el drag para calcular el slot al soltar
  const pointerXRef = useRef(null);

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

    const snapped = snapTo30(clampStart(startMin, dur));
    resolveAndSave(cls, instrId, snapped, dur);
  }

  function resolveAndSave(cls, instrId, startMin, dur) {
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
        <Btn variant="ghost" size="sm" onClick={() => { setAnchorDate(todayStr); setSelectedDate(todayStr); }}
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
            {instructors.map(instr => (
              <InstructorRow
                key={instr.id}
                instr={instr}
                date={selectedDate}
                classes={byInstructor(instr.id)}
                pxPerMin={pxPerMin}
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

      {/* UNASSIGNED */}
      <UnassignedBucket classes={unassigned} date={selectedDate} />

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

export function PlanningInstructorView({ classes, staffMember }) {
  const [date, setDate] = useState(todayStr);

  // Solo clases donde el usuario logueado es el instructor
  const allDay = classes
    .filter(c => c.instructorId === staffMember?.id && c.classDate === date);

  const withTime    = allDay.filter(c => c.horarioInicio)
    .sort((a, b) => (timeToMin(a.horarioInicio) ?? 0) - (timeToMin(b.horarioInicio) ?? 0));
  const withoutTime = allDay.filter(c => !c.horarioInicio);

  function fmtDateLong(d) {
    return new Date(d + "T12:00:00").toLocaleDateString("es-AR",
      { weekday: "long", day: "numeric", month: "long" });
  }

  function AgendaCard({ c }) {
    const color   = classColor(c);
    const startMin = timeToMin(c.horarioInicio);
    const endStr  = startMin != null ? fmtTime(minToTime(startMin + classDuration(c))) : null;
    const isOwn   = c.scenario === "own_class";
    const pay     = PAY_INFO[c.paymentStatus] ?? PAY_INFO.reserved;

    return (
      <div style={{ background: T.card, border: `1px solid ${T.border}`,
        borderLeft: `4px solid ${color}`, borderRadius: 12, padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Horario + tipo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "monospace", fontWeight: 900, color, fontSize: 16 }}>
            {c.horarioInicio
              ? `${fmtTime(c.horarioInicio)}${endStr ? ` – ${endStr}` : ""}`
              : "⏳ Horario sin confirmar"}
          </span>
        </div>

        {/* Badges */}
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

        {/* Cliente */}
        <div>
          <div style={{ fontWeight: 900, fontSize: 15 }}>{c.clientName}</div>
          {c.peopleCount > 1 && (
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>
              👥 {c.peopleCount} personas
            </div>
          )}
        </div>

        {/* Notas */}
        {c.notes && (
          <div style={{ fontSize: 12, color: T.textDim, background: T.surface,
            borderRadius: 8, padding: "8px 11px", lineHeight: 1.6,
            borderLeft: `2px solid ${T.borderLight}` }}>
            📝 {c.notes}
          </div>
        )}

        {/* Duración calculada */}
        {c.horarioInicio && (
          <div style={{ fontSize: 11, color: T.muted }}>
            Duración: {Math.round(classDuration(c) / 60 * 10) / 10}hs
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      {/* Day nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Btn variant="ghost" size="sm" onClick={() => setDate(d => addDays(d, -1))}>←</Btn>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 15, textTransform: "capitalize" }}>
            {fmtDateLong(date)}
          </div>
          {date === todayStr
            ? <div style={{ fontSize: 11, color: T.accent, marginTop: 2 }}>Hoy</div>
            : <button onClick={() => setDate(todayStr)}
                style={{ fontSize: 11, color: T.textDim, background: "none", border: "none",
                  cursor: "pointer", fontFamily: "inherit", marginTop: 2 }}>
                Volver a hoy
              </button>
          }
        </div>
        <Btn variant="ghost" size="sm" onClick={() => setDate(d => addDays(d, 1))}>→</Btn>
      </div>

      <div style={{ fontSize: 11, color: T.muted, textAlign: "center", marginBottom: 16 }}>
        {allDay.length === 0 ? "Sin clases" : `${allDay.length} clase(s)`}
      </div>

      {/* Con horario */}
      {withTime.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {withTime.map(c => <AgendaCard key={c.id} c={c} />)}
        </div>
      )}

      {/* Sin horario asignado */}
      {withoutTime.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.orange,
            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            ⏳ Horario pendiente de confirmar
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {withoutTime.map(c => <AgendaCard key={c.id} c={c} />)}
          </div>
        </div>
      )}

      {/* Vacío */}
      {allDay.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: T.muted, fontSize: 13 }}>
          — Sin clases para este día —
        </div>
      )}
    </div>
  );
}

// ─── EXPORT PRINCIPAL ─────────────────────────────────────────────────────────
export default function PlanningView({ classes, staff, isAdmin, staffProfile, onUpdate }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>▦ Planning</div>
        {isAdmin && (
          <span style={{ background: `${T.accent}18`, color: T.accent,
            border: `1px solid ${T.accent}40`, padding: "2px 10px",
            borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
            Vista Admin
          </span>
        )}
      </div>

      {isAdmin ? (
        <PlanningAdminView classes={classes} staff={staff} onUpdate={onUpdate} />
      ) : (
        <PlanningInstructorView classes={classes} staffMember={staffProfile} />
      )}
    </div>
  );
}
