import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { getDailyEntry, updateDailyEntry } from "@/lib/server/habits";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { dateParamSchema, dayPatchSchema } from "@/lib/server/schemas";
import { logServerEvent } from "@/lib/server/logger";
import { addPointsOnce, POINTS } from "@/lib/server/rewards";
import { getHabitField } from "@/lib/config/habits";
import { updateSpiritualStreakEntry } from "@/lib/server/spiritualStreaks";
import { getFixedHabitTaskTitles, syncHabitAgendaTasks } from "@/lib/server/habitTaskSync";
import type { SpiritualStreakBoardKey } from "@/lib/types";

// Shared habit keys that map to boolish DB fields (excludes metrics)
const SHARED_HABIT_PATCH_KEYS = new Set([
  "bible_reading", "bible_study", "dissertation_work", "workout",
  "general_reading", "shower", "daily_text", "meeting_attended",
  "prepare_meeting", "family_worship", "writing", "scientific_writing",
  "prayer_on_waking",
]);

// Map daily-habit keys to spiritual streak boards. When the habit is toggled,
// the matching streak board entry is mirrored automatically — so checking
// "Bible reading" on the daily Habits screen also lights up that day's
// success on the Spiritual Streaks page (and vice-versa cleanup on untoggle).
const HABIT_TO_STREAK_BOARD: Record<string, SpiritualStreakBoardKey> = {
  bible_reading: "bible_reading",
  bible_study: "bible_reading",
  daily_text: "daily_text",
  prayer_on_waking: "prayer_on_waking",
};

function isoMonthKey(dateIso: string) {
  return dateIso.slice(0, 7);
}

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: { date: string } }
) {
  try {
    const userEmail = await requireUserEmail(request);
    const paramsParsed = dateParamSchema.safeParse(context.params);
    if (!paramsParsed.success) return jsonError(zodErrorMessage(paramsParsed.error), 400);
    const dateIso = paramsParsed.data.date;
    const entry = await getDailyEntry(userEmail, dateIso);
    return jsonOk({ entry });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/day/[date]",
      message: "Unhandled error while loading day entry",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load entry", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: { date: string } }
) {
  try {
    const userEmail = await requireUserEmail(request);
    const paramsParsed = dateParamSchema.safeParse(context.params);
    if (!paramsParsed.success) return jsonError(zodErrorMessage(paramsParsed.error), 400);
    const dateIso = paramsParsed.data.date;
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = dayPatchSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    const payload = { ...parsed.data } as Record<string, unknown>;
    if (Array.isArray(payload.mood_tags_json)) {
      payload.mood_tags_json = JSON.stringify(payload.mood_tags_json);
    }

    // Snapshot old values for any habit fields about to be toggled ON
    const habitKeysBeingSetOn = Object.entries(payload)
      .filter(([k, v]) => SHARED_HABIT_PATCH_KEYS.has(k) && (v === 1 || v === true))
      .map(([k]) => k);

    let oldEntry: Awaited<ReturnType<typeof getDailyEntry>> | null = null;
    if (habitKeysBeingSetOn.length > 0) {
      oldEntry = await getDailyEntry(userEmail, dateIso);
    }

    const entry = await updateDailyEntry(userEmail, dateIso, payload);

    // Award +2 per shared habit that just turned ON (idempotent via ledger)
    if (oldEntry && habitKeysBeingSetOn.length > 0) {
      await Promise.all(
        habitKeysBeingSetOn
          .filter((k) => {
            const field = getHabitField(k);
            return field && !oldEntry![field as keyof typeof oldEntry];
          })
          .map((k) =>
            addPointsOnce(userEmail, `habit::shared::${dateIso}::${k}`, POINTS.sharedHabit)
          )
      );
    }

    // Mirror habit toggles into the matching spiritual-streak board for the
    // same day, so the streak page never falls out of sync with the habit
    // page. Best-effort: a streak failure should never block the habit save.
    const monthKey = isoMonthKey(dateIso);
    await Promise.all(
      Object.entries(payload)
        .filter(([key]) => key in HABIT_TO_STREAK_BOARD)
        .map(async ([key, value]) => {
          const boardKey = HABIT_TO_STREAK_BOARD[key];
          const truthy = value === 1 || value === true;
          const falsy = value === 0 || value === false;
          // value !== undefined when present in payload; if neither truthy nor
          // falsy (e.g. an unexpected string), skip rather than guess.
          if (!truthy && !falsy) return;
          try {
            await updateSpiritualStreakEntry({
              userEmail,
              boardKey,
              monthKey,
              date: dateIso,
              success: truthy ? true : null,
            });
          } catch (error) {
            logServerEvent("warn", {
              endpoint: "PATCH /api/day/[date]",
              message: "Failed to mirror habit into spiritual streak board",
              error,
              meta: { habitKey: key, boardKey, dateIso },
            });
          }
        })
    );

    // Keep habit agenda tasks in the same state as the habit itself. This is
    // what makes catch-up, Habits, Calendar, and completed lists agree.
    await Promise.all(
      Object.entries(payload)
        .filter(([key]) => SHARED_HABIT_PATCH_KEYS.has(key))
        .map(async ([key, value]) => {
          const truthy = value === 1 || value === true;
          const falsy = value === 0 || value === false;
          if (!truthy && !falsy) return;
          const titles = getFixedHabitTaskTitles(key);
          if (!titles.length) return;
          try {
            await syncHabitAgendaTasks({
              userEmail,
              dateIso,
              titles,
              done: truthy,
            });
          } catch (error) {
            logServerEvent("warn", {
              endpoint: "PATCH /api/day/[date]",
              message: "Failed to sync fixed habit agenda tasks",
              error,
              meta: { habitKey: key, dateIso },
            });
          }
        })
    );

    return jsonOk({ entry });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PATCH /api/day/[date]",
      message: "Unhandled error while updating day entry",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update entry", 500);
  }
}
