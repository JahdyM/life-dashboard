import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getCoupleMoodboard } from "@/lib/server/couple";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const range = (searchParams.get("range") || "month") as "month" | "year";
    const month = searchParams.get("month") || undefined;
    const payload = await getCoupleMoodboard(userEmail, range, month);
    return jsonOk(payload);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load moodboard", 500);
  }
}
