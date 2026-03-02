import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { statsPeriodQuerySchema } from "@/lib/server/schemas";
import { getMoodHabitCorrelations } from "@/lib/server/stats/behavior";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const parsed = statsPeriodQuerySchema.safeParse({
      period: searchParams.get("period") || "90d",
    });
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }
    const payload = await getMoodHabitCorrelations(userEmail, parsed.data.period);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/stats/correlations",
      message: "Unhandled error while loading mood x habits correlations",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load correlation analytics", 500);
  }
}
