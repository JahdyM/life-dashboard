"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import type { RewardsState } from "@/lib/rewards";

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

  return (
    <section className="today-panel rewards-store-card">
      <div className="today-panel-head compact">
        <div>
          <p className="panel-kicker">Rewards</p>
          <h2>Points</h2>
        </div>
        <strong className="rewards-points">{rewards.points}</strong>
      </div>

      <div className="rewards-store-grid">
        <div className="rewards-store-item">
          <span>Freeze</span>
          <strong>{rewards.streakFreezes}</strong>
        </div>
        <button
          type="button"
          className="secondary subtle"
          disabled={action.isPending || rewards.points < rewards.freezeCost}
          onClick={() => action.mutate({ action: "purchase_freeze" })}
        >
          Buy · {rewards.freezeCost}
        </button>
      </div>

      {rewards.canUseMorningGrace ? (
        <button
          type="button"
          className="secondary subtle grace-day-button"
          disabled={action.isPending}
          onClick={() => action.mutate({ action: "use_morning_grace" })}
        >
          Use grace day · {rewards.morningGraceDate}
        </button>
      ) : null}
      {action.isError ? <p className="form-error">Could not update rewards.</p> : null}
    </section>
  );
}
