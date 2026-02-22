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

export async function GET(
  _request: NextRequest,
  context: { params: { date: string } }
) {
  try {
    const userEmail = await requireUserEmail();
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
    const userEmail = await requireUserEmail();
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
    const entry = await updateDailyEntry(userEmail, dateIso, payload);
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
