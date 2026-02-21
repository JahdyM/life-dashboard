import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getMeetingDays, setMeetingDays } from "@/lib/server/settings";

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
    const payload = await request.json();
    await setMeetingDays(userEmail, payload.days || []);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update meeting days", 500);
  }
}
