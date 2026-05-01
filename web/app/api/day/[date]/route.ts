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

// Shared habit keys that map to boolish DB fields (excludes metrics)
const SHARED_HABIT_PATCH_KEYS = new Set([
  "bible_reading", "bible_study", "dissertation_work", "workout",
  "general_reading", "shower", "daily_text", "meeting_attended",
  "prepare_meeting", "family_worship", "writing", "scientific_writing",
]);

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
