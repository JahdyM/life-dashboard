import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { listGoogleEvents, googleEventToTask } from "@/lib/server/googleCalendar";
import { createTask, updateTask } from "@/lib/server/tasks";
import { prisma } from "@/lib/db/prisma";
import { getUserTimeZone } from "@/lib/server/settings";
import { DEFAULT_TIME_ZONE } from "@/lib/constants";
import { rangeQuerySchema } from "@/lib/server/schemas";

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = rangeQuerySchema.safeParse(rawBody);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    const { start, end } = parsed.data;
    const events = await listGoogleEvents(userEmail, start, end, "primary");
    const eventIds = events.map((event: any) => event.id).filter(Boolean);
    const existing = await prisma.todoTask.findMany({
      where: {
        userEmail,
        googleEventId: { in: eventIds },
      },
    });
    const existingMap = new Map(existing.map((item) => [item.googleEventId, item]));
    const timezone = (await getUserTimeZone(userEmail)) || DEFAULT_TIME_ZONE;
    for (const event of events) {
      if (!event?.id) continue;
      const mapped = googleEventToTask(event, timezone);
      const payload = {
        title: mapped.title,
        scheduledDate: mapped.scheduled_date || null,
        scheduledTime: mapped.scheduled_time || null,
        source: "google",
        googleCalendarId: "primary",
        googleEventId: event.id,
      } as any;
      if (existingMap.has(event.id)) {
        await updateTask(userEmail, existingMap.get(event.id)!.id, payload);
      } else {
        await createTask(userEmail, payload);
      }
    }
    return jsonOk({ synced: events.length });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to sync calendar", 500);
  }
}
