import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { buildHeaderSnapshot } from "@/lib/server/header";
import {
  getFamilyWorshipDay,
  getMeetingDays,
  getTodayIsoForUser,
  getUserTimeZone,
} from "@/lib/server/settings";
import { prisma } from "@/lib/db/prisma";
import { logServerEvent } from "@/lib/server/logger";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const todayIso = await getTodayIsoForUser(userEmail);
    const [header, meetingDays, familyWorshipDay, timezone] = await Promise.all([
      buildHeaderSnapshot(userEmail, todayIso),
      getMeetingDays(userEmail),
      getFamilyWorshipDay(userEmail),
      getUserTimeZone(userEmail),
    ]);
    const pendingTasks = await prisma.todoTask.count({
      where: {
        userEmail,
        isDone: 0,
        scheduledDate: todayIso,
      },
    });
    return jsonOk({
      header,
      meeting_days: meetingDays,
      family_worship_day: familyWorshipDay,
      pending_tasks: pendingTasks,
      timezone,
    });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/init",
      message: "Unhandled error while loading init payload",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load init", 500);
  }
}
