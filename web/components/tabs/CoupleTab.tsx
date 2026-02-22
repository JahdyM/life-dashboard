"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import { MOOD_PALETTE } from "@/lib/constants";
import { format } from "date-fns";
import type { CoupleMoodboardData, StreakData } from "@/lib/types";

export default function CoupleTab({ userEmail }: { userEmail: string }) {
  const [monthKey, setMonthKey] = useState(() => format(new Date(), "yyyy-MM"));
  const moodQuery = useQuery({
    queryKey: ["couple-mood", monthKey],
    queryFn: () =>
      fetchJson<CoupleMoodboardData>(`/api/couple/moodboard?range=month&month=${monthKey}`),
  });
  const streakQuery = useQuery({
    queryKey: ["couple-streaks"],
    queryFn: () => fetchJson<StreakData>("/api/couple/streaks"),
  });
  const queryLoading = moodQuery.isPending || streakQuery.isPending;
  const queryError = moodQuery.isError || streakQuery.isError;

  const moodMeta = (key?: string | null) => {
    if (!key) return null;
    return MOOD_PALETTE.find((mood) => mood.key === key) || null;
  };

  const getLatestMood = (row: Array<string | null> | undefined) => {
    if (!row) return null;
    for (let i = row.length - 1; i >= 0; i -= 1) {
      if (row[i]) return row[i] as string;
    }
    return null;
  };

  const supportSuggestion = (moodKey: string | null, partnerName: string) => {
    switch (moodKey) {
      case "fear":
        return `Medo: abrace ${partnerName} com mais presença, traga segurança e escuta sem julgamento.`;
      case "anger":
        return `Raiva: dê espaço curto, valide o que ${partnerName} sente e retomem a conversa com calma.`;
      case "anxiety":
        return `Ansiedade: fale devagar com ${partnerName}, simplifiquem o dia e priorizem uma coisa por vez.`;
      case "joy":
        return `Felicidade: celebre com ${partnerName} e reforcem juntos o que funcionou hoje.`;
      case "peace":
        return `Paz: mantenha com ${partnerName} um ritmo leve, carinho prático e gratidão no fim do dia.`;
      case "neutral":
        return `Neutro: faça um check-in breve com ${partnerName} e ofereça apoio em algo concreto.`;
      default:
        return `Sem registro recente de humor para ${partnerName}. Faça um check-in carinhoso hoje.`;
    }
  };

  const xLabels = moodQuery.data?.x_labels || [];
  const yLabels = moodQuery.data?.y_labels || [];
  const z = moodQuery.data?.z || [];
  const userName = yLabels[0] || userEmail.split("@")[0];
  const partnerName = yLabels[1] || "Partner";
  const latestUserMood = getLatestMood(z?.[0]);
  const latestPartnerMood = getLatestMood(z?.[1]);

  return (
    <div className="card">
      <h2>Shared mood board</h2>
      <div className="form-row">
        <label>Month</label>
        <input
          type="month"
          value={monthKey}
          onChange={(event) => setMonthKey(event.target.value)}
        />
      </div>
      {queryLoading && <div className="query-status">Loading couple data...</div>}
      {queryError && (
        <div className="query-status error">
          <span>Could not load couple insights.</span>
          <button
            className="secondary"
            onClick={() => {
              moodQuery.refetch();
              streakQuery.refetch();
            }}
          >
            Retry
          </button>
        </div>
      )}
      {moodQuery.data?.warning && (
        <div className="warning">{moodQuery.data.warning}</div>
      )}
      <div className="mood-legend">
        {MOOD_PALETTE.map((mood) => (
          <div key={mood.key} className="mood-legend-item">
            <span className="mood-legend-color" style={{ background: mood.color }}>
              {mood.emoji}
            </span>
            <span>{mood.label}</span>
          </div>
        ))}
      </div>
      <div className="mood-board">
        {yLabels.map((label: string, rowIndex: number) => (
          <div key={label} className="mood-row">
            <div className="mood-row-label">{label}</div>
            <div className="mood-row-cells">
              {xLabels.map((day: string, colIndex: number) => {
                const mood = moodMeta(z?.[rowIndex]?.[colIndex]);
                return (
                  <div
                    key={`${label}-${day}`}
                    className="mood-cell"
                    style={{ background: mood?.color || "#2E2A26" }}
                    title={mood ? `Dia ${day}: ${mood.label}` : `Dia ${day}: sem registro`}
                  >
                    {mood?.emoji ? <span className="mood-cell-emoji">{mood.emoji}</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="section">
        <h3>Partner care suggestions</h3>
        <div className="suggestion-grid">
          <div className="suggestion-card">
            <div className="suggestion-title">
              Para {userName} cuidar de {partnerName}
            </div>
            <div className="suggestion-body">
              {supportSuggestion(latestPartnerMood, partnerName)}
            </div>
          </div>
          <div className="suggestion-card">
            <div className="suggestion-title">
              Para {partnerName} cuidar de {userName}
            </div>
            <div className="suggestion-body">
              {supportSuggestion(latestUserMood, userName)}
            </div>
          </div>
        </div>
      </div>
      <div className="section">
        <h3>Shared streaks</h3>
        <div className="streak-grid">
          {(streakQuery.data?.items || []).map((item) => (
            <div key={item.habit_key} className="streak-card">
              <div className="streak-icon">🔥</div>
              <div className="streak-label">{item.label}</div>
              <div className="streak-row">
                <span>{item.user.streak} days</span>
                <span>{item.user.email.split("@")[0]}</span>
              </div>
              <div className="streak-row">
                <span>{item.partner.streak} days</span>
                <span>{item.partner.email.split("@")[0]}</span>
              </div>
              <div className="streak-max">
                Max: {item.user.email.split("@")[0]} {item.user.max_streak || 0} ·{" "}
                {item.partner.email.split("@")[0]} {item.partner.max_streak || 0}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
