import { requireUserEmail } from "@/lib/server/auth";
import { getSpiritualGoalsPageData } from "@/lib/server/spiritualGoals";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userEmail = await requireUserEmail();
    const payload = await getSpiritualGoalsPageData(userEmail);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/spiritual-goals",
      message: "Unhandled error while loading spiritual goals",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load spiritual goals", 500);
  }
}
