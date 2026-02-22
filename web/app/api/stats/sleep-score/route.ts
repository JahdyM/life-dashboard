import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getSleepScore } from "@/lib/server/stats/behavior";
import { logServerEvent } from "@/lib/server/logger";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const payload = await getSleepScore(userEmail);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/stats/sleep-score",
      message: "Unhandled error while loading sleep score",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load sleep score", 500);
  }
}
