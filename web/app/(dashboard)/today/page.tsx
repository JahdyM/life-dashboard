import Link from "next/link";
import PublicEntryExperience from "@/components/PublicEntryExperience";
import PageSectionIntro from "@/components/PageSectionIntro";
import { MOOD_PALETTE } from "@/lib/constants";
import { getTodayOverviewData } from "@/lib/server/dashboard";
import { getOptionalPageEmail } from "@/lib/server/pageAuth";

const MOOD_LABELS_EN: Record<string, string> = {
  peace: "Peace",
  joy: "Joy",
  anxiety: "Anxiety",
  fear: "Fear",
  anger: "Anger",
  neutral: "Neutral",
};

function formatTaskMeta(time: string | null | undefined, minutes: number | null | undefined) {
  const parts: string[] = [];
  if (time) parts.push(time);
  if (minutes) parts.push(`${minutes} min`);
  return parts.join(" · ");
}

function sortTasks<T extends { scheduledTime?: string | null }>(tasks: T[]) {
  return [...tasks].sort((left, right) => {
    const leftTime = left.scheduledTime || "99:99";
    const rightTime = right.scheduledTime || "99:99";
    return leftTime.localeCompare(rightTime);
  });
}

function buildPrimaryAction(args: {
  hasPendingTasks: boolean;
  hasMood: boolean;
  hasNotes: boolean;
  hasCompletedTasks: boolean;
  nextTaskTitle: string | null;
}) {
  if (args.hasPendingTasks) {
    return {
      href: "/calendar",
      label: "Calendar",
      eyebrow: "Next",
      description: args.nextTaskTitle
        ? `Start with ${args.nextTaskTitle}.`
        : "Your next task is waiting.",
    };
  }

  if (!args.hasMood) {
    return {
      href: "/mood",
      label: "Mood",
      eyebrow: "Mood",
      description: "Log a quick check-in.",
    };
  }

  if (!args.hasNotes && !args.hasCompletedTasks) {
    return {
      href: "/calendar",
      label: "Plan the day",
      eyebrow: "Plan",
      description: "Set one next step.",
    };
  }

  return {
    href: "/calendar",
    label: "Review",
    eyebrow: "Review",
    description: "Check the day.",
  };
}

