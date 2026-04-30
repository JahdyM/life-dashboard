import Link from "next/link";
import { Suspense } from "react";
import PublicEntryExperience from "@/components/PublicEntryExperience";
import TodayQuickLog, { type TodayMoodOption } from "@/components/today/TodayQuickLog";
import WordOfDay from "@/components/today/WordOfDay";
import MorningCheckin from "@/components/today/MorningCheckin";
import { MOOD_DEFINITIONS, getMoodMeta } from "@/lib/moods";
import { getTodayOverviewData } from "@/lib/server/dashboard";
import { getDashboardOnboardingPreferences } from "@/lib/server/onboarding";
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

function sortTasks<
  T extends { scheduledTime?: string | null; focusOrder?: number | null; createdAt?: string }
>(tasks: T[]) {
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
    return 0;
  });
}

function getNextTaskGroup<T extends { title: string; scheduledTime?: string | null; focusOrder?: number | null }>(
  tasks: T[]
) {
  const sorted = sortTasks(tasks);
  const first = sorted[0];
  if (!first) {
    return { time: null as string | null, items: [] as T[] };
  }

  if (getFocusOrder(first) || !first.scheduledTime) {
    return { time: null, items: [first] };
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
}) {
  if (args.hasPendingTasks) {
    return {
      href: "/calendar",
      label: "Continue",
      description: "Go to your next step.",
    };
  }

  if (!args.hasMood) {
    return {
      href: "/mood",
      label: "Mood",
      description: "Log one quick check-in.",
    };
  }

  if (!args.hasNotes && !args.hasCompletedItems) {
    return {
      href: "/calendar",
      label: "Plan",
      description: "Add one task for today.",
    };
  }

  return {
    href: "/calendar",
    label: "Review",
    description: "Check your day and close the loop.",
  };
}

function formatCompletedMeta(item: { kind: "task" | "habit"; meta: string | null }) {
  if (item.kind === "habit") return "Habit";
  return item.meta || "Task";
}

function buildMoodOptions(
  preferences: Awaited<ReturnType<typeof getDashboardOnboardingPreferences>>
): TodayMoodOption[] {
  const configured = preferences.moods?.length
    ? preferences.moods.filter((mood) => mood.enabled !== false)
    : MOOD_DEFINITIONS.map((mood) => ({
        key: mood.key,
        label: mood.label,
        enabled: true,
      }));
  const byKey = new Map(MOOD_DEFINITIONS.map((mood) => [mood.key, mood]));

  return configured
    .map((mood) => {
      const meta = byKey.get(mood.key);
      if (!meta) return null;
      return {
        key: meta.key,
        label: mood.label || meta.label,
        emoji: meta.emoji,
        color: meta.color,
      };
    })
    .filter((mood): mood is TodayMoodOption => Boolean(mood));
}

