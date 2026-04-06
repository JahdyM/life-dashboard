import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { createMoodMoment, getMoodHistory } from "@/lib/server/mood";
import { moodMomentCreateSchema } from "@/lib/server/schemas";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const payload = await getMoodHistory(userEmail);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/mood",
      message: "Unhandled error while loading mood history",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load mood history", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = moodMomentCreateSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }
    const payload = await createMoodMoment(userEmail, {
      dayIso: parsed.data.day_iso,
      loggedTime: parsed.data.logged_time,
      moodCategory: parsed.data.mood_category,
      moodNote: parsed.data.mood_note || null,
    });
    return jsonOk(payload, 201);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "POST /api/mood",
      message: "Unhandled error while creating mood moment",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save mood", 500);
  }
}
