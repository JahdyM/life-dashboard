import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getLifeBalanceScore } from "@/lib/server/stats/behavior";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const payload = await getLifeBalanceScore(userEmail);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/stats/life-balance",
      message: "Unhandled error while loading life balance score",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load life balance score", 500);
  }
}
