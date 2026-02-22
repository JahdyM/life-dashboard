"use client";

import { useQuery } from "@tanstack/react-query";
import { signOut, useSession } from "next-auth/react";
import { fetchJson } from "@/lib/client/api";

type InitResponse = {
  header: {
    date: string;
    habits_completed: number;
    habits_total: number;
    habits_percent: number;
  };
  meeting_days: number[];
  family_worship_day: number;
  pending_tasks: number;
  timezone?: string | null;
};

type StreakResponse = {
  items: Array<{
    habit_key: string;
    label: string;
    user: { email: string; streak: number; today_done: boolean; today_applicable?: boolean };
    partner: { email: string; streak: number; today_done: boolean; today_applicable?: boolean };
  }>;
  warning?: string;
};

export default function Header() {
  const { data: session } = useSession();
  const displayName = session?.user?.email
    ? session.user.email.split("@")[0]
    : "Welcome";
  const initQuery = useQuery({
    queryKey: ["init"],
    queryFn: () => fetchJson<InitResponse>("/api/init"),
  });
  const streakQuery = useQuery({
    queryKey: ["couple-streaks"],
    queryFn: () => fetchJson<StreakResponse>("/api/couple/streaks"),
  });

  const init = initQuery.data;
  const streaks = streakQuery.data;

  return (
    <div className="header">
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
