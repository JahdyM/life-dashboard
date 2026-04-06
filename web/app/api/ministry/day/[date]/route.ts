import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { setMinistryDayEntry } from "@/lib/server/ministry";
import { dateParamSchema, ministryDayEntrySchema } from "@/lib/server/schemas";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  context: { params: { date: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const dateParsed = dateParamSchema.safeParse(context.params);
    if (!dateParsed.success) {
      return jsonError(zodErrorMessage(dateParsed.error), 400);
    }

    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_error) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = ministryDayEntrySchema.safeParse(rawPayload);
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }

    const entry = await setMinistryDayEntry(userEmail, dateParsed.data.date, {
      goalMinutes: parsed.data.goal_minutes,
      actualMinutes: parsed.data.actual_minutes,
      notes: parsed.data.notes,
    });

    return jsonOk({ entry });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PUT /api/ministry/day/[date]",
      message: "Unhandled error while saving ministry day entry",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save ministry day", 500);
  }
}
