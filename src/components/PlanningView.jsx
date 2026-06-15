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

// Duración en minutos por tipo de clase
const CLASS_DURATIONS = {
  "b31212c9-f92d-4536-abe9-52a233985a79": 420, // Full Day  9:30-16:30
  "e498e156-1668-4b5d-b0f8-fec47def2948": 270, // Mini Day  9:30-14:00
  "1ae8e449-40ac-444a-b524-220f81e150c6": 180, // Half Day  3hs
  "1e71732f-a418-44d4-8a4c-34b721aeec04": 120, // 2 Horas
  "44deac8a-0fcc-45c7-bd46-feb14be29eb5": 180, // Grupal    3hs (asumido)
};

// Horarios fijos para tipos que no tienen flexibilidad
const FIXED_START = {
  "b31212c9-f92d-4536-abe9-52a233985a79": "09:30", // Full Day
  "e498e156-1668-4b5d-b0f8-fec47def2948": "09:30", // Mini Day
};

// Half Day IDs para detectarlo
const HALF_DAY_ID = "1ae8e449-40ac-444a-b524-220f81e150c6";

function classDuration(cls) {
  return CLASS_DURATIONS[cls.classTypeId] ?? 120;
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
  const width = Math.max(dur * pxPerMin - 2, 20);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cls.id, data: { cls } });

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      title={`${cls.clientName} · ${fmtTime(cls.horarioInicio)} – ${fmtTime(minToTime(startMin + dur))}`}
      style={{ position: "absolute", left, width, top: 4, bottom: 4,
        background: `${color}25`, border: `1.5px solid ${color}70`, borderRadius: 6,
        cursor: "grab", opacity: isDragging ? 0.35 : 1, overflow: "hidden",
        padding: "3px 6px", boxSizing: "border-box", touchAction: "none",
        display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color, whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis" }}>{cls.clientName}</div>
      {width > 60 && (
        <div style={{ fontSize: 9, color: T.textDim }}>
          {fmtTime(cls.horarioInicio)}
        </div>
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
      style={{ position: "relative", height: 52, flex: 1,
        background: isOver ? `${T.accent}10` : "transparent",
        border: isOver ? `1px dashed ${T.accent}60` : "1px solid transparent",
        borderRadius: 6, transition: "background .15s", overflow: "visible" }}>
      {children}
    </div>
  );
}

// ─── DROPPABLE PENDING ZONE ───────────────────────────────────────────────────
function PendingZone({ instrId, date, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `pending-${instrId}-${date}`,
    data: { instrId, date, type: "pending" },
  });
  const hasChildren = Array.isArray(children) ? children.filter(Boolean).length > 0 : !!children;
  return (
    <div ref={setNodeRef}
      style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "4px 6px",
        minHeight: 36, background: isOver ? `${T.gold}10` : `${T.surface}`,
        border: isOver ? `1px dashed ${T.gold}60` : `1px solid ${T.border}30`,
        borderRadius: 6, alignItems: "center",
        ...(hasChildren ? {} : { opacity: 0.4 }) }}>
      {hasChildren ? children : <span style={{ fontSize: 10, color: T.muted }}>sin horario asignado</span>}
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
  const pending    = classes.filter(c => !c.horarioInicio);

  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 8, minHeight: 62, padding: "4px 0",
      borderBottom: `1px solid ${T.border}30` }}>
      {/* Label */}
      <div style={{ width: 132, flexShrink: 0, display: "flex", alignItems: "center", gap: 7 }}>
        <Av name={instr.name} size={26} color={T.purple} />
        <span style={{ fontSize: 11, fontWeight: 700, color: T.text, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{instr.name.split(" ")[0]}</span>
      </div>

      {/* Timeline */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 4 }}>
        <TimelineDropArea instrId={instr.id} date={date} pxPerMin={pxPerMin}>
          {onTimeline.map(c => (
            <ClassBlock key={c.id} cls={c} pxPerMin={pxPerMin} color={classColor(c)} />
          ))}
        </TimelineDropArea>

        {/* Pending (sin horario) */}
        <PendingZone instrId={instr.id} date={date}>
          {pending.map(c => (
            <DraggableChip key={c.id} cls={c} color={classColor(c)} />
          ))}
        </PendingZone>
      </div>
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
  const TIMELINE_W = 660;
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

    if (type === "pending") {
      onUpdate(cls.id, { instructorId: instrId, horarioInicio: null });
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
        <div style={{ minWidth: TIMELINE_W + 160 }}>
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
function PlanningInstructorView({ classes, staffMember }) {
  const [date, setDate] = useState(todayStr);

  const dayClasses = classes
    .filter(c => c.instructorId === staffMember?.id && c.classDate === date)
    .sort((a, b) => {
      const aMin = timeToMin(a.horarioInicio) ?? 9999;
      const bMin = timeToMin(b.horarioInicio) ?? 9999;
      return aMin - bMin;
    });

  function fmtDateLong(d) {
    return new Date(d + "T12:00:00").toLocaleDateString("es-AR",
      { weekday: "long", day: "numeric", month: "long" });
  }

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      {/* Day nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Btn variant="ghost" size="sm" onClick={() => setDate(d => addDays(d, -1))}>←</Btn>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{fmtDateLong(date)}</div>
          {date === todayStr && <div style={{ fontSize: 11, color: T.accent }}>Hoy</div>}
        </div>
        <Btn variant="ghost" size="sm" onClick={() => setDate(d => addDays(d, 1))}>→</Btn>
      </div>
      {date !== todayStr && (
        <Btn variant="ghost" size="sm" onClick={() => setDate(todayStr)}
          style={{ marginBottom: 12, display: "block", marginInline: "auto" }}>
          Volver a hoy
        </Btn>
      )}

      {/* Agenda */}
      {dayClasses.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: T.muted, fontSize: 13 }}>
          — Sin clases para este día —
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {dayClasses.map(c => {
            const color = classColor(c);
            const startMin = timeToMin(c.horarioInicio);
            const endStr = startMin != null
              ? fmtTime(minToTime(startMin + classDuration(c)))
              : null;
            const isOwn = c.scenario === "own_class";

            return (
              <div key={c.id} style={{ background: T.card, border: `1px solid ${T.border}`,
                borderLeft: `4px solid ${color}`, borderRadius: 12, padding: "14px 16px" }}>
                {/* Horario */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  {c.horarioInicio ? (
                    <span style={{ fontFamily: "monospace", fontWeight: 800, color, fontSize: 15 }}>
                      {fmtTime(c.horarioInicio)}{endStr ? ` – ${endStr}` : ""}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: T.orange, fontWeight: 600 }}>
                      ⏳ Horario sin confirmar
                    </span>
                  )}
                  <span style={{ background: `${color}18`, color, border: `1px solid ${color}40`,
                    padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
                    {c.classTypeName || "—"}
                  </span>
                  {isOwn && (
                    <span style={{ background: `${T.gold}18`, color: T.gold,
                      border: `1px solid ${T.gold}40`, padding: "2px 8px",
                      borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
                      ⭐ Propia
                    </span>
                  )}
                </div>

                {/* Cliente */}
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{c.clientName}</div>
                {c.peopleCount > 1 && (
                  <div style={{ fontSize: 12, color: T.textDim }}>👥 {c.peopleCount} personas</div>
                )}
                {c.notes && (
                  <div style={{ fontSize: 12, color: T.textDim, marginTop: 6,
                    background: T.surface, borderRadius: 6, padding: "5px 9px", lineHeight: 1.5 }}>
                    {c.notes}
                  </div>
                )}
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>
                  {c.discipline === "snowboard" ? "🏂 Snowboard" : "🎿 Esquí"}
                </div>
              </div>
            );
          })}
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
