import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getWeeklyCheckin, saveWeeklyCheckin } from "@/lib/server/coupleSettings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const week = searchParams.get("week");
    if (!week) return jsonError("week required", 400);
    const text = await getWeeklyCheckin(userEmail, week);
    return jsonOk({ text });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load check-in", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const body = await request.json();
    const { week, text } = body;
    if (!week) return jsonError("week required", 400);
    await saveWeeklyCheckin(userEmail, String(week), String(text || ""));
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save check-in", 500);
  }
}
