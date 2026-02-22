import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { anxietyTrendQuerySchema } from "@/lib/server/schemas";
import { getAnxietyTrend } from "@/lib/server/stats/behavior";
import { logServerEvent } from "@/lib/server/logger";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const parsed = anxietyTrendQuerySchema.safeParse({
      days: searchParams.get("days") || "90",
    });
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }
    const periodDays = Number(parsed.data.days) as 30 | 90;
    const payload = await getAnxietyTrend(userEmail, periodDays);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/stats/anxiety-trend",
      message: "Unhandled error while loading anxiety trend",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load anxiety trend", 500);
  }
}
