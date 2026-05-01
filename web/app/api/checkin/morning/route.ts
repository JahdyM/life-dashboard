import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getMorningCheckin, saveMorningCheckin, getCheckinStreak, getEveningCheckin } from "@/lib/server/checkin";
import { addPointsOnce, POINTS } from "@/lib/server/rewards";

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
    const base = await addPointsOnce(userEmail, `morning_checkin::${data.date}`, POINTS.morningCheckin);
    let earned = base.awarded;
    let points = base.balance;

    // Full-day bonus if evening check-in already done
    const eveningAlreadyDone = await getEveningCheckin(userEmail, data.date);
    if (eveningAlreadyDone) {
      const fullDay = await addPointsOnce(userEmail, `full_day::${data.date}`, POINTS.fullDayBonus);
      earned += fullDay.awarded;
      points = fullDay.balance;
    }

    // Streak milestone bonuses (awarded once per milestone)
    if (streak === 7 || streak === 14 || streak === 30 || streak === 60 || streak === 100) {
      const bonus = streak >= 100 ? 50 : streak >= 60 ? 30 : streak >= 30 ? 20 : streak >= 14 ? 15 : 10;
      const bonusResult = await addPointsOnce(userEmail, `streak_bonus::${streak}d::${data.date}`, bonus);
      earned += bonusResult.awarded;
      points = bonusResult.balance;
    }
    return jsonOk({ ok: true, streak, points, earned });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save check-in", 500);
  }
}
