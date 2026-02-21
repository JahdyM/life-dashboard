import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { getDailyEntry, updateDailyEntry } from "@/lib/server/habits";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";

export async function GET(
  _request: NextRequest,
  context: { params: { date: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const dateIso = context.params.date;
    const entry = await getDailyEntry(userEmail, dateIso);
    return jsonOk({ entry });
  } catch (err) {
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
    const dateIso = context.params.date;
    const payload = await request.json();
    const entry = await updateDailyEntry(userEmail, dateIso, payload);
    return jsonOk({ entry });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update entry", 500);
  }
}
