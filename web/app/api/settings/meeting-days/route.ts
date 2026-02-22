import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getMeetingDays, setMeetingDays } from "@/lib/server/settings";
import { meetingDaysSchema } from "@/lib/server/schemas";
import { zodErrorMessage } from "@/lib/server/response";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const days = await getMeetingDays(userEmail);
    return jsonOk({ days });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load meeting days", 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = meetingDaysSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    await setMeetingDays(userEmail, parsed.data.days);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update meeting days", 500);
  }
}
