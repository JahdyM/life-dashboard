import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getRewardsState, purchaseStreakFreeze, spendGenericGraceDay, applyMorningGraceDay } from "@/lib/server/rewards";

export const dynamic = "force-dynamic";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail(request);
    const date = new URL(request.url).searchParams.get("date") || todayIso();
    return jsonOk(await getRewardsState(userEmail, date));
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load rewards", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail(request);
    const body = await request.json();
    const action = String(body.action || "");
    const date = String(body.date || todayIso());
    if (action === "purchase_freeze") {
      await purchaseStreakFreeze(userEmail);
      return jsonOk(await getRewardsState(userEmail, date));
    }
    if (action === "use_morning_grace") {
      await applyMorningGraceDay(userEmail, date);
      return jsonOk(await getRewardsState(userEmail, date));
    }
    if (action === "spend_grace") {
      await spendGenericGraceDay(userEmail);
      return jsonOk(await getRewardsState(userEmail, date));
    }
    return jsonError("Invalid reward action", 400);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    if (err instanceof Error && err.message === "NOT_ENOUGH_POINTS") return jsonError("Not enough points", 400);
    if (err instanceof Error && err.message === "NO_FREEZES") return jsonError("No streak freezes available", 400);
    if (err instanceof Error && err.message === "GRACE_NOT_AVAILABLE") return jsonError("Grace day not available", 400);
    return jsonError("Failed to update rewards", 500);
  }
}
