import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { getEveningCheckin, saveEveningCheckin } from "@/lib/server/checkin";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const date = new URL(request.url).searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const data = await getEveningCheckin(userEmail, date);
    return jsonOk({ data });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load evening check-in", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const body = await request.json();
    const date = String(body.date || new Date().toISOString().slice(0, 10));
    const energy = String(body.energy || "").trim();
    const wentWell = String(body.wentWell || "").trim();
    const tomorrow = String(body.tomorrow || "").trim();
    if (!date || !energy || !wentWell || !tomorrow) {
      return jsonError("Missing check-in fields", 400);
    }
    const data = { date, energy, wentWell, tomorrow, completedAt: new Date().toISOString() };
    await saveEveningCheckin(userEmail, data);
    return jsonOk({ ok: true, data });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save evening check-in", 500);
  }
}
