import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { weeklyReportQuerySchema } from "@/lib/server/schemas";
import { getWeeklyReport } from "@/lib/server/stats/behavior";
import { logServerEvent } from "@/lib/server/logger";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const parsed = weeklyReportQuerySchema.safeParse({
      week: searchParams.get("week") || undefined,
    });
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }
    const payload = await getWeeklyReport(userEmail, parsed.data.week);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/stats/weekly-report",
      message: "Unhandled error while loading weekly report",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load weekly report", 500);
  }
}
