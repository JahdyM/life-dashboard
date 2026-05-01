"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import type { RewardsState } from "@/lib/rewards";

type EarnRow = { label: string; pts: number; note?: string };

function EarnTable({ table }: { table: RewardsState["pointsTable"] }) {
  const rows: EarnRow[] = [
    { label: "Morning check-in", pts: table.morningCheckin },
    { label: "Evening check-in", pts: table.eveningCheckin },
    { label: "Both check-ins (same day)", pts: table.fullDayBonus, note: "bonus" },
    { label: "Shared habit done", pts: table.sharedHabit, note: "per habit" },
    { label: "Custom habit done", pts: table.customHabit, note: "per habit" },
    { label: "Task done (< 30 min)", pts: table.taskShort },
    { label: "Task done (30–59 min)", pts: table.taskMedium },
    { label: "Task done (≥ 60 min)", pts: table.taskDeep },
    { label: "Streak 7d / 14d / 30d…", pts: 10, note: "+10–50 bonus" },
  ];
  return (
    <div className="rewards-earn-table">
      {rows.map((row) => (
        <div key={row.label} className="rewards-earn-row">
          <span>{row.label}</span>
          <span className="rewards-earn-pts">
            +{row.pts}
            {row.note ? <em> {row.note}</em> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RewardsStore() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const query = useQuery({
    queryKey: ["rewards", today],
    queryFn: () => fetchJson<RewardsState>(`/api/rewards?date=${today}`),
  });

  const action = useMutation({
    mutationFn: (payload: { action: "purchase_freeze" | "use_morning_grace" }) =>
      fetchJson<RewardsState>("/api/rewards", {
        method: "POST",
        body: JSON.stringify({ ...payload, date: today }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["rewards", today], data);
      void queryClient.invalidateQueries({ queryKey: ["morning-checkin"] });
    },
  });

  const rewards = query.data;
  if (query.isPending || !rewards) return null;

  const freezeProgress = Math.min(100, Math.round((rewards.points / rewards.freezeCost) * 100));

  return (
    <section className="today-panel rewards-store-card">
      {/* Header */}
      <div className="today-panel-head compact">
        <div>
          <p className="panel-kicker">Rewards</p>
          <h2>Points</h2>
        </div>
        <strong className="rewards-points">✨ {rewards.points}</strong>
      </div>

      {/* Freeze progress */}
      <div className="rewards-freeze-section">
        <div className="rewards-freeze-header">
          <span>Streak freeze</span>
          <span className="rewards-freeze-stock">
            {rewards.streakFreezes > 0 ? `🧊 ${rewards.streakFreezes} available` : "None"}
          </span>
        </div>
        <div className="rewards-freeze-bar">
          <div style={{ width: `${freezeProgress}%` }} />
        </div>
        <div className="rewards-freeze-meta">
          <span>{rewards.points} / {rewards.freezeCost} pts</span>
          <button
            type="button"
            className="secondary subtle"
            disabled={action.isPending || rewards.points < rewards.freezeCost}
            onClick={() => action.mutate({ action: "purchase_freeze" })}
          >
            Buy freeze
          </button>
        </div>
      </div>

      {/* Grace day offer */}
      {rewards.canUseMorningGrace ? (
        <button
          type="button"
          className="secondary subtle grace-day-button"
          disabled={action.isPending}
          onClick={() => action.mutate({ action: "use_morning_grace" })}
        >
          🧊 Use freeze as grace day · {rewards.morningGraceDate}
        </button>
      ) : null}

      {/* How to earn */}
      <details className="rewards-earn-details">
        <summary>How to earn points</summary>
        {rewards.pointsTable ? <EarnTable table={rewards.pointsTable} /> : null}
      </details>

      {action.isError ? <p className="form-error">Could not update rewards.</p> : null}
    </section>
  );
}
