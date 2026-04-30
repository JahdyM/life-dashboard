"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import type { CoupleGoal, BucketItem } from "@/lib/server/coupleSettings";

const GOAL_CATEGORIES = ["💑 Casal", "✈️ Viagem", "📚 Aprendizado", "💪 Saúde", "💰 Financeiro", "🌱 Pessoal", "🔭 Sonho"];
const GOAL_SIZES = ["🌱 Pequena", "🎯 Média", "🌟 Grande", "🚀 Sonho grande"];

function isoWeek(d: Date) {
  const y = d.getFullYear();
  const wk = String(Math.ceil((((d.getTime() - new Date(y, 0, 1).getTime()) / 86400000) + new Date(y, 0, 1).getDay() + 1) / 7)).padStart(2, "0");
  return `${y}-W${wk}`;
}

function ProgressPill({ pct }: { pct: number }) {
  const color = pct === 100 ? "#9DCFB7" : pct >= 50 ? "#8e79af" : "#D9C979";
  return (
    <div>
      <div style={{ background: "var(--bg-panel,#2a2335)", borderRadius: 999, height: 6, overflow: "hidden", margin: "4px 0 2px" }}>
        <div style={{ background: color, width: `${pct}%`, height: 6, borderRadius: 999 }} />
      </div>
      <small style={{ color: "var(--text-soft,#888)" }}>{pct}% {pct === 100 ? "✅" : ""}</small>
    </div>
  );
}

