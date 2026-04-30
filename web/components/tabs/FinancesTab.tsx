"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import type {
  MonthlyFinance,
  FixedCostItem,
  PaidStatus,
  SavingsGoal,
} from "@/lib/server/coupleSettings";

// ---- helpers ----------------------------------------------------------------

function currentYM() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

// ---- main component ---------------------------------------------------------

export default function FinancesTab({ userEmail }: { userEmail: string }) {
  const qc = useQueryClient();
  const ym = currentYM();
  const [year, setYear] = useState(ym.year);
  const [month, setMonth] = useState(ym.month);
  const [finance, setFinance] = useState<MonthlyFinance | null>(null);
  const [dirty, setDirty] = useState(false);

  // Load monthly finance data
  const finQuery = useQuery({
    queryKey: ["finances", year, month],
    queryFn: () =>
      fetchJson<{ data: MonthlyFinance; summary: ReturnType<typeof import("@/lib/server/coupleSettings").computeFinanceSummary> }>(
        `/api/finances/expenses?year=${year}&month=${month}`
      ),
  });

  useEffect(() => {
    if (finQuery.data?.data) {
      setFinance(finQuery.data.data);
      setDirty(false);
    }
  }, [finQuery.data]);

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

  const update = useCallback((updater: (prev: MonthlyFinance) => MonthlyFinance) => {
    setFinance((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      setDirty(true);
      return next;
    });
  }, []);

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

  const summary = finQuery.data?.summary;

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
          <button
            onClick={() => finance && saveMut.mutate(finance)}
            disabled={!dirty || saveMut.isPending}
            style={{ marginLeft: "auto", fontSize: "0.85rem" }}
          >
            {saveMut.isPending ? "Saving…" : dirty ? "💾 Save changes" : "✓ Saved"}
          </button>
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
          <SummaryCard label="Fixed costs" value={`R$ ${fmt(summary.totalActual)}`} sub={`budgeted R$ ${fmt(summary.totalBudget)}`} />
          <SummaryCard label="Debts" value={`R$ ${fmt(summary.totalDebts)}`} />
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
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={val ?? ""}
                  placeholder={key === "jahdy" ? "— no salary" : "0"}
                  style={{ width: 140 }}
                  onChange={(e) => {
                    const raw = e.target.value;
                    update((prev) => ({
                      ...prev,
                      income: {
                        ...prev.income,
                        [key]: raw === "" ? null : Number(raw),
                      },
                    }));
                  }}
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
                <input
                  key={`${item.id}-budget`}
                  type="number"
                  min="0"
                  step="10"
                  value={item.budget}
                  style={{ width: 90, textAlign: "right" }}
                  onChange={(e) =>
                    update((prev) => ({
                      ...prev,
                      fixedCosts: prev.fixedCosts.map((c) =>
                        c.id === item.id ? { ...c, budget: Number(e.target.value) } : c
                      ),
                    }))
                  }
                />
                <input
                  key={`${item.id}-actual`}
                  type="number"
                  min="0"
                  step="10"
                  value={item.actual ?? ""}
                  placeholder={String(item.budget)}
                  style={{ width: 90, textAlign: "right" }}
                  onChange={(e) =>
                    update((prev) => ({
                      ...prev,
                      fixedCosts: prev.fixedCosts.map((c) =>
                        c.id === item.id
                          ? { ...c, actual: e.target.value === "" ? null : Number(e.target.value) }
                          : c
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
        <h2>💳 Outstanding Debts</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {(["contador", "nacional", "cartao"] as const).map((key) => {
            const labels = { contador: "Contador", nacional: "Nacional", cartao: "Credit card" };
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ minWidth: 140, fontSize: "0.88rem" }}>{labels[key]}</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={finance.debts[key]}
                  style={{ width: 140 }}
                  onChange={(e) =>
                    update((prev) => ({
                      ...prev,
                      debts: { ...prev.debts, [key]: Number(e.target.value) },
                    }))
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Savings Goals */}
      <div className="card">
        <h2>🎯 Savings Goals</h2>
        {sgQuery.isPending && <div className="query-status">Loading…</div>}
        {savingsGoals.map((g) => {
          const color = g.current / g.target >= 0.8 ? "#9DCFB7" : "#8e79af";
          return (
            <div key={g.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border,#444)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: "1.2rem" }}>{g.emoji}</span>
                <strong style={{ flex: 1 }}>{g.title}</strong>
                <input
                  aria-label={`Current amount — ${g.title}`}
                  type="number"
                  min="0"
                  step="100"
                  defaultValue={g.current}
                  style={{ width: 110 }}
                  onBlur={(e) => {
                    const val = Number(e.target.value);
                    if (val !== g.current) patchSgMut.mutate({ id: g.id, current: val });
                  }}
                />
                <button className="secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => delSgMut.mutate(g.id)}>✕</button>
              </div>
              <ProgressBar current={g.current} target={g.target} color={color} />
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
              <input id="sg-target" type="number" min="1" step="500" value={sgTarget} onChange={(e) => setSgTarget(e.target.value)} placeholder="10000" />
            </div>
            <div className="form-row">
              <label htmlFor="sg-emoji">Emoji</label>
              <input id="sg-emoji" value={sgEmoji} onChange={(e) => setSgEmoji(e.target.value)} maxLength={4} style={{ width: 60 }} />
            </div>
            <button
              onClick={() => {
                if (!sgTitle || !sgTarget) return;
                addSgMut.mutate({ title: sgTitle, target: Number(sgTarget), emoji: sgEmoji || "💰" });
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
