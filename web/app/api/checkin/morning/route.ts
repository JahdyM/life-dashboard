import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getMorningCheckin, saveMorningCheckin, getCheckinStreak } from "@/lib/server/checkin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const date = new URL(request.url).searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const data = await getMorningCheckin(userEmail, date);
    const streak = data ? await getCheckinStreak(userEmail, date) : 0;
    return jsonOk({ data, streak });
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
    const data = { ...body, completedAt: new Date().toISOString() };
    await saveMorningCheckin(userEmail, data);
    const streak = await getCheckinStreak(userEmail, data.date);
    return jsonOk({ ok: true, streak });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save check-in", 500);
  }
}
