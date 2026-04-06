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
  const parts = [];
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
      label: "Open calendar",
      eyebrow: args.nextTaskTitle ? "Next scheduled step" : "Next focus",
      description: args.nextTaskTitle
        ? `Start with ${args.nextTaskTitle}. The calendar is the fastest path back into the day.`
        : "Your agenda already has something waiting. Open the calendar and continue from there.",
    };
  }

  if (!args.hasMood) {
    return {
      href: "/mood",
      label: "Log mood",
      eyebrow: "Ground the day",
      description:
        "A quick emotional check-in gives the rest of the dashboard better context without adding noise.",
    };
  }

  if (!args.hasNotes && !args.hasCompletedTasks) {
    return {
      href: "/calendar",
      label: "Plan the day",
      eyebrow: "Set the shape",
      description:
        "Nothing is anchored yet. Add the next task or a quick note so the day has a clear starting point.",
    };
  }

  return {
    href: "/calendar",
    label: "Review calendar",
    eyebrow: "Stay oriented",
    description:
      "The essentials are already moving. Review the day calmly and adjust only what needs attention.",
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
    { href: "/habits", label: "Update habits" },
    { href: "/mood", label: "Open mood board" },
    { href: "/couple", label: "Couple pulse" },
  ].filter((item) => item.href !== primaryAction.href);

  return (
    <div className="route-stack">
      <PageSectionIntro
        eyebrow="Today overview"
        title="Know what matters next in one calm glance."
        description="Use this page as the quiet launchpad for the day: one clear next move, the essentials already in motion, and only the sections that deserve attention now."
      />

      <section className="today-grid">
        <article className="today-panel today-panel-hero">
          <div className="today-panel-head today-panel-head-hero">
            <div className="today-hero-copy">
              <p className="panel-kicker">{primaryAction.eyebrow}</p>
              <h2>{upcomingTasks[0]?.title || "What deserves attention now"}</h2>
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
                    ) || "No time assigned yet"}
                  </p>
                </>
              ) : (
                <>
                  <strong>The day is still open.</strong>
                  <p>Use the next action to anchor one useful step and let the rest stay quiet for now.</p>
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
                      {formatTaskMeta(task.scheduledTime, task.estimatedMinutes) ||
                        "No time assigned yet"}
                    </p>
                  </div>
                  <span className="today-task-state">Pending</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="today-empty">
              <p>No pending tasks for today yet.</p>
              <span>Add one in Calendar, or bring a habit into today&apos;s agenda.</span>
            </div>
          )}
        </article>

        <article className="today-panel">
          <div className="today-panel-head compact">
            <div>
              <p className="panel-kicker">Mood</p>
              <h2>Emotional check-in</h2>
            </div>
            <Link href="/mood" className="page-link inline muted">
              Open mood board
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
            <div className="today-empty">
              <p>No mood logged yet.</p>
              <span>A quick note here makes the rest of the dashboard more useful.</span>
            </div>
          )}
        </article>

        <article className="today-panel">
          <div className="today-panel-head compact">
            <div>
              <p className="panel-kicker">Completed</p>
              <h2>Already done today</h2>
            </div>
            <Link href="/calendar" className="page-link inline muted">
              Review tasks
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
            <div className="today-empty">
              <p>No completed tasks yet.</p>
              <span>As you finish tasks, this list becomes the day&apos;s proof of progress.</span>
            </div>
          )}
        </article>

        <article className="today-panel">
          <div className="today-panel-head compact">
            <div>
              <p className="panel-kicker">Notes</p>
              <h2>Today&apos;s scratchpad</h2>
            </div>
            <Link href="/calendar" className="page-link inline muted">
              Open notes pad
            </Link>
          </div>
          {notePreview ? (
            <p className="today-note-preview">{notePreview}</p>
          ) : (
            <div className="today-empty">
              <p>Your notes pad is empty.</p>
              <span>Use it for loose thoughts, errands, or context you want near the schedule.</span>
            </div>
          )}
        </article>

        <article className="today-panel today-panel-wide">
          <div className="today-panel-head compact">
            <div>
              <p className="panel-kicker">Shared rhythm</p>
              <h2>Streaks that matter to both of you</h2>
            </div>
            <Link href="/couple" className="page-link inline muted">
              Open couple view
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
            <div className="today-empty">
              <p>No shared streaks available yet.</p>
              <span>Once shared habits are active, this section becomes the couple pulse.</span>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
