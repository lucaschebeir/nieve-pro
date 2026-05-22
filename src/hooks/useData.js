// src/hooks/useData.js
// ─────────────────────────────────────────────────────────────
// Todos los hooks de datos reales conectados a Supabase.
// Reemplazan los useState con datos mock del simulador.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

// ─── Hook genérico de tabla ────────────────────────────────────
function useTable(tableName, query = null, deps = []) {
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase.from(tableName).select(query || "*");
      const { data: rows, error: err } = await q.order("created_at", { ascending: false });
      if (err) throw err;
      setData(rows || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tableName, ...deps]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch, setData };
}

// ─── STAFF ────────────────────────────────────────────────────
export function useStaff() {
  const { data, loading, error, refetch } = useTable("staff", "*");

  async function toggleActive(staffId, currentValue) {
    const { error } = await supabase
      .from("staff")
      .update({ is_active: !currentValue })
      .eq("id", staffId);
    if (error) throw error;
    refetch();
  }

  async function saveStaff(staffData) {
    if (staffData.id) {
      const { error } = await supabase
        .from("staff")
        .update({
          name:           staffData.name,
          phone:          staffData.phone,
          role:           staffData.role,
          commission_pct: staffData.commissionPct,
          hourly_rate:    staffData.hourlyRate,
          is_active:      staffData.isActive,
        })
        .eq("id", staffData.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("staff")
        .insert({
          name:           staffData.name,
          email:          staffData.email,
          phone:          staffData.phone,
          role:           staffData.role,
          commission_pct: staffData.commissionPct,
          hourly_rate:    staffData.hourlyRate,
          is_active:      staffData.isActive,
        });
      if (error) throw error;
    }
    refetch();
  }

  // Mapear campos snake_case → camelCase para la UI
  const mapped = data.map(s => ({
    id:             s.id,
    name:           s.name,
    email:          s.email,
    phone:          s.phone,
    role:           s.role,
    commissionPct:  s.commission_pct,
    hourlyRate:     s.hourly_rate,
    isActive:       s.is_active,
    userId:         s.user_id,
  }));

  return { staff: mapped, loading, error, refetch, toggleActive, saveStaff };
}

// ─── CLIENTS ──────────────────────────────────────────────────
export function useClients() {
  const { data, loading, error, refetch } = useTable("clients", "*");

  async function saveClient(clientData) {
    const payload = {
      name:            clientData.name,
      phone:           clientData.phone,
      email:           clientData.email,
      notes:           clientData.notes,
      assigned_seller: clientData.sellerId || null,
    };

    if (clientData.id) {
      const { error } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", clientData.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("clients")
        .insert(payload);
      if (error) throw error;
    }
    refetch();
  }

  async function searchClients(query) {
    const { data, error } = await supabase
      .from("clients")
      .select("*, staff!assigned_seller(name, commission_pct)")
      .or(`name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%,notes.ilike.%${query}%`);
    if (error) throw error;
    return data;
  }

  const mapped = data.map(c => ({
    id:        c.id,
    name:      c.name,
    phone:     c.phone,
    email:     c.email,
    notes:     c.notes,
    sellerId:  c.assigned_seller,
    createdAt: c.created_at?.split("T")[0],
  }));

  return { clients: mapped, loading, error, refetch, saveClient, searchClients };
}

// ─── CLASSES ──────────────────────────────────────────────────
export function useClasses() {
  const { data, loading, error, refetch } = useTable(
    "classes",
    `*, 
     seller:seller_id(id,name,commission_pct),
     instructor:instructor_id(id,name,hourly_rate)`,
  );

  async function saveClass(formData) {
    // Seña = primer pago al crear (reservation_amount = paid_amount)
    const isNew = !formData.id;
    const paidAmount = isNew
      ? (+formData.reservationAmount || 0)
      : (+formData.paidAmount || 0);

    const payload = {
      class_date:          formData.classDate,
      class_type_id:       formData.classTypeId || null,
      class_type_name:     formData.classTypeName || "",
      amount:              +formData.amount,
      people_count:        +formData.peopleCount || 1,
      seller_id:           formData.sellerId || null,
      instructor_id:       formData.instructorId || null,
      client_id:           formData.clientId || null,
      client_name:         formData.clientName,
      notes:               formData.notes || "",
      reservation_amount:  +formData.reservationAmount || 0,
      paid_amount:         paidAmount,
      class_done:          !!formData.classDone,
      // El trigger de Supabase calcula automáticamente:
      // scenario, seller_commission, instructor_earning,
      // school_cut, payment_status, instructor_status
    };

    if (formData.id) {
      const { error } = await supabase
        .from("classes")
        .update(payload)
        .eq("id", formData.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("classes")
        .insert(payload);
      if (error) throw error;
    }
    refetch();
  }

  const mapped = data.map(c => ({
    id:                  c.id,
    classDate:           c.class_date,
    classTypeId:         c.class_type_id,
    classTypeName:       c.class_type_name,
    amount:              c.amount,
    peopleCount:         c.people_count,
    sellerId:            c.seller_id,
    instructorId:        c.instructor_id,
    clientId:            c.client_id,
    clientName:          c.client_name,
    notes:               c.notes,
    reservationAmount:   c.reservation_amount,
    paidAmount:          c.paid_amount,
    paymentStatus:       c.payment_status,
    instructorStatus:    c.instructor_status,
    classDone:           c.class_done,
    instructorHours:     c.instructor_hours,
    instructorHourlyRate:c.instructor_hourly_rate,
    instructorEarning:   c.instructor_earning,
    scenario:            c.scenario,
    sellerCommission:    c.seller_commission,
    schoolCut:           c.school_cut,
    isSettled:           c.is_settled,
    settlementId:        c.settlement_id,
    createdAt:           c.created_at?.split("T")[0],
  }));

  return { classes: mapped, loading, error, refetch, saveClass };
}

// ─── SETTLEMENTS ──────────────────────────────────────────────
export function useSettlements() {
  const { data, loading, error, refetch } = useTable("settlements", "*");

  async function settlePeriod(staffId, periodStart, periodEnd, method, notes) {
    // Llamamos a la función de Supabase que hace todo en una transacción
    const { data, error } = await supabase.rpc("settle_period", {
      p_staff_id:     staffId,
      p_period_start: periodStart,
      p_period_end:   periodEnd,
      p_method:       method,
      p_notes:        notes || null,
    });
    if (error) throw error;
    refetch();
    return data;
  }

  const mapped = data.map(s => ({
    id:          s.id,
    staffId:     s.staff_id,
    periodStart: s.period_start,
    periodEnd:   s.period_end,
    totalClasses:s.total_classes,
    totalEarned: s.total_earned,
    method:      s.payment_method,
    notes:       s.notes,
    settledAt:   s.settled_at?.split("T")[0],
  }));

  return { settlements: mapped, loading, error, refetch, settlePeriod };
}

// ─── EXPENSES ─────────────────────────────────────────────────
export function useExpenses() {
  const { data, loading, error, refetch } = useTable("expenses", "*");

  async function addExpense(expenseData) {
    const { error } = await supabase
      .from("expenses")
      .insert({
        amount:       +expenseData.amount,
        description:  expenseData.description,
        category:     expenseData.category || "general",
        expense_date: expenseData.date || new Date().toISOString().split("T")[0],
      });
    if (error) throw error;
    refetch();
  }

  async function deleteExpense(id) {
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", id);
    if (error) throw error;
    refetch();
  }

  const mapped = data.map(e => ({
    id:          e.id,
    amount:      e.amount,
    description: e.description,
    category:    e.category,
    date:        e.expense_date,
  }));

  return { expenses: mapped, loading, error, refetch, addExpense, deleteExpense };
}

// ─── CONFIG ───────────────────────────────────────────────────
export function useConfig() {
  const [config, setConfig] = useState({
    rates: [],
    defaultCommissionPct: 10,
    schoolCutPct: 30,
    defaultReservationPct: 30,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadConfig() {
      const { data, error } = await supabase
        .from("school_config")
        .select("*");

      if (error) { console.error(error); setLoading(false); return; }

      const get = (key) => data.find(d => d.key === key)?.value || 0;

      setConfig({
        rates: [
  { id: "b31212c9-f92d-4536-abe9-52a233985a79", name: "Full Day",     amount: get("rate_full_day"),  hours: get("hours_full_day") },
  { id: "e498e156-1668-4b5d-b0f8-fec47def2948", name: "Mini Day",     amount: get("rate_mini_day"),  hours: get("hours_mini_day") },
  { id: "1ae8e449-40ac-444a-b524-220f81e150c6", name: "Half Day",     amount: get("rate_half_day"),  hours: get("hours_half_day") },
  { id: "1e71732f-a418-44d4-8a4c-34b721aeec04", name: "2 Horas",      amount: get("rate_2hs"),       hours: get("hours_2hs") },
  { id: "44deac8a-0fcc-45c7-bd46-feb14be29eb5", name: "Clase Grupal", amount: get("rate_grupal"),    hours: get("hours_grupal") },
],
        defaultCommissionPct:  get("default_commission_pct"),
        schoolCutPct:          get("school_cut_own_class"),
        defaultReservationPct: 30,
      });
      setLoading(false);
    }
    loadConfig();
  }, []);

  async function saveConfig(newConfig) {
    const updates = [
      { key: "rate_full_day",          value: newConfig.rates.find(r=>r.id==="ct1")?.amount || 550 },
      { key: "rate_mini_day",          value: newConfig.rates.find(r=>r.id==="ct2")?.amount || 450 },
      { key: "rate_half_day",          value: newConfig.rates.find(r=>r.id==="ct3")?.amount || 350 },
      { key: "rate_2hs",               value: newConfig.rates.find(r=>r.id==="ct4")?.amount || 250 },
      { key: "rate_grupal",            value: newConfig.rates.find(r=>r.id==="ct5")?.amount || 150 },
      { key: "default_commission_pct", value: newConfig.defaultCommissionPct },
      { key: "school_cut_own_class",   value: newConfig.schoolCutPct },
    ];

    for (const u of updates) {
      await supabase.from("school_config").update({ value: u.value }).eq("key", u.key);
    }
    setConfig(newConfig);
  }

  return { config, loading, saveConfig };
}

// ─── PENDING BALANCES ─────────────────────────────────────────
export function usePendingBalances() {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading]   = useState(true);

  async function fetch() {
    setLoading(true);
    const { data, error } = await supabase
      .from("staff_pending_balance")
      .select("*");
    if (!error) {
      setBalances((data || []).map(b => ({
        staffId:        b.staff_id,
        pendingAmount:  b.pending_amount,
        pendingClasses: b.pending_classes,
      })));
    }
    setLoading(false);
  }

  useEffect(() => { fetch(); }, []);

  function getBalance(staffId) {
    return balances.find(b => b.staffId === staffId) || { pendingAmount: 0, pendingClasses: 0 };
  }

  return { balances, loading, refetch: fetch, getBalance };
}
