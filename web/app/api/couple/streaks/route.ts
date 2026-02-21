import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getSharedStreaks } from "@/lib/server/couple";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const todayIso = new Date().toISOString().slice(0, 10);
    const payload = await getSharedStreaks(userEmail, todayIso);
    return jsonOk(payload);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load couple streaks", 500);
  }
}
