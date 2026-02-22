import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { coupleAnalyticsQuerySchema } from "@/lib/server/schemas";
import { getCoupleComparison } from "@/lib/server/stats/behavior";
import { logServerEvent } from "@/lib/server/logger";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const parsed = coupleAnalyticsQuerySchema.safeParse({
      days: searchParams.get("days") || 30,
    });
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }
    const payload = await getCoupleComparison(userEmail, parsed.data.days);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/couple/analytics",
      message: "Unhandled error while loading couple analytics",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load couple analytics", 500);
  }
}
