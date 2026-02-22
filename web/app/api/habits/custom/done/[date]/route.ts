import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getCustomHabitDone, setCustomHabitDone } from "@/lib/server/settings";
import { customHabitDoneSchema, dateParamSchema } from "@/lib/server/schemas";
import { zodErrorMessage } from "@/lib/server/response";

export async function GET(
  _request: NextRequest,
  context: { params: { date: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const paramsParsed = dateParamSchema.safeParse(context.params);
    if (!paramsParsed.success) return jsonError(zodErrorMessage(paramsParsed.error), 400);
    const payload = await getCustomHabitDone(userEmail, paramsParsed.data.date);
    return jsonOk({ done: payload });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load custom habits", 500);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: { date: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const paramsParsed = dateParamSchema.safeParse(context.params);
    if (!paramsParsed.success) return jsonError(zodErrorMessage(paramsParsed.error), 400);
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = customHabitDoneSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    await setCustomHabitDone(userEmail, paramsParsed.data.date, parsed.data.done);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update custom habits", 500);
  }
}
