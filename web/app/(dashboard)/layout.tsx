import { ReactNode } from "react";
import Link from "next/link";
import { AppNav, LogoutButton } from "@/components/AppNav";
import DashboardFreshness from "@/components/DashboardFreshness";
import WordOfDayWidget from "@/components/WordOfDayWidget";
import YesterdayCatchupModal from "@/components/YesterdayCatchupModal";
import { Providers } from "@/app/providers";
import { getDashboardShellData } from "@/lib/server/dashboard";
import { getMoodMeta } from "@/lib/moods";
import { getOptionalPageEmail } from "@/lib/server/pageAuth";
import { getDashboardOnboardingPreferences } from "@/lib/server/onboarding";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const userEmail = await getOptionalPageEmail();

  if (!userEmail) {
    return (
      <div className="shell-layout shell-layout-public">
        <div className="space-backdrop" aria-hidden="true">
          <span className="space-backdrop-stars" />
          <span className="space-backdrop-planet space-backdrop-planet-large" />
          <span className="space-backdrop-planet space-backdrop-planet-small" />
        </div>
        <header className="shell-topbar">
          <div className="shell-brand">
            <h1>Life Dashboard</h1>
            <p className="shell-copy">Private observatory.</p>
          </div>
          <div className="shell-public-actions">
            <Link href="/" prefetch={false} className="page-link">
              Home
            </Link>
            <Link href="/signin?callbackUrl=%2Ftoday" prefetch={false} className="page-link primary">
              Sign in
            </Link>
          </div>
        </header>
        <main className="shell-main">{children}</main>
      </div>
    );
  }

  const [shell, preferences] = await Promise.all([
    getDashboardShellData(userEmail),
    getDashboardOnboardingPreferences(userEmail),
  ]);
  const moodMeta = getMoodMeta(shell.moodCategory);

  return (
    <Providers>
      <DashboardFreshness />
      <div className="shell-layout">
        <div className="space-backdrop" aria-hidden="true">
          <span className="space-backdrop-stars" />
          <span className="space-backdrop-planet space-backdrop-planet-large" />
          <span className="space-backdrop-planet space-backdrop-planet-small" />
        </div>
        <header className="shell-topbar">
          <div className="shell-brand">
            <h1>Life Dashboard</h1>
            <p className="shell-copy">Daily observatory.</p>
          </div>
          <div className="shell-user">
            <div>
              <p className="shell-user-label">Signed in</p>
              <p className="shell-user-name">{shell.displayName}</p>
            </div>
            <Link href="/onboarding" prefetch={false} className="page-link inline muted">
              Customize
            </Link>
            <Link href="/settings/tokens" prefetch={false} className="page-link inline muted">
              Tokens
            </Link>
            <LogoutButton />
          </div>
        </header>

        <AppNav modules={preferences.modules} />

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
                  ? `${moodMeta.emoji} ${moodMeta.label}`
                  : "Add a task or mood."}
            </p>
          </article>
        </section>

        <section className="shell-study-strip" aria-label="Daily study widgets">
          <WordOfDayWidget dateIso={shell.todayIso} />
        </section>

        <main className="shell-main">{children}</main>

        <YesterdayCatchupModal todayIso={shell.todayIso} sharedHabits={preferences.sharedHabits} />

        <section className="shell-streak-panel shell-streak-panel-tail" aria-label="Shared streak overview">
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
      </div>
    </Providers>
  );
}
