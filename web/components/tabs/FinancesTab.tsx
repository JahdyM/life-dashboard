"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import type { Expense, SavingsGoal } from "@/lib/server/coupleSettings";

const CATEGORIES = [
  "🍽 Alimentação",
  "🏠 Moradia",
  "🚗 Transporte",
  "🎉 Lazer",
  "💊 Saúde",
  "📚 Educação",
  "🛍 Compras",
  "✈️ Viagem",
  "💡 Outros",
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ProgressBar({ current, target }: { current: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const color = pct >= 80 ? "#9DCFB7" : "#8e79af";
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

export default function FinancesTab({ userEmail }: { userEmail: string }) {
  const qc = useQueryClient();
  const ym = currentYearMonth();
  const [year, setYear] = useState(ym.year);
  const [month, setMonth] = useState(ym.month);

  // Expenses
  const expQuery = useQuery({
    queryKey: ["finances-expenses", year, month],
    queryFn: () => fetchJson<{ expenses: Expense[] }>(`/api/finances/expenses?year=${year}&month=${month}`),
  });
  const expenses: Expense[] = expQuery.data?.expenses || [];
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const [newAmt, setNewAmt] = useState("");
  const [newCat, setNewCat] = useState(CATEGORIES[0]);
  const [newDesc, setNewDesc] = useState("");
  const [newDate, setNewDate] = useState(today);
  const [newPaid, setNewPaid] = useState(userEmail);
  const [showExpForm, setShowExpForm] = useState(false);

  const addExpMut = useMutation({
    mutationFn: (data: object) =>
      fetchJson("/api/finances/expenses", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finances-expenses"] });
      setNewAmt(""); setNewDesc(""); setNewDate(today()); setShowExpForm(false);
    },
  });

  const delExpMut = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/finances/expenses?id=${id}&year=${year}&month=${month}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finances-expenses"] }),
  });

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

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <div className="route-stack">
      {/* Month picker */}
      <div className="card">
        <div className="form-row">
          <label htmlFor="fin-month">Mês</label>
          <input
            id="fin-month"
            type="month"
            value={monthStr}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-");
              setYear(Number(y)); setMonth(Number(m));
            }}
          />
        </div>

        {/* Summary */}
        <div className="streak-grid" style={{ marginTop: 12 }}>
          <article className="streak-card">
            <div className="streak-label">Total do mês</div>
            <div className="streak-icon">R$ {fmt(total)}</div>
          </article>
          <article className="streak-card">
            <div className="streak-label">Lançamentos</div>
            <div className="streak-icon">{expenses.length}</div>
          </article>
        </div>

        {/* Expense list */}
        {expQuery.isPending && <div className="query-status">Carregando…</div>}
        {expenses.length > 0 && (
          <div className="section" style={{ marginTop: 16 }}>
            <h3>Lançamentos</h3>
            {[...expenses].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
              <div key={e.id} className="streak-row" style={{ padding: "6px 0", borderBottom: "1px solid var(--border,#444)" }}>
                <span style={{ minWidth: 52, fontSize: "0.8rem", color: "var(--text-soft)" }}>{e.date.slice(5)}</span>
                <span style={{ flex: 1 }}>{e.category} — {e.description || "–"}</span>
                <strong>R$ {fmt(e.amount)}</strong>
                <button
                  className="secondary"
                  style={{ marginLeft: 8, padding: "2px 8px", fontSize: "0.75rem" }}
                  onClick={() => delExpMut.mutate(e.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add expense */}
        <div style={{ marginTop: 12 }}>
          <button className="secondary" onClick={() => setShowExpForm((v) => !v)}>
            {showExpForm ? "Fechar" : "➕ Adicionar gasto"}
          </button>
        </div>
        {showExpForm && (
          <div className="section" style={{ marginTop: 12 }}>
            <div className="form-row">
              <label htmlFor="fin-amt">Valor (R$)</label>
              <input id="fin-amt" type="number" min="0.01" step="0.5" value={newAmt} onChange={(e) => setNewAmt(e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-row">
              <label htmlFor="fin-cat">Categoria</label>
              <select id="fin-cat" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="fin-desc">Descrição</label>
              <input id="fin-desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="ex: Mercado da semana" />
            </div>
            <div className="form-row">
              <label htmlFor="fin-date">Data</label>
              <input id="fin-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="fin-paid">Quem pagou</label>
              <input id="fin-paid" value={newPaid} onChange={(e) => setNewPaid(e.target.value)} placeholder="email" />
            </div>
            <button
              onClick={() => {
                if (!newAmt || Number(newAmt) <= 0) return;
                addExpMut.mutate({ amount: Number(newAmt), category: newCat, description: newDesc, date: newDate, paidBy: newPaid, year, month });
              }}
              disabled={addExpMut.isPending}
            >
              Salvar gasto
            </button>
          </div>
        )}
      </div>

      {/* Savings goals */}
      <div className="card">
        <h2>Metas de economia</h2>
        {sgQuery.isPending && <div className="query-status">Carregando…</div>}
        {savingsGoals.map((g) => (
          <div key={g.id} className="section" style={{ padding: "10px 0", borderBottom: "1px solid var(--border,#444)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "1.3rem" }}>{g.emoji}</span>
              <strong style={{ flex: 1 }}>{g.title}</strong>
              <input
                type="number"
                min="0"
                step="50"
                defaultValue={g.current}
                style={{ width: 100 }}
                onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (val !== g.current) patchSgMut.mutate({ id: g.id, current: val });
                }}
              />
              <button className="secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => delSgMut.mutate(g.id)}>✕</button>
            </div>
            <ProgressBar current={g.current} target={g.target} />
          </div>
        ))}

        <div style={{ marginTop: 12 }}>
          <button className="secondary" onClick={() => setShowSgForm((v) => !v)}>
            {showSgForm ? "Fechar" : "➕ Nova meta de economia"}
          </button>
        </div>
        {showSgForm && (
          <div className="section" style={{ marginTop: 12 }}>
            <div className="form-row">
              <label htmlFor="sg-title">Nome</label>
              <input id="sg-title" value={sgTitle} onChange={(e) => setSgTitle(e.target.value)} placeholder="ex: Viagem para Portugal" />
            </div>
            <div className="form-row">
              <label htmlFor="sg-target">Valor alvo (R$)</label>
              <input id="sg-target" type="number" min="1" step="100" value={sgTarget} onChange={(e) => setSgTarget(e.target.value)} placeholder="5000" />
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
              Criar meta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
