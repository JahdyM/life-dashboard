"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import type {
  MonthlyFinance,
  FixedCostItem,
  PaidStatus,
  SavingsGoal,
  DebtEntry,
  ExtraExpense,
} from "@/lib/server/coupleSettings";

// ---- helpers ----------------------------------------------------------------

function currentYM() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function cleanMoneyDraft(value: string) {
  return value.replace(/[^\d.,]/g, "");
}

function parseMoneyDraft(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  const dotGroups = trimmed.split(".");
  const normalized =
    lastComma < 0 && dotGroups.length > 1 && dotGroups[0].length <= 3 && dotGroups.slice(1).every((group) => group.length === 3)
      ? dotGroups.join("")
      : decimalIndex >= 0
        ? `${trimmed.slice(0, decimalIndex).replace(/[.,]/g, "") || "0"}.${trimmed.slice(decimalIndex + 1).replace(/[.,]/g, "")}`
        : trimmed.replace(/[.,]/g, "");

  if (!/^\d+(\.\d*)?$/.test(normalized)) return undefined;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? roundMoney(parsed) : undefined;
}

function draftFromMoney(value: number | null | undefined, editing = false) {
  if (value === null || value === undefined) return "";
  return editing ? String(value).replace(".", ",") : fmt(value);
}

function debtKeyFromName(name: string) {
  const key = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || `divida_${Date.now()}`;
}

function uniqueDebtKey(name: string, debts: MonthlyFinance["debts"]) {
  const base = debtKeyFromName(name);
  if (!debts[base]) return base;
  let index = 2;
  while (debts[`${base}_${index}`]) index += 1;
  return `${base}_${index}`;
}

function computeSummary(f: MonthlyFinance) {
  const totalIncome = (f.income.gui || 0) + (f.income.jahdy || 0) + (f.income.extras || 0);
  const totalBudget = f.fixedCosts.reduce((s, c) => s + c.budget, 0);
  const totalActual = f.fixedCosts.reduce((s, c) => s + (c.actual ?? 0), 0);
  const totalDebtsPaid = Object.values(f.debts).reduce((s, d: DebtEntry) => s + (d.paid || 0), 0);
  const totalOutstanding = Object.values(f.debts).reduce(
    (s, d: DebtEntry) => s + Math.max(0, (d.total || 0) - (d.paid || 0)),
    0
  );
  const totalExtras = (f.extraExpenses || []).reduce((s, e: ExtraExpense) => s + (e.amount || 0), 0);
  const surplus = totalIncome - totalActual - totalDebtsPaid - totalExtras;
  return {
    totalIncome, totalBudget, totalActual, totalDebtsPaid, totalOutstanding, totalExtras, surplus,
    allocation: {
      casa: surplus > 0 ? Math.round(surplus * 0.2 * 100) / 100 : 0,
      reservaEmergencia: surplus > 0 ? Math.round(surplus * 0.1 * 100) / 100 : 0,
      dividas: surplus > 0 ? Math.round(surplus * 0.7 * 100) / 100 : 0,
    },
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PAID_LABELS: Record<PaidStatus, { label: string; color: string }> = {
  pago:     { label: "Paid",     color: "#9DCFB7" },
  sim:      { label: "Paid",     color: "#9DCFB7" },
  nao:      { label: "Pending",  color: "var(--text-soft,#888)" },
  nao_pago: { label: "Overdue",  color: "#D95252" },
};

function nextStatus(current: PaidStatus): PaidStatus {
  const cycle: PaidStatus[] = ["nao", "pago", "nao_pago"];
  const idx = cycle.indexOf(current === "sim" ? "pago" : current);
  return cycle[(idx + 1) % cycle.length];
}

// ---- sub-components ---------------------------------------------------------

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <article className="shell-summary-card" style={accent ? { borderColor: "#9DCFB7" } : {}}>
      <p className="shell-summary-label">{label}</p>
      <p className="shell-summary-value" style={{ fontSize: "1rem" }}>{value}</p>
      {sub && <p className="shell-summary-meta">{sub}</p>}
    </article>
  );
}

