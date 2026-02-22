import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { getCoupleMoodboard } from "@/lib/server/couple";
import { coupleMoodboardQuerySchema } from "@/lib/server/schemas";
import { logServerEvent } from "@/lib/server/logger";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const parsed = coupleMoodboardQuerySchema.safeParse({
      range: searchParams.get("range") || undefined,
      month: searchParams.get("month") || undefined,
    });
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    const { range, month } = parsed.data;
    const payload = await getCoupleMoodboard(userEmail, range, month);
    return jsonOk(payload);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/couple/moodboard",
      message: "Unhandled error while loading couple moodboard",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load moodboard", 500);
  }
}
