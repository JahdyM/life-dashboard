import Link from "next/link";
import { MOOD_PALETTE } from "@/lib/constants";
import { getTodayOverviewData } from "@/lib/server/dashboard";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";
import PageSectionIntro from "@/components/PageSectionIntro";

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

export default async function TodayPage() {
  const userEmail = await getAuthenticatedPageEmail();
  const overview = await getTodayOverviewData(userEmail);
  const moodMeta =
    MOOD_PALETTE.find((item) => item.key === overview.moodCategory) || null;
  const upcomingTasks = sortTasks(overview.pendingTasks).slice(0, 5);
  const completedTasks = sortTasks(overview.completedTasks).slice(0, 5);
  const notePreview = overview.quickNotesText.trim();

  return (
    <div className="route-stack">
      <PageSectionIntro
        eyebrow="Today overview"
        title="Know what matters next in one glance."
        description="Use this page as the calm starting point for the day: what is scheduled, what is already done, and which shared rhythms still need attention."
      />

      <section className="today-grid">
        <article className="today-panel today-panel-hero">
          <div className="today-panel-head">
            <div>
              <p className="panel-kicker">Next focus</p>
              <h2>What deserves attention now</h2>
            </div>
            <div className="today-actions">
              <Link href="/calendar" className="page-link primary">
                Open calendar
              </Link>
              <Link href="/habits" className="page-link">
                Update habits
              </Link>
              <Link href="/mood" className="page-link">
                Log mood
              </Link>
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
            <Link href="/mood" className="page-link inline">
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
            <Link href="/calendar" className="page-link inline">
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
            <Link href="/calendar" className="page-link inline">
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
            <Link href="/couple" className="page-link inline">
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
