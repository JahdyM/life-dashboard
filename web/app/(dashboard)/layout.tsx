import { ReactNode } from "react";
import Link from "next/link";
import { AppNav, LogoutButton } from "@/components/AppNav";
import { Providers } from "@/app/providers";
import { getDashboardShellData } from "@/lib/server/dashboard";
import { getMoodMeta } from "@/lib/moods";
import { getOptionalPageEmail } from "@/lib/server/pageAuth";

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
              Sign in
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
              <p className="shell-user-label">Signed in</p>
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
          </article>

          <article className="shell-summary-card">
            <p className="shell-summary-label">Habits</p>
            <p className="shell-summary-value">
              {shell.header.habits_completed}/{shell.header.habits_total}
            </p>
            <p className="shell-summary-meta">{shell.header.habits_percent}%</p>
          </article>

          <article className="shell-summary-card">
            <p className="shell-summary-label">Tasks</p>
            <p className="shell-summary-value">{shell.pendingTasksCount}</p>
            <p className="shell-summary-meta">{shell.completedTasksCount} done</p>
          </article>

          <article className="shell-summary-card">
            <p className="shell-summary-label">Next</p>
            <p className="shell-summary-value shell-summary-title">
              {shell.nextTask?.title || "Nothing next"}
            </p>
            <p className="shell-summary-meta">
              {shell.nextTask?.scheduledTime
                ? `Starts ${shell.nextTask.scheduledTime}`
                : moodMeta
                ? `${moodMeta.emoji} ${MOOD_LABELS_EN[moodMeta.key] || moodMeta.label}`
                ? `${moodMeta.emoji} ${moodMeta.label}`
                  : "Add a task or mood."}
            </p>
          </article>
        </section>

        <section className="shell-streak-panel" aria-label="Shared streak overview">
          <div className="shell-streak-head">
            <div>
              <h2>Shared</h2>
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
