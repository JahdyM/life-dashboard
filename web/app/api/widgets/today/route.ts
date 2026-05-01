import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getTodayOverviewData } from "@/lib/server/dashboard";
import { getMorningCheckin, getEveningCheckin, getCheckinStreak } from "@/lib/server/checkin";
import { getRewardsState } from "@/lib/server/rewards";
import { getMoodMeta } from "@/lib/moods";

export const dynamic = "force-dynamic";

/**
 * Single endpoint optimized for widgets / external clients.
 * Returns a compact snapshot of "today" — everything Scriptable, Shortcuts,
 * or Alexa would need to render a tile or answer "what's on today".
 *
 * Auth: Bearer token (preferred) or cookie session.
 */
export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail(request);
    const overview = await getTodayOverviewData(userEmail);

    const [morning, evening, rewards] = await Promise.all([
      getMorningCheckin(userEmail, overview.todayIso),
      getEveningCheckin(userEmail, overview.todayIso),
      getRewardsState(userEmail, overview.todayIso),
    ]);
    const checkinStreak = await getCheckinStreak(userEmail, overview.todayIso);

    const sortedPending = [...overview.pendingTasks].sort((a, b) => {
      const at = a.scheduledTime || "99:99";
      const bt = b.scheduledTime || "99:99";
      return at.localeCompare(bt);
    });

    const nextTask = sortedPending[0]
      ? {
          id: sortedPending[0].id,
          title: sortedPending[0].title,
          scheduledTime: sortedPending[0].scheduledTime ?? null,
          estimatedMinutes: sortedPending[0].estimatedMinutes ?? null,
        }
      : null;

    const moodMeta = getMoodMeta(overview.moodCategory);

    return jsonOk({
      date: overview.todayIso,
      mood: moodMeta
        ? { key: overview.moodCategory, label: moodMeta.label, emoji: moodMeta.emoji }
        : null,
      sleepHours: overview.sleepHours,
      habits: {
        completed: overview.header.habits_completed,
        total: overview.header.habits_total,
        percent: overview.header.habits_percent,
      },
      tasks: {
        pending: overview.pendingTasks.length,
        completed: overview.completedTasks.length,
        nextTask,
        upcoming: sortedPending.slice(0, 5).map((t) => ({
          id: t.id,
          title: t.title,
          scheduledTime: t.scheduledTime ?? null,
        })),
      },
      checkin: {
        morningDone: Boolean(morning),
        eveningDone: Boolean(evening),
        morningPriority: morning?.priority ?? null,
        morningIntention: morning?.intention ?? null,
        streakDays: checkinStreak,
      },
      rewards: {
        points: rewards.points,
        streakFreezes: rewards.streakFreezes,
        freezeCost: rewards.freezeCost,
        progressToNextFreeze: Math.min(
          1,
          rewards.points / Math.max(rewards.freezeCost, 1)
        ),
      },
    });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load widget data", 500);
  }
}
