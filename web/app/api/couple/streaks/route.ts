import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getSharedStreaks } from "@/lib/server/couple";
import { getTodayIsoForUser } from "@/lib/server/settings";
import { logServerEvent } from "@/lib/server/logger";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const todayIso = await getTodayIsoForUser(userEmail);
    const payload = await getSharedStreaks(userEmail, todayIso);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/couple/streaks",
      message: "Unhandled error while loading couple streaks",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load couple streaks", 500);
  }
}
