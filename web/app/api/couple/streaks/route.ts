import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getSharedStreaks } from "@/lib/server/couple";
import { getTodayIsoForUser } from "@/lib/server/settings";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const todayIso = await getTodayIsoForUser(userEmail);
    const payload = await getSharedStreaks(userEmail, todayIso);
    return jsonOk(payload);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load couple streaks", 500);
  }
}