export default async function TodayPage() {
  const userEmail = await getOptionalPageEmail();
  if (!userEmail) {
    return <PublicEntryExperience mode="today" />;
  }

  const overview = await getTodayOverviewData(userEmail);
  const moodMeta =
    MOOD_PALETTE.find((item) => item.key === overview.moodCategory) || null;
  const upcomingTasks = sortTasks(overview.pendingTasks).slice(0, 5);
  const completedTasks = sortTasks(overview.completedTasks).slice(0, 5);
  const notePreview = overview.quickNotesText.trim();
  const primaryAction = buildPrimaryAction({
    hasPendingTasks: upcomingTasks.length > 0,
    hasMood: Boolean(moodMeta),
    hasNotes: Boolean(notePreview),
    hasCompletedTasks: completedTasks.length > 0,
    nextTaskTitle: upcomingTasks[0]?.title || null,
  });
  const secondaryLinks = [
    { href: "/habits", label: "Habits" },
    { href: "/mood", label: "Mood" },
    { href: "/couple", label: "Couple" },
  ].filter((item) => item.href !== primaryAction.href);

  return (
    <div className="route-stack">
      <PageSectionIntro title="Today" />

      <section className="today-grid">
        <article className="today-panel today-panel-hero">
          <div className="today-panel-head today-panel-head-hero">
            <div className="today-hero-copy">
              <p className="panel-kicker">{primaryAction.eyebrow}</p>
              <h2>{upcomingTasks[0]?.title || "Start here"}</h2>
              <p className="today-panel-copy">{primaryAction.description}</p>
              <div className="today-primary-actions">
                <Link href={primaryAction.href} className="page-link primary">
                  {primaryAction.label}
                </Link>
                <div className="today-secondary-links" aria-label="Secondary actions">
                  {secondaryLinks.map((link) => (
                    <Link key={link.href} href={link.href} className="page-link inline muted">
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="today-next-card">
              <span className="today-next-label">Next up</span>
              {upcomingTasks[0] ? (
                <>
                  <strong>{upcomingTasks[0].title}</strong>
                  <p>
                    {formatTaskMeta(
                      upcomingTasks[0].scheduledTime,
                      upcomingTasks[0].estimatedMinutes
                    ) || "No time set"}
                  </p>
                </>
              ) : (
                <>
                  <strong>The day is open.</strong>
                  <p>Set one next step.</p>
                </>
              )}
            </div>
          </div>

          {upcomingTasks.length ? (
            <ul className="today-task-list">
              {upcomingTasks.map((task) => (
                <li key={task.id} className="today-task-item">
                  <div>
                    <p className="today-task-title">{task.title}</p>
                    <p className="today-task-meta">
                      {formatTaskMeta(task.scheduledTime, task.estimatedMinutes) || "No time set"}
                    </p>
                  </div>
                  <span className="today-task-state">Pending</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="today-empty"><p>No tasks for today.</p></div>
          )}
        </article>

        <article className="today-panel">
          <div className="today-panel-head compact">
            <div>
              <p className="panel-kicker">Mood</p>
              <h2>Mood</h2>
            </div>
            <Link href="/mood" className="page-link inline muted">
              Mood
            </Link>
          </div>
          {moodMeta ? (
            <div className="today-mood-card">
              <p className="today-mood-value">
                <span>{moodMeta.emoji}</span>
                {MOOD_LABELS_EN[moodMeta.key] || moodMeta.label}
              </p>
              <p className="today-panel-copy">
                {overview.moodNote?.trim() ||
                  "Mood logged for today. You can refine the note any time."}
              </p>
            </div>
          ) : (
            <div className="today-empty"><p>No mood yet.</p></div>
          )}
        </article>

        <article className="today-panel">
          <div className="today-panel-head compact">
            <div>
              <p className="panel-kicker">Completed</p>
              <h2>Done</h2>
            </div>
            <Link href="/calendar" className="page-link inline muted">
              Tasks
            </Link>
          </div>
          {completedTasks.length ? (
            <ul className="today-compact-list">
              {completedTasks.map((task) => (
                <li key={task.id}>
                  <span>{task.title}</span>
                  <small>{formatTaskMeta(task.scheduledTime, task.actualMinutes)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <div className="today-empty"><p>Nothing done yet.</p></div>
          )}
        </article>

        <article className="today-panel">
          <div className="today-panel-head compact">
            <div>
              <p className="panel-kicker">Notes</p>
              <h2>Notes</h2>
            </div>
            <Link href="/calendar" className="page-link inline muted">
              Notes
            </Link>
          </div>
          {notePreview ? (
            <p className="today-note-preview">{notePreview}</p>
          ) : (
            <div className="today-empty"><p>No notes yet.</p></div>
          )}
        </article>

        <article className="today-panel today-panel-wide">
          <div className="today-panel-head compact">
            <div>
              <p className="panel-kicker">Shared</p>
              <h2>Streaks</h2>
            </div>
            <Link href="/couple" className="page-link inline muted">
              Couple
            </Link>
          </div>
          {overview.streaks.items.length ? (
            <div className="today-streak-list">
              {overview.streaks.items.slice(0, 4).map((item) => (
                <div key={item.habit_key} className="today-streak-item">
                  <div>
                    <strong>{item.label}</strong>
                    <p>
                      {item.user.email.split("@")[0]} {item.user.streak}d ·{" "}
                      {item.partner.email.split("@")[0]} {item.partner.streak}d
                    </p>
                  </div>
                  <span className="today-task-state quiet">Shared</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="today-empty"><p>No shared streaks yet.</p></div>
          )}
        </article>
      </section>
    </div>
  );
}
