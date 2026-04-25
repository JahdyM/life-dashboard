import Link from "next/link";
import PublicEntryExperience from "@/components/PublicEntryExperience";
import PageSectionIntro from "@/components/PageSectionIntro";
import { getMoodMeta } from "@/lib/moods";
import { getTodayOverviewData } from "@/lib/server/dashboard";
import { getOptionalPageEmail } from "@/lib/server/pageAuth";

function formatTaskMeta(time: string | null | undefined, minutes: number | null | undefined) {
  const parts: string[] = [];
  if (time) parts.push(time);
  if (minutes) parts.push(`${minutes} min`);
  return parts.join(" · ");
}

function getFocusOrder(task: { focusOrder?: number | null }) {
  const value = Number(task.focusOrder);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function sortTasks<T extends { scheduledTime?: string | null; focusOrder?: number | null; createdAt?: string }>(tasks: T[]) {
  return [...tasks].sort((left, right) => {
    const leftFocus = getFocusOrder(left) ?? Number.MAX_SAFE_INTEGER;
    const rightFocus = getFocusOrder(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftFocus !== rightFocus) return leftFocus - rightFocus;

    const leftTime = left.scheduledTime || "99:99";
    const rightTime = right.scheduledTime || "99:99";
    if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);

    if (left.createdAt && right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }
    return leftTime.localeCompare(rightTime);
  });
}

function getNextTaskGroup<T extends { title: string; scheduledTime?: string | null; focusOrder?: number | null }>(tasks: T[]) {
  const sorted = sortTasks(tasks);
  const first = sorted[0];
  if (!first) {
    return {
      time: null as string | null,
      items: [] as T[],
    };
  }

  if (getFocusOrder(first)) {
    return {
      time: null,
      items: [first],
    };
  }

  if (!first.scheduledTime) {
    return {
      time: null,
      items: [first],
    };
  }

  return {
    time: first.scheduledTime,
    items: sorted.filter((task) => task.scheduledTime === first.scheduledTime),
  };
}

function buildPrimaryAction(args: {
  hasPendingTasks: boolean;
  hasMood: boolean;
  hasNotes: boolean;
  hasCompletedItems: boolean;
  nextTaskTitle: string | null;
}) {
  if (args.hasPendingTasks) {
    return {
      href: "/calendar",
      label: "Open",
      eyebrow: "Next",
      description: args.nextTaskTitle
        ? `Start with ${args.nextTaskTitle}.`
        : "Start here.",
    };
  }

  if (!args.hasMood) {
    return {
      href: "/mood",
      label: "Log",
      eyebrow: "Mood",
      description: "Quick check-in.",
    };
  }

  if (!args.hasNotes && !args.hasCompletedItems) {
    return {
      href: "/calendar",
      label: "Plan",
      eyebrow: "Plan",
      description: "Set one step.",
    };
  }

  return {
      href: "/calendar",
      label: "Review",
      eyebrow: "Review",
      description: "Review the day.",
    };
  }

export default async function TodayPage() {
  const userEmail = await getOptionalPageEmail();
  if (!userEmail) {
    return <PublicEntryExperience mode="today" />;
  }

  const overview = await getTodayOverviewData(userEmail);
  const moodMeta = getMoodMeta(overview.moodCategory);
  const upcomingTasks = sortTasks(overview.pendingTasks).slice(0, 5);
  const nextTaskGroup = getNextTaskGroup(upcomingTasks);
  const completedItems = sortTasks(overview.completedItems).slice(0, 6);
  const notePreview = overview.quickNotesText.trim();
  const primaryAction = buildPrimaryAction({
    hasPendingTasks: upcomingTasks.length > 0,
    hasMood: Boolean(moodMeta),
    hasNotes: Boolean(notePreview),
    hasCompletedItems: completedItems.length > 0,
    nextTaskTitle:
      nextTaskGroup.items.length > 1 && nextTaskGroup.time
        ? `${nextTaskGroup.items.length} tasks at ${nextTaskGroup.time}`
        : nextTaskGroup.items[0]?.title || null,
  });
  const secondaryLinks = [
    { href: "/habits", label: "Habits" },
    { href: "/mood", label: "Mood" },
  ].filter((item) => item.href !== primaryAction.href);

  return (
    <div className="route-stack">
      <PageSectionIntro title="Today" />

      <section className="today-grid">
        <article className="today-panel today-panel-hero">
          <div className="today-panel-head today-panel-head-hero">
            <div className="today-hero-copy">
              <p className="panel-kicker">{primaryAction.eyebrow}</p>
              <h2>
                {nextTaskGroup.items.length > 1 && nextTaskGroup.time
                  ? `${nextTaskGroup.items.length} tasks at ${nextTaskGroup.time}`
                  : nextTaskGroup.items[0]?.title || "Start here"}
              </h2>
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
              <span className="today-next-label">Next</span>
              {nextTaskGroup.items.length ? (
                <>
                  <strong>
                    {nextTaskGroup.time ||
                      (getFocusOrder(nextTaskGroup.items[0]) ? "Focus" : "Open time")}
                  </strong>
                  <p>
                    {nextTaskGroup.items.length === 1
                      ? formatTaskMeta(
                          nextTaskGroup.items[0].scheduledTime,
                          nextTaskGroup.items[0].estimatedMinutes
                        ) ||
                        (getFocusOrder(nextTaskGroup.items[0])
                          ? "Focus"
                          : "No time set")
                      : `${nextTaskGroup.items.length} tasks`}
                  </p>
                  {nextTaskGroup.items.length > 1 ? (
                    <ul className="today-next-list">
                      {nextTaskGroup.items.map((task) => (
                        <li key={task.id} className="today-next-list-item">
                          <span>{task.title}</span>
                          <small>{task.estimatedMinutes ? `${task.estimatedMinutes} min` : ""}</small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="today-next-single-title">{nextTaskGroup.items[0].title}</p>
                  )}
                </>
              ) : (
                <>
                  <strong>Open time.</strong>
                  <p>Add one task.</p>
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
                        (getFocusOrder(task) ? "Focus" : "No time set")}
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
                {moodMeta.label}
              </p>
              <p className="today-panel-copy">
                {overview.moodNote?.trim() || "Logged."}
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
          {completedItems.length ? (
            <ul className="today-compact-list">
              {completedItems.map((item) => (
                <li key={item.id}>
                  <span>{item.title}</span>
                  <small>{item.meta || (item.kind === "habit" ? "Habit" : "")}</small>
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

      </section>
    </div>
  );
}
