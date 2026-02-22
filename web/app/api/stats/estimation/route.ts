import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { estimationStatsQuerySchema } from "@/lib/server/schemas";
import { getEstimationStats } from "@/lib/server/stats/estimation";
import { logServerEvent } from "@/lib/server/logger";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const parsed = estimationStatsQuerySchema.safeParse({
      period: searchParams.get("period") || "90d",
    });
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }
    const payload = await getEstimationStats(userEmail, parsed.data.period);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/stats/estimation",
      message: "Unhandled error while loading estimation analytics",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load estimation analytics", 500);
  }
}