function ProgressBar({ current, target, color = "#8e79af" }: { current: number; target: number; color?: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div>
      <div style={{ background: "var(--bg-panel,#2a2335)", borderRadius: 999, height: 6, overflow: "hidden", margin: "4px 0 2px" }}>
        <div style={{ background: color, width: `${pct}%`, height: 6, borderRadius: 999, transition: "width .4s" }} />
      </div>
      <small style={{ color: "var(--text-soft,#888)" }}>
        {pct}% — R$ {fmt(current)} / R$ {fmt(target)}
      </small>
    </div>
  );
}

function MoneyInput({
  value,
  onValueChange,
  allowEmpty = false,
  placeholder,
  style,
  ariaLabel,
}: {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  allowEmpty?: boolean;
  placeholder?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(() => draftFromMoney(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(draftFromMoney(value));
  }, [focused, value]);

  const commitDraft = (raw: string) => {
    const parsed = parseMoneyDraft(raw);
    if (parsed === undefined) {
      setDraft(draftFromMoney(value));
      return;
    }
    if (parsed === null) {
      const emptyValue = allowEmpty ? null : 0;
      onValueChange(emptyValue);
      setDraft(draftFromMoney(emptyValue));
      return;
    }
    onValueChange(parsed);
    setDraft(draftFromMoney(parsed));
  };

  return (
    <input
      aria-label={ariaLabel}
      type="text"
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      style={style}
      onFocus={() => {
        setFocused(true);
        setDraft(draftFromMoney(value, true));
      }}
      onChange={(e) => {
        const nextDraft = cleanMoneyDraft(e.target.value);
        setDraft(nextDraft);

        if (/[,.]$/.test(nextDraft.trim())) return;

        const parsed = parseMoneyDraft(nextDraft);
        if (parsed === undefined) return;
        onValueChange(parsed === null ? (allowEmpty ? null : 0) : parsed);
      }}
      onBlur={() => {
        setFocused(false);
        commitDraft(draft);
      }}
    />
  );
}

// ---- main component ---------------------------------------------------------

export default function FinancesTab({ userEmail }: { userEmail: string }) {
  const qc = useQueryClient();
  const ym = currentYM();
  const [year, setYear] = useState(ym.year);
  const [month, setMonth] = useState(ym.month);
  const [finance, setFinance] = useState<MonthlyFinance | null>(null);
  const [dirty, setDirty] = useState(false);
  const [newDebtName, setNewDebtName] = useState("");

  // Load monthly finance data
  const finQuery = useQuery({
    queryKey: ["finances", year, month],
    queryFn: () =>
      fetchJson<{ data: MonthlyFinance; summary: ReturnType<typeof import("@/lib/server/coupleSettings").computeFinanceSummary> }>(
        `/api/finances/expenses?year=${year}&month=${month}`
      ),
  });

  // Don't clobber local unsaved edits when a window-focus refetch arrives
  // with the older server snapshot (would silently lose user input).
  useEffect(() => {
    if (finQuery.data?.data && !dirty) {
      setFinance(finQuery.data.data);
    }
  }, [finQuery.data, dirty]);

  // Track latest finance/year/month in refs so the page-hide handler can
  // flush whatever is current at the moment the app backgrounds.
  const financeRef = useRef<MonthlyFinance | null>(null);
  const dirtyRef = useRef(false);
  const yearRef = useRef(year);
  const monthRef = useRef(month);
  useEffect(() => { financeRef.current = finance; }, [finance]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { yearRef.current = year; }, [year]);
  useEffect(() => { monthRef.current = month; }, [month]);

  const saveMut = useMutation({
    mutationFn: (data: MonthlyFinance) =>
      fetchJson(`/api/finances/expenses?year=${year}&month=${month}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["finances", year, month] });
    },
  });

  // Auto-save 1.5 s after the last change
  useEffect(() => {
    if (!dirty || !finance || saveMut.isPending) return;
    const timer = setTimeout(() => saveMut.mutate(finance), 1500);
    return () => clearTimeout(timer);
  }, [finance, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush pending edits on page hide / visibility change — without this,
  // backgrounding the PWA before the 1.5 s debounce fires loses the change.
  // sendBeacon survives navigation/suspension; we use the same JSON shape.
  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current || !financeRef.current) return;
      const url = `/api/finances/expenses?year=${yearRef.current}&month=${monthRef.current}`;
      const body = JSON.stringify(financeRef.current);
      try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const blob = new Blob([body], { type: "application/json" });
          if (navigator.sendBeacon(url, blob)) return;
        }
      } catch { /* fall through to fetch */ }
      // Fallback: keepalive fetch (works in modern browsers during pagehide)
      void fetch(url, {
        method: "PUT",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => { /* best-effort */ });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const update = useCallback((updater: (prev: MonthlyFinance) => MonthlyFinance) => {
    setFinance((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      setDirty(true);
      return next;
    });
  }, []);

  const addDebt = useCallback(() => {
    const label = newDebtName.trim();
    if (!label) return;
    update((prev) => {
      const key = uniqueDebtKey(label, prev.debts);
      return {
        ...prev,
        debts: {
          ...prev.debts,
          [key]: { label, total: 0, monthly: 0, paid: 0 },
        },
      };
    });
    setNewDebtName("");
  }, [newDebtName, update]);

  // Savings goals
  const sgQuery = useQuery({
    queryKey: ["finances-savings"],
    queryFn: () => fetchJson<{ goals: SavingsGoal[] }>("/api/finances/savings-goals"),
  });
  const savingsGoals: SavingsGoal[] = sgQuery.data?.goals || [];

  const [sgTitle, setSgTitle] = useState("");
  const [sgTarget, setSgTarget] = useState("");
  const [sgEmoji, setSgEmoji] = useState("💰");
  const [showSgForm, setShowSgForm] = useState(false);

  const addSgMut = useMutation({
    mutationFn: (data: object) =>
      fetchJson("/api/finances/savings-goals", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finances-savings"] });
      setSgTitle(""); setSgTarget(""); setSgEmoji("💰"); setShowSgForm(false);
    },
  });
  const patchSgMut = useMutation({
    mutationFn: (data: { id: string; current: number }) =>
      fetchJson("/api/finances/savings-goals", { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finances-savings"] }),
  });
  const delSgMut = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/finances/savings-goals?id=${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finances-savings"] }),
  });

  const summary = useMemo(() => (finance ? computeSummary(finance) : null), [finance]);

  if (finQuery.isPending) return <div className="query-status">Loading…</div>;
  if (!finance) return null;

  return (
    <div className="route-stack">

      {/* Month tabs */}
      <div className="card" style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <button
            className="secondary"
            style={{ padding: "2px 10px", fontSize: "0.85rem" }}
            onClick={() => setYear((y) => y - 1)}
          >
            ‹
          </button>
          <span style={{ fontWeight: 600, minWidth: 40, textAlign: "center" }}>{year}</span>
          <button
            className="secondary"
            style={{ padding: "2px 10px", fontSize: "0.85rem" }}
            onClick={() => setYear((y) => y + 1)}
          >
            ›
          </button>
          <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: saveMut.isPending ? "var(--text-soft,#888)" : dirty ? "#D9C979" : "#9DCFB7" }}>
            {saveMut.isPending ? "Saving…" : dirty ? "Unsaved changes…" : "✓ Saved"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {MONTHS.map((label, i) => {
            const m = i + 1;
            const active = m === month;
            return (
              <button
                key={m}
                className={active ? "" : "secondary"}
                style={{
                  padding: "4px 12px",
                  fontSize: "0.8rem",
                  ...(active
                    ? { background: "#9DCFB7", color: "#1a1625", borderColor: "#9DCFB7" }
                    : {}),
                }}
                onClick={() => setMonth(m)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="shell-summary-grid">
          <SummaryCard label="Income" value={`R$ ${fmt(summary.totalIncome)}`} accent />
          <SummaryCard label="Fixed costs paid" value={`R$ ${fmt(summary.totalActual)}`} sub={`budgeted R$ ${fmt(summary.totalBudget)}`} />
          <SummaryCard label="Debt payments made" value={`R$ ${fmt(summary.totalDebtsPaid)}`} sub={`outstanding R$ ${fmt(summary.totalOutstanding)}`} />
          {summary.totalExtras > 0 && <SummaryCard label="Extra expenses" value={`R$ ${fmt(summary.totalExtras)}`} />}
          <SummaryCard
            label="Month surplus"
            value={`R$ ${fmt(summary.surplus)}`}
            sub={summary.surplus > 0 ? `🏠 ${fmt(summary.allocation.casa)} · 🛡️ ${fmt(summary.allocation.reservaEmergencia)} · 💳 ${fmt(summary.allocation.dividas)}` : ""}
            accent={summary.surplus > 0}
          />
        </div>
      )}

      {/* Income */}
      <div className="card">
        <h2>💰 Income</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {(["gui", "jahdy", "extras"] as const).map((key) => {
            const labels = { gui: "Gui's salary", jahdy: "Jahdy's salary", extras: "Extras" };
            const val = finance.income[key];
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ minWidth: 140, fontSize: "0.88rem" }}>{labels[key]}</span>
                <MoneyInput
                  value={val}
                  allowEmpty={key === "jahdy"}
                  placeholder={key === "jahdy" ? "— no salary" : "0"}
                  ariaLabel={labels[key]}
                  style={{ width: 140 }}
                  onValueChange={(value) =>
                    update((prev) => ({
                      ...prev,
                      income: {
                        ...prev.income,
                        [key]: key === "jahdy" ? value : value ?? 0,
                      },
                    }))
                  }
                />
                {key === "jahdy" && (
                  <button
                    className="secondary"
                    style={{ padding: "2px 10px", fontSize: "0.75rem" }}
                    onClick={() =>
                      update((prev) => ({
                        ...prev,
                        income: { ...prev.income, jahdy: prev.income.jahdy === null ? 0 : null },
                      }))
                    }
                  >
                    {finance.income.jahdy === null ? "+ add" : "× no salary"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Fixed Costs */}
      <div className="card">
        <h2>📋 Fixed Costs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "6px 12px", alignItems: "center" }}>
          <small style={{ color: "var(--text-soft)" }}>Item</small>
          <small style={{ color: "var(--text-soft)", textAlign: "right" }}>Budgeted</small>
          <small style={{ color: "var(--text-soft)", textAlign: "right" }}>Actual</small>
          <small style={{ color: "var(--text-soft)", textAlign: "center" }}>Status</small>

          {finance.fixedCosts.map((item: FixedCostItem) => {
            const variance = item.actual !== null ? item.actual - item.budget : null;
            const statusMeta = PAID_LABELS[item.paid] || PAID_LABELS.nao;
            return (
              <>
                <span key={`${item.id}-label`} style={{ fontSize: "0.88rem" }}>
                  {item.label}
                  {variance !== null && (
                    <span style={{ fontSize: "0.72rem", marginLeft: 6, color: variance > 0 ? "#D95252" : "#9DCFB7" }}>
                      {variance > 0 ? `+${fmt(variance)}` : fmt(variance)}
                    </span>
                  )}
                </span>
                <MoneyInput
                  key={`${item.id}-budget`}
                  value={item.budget}
                  ariaLabel={`Budgeted amount for ${item.label}`}
                  style={{ width: 90, textAlign: "right" }}
                  onValueChange={(value) =>
                    update((prev) => ({
                      ...prev,
                      fixedCosts: prev.fixedCosts.map((c) =>
                        c.id === item.id ? { ...c, budget: value ?? 0 } : c
                      ),
                    }))
                  }
                />
                <MoneyInput
                  key={`${item.id}-actual`}
                  value={item.actual}
                  allowEmpty
                  ariaLabel={`Actual amount for ${item.label}`}
                  placeholder={fmt(item.budget)}
                  style={{ width: 90, textAlign: "right" }}
                  onValueChange={(value) =>
                    update((prev) => ({
                      ...prev,
                      fixedCosts: prev.fixedCosts.map((c) =>
                        c.id === item.id ? { ...c, actual: value } : c
                      ),
                    }))
                  }
                />
                <button
                  key={`${item.id}-status`}
                  className="secondary"
                  style={{ fontSize: "0.72rem", padding: "2px 8px", color: statusMeta.color, borderColor: statusMeta.color, whiteSpace: "nowrap" }}
                  onClick={() =>
                    update((prev) => ({
                      ...prev,
                      fixedCosts: prev.fixedCosts.map((c) =>
                        c.id === item.id ? { ...c, paid: nextStatus(c.paid) } : c
                      ),
                    }))
                  }
                >
                  {statusMeta.label}
                </button>
              </>
            );
          })}
        </div>
      </div>

      {/* Debts */}
      <div className="card">
        <h2>💳 Debts</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            aria-label="New debt name"
            value={newDebtName}
            placeholder="New debt + Enter"
            style={{ minWidth: 220, flex: "1 1 220px" }}
            onChange={(e) => setNewDebtName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDebt();
              }
              if (e.key === "Escape") setNewDebtName("");
            }}
          />
          <button
            className="secondary"
            type="button"
            disabled={!newDebtName.trim()}
            onClick={addDebt}
          >
            Add
          </button>
        </div>

        {Object.keys(finance.debts).length === 0 ? (
          <p style={{ color: "var(--text-soft)", margin: 0 }}>No debts yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {Object.entries(finance.debts).map(([key, entry]) => {
              const remaining = entry.total - entry.paid;
              const remainingColor =
                remaining <= 0
                  ? "#9DCFB7"
                  : remaining < entry.total * 0.25
                    ? "#D9C979"
                    : "var(--text-soft,#888)";
              return (
                <article
                  key={key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))",
                    gap: "8px 10px",
                    alignItems: "end",
                    padding: "10px",
                    border: "1px solid var(--border,#444)",
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.025)",
                  }}
                >
                  <input
                    aria-label="Debt name"
                    type="text"
                    value={entry.label}
                    placeholder="Debt name"
                    style={{ minWidth: 0, width: "100%" }}
                    onChange={(e) =>
                      update((prev) => ({
                        ...prev,
                        debts: {
                          ...prev.debts,
                          [key]: { ...prev.debts[key], label: e.target.value },
                        },
                      }))
                    }
                  />
                  {(["total", "monthly", "paid"] as const).map((field) => {
                    const labels = {
                      total: "Total",
                      monthly: "Due",
                      paid: "Paid",
                    };
                    return (
                      <label key={`${key}-${field}`} style={{ display: "grid", gap: 3, minWidth: 0 }}>
                        <small style={{ color: "var(--text-soft)", fontSize: "0.68rem" }}>
                          {labels[field]}
                        </small>
                        <MoneyInput
                          value={entry[field]}
                          ariaLabel={`${labels[field]} amount for ${entry.label || key}`}
                          style={{ width: "100%", textAlign: "right" }}
                          onValueChange={(value) =>
                            update((prev) => ({
                              ...prev,
                              debts: {
                                ...prev.debts,
                                [key]: { ...prev.debts[key], [field]: value ?? 0 },
                              },
                            }))
                          }
                        />
                      </label>
                    );
                  })}
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: "0.88rem",
                      fontVariantNumeric: "tabular-nums",
                      color: remainingColor,
                      minWidth: 0,
                    }}
                  >
                    <small style={{ display: "block", color: "var(--text-soft)", fontSize: "0.68rem" }}>
                      Remaining
                    </small>
                    {remaining <= 0 ? "✓ Paid off" : `R$ ${fmt(remaining)}`}
                  </div>
                  <button
                    aria-label={`Delete debt ${entry.label || key}`}
                    className="secondary"
                    type="button"
                    style={{ padding: "2px 8px", fontSize: "0.75rem", justifySelf: "end" }}
                    onClick={() =>
                      update((prev) => {
                        const { [key]: _removed, ...nextDebts } = prev.debts;
                        return { ...prev, debts: nextDebts };
                      })
                    }
                  >
                    ✕
                  </button>
                </article>
              );
          })}
        </div>
        )}
      </div>

      {/* Extra Expenses */}
      <div className="card">
        <h2>⚡ Extra Expenses</h2>
        <div style={{ display: "grid", gap: 6 }}>
          {(finance.extraExpenses || []).map((ex: ExtraExpense) => (
            <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                aria-label="Description"
                type="text"
                value={ex.label}
                placeholder="Description"
                style={{ flex: 1 }}
                onChange={(e) =>
                  update((prev) => ({
                    ...prev,
                    extraExpenses: prev.extraExpenses.map((x) =>
                      x.id === ex.id ? { ...x, label: e.target.value } : x
                    ),
                  }))
                }
              />
              <MoneyInput
                value={ex.amount}
                ariaLabel="Amount"
                placeholder="0"
                style={{ width: 110, textAlign: "right" }}
                onValueChange={(value) =>
                  update((prev) => ({
                    ...prev,
                    extraExpenses: prev.extraExpenses.map((x) =>
                      x.id === ex.id ? { ...x, amount: value ?? 0 } : x
                    ),
                  }))
                }
              />
              <button
                className="secondary"
                style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                onClick={() =>
                  update((prev) => ({
                    ...prev,
                    extraExpenses: prev.extraExpenses.filter((x) => x.id !== ex.id),
                  }))
                }
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            className="secondary"
            onClick={() =>
              update((prev) => ({
                ...prev,
                extraExpenses: [
                  ...(prev.extraExpenses || []),
                  { id: `ex_${Date.now()}`, label: "", amount: 0 },
                ],
              }))
            }
          >
            ➕ Add expense
          </button>
        </div>
      </div>

      {/* Savings Goals */}
      <div className="card">
        <h2>🎯 Savings Goals</h2>
        {sgQuery.isPending && <div className="query-status">Loading…</div>}
        {savingsGoals.map((g) => {
          const effectiveTarget =
            g.id === "reserva_emergencia" && summary
              ? Math.round(summary.totalBudget * 6)
              : g.id === "quitar_dividas" && summary
              ? summary.totalOutstanding
              : g.target;
          const color = g.current / effectiveTarget >= 0.8 ? "#9DCFB7" : "#8e79af";
          return (
            <div key={g.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border,#444)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: "1.2rem" }}>{g.emoji}</span>
                <div style={{ flex: 1 }}>
                  <strong>{g.title}</strong>
                  {g.id === "reserva_emergencia" && summary && (
                    <span style={{ fontSize: "0.72rem", color: "var(--text-soft,#888)", marginLeft: 6 }}>
                      6 × R$ {fmt(summary.totalBudget)}
                    </span>
                  )}
                  {g.id === "quitar_dividas" && summary && (
                    <span style={{ fontSize: "0.72rem", color: "var(--text-soft,#888)", marginLeft: 6 }}>
                      R$ {fmt(summary.totalOutstanding)} outstanding
                    </span>
                  )}
                </div>
                <MoneyInput
                  value={g.current}
                  ariaLabel={`Current amount — ${g.title}`}
                  style={{ width: 110, textAlign: "right" }}
                  onValueChange={(value) => {
                    const next = value ?? 0;
                    if (next !== g.current) patchSgMut.mutate({ id: g.id, current: next });
                  }}
                />
                <button className="secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => delSgMut.mutate(g.id)}>✕</button>
              </div>
              <ProgressBar current={g.current} target={effectiveTarget} color={color} />
            </div>
          );
        })}

        <div style={{ marginTop: 12 }}>
          <button className="secondary" onClick={() => setShowSgForm((v) => !v)}>
            {showSgForm ? "Close" : "➕ New goal"}
          </button>
        </div>
        {showSgForm && (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <div className="form-row">
              <label htmlFor="sg-title">Name</label>
              <input id="sg-title" value={sgTitle} onChange={(e) => setSgTitle(e.target.value)} placeholder="e.g. Trip to Portugal" />
            </div>
            <div className="form-row">
              <label htmlFor="sg-target">Target (R$)</label>
              <input
                id="sg-target"
                type="text"
                inputMode="decimal"
                value={sgTarget}
                onChange={(e) => setSgTarget(cleanMoneyDraft(e.target.value))}
                placeholder="10000"
              />
            </div>
            <div className="form-row">
              <label htmlFor="sg-emoji">Emoji</label>
              <input id="sg-emoji" value={sgEmoji} onChange={(e) => setSgEmoji(e.target.value)} maxLength={4} style={{ width: 60 }} />
            </div>
            <button
              onClick={() => {
                const target = parseMoneyDraft(sgTarget);
                if (!sgTitle || target === null || target === undefined || target <= 0) return;
                addSgMut.mutate({ title: sgTitle, target, emoji: sgEmoji || "💰" });
              }}
              disabled={addSgMut.isPending}
            >
              Create goal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
