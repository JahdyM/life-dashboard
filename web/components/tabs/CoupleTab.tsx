"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import { MOOD_PALETTE } from "@/lib/constants";
import { format } from "date-fns";

export default function CoupleTab({ userEmail }: { userEmail: string }) {
  const [monthKey, setMonthKey] = useState(() => format(new Date(), "yyyy-MM"));
  const moodQuery = useQuery({
    queryKey: ["couple-mood", monthKey],
    queryFn: () =>
      fetchJson<any>(`/api/couple/moodboard?range=month&month=${monthKey}`),
  });
  const streakQuery = useQuery({
    queryKey: ["couple-streaks"],
    queryFn: () => fetchJson<any>("/api/couple/streaks"),
  });

  const moodColor = (key?: string | null) => {
    if (!key) return "#2E2A26";
    return MOOD_PALETTE.find((mood) => mood.key === key)?.color || "#2E2A26";
  };

  const xLabels = moodQuery.data?.x_labels || [];
  const yLabels = moodQuery.data?.y_labels || [];
  const z = moodQuery.data?.z || [];

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
      {moodQuery.data?.warning && (
        <div className="warning">{moodQuery.data.warning}</div>
      )}
      <div className="mood-board">
        {yLabels.map((label: string, rowIndex: number) => (
          <div key={label} className="mood-row">
            <div className="mood-row-label">{label}</div>
            <div className="mood-row-cells">
              {xLabels.map((day: string, colIndex: number) => (
                <div
                  key={`${label}-${day}`}
                  className="mood-cell"
                  style={{ background: moodColor(z?.[rowIndex]?.[colIndex]) }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="section">
        <h3>Shared streaks</h3>
        <div className="streak-grid">
          {(streakQuery.data?.items || []).map((item: any) => (
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
