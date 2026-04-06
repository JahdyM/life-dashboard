import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { setMinistryMonthlyGoal } from "@/lib/server/ministry";
import { ministryMonthlyGoalSchema } from "@/lib/server/schemas";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_error) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = ministryMonthlyGoalSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }

    const goal = await setMinistryMonthlyGoal(
      userEmail,
      parsed.data.month,
      parsed.data.target_minutes
    );

    return jsonOk({ goal });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PUT /api/ministry/monthly-goal",
      message: "Unhandled error while saving ministry monthly goal",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save monthly goal", 500);
  }
}