export default function GoalsTab({ userEmail }: { userEmail: string }) {
  const qc = useQueryClient();
  const today = new Date();
  const weekIso = isoWeek(today);
  const isMonday = today.getDay() === 1;

  // Weekly check-in
  const checkinQuery = useQuery({
    queryKey: ["goals-checkin", weekIso],
    queryFn: () => fetchJson<{ text: string }>(`/api/goals/checkin?week=${weekIso}`),
  });
  const [checkinText, setCheckinText] = useState("");
  useEffect(() => {
    if (checkinQuery.data?.text !== undefined) setCheckinText(checkinQuery.data.text);
  }, [checkinQuery.data?.text]);

  const saveCheckinMut = useMutation({
    mutationFn: () =>
      fetchJson("/api/goals/checkin", { method: "POST", body: JSON.stringify({ week: weekIso, text: checkinText }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals-checkin"] }),
  });

  // Goals
  const goalsQuery = useQuery({
    queryKey: ["couple-goals"],
    queryFn: () => fetchJson<{ goals: CoupleGoal[] }>("/api/goals"),
  });
  const goals: CoupleGoal[] = goalsQuery.data?.goals || [];
  const activeGoals = goals.filter((g) => !g.isDone);
  const doneGoals = goals.filter((g) => g.isDone);

  const [gTitle, setGTitle] = useState("");
  const [gCat, setGCat] = useState(GOAL_CATEGORIES[0]);
  const [gSize, setGSize] = useState(GOAL_SIZES[1]);
  const [gEmoji, setGEmoji] = useState("🎯");
  const [gDeadline, setGDeadline] = useState("");
  const [showGForm, setShowGForm] = useState(false);

  const addGoalMut = useMutation({
    mutationFn: (data: object) =>
      fetchJson("/api/goals", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["couple-goals"] });
      setGTitle(""); setGEmoji("🎯"); setGDeadline(""); setShowGForm(false);
    },
  });

  const patchGoalMut = useMutation({
    mutationFn: (data: { id: string; progress: number }) =>
      fetchJson("/api/goals", { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["couple-goals"] }),
  });

  const delGoalMut = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/goals?id=${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["couple-goals"] }),
  });

  // Bucket list
  const bucketQuery = useQuery({
    queryKey: ["bucket-list"],
    queryFn: () => fetchJson<{ items: BucketItem[] }>("/api/goals/bucket"),
  });
  const bucket: BucketItem[] = bucketQuery.data?.items || [];
  const pending = bucket.filter((b) => !b.isDone);
  const done = bucket.filter((b) => b.isDone);

  const [newBucket, setNewBucket] = useState("");

  const addBucketMut = useMutation({
    mutationFn: (title: string) =>
      fetchJson("/api/goals/bucket", { method: "POST", body: JSON.stringify({ title }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bucket-list"] }); setNewBucket(""); },
  });

  const toggleBucketMut = useMutation({
    mutationFn: (id: string) =>
      fetchJson("/api/goals/bucket", { method: "PATCH", body: JSON.stringify({ id }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bucket-list"] }),
  });

  const delBucketMut = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/goals/bucket?id=${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bucket-list"] }),
  });

  return (
    <div className="route-stack">
      {/* Weekly check-in */}
      <div className="card">
        <h2>📝 Check-in semanal {isMonday ? "✨" : ""}</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--text-soft)" }}>
          Qual é a intenção de vocês para esta semana?
        </p>
        <textarea
          value={checkinText}
          onChange={(e) => setCheckinText(e.target.value)}
          placeholder="Ex: Focar na dissertação, priorizar descanso, ter pelo menos uma date night..."
          rows={3}
          style={{ width: "100%", resize: "vertical" }}
        />
        <button
          onClick={() => saveCheckinMut.mutate()}
          disabled={saveCheckinMut.isPending}
          style={{ marginTop: 8 }}
        >
          Salvar check-in
        </button>
      </div>

      {/* Goals */}
      <div className="card">
        <h2>🎯 Metas do casal</h2>
        {goalsQuery.isPending && <div className="query-status">Carregando…</div>}

        {activeGoals.length === 0 && !goalsQuery.isPending && (
          <p style={{ color: "var(--text-soft)", fontSize: "0.85rem" }}>Nenhuma meta ativa. Adicione uma!</p>
        )}

        {activeGoals.map((g) => {
          const daysLeft = g.targetDate
            ? Math.ceil((new Date(g.targetDate).getTime() - Date.now()) / 86400000)
            : null;
          return (
            <div key={g.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border,#444)", alignItems: "flex-start" }}>
              <span style={{ fontSize: "1.4rem" }}>{g.emoji}</span>
              <div style={{ flex: 1 }}>
                <div>
                  <strong>{g.title}</strong>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-soft)", marginLeft: 6 }}>{g.size} · {g.category}</span>
                  {daysLeft !== null && (
                    <span style={{ fontSize: "0.72rem", color: daysLeft < 30 ? "#D9C979" : "var(--text-soft)", marginLeft: 6 }}>
                      {daysLeft < 0 ? "⚠️ vencida" : `${daysLeft}d`}
                    </span>
                  )}
                </div>
                <ProgressPill pct={g.progress} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  defaultValue={g.progress}
                  style={{ width: 64 }}
                  onBlur={(e) => {
                    const val = Number(e.target.value);
                    if (val !== g.progress) patchGoalMut.mutate({ id: g.id, progress: val });
                  }}
                />
                <button className="secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => delGoalMut.mutate(g.id)}>✕</button>
              </div>
            </div>
          );
        })}

        {doneGoals.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", color: "var(--text-soft)", fontSize: "0.85rem" }}>
              ✅ Metas concluídas ({doneGoals.length})
            </summary>
            {doneGoals.map((g) => (
              <div key={g.id} style={{ fontSize: "0.85rem", padding: "4px 0" }}>✅ {g.emoji} {g.title}</div>
            ))}
          </details>
        )}

        <div style={{ marginTop: 12 }}>
          <button className="secondary" onClick={() => setShowGForm((v) => !v)}>
            {showGForm ? "Fechar" : "➕ Nova meta"}
          </button>
        </div>
        {showGForm && (
          <div className="section" style={{ marginTop: 12 }}>
            <div className="form-row">
              <label>Meta</label>
              <input value={gTitle} onChange={(e) => setGTitle(e.target.value)} placeholder="ex: Visitar o Pantanal" />
            </div>
            <div className="form-row">
              <label>Categoria</label>
              <select value={gCat} onChange={(e) => setGCat(e.target.value)}>
                {GOAL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Tamanho</label>
              <select value={gSize} onChange={(e) => setGSize(e.target.value)}>
                {GOAL_SIZES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Emoji</label>
              <input value={gEmoji} onChange={(e) => setGEmoji(e.target.value)} maxLength={4} style={{ width: 60 }} />
            </div>
            <div className="form-row">
              <label>Prazo (opcional)</label>
              <input type="date" value={gDeadline} onChange={(e) => setGDeadline(e.target.value)} />
            </div>
            <button
              onClick={() => {
                if (!gTitle.trim()) return;
                addGoalMut.mutate({ title: gTitle, category: gCat, size: gSize, emoji: gEmoji || "🎯", targetDate: gDeadline || null, createdBy: userEmail });
              }}
              disabled={addGoalMut.isPending}
            >
              Criar meta
            </button>
          </div>
        )}
      </div>

      {/* Bucket list */}
      <div className="card">
        <h2>🌍 Bucket list do casal</h2>
        {bucketQuery.isPending && <div className="query-status">Carregando…</div>}

        {pending.length === 0 && !bucketQuery.isPending && (
          <p style={{ color: "var(--text-soft)", fontSize: "0.85rem" }}>Bucket list vazia — adicionem seus sonhos!</p>
        )}

        {pending.map((item) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border,#444)" }}>
            <input
              type="checkbox"
              checked={false}
              onChange={() => toggleBucketMut.mutate(item.id)}
              style={{ cursor: "pointer" }}
            />
            <span style={{ flex: 1 }}>{item.title}</span>
            <button className="secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => delBucketMut.mutate(item.id)}>✕</button>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={newBucket}
            onChange={(e) => setNewBucket(e.target.value)}
            placeholder="ex: Ver aurora boreal juntos"
            style={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === "Enter" && newBucket.trim()) addBucketMut.mutate(newBucket); }}
          />
          <button onClick={() => { if (newBucket.trim()) addBucketMut.mutate(newBucket); }} disabled={addBucketMut.isPending}>
            Adicionar
          </button>
        </div>

        {done.length > 0 && (
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: "pointer", color: "var(--text-soft)", fontSize: "0.85rem" }}>
              ✅ Já vivemos isso! ({done.length})
            </summary>
            {done.map((item) => (
              <div key={item.id} style={{ fontSize: "0.85rem", padding: "3px 0", display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked onChange={() => toggleBucketMut.mutate(item.id)} style={{ cursor: "pointer" }} />
                <span>✅ {item.title} {item.doneDate ? `— ${item.doneDate}` : ""}</span>
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}
