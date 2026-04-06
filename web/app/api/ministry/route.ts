import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { getTodayIsoForUser } from "@/lib/server/settings";
import { getMinistryMonthData } from "@/lib/server/ministry";
import { ministryMonthQuerySchema } from "@/lib/server/schemas";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const todayIso = await getTodayIsoForUser(userEmail);
    const parsed = ministryMonthQuerySchema.safeParse({
      month: searchParams.get("month") || todayIso.slice(0, 7),
    });
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }
    const payload = await getMinistryMonthData(userEmail, parsed.data.month);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/ministry",
      message: "Unhandled error while loading ministry month data",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load ministry hours", 500);
  }
}
