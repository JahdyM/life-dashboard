import { ReactNode } from "react";
import Link from "next/link";
import { AppNav, LogoutButton } from "@/components/AppNav";
import { Providers } from "@/app/providers";
import { MOOD_PALETTE } from "@/lib/constants";
import { getDashboardShellData } from "@/lib/server/dashboard";
import { getOptionalPageEmail } from "@/lib/server/pageAuth";

const MOOD_LABELS_EN: Record<string, string> = {
  peace: "Peace",
  joy: "Joy",
  anxiety: "Anxiety",
  fear: "Fear",
  anger: "Anger",
  neutral: "Neutral",
};

function getMoodMeta(key: string | null) {
  if (!key) return null;
  return MOOD_PALETTE.find((item) => item.key === key) || null;
}

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const userEmail = await getOptionalPageEmail();

  if (!userEmail) {
    return (
      <div className="shell-layout shell-layout-public">
        <header className="shell-topbar">
          <div className="shell-brand">
            <h1>Life Dashboard</h1>
            <p className="shell-copy">Private daily dashboard.</p>
          </div>
          <div className="shell-public-actions">
            <Link href="/" className="page-link">
              Home
            </Link>
            <Link href="/signin?callbackUrl=%2Ftoday" className="page-link primary">
              Sign in for your real data
            </Link>
          </div>
        </header>
        <main className="shell-main">{children}</main>
      </div>
    );
  }

  const shell = await getDashboardShellData(userEmail);
  const moodMeta = getMoodMeta(shell.moodCategory);

  return (
    <Providers>
      <div className="shell-layout">
        <header className="shell-topbar">
          <div className="shell-brand">
            <h1>Life Dashboard</h1>
            <p className="shell-copy">Today, at a glance.</p>
          </div>
          <div className="shell-user">
            <div>
              <p className="shell-user-label">Signed in as</p>
              <p className="shell-user-name">{shell.displayName}</p>
            </div>
            <LogoutButton />
          </div>
        </header>

        <AppNav />

        <section className="shell-summary-grid" aria-label="Today at a glance">
          <article className="shell-summary-card primary">
            <p className="shell-summary-label">Today</p>
            <p className="shell-summary-value">{shell.header.date}</p>
            <p className="shell-summary-meta">
              {shell.timezone || "Local time"} is active for this dashboard.
            </p>
          </article>

          <article className="shell-summary-card">
            <p className="shell-summary-label">Habits</p>
            <p className="shell-summary-value">
              {shell.header.habits_completed}/{shell.header.habits_total}
            </p>
            <p className="shell-summary-meta">
              {shell.header.habits_percent}% of today&apos;s active habits completed.
            </p>
          </article>

          <article className="shell-summary-card">
            <p className="shell-summary-label">Pending tasks</p>
            <p className="shell-summary-value">{shell.pendingTasksCount}</p>
            <p className="shell-summary-meta">
              {shell.completedTasksCount} completed today.
            </p>
          </article>

          <article className="shell-summary-card">
            <p className="shell-summary-label">Next up</p>
            <p className="shell-summary-value shell-summary-title">
              {shell.nextTask?.title || "Nothing scheduled next"}
            </p>
            <p className="shell-summary-meta">
              {shell.nextTask?.scheduledTime
                ? `Starts at ${shell.nextTask.scheduledTime}`
                : moodMeta
                  ? `Mood check: ${moodMeta.emoji} ${MOOD_LABELS_EN[moodMeta.key] || moodMeta.label}`
                  : "Add a task or log your mood to shape the rest of the day."}
            </p>
          </article>
        </section>

        <section className="shell-streak-panel" aria-label="Shared streak overview">
          <div className="shell-streak-head">
            <div>
              <p className="shell-kicker">Shared streaks</p>
              <h2>Keep the shared habits visible without opening another section.</h2>
            </div>
            {shell.streaks.warning ? (
              <p className="shell-streak-warning">{shell.streaks.warning}</p>
            ) : null}
          </div>

          <div className="shell-streak-grid">
            {shell.streaks.items.slice(0, 4).map((item) => (
              <article key={item.habit_key} className="shell-streak-card">
                <p className="shell-streak-label">{item.label}</p>
                <div className="shell-streak-row">
                  <span>{item.user.email.split("@")[0]}</span>
                  <strong>{item.user.streak}d</strong>
                </div>
                <div className="shell-streak-row">
                  <span>{item.partner.email.split("@")[0]}</span>
                  <strong>{item.partner.streak}d</strong>
                </div>
              </article>
            ))}
          </div>
        </section>

        <main className="shell-main">{children}</main>
      </div>
    </Providers>
  );
}
