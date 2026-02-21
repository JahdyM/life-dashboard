import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getUserTimeZone, setUserTimeZone } from "@/lib/server/settings";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const timezone = await getUserTimeZone(userEmail);
    return jsonOk({ timezone });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load timezone", 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const payload = await request.json();
    const timezone = String(payload?.timezone || "").trim();
    if (!timezone) return jsonError("Missing timezone", 400);
    await setUserTimeZone(userEmail, timezone);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update timezone", 500);
  }
}
