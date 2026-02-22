"use client";

import { useQuery } from "@tanstack/react-query";
import { signOut, useSession } from "next-auth/react";
import { fetchJson } from "@/lib/client/api";
import type { InitData, StreakData } from "@/lib/types";

export default function Header() {
  const { data: session } = useSession();
  const displayName = session?.user?.email
    ? session.user.email.split("@")[0]
    : "Welcome";
  const initQuery = useQuery({
    queryKey: ["init"],
    queryFn: () => fetchJson<InitData>("/api/init"),
  });
  const streakQuery = useQuery({
    queryKey: ["couple-streaks"],
    queryFn: () => fetchJson<StreakData>("/api/couple/streaks"),
  });

  const init = initQuery.data;
  const streaks = streakQuery.data;
  const isLoading = initQuery.isPending || streakQuery.isPending;
  const hasError = initQuery.isError || streakQuery.isError;

  const retryHeaderData = () => {
    initQuery.refetch();
    streakQuery.refetch();
  };

  return (
    <div className="header">
      {isLoading ? (
        <div className="query-status">Loading header data...</div>
      ) : null}
      {hasError ? (
        <div className="query-status error">
          <span>Could not refresh header data.</span>
          <button className="secondary" onClick={retryHeaderData}>
            Retry
          </button>
        </div>
      ) : null}
      <div className="header-summary">
        <div>
          <p className="header-title">Welcome</p>
          <p className="header-metric">{displayName}</p>
          <button
            className="header-logout"
            onClick={() => signOut({ callbackUrl: "/signin" })}
          >
            Log out
          </button>
        </div>
        <div>
          <p className="header-title">Daily Summary</p>
          <p className="header-metric">
            {init ? `${init.header.habits_completed}/${init.header.habits_total}` : "--"}
            <span> habits</span>
          </p>
        </div>
        <div>
          <p className="header-title">Pending tasks</p>
          <p className="header-metric">
            {init ? init.pending_tasks : "--"}
          </p>
        </div>
        <div>
          <p className="header-title">Date</p>
          <p className="header-metric">{init?.header.date || "--"}</p>
        </div>
      </div>

      <div className="header-streaks">
        <div className="header-streaks-title">Shared Habits Streak</div>
        {streaks?.warning && (
          <div className="header-warning">{streaks.warning}</div>
        )}
        <div className="streak-grid">
          {streaks?.items?.length ? (
            streaks.items.map((item) => (
              <div key={item.habit_key} className="streak-card">
                <div className="streak-icon">🔥</div>
                <div className="streak-label">{item.label}</div>
                <div className="streak-row">
                  <span>{item.user.streak} days</span>
                  <span
                    className={
                      item.user.today_applicable === false
                        ? "offday"
                        : item.user.today_done
                          ? "done"
                          : "pending"
                    }
                  >
                    {item.user.email.split("@")[0]}
                  </span>
                </div>
                <div className="streak-row">
                  <span>{item.partner.streak} days</span>
                  <span
                    className={
                      item.partner.today_applicable === false
                        ? "offday"
                        : item.partner.today_done
                          ? "done"
                          : "pending"
                    }
                  >
                    {item.partner.email.split("@")[0]}
                  </span>
                </div>
                <div className="streak-max">
                  Max: {item.user.email.split("@")[0]} {item.user.max_streak || 0} ·{" "}
                  {item.partner.email.split("@")[0]} {item.partner.max_streak || 0}
                </div>
              </div>
            ))
          ) : (
            <div className="header-warning">Loading streaks...</div>
          )}
        </div>
      </div>
    </div>
  );
}