export default async function TodayPage() {
  const userEmail = await getOptionalPageEmail();
  if (!userEmail) {
    return <PublicEntryExperience mode="today" />;
  }

  const [overview, preferences] = await Promise.all([
    getTodayOverviewData(userEmail),
    getDashboardOnboardingPreferences(userEmail),
  ]);
  const moodMeta = getMoodMeta(overview.moodCategory);
  const pendingTasks = sortTasks(overview.pendingTasks);
  const nextTaskGroup = getNextTaskGroup(pendingTasks);
  const completedItems = overview.completedItems.slice(0, 8);
  const pendingPreview = pendingTasks.slice(0, 6);
  const notePreview = overview.quickNotesText.trim();
  const moodOptions = buildMoodOptions(preferences);
  const sleepLabel =
    overview.sleepHours === null || overview.sleepHours === undefined
      ? "Sleep not logged"
      : `${overview.sleepHours}h sleep`;

  const primaryAction = buildPrimaryAction({
    hasPendingTasks: pendingTasks.length > 0,
    hasMood: Boolean(moodMeta),
    hasNotes: Boolean(notePreview),
    hasCompletedItems: completedItems.length > 0,
  });

  return (
    <div className="route-stack">
      <MorningCheckin />

      <section className="today-panel today-panel-hero">
        <div className="today-panel-head today-panel-head-hero">
          <div className="today-hero-copy">
            <p className="panel-kicker">Today</p>
            <h2>
              {nextTaskGroup.items.length > 1 && nextTaskGroup.time
                ? `${nextTaskGroup.items.length} tasks at ${nextTaskGroup.time}`
                : nextTaskGroup.items[0]?.title || "Calm start"}
            </h2>
            <p className="today-panel-copy">
              {pendingTasks.length ? primaryAction.description : "Mood, sleep, tasks, done."}
            </p>
            <div className="today-primary-actions">
              <Link href={primaryAction.href} className="page-link primary">
                {primaryAction.label}
              </Link>
              <Link href="/calendar" className="page-link inline muted">
                Calendar
              </Link>
              {!preferences.completed ? (
                <Link href="/onboarding" className="page-link inline muted">
                  Customize
                </Link>
              ) : null}
            </div>
          </div>

          <div className="today-next-card">
            <span className="today-next-label">Day</span>
            <strong>{pendingTasks.length} pending</strong>
            <p>{completedItems.length} done</p>
            <p>{sleepLabel}</p>
            {moodMeta ? (
              <p className="today-next-single-title">
                {moodMeta.emoji} {moodMeta.label}
              </p>
            ) : (
              <p className="today-next-single-title">No mood yet</p>
            )}
          </div>
        </div>

        {nextTaskGroup.items.length ? (
          <ul className="today-task-list">
            {nextTaskGroup.items.map((task) => (
              <li key={task.id} className="today-task-item">
                <div>
                  <p className="today-task-title">{task.title}</p>
                  <p className="today-task-meta">
                    {formatTaskMeta(task.scheduledTime, task.estimatedMinutes) ||
                      (getFocusOrder(task) ? "Focus" : "No time set")}
                  </p>
                </div>
                <span className="today-task-state">Next</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="today-empty">
            <p>No pending tasks.</p>
          </div>
        )}
      </section>

      <section className="today-grid">
        <TodayQuickLog
          todayIso={overview.todayIso}
          initialMoodCategory={overview.moodCategory}
          initialSleepHours={overview.sleepHours}
          moodOptions={moodOptions}
        />

        <article className="today-panel">
          <div className="today-panel-head compact">
            <div>
              <p className="panel-kicker">Plan</p>
              <h2>Tasks</h2>
            </div>
            <Link href="/calendar" className="page-link inline muted">
              Open
            </Link>
          </div>
          {pendingPreview.length ? (
            <ul className="today-compact-list">
              {pendingPreview.map((task) => (
                <li key={task.id}>
                  <span>{task.title}</span>
                  <small>
                    {formatTaskMeta(task.scheduledTime, task.estimatedMinutes) ||
                      (getFocusOrder(task) ? "Next" : "No time")}
                  </small>
                </li>
              ))}
              {pendingTasks.length > pendingPreview.length ? (
                <li>
                  <span>+{pendingTasks.length - pendingPreview.length} more</span>
                  <small>Calendar</small>
                </li>
              ) : null}
            </ul>
          ) : (
            <div className="today-empty">
              <p>No pending tasks.</p>
            </div>
          )}
        </article>

        <article className="today-panel">
          <div className="today-panel-head compact">
            <div>
              <p className="panel-kicker">Completed</p>
              <h2>Done</h2>
            </div>
            <Link href="/calendar" className="page-link inline muted">
              Open
            </Link>
          </div>
          {completedItems.length ? (
            <ul className="today-compact-list">
              {completedItems.map((item) => (
                <li key={item.id}>
                  <span>{item.title}</span>
                  <small>{formatCompletedMeta(item)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <div className="today-empty">
              <p>Nothing done yet.</p>
            </div>
          )}
        </article>

        <article className="today-panel">
          <div className="today-panel-head compact">
            <div>
              <p className="panel-kicker">Notes</p>
              <h2>Notes</h2>
            </div>
            <Link href="/calendar" className="page-link inline muted">
              Open
            </Link>
          </div>
          {notePreview ? (
            <p className="today-note-preview">{notePreview}</p>
          ) : (
            <div className="today-empty">
              <p>No notes yet.</p>
            </div>
          )}
        </article>
      </section>

      <section className="today-grid" style={{ marginTop: 0 }}>
        <Suspense>
          <WordOfDay />
        </Suspense>
      </section>
    </div>
  );
}
