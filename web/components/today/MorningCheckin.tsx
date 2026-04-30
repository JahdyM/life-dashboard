"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";

type CheckinData = {
  mood: string;
  moodLabel: string;
  intention: string;
  priority: string;
};

const MOODS = [
  { emoji: "🌟", label: "Ótimo" },
  { emoji: "😊", label: "Bem" },
  { emoji: "😐", label: "Ok" },
  { emoji: "😔", label: "Mal" },
  { emoji: "😴", label: "Cansado" },
];

function streakBadge(n: number): string {
  if (n >= 30) return `${n} dias 🏆`;
  if (n >= 14) return `${n} dias 💪`;
  if (n >= 7)  return `${n} dias 🔥`;
  if (n >= 3)  return `${n} dias ✨`;
  if (n === 2) return `2 dias 🌱`;
  return `1º dia ⭐`;
}

// Neuroscience rationale:
// - Step-by-step progress (progress dots) activates the "completion dopamine" on each micro-step
// - Streak counter creates loss aversion (Kahneman) — don't break the chain
// - Mood choice first = low-friction entry, then intention = goal-priming
// - Celebration moment (brief green flash) = positive reinforcement conditioning

export default function MorningCheckin() {
  const today = new Date().toISOString().slice(0, 10);
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [mood, setMood] = useState("");
  const [moodLabel, setMoodLabel] = useState("");
  const [intention, setIntention] = useState("");
  const [priority, setPriority] = useState("");
  const [streak, setStreak] = useState(0);
  const [points, setPoints] = useState(0);
  const [earned, setEarned] = useState(0);
  const [done, setDone] = useState<CheckinData | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["morning-checkin", today],
    queryFn: () =>
      fetchJson<{ data: CheckinData | null; streak: number }>(
        `/api/checkin/morning?date=${today}`
      ),
  });

  useEffect(() => {
    if (!query.data) return;
    setStreak(query.data.streak);
    if (query.data.data) {
      setDone(query.data.data);
      setStep(4);
    } else {
      setStep(1);
    }
  }, [query.data]);

  useEffect(() => {
    const fetchPoints = async () => {
      try {
        const res = await fetch(`/api/rewards?date=${today}`);
        if (!res.ok) return;
        const json = await res.json() as { points?: number };
        if (typeof json.points === "number") setPoints(json.points);
      } catch { /* ignore */ }
    };
    void fetchPoints();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === 2 || step === 3) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [step]);

  const saveMut = useMutation({
    mutationFn: (data: object) =>
      fetchJson<{ ok: boolean; streak: number; points: number; earned: number }>("/api/checkin/morning", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (res) => {
      setStreak(res.streak);
      if (typeof res.points === "number") setPoints(res.points);
      if (typeof res.earned === "number") setEarned(res.earned);
      setDone({ mood, moodLabel, intention, priority });
      setCelebrating(true);
      setStep(4);
      setTimeout(() => setCelebrating(false), 3000);
    },
  });

  const submit = () => {
    if (!mood || !intention.trim() || !priority.trim()) return;
    saveMut.mutate({ date: today, mood, moodLabel, intention: intention.trim(), priority: priority.trim() });
  };

  if (query.isPending || step === 0) return null;

  // ── Completed state ──────────────────────────────────────────────────────
  if (step === 4 && done) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 16px",
          background: celebrating ? "rgba(157,207,183,0.14)" : "var(--bg-panel,#1e1b2e)",
          borderRadius: 12,
          border: `1px solid ${celebrating ? "#9DCFB7" : "var(--border,#333)"}`,
          transition: "all 0.5s",
          marginBottom: 2,
        }}
      >
        <span style={{ fontSize: "1.3rem" }}>{done.mood}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "0.82rem", color: celebrating ? "#9DCFB7" : "var(--text-soft,#888)", fontWeight: 600 }}>
            {celebrating
              ? earned > 0
                ? `🎉 +${earned} pts! Ótimo começo!`
                : "🎉 Ótimo começo de dia!"
              : `${done.moodLabel} · ${done.intention}`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {points > 0 && (
            <span style={{ fontSize: "0.75rem", color: "#D9C979", fontWeight: 700, whiteSpace: "nowrap" }}>
              ✨ {points}
            </span>
          )}
          {streak > 0 && (
            <span style={{ fontSize: "0.78rem", color: "#D9C979", fontWeight: 700, whiteSpace: "nowrap" }}>
              🔥 {streakBadge(streak)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Check-in flow ────────────────────────────────────────────────────────
  const progress = step - 1; // 0 → 1 → 2

  return (
    <div
      style={{
        background: "var(--bg-panel,#1e1b2e)",
        borderRadius: 14,
        border: "1px solid var(--border,#333)",
        padding: "18px 20px",
        marginBottom: 2,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#9DCFB7", letterSpacing: "0.04em" }}>
          ☀️ Morning check-in
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background:
                  i < progress ? "#9DCFB7" : i === progress ? "#8e79af" : "var(--border,#444)",
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>
      </div>

      {/* Step 1 — Mood */}
      {step === 1 && (
        <>
          <p style={{ margin: "0 0 16px", fontSize: "0.95rem", fontWeight: 500 }}>
            Como você está chegando hoje?
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MOODS.map((m) => (
              <button
                key={m.emoji}
                onClick={() => { setMood(m.emoji); setMoodLabel(m.label); setStep(2); }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border,#444)",
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  minWidth: 56,
                }}
              >
                <span style={{ fontSize: "1.5rem" }}>{m.emoji}</span>
                <span style={{ fontSize: "0.68rem", color: "var(--text-soft,#888)" }}>{m.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Step 2 — Intention */}
      {step === 2 && (
        <>
          <p style={{ margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 500 }}>
            {mood} Qual é a sua intenção para hoje?
          </p>
          <input
            ref={inputRef}
            type="text"
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && intention.trim()) setStep(3); }}
            placeholder="ex: focar na dissertação, descansar bem..."
            style={{ width: "100%", marginBottom: 14 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" onClick={() => setStep(1)} style={{ fontSize: "0.82rem", padding: "6px 12px" }}>
              ← Voltar
            </button>
            <button
              onClick={() => intention.trim() && setStep(3)}
              disabled={!intention.trim()}
              style={{ fontSize: "0.82rem", padding: "6px 18px" }}
            >
              Próximo →
            </button>
          </div>
        </>
      )}

      {/* Step 3 — Priority */}
      {step === 3 && (
        <>
          <p style={{ margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 500 }}>
            Prioridade #1 do dia
          </p>
          <input
            ref={inputRef}
            type="text"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && priority.trim()) submit(); }}
            placeholder="ex: terminar capítulo 3, academia, ligar pra mãe..."
            style={{ width: "100%", marginBottom: 14 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" onClick={() => setStep(2)} style={{ fontSize: "0.82rem", padding: "6px 12px" }}>
              ← Voltar
            </button>
            <button
              onClick={submit}
              disabled={!priority.trim() || saveMut.isPending}
              style={{ fontSize: "0.82rem", padding: "6px 18px" }}
            >
              {saveMut.isPending ? "Salvando…" : "✓ Concluir"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
