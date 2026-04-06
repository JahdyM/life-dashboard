import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { logServerEvent } from "@/lib/server/logger";
import { handleAuthError, jsonError, jsonOk, zodErrorMessage } from "@/lib/server/response";
import { spiritualStreakMonthQuerySchema } from "@/lib/server/schemas";
import { getSpiritualStreaksPageData } from "@/lib/server/spiritualStreaks";
import { getTodayIsoForUser } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const fallbackMonth = (await getTodayIsoForUser(userEmail)).slice(0, 7);
    const parsed = spiritualStreakMonthQuerySchema.safeParse({
      month: searchParams.get("month") || fallbackMonth,
    });
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    const payload = await getSpiritualStreaksPageData(userEmail, parsed.data.month);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/spiritual-streaks",
      message: "Unhandled error while loading spiritual streaks",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load spiritual streaks", 500);
  }
}
