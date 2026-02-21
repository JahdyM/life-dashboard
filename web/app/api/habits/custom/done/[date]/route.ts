import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getCustomHabitDone, setCustomHabitDone } from "@/lib/server/settings";

export async function GET(
  _request: NextRequest,
  context: { params: { date: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const payload = await getCustomHabitDone(userEmail, context.params.date);
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
    const body = await request.json();
    await setCustomHabitDone(userEmail, context.params.date, body?.done || {});
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update custom habits", 500);
  }
}
