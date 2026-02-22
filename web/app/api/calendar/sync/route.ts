import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import {
  listGoogleEvents,
  googleEventToTask,
  type GoogleCalendarEvent,
} from "@/lib/server/googleCalendar";
import { prisma } from "@/lib/db/prisma";
import { getUserTimeZone } from "@/lib/server/settings";
import { DEFAULT_TIME_ZONE } from "@/lib/constants";
import { rangeQuerySchema } from "@/lib/server/schemas";
import { randomUUID } from "crypto";
import { logServerEvent } from "@/lib/server/logger";

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
    const eventIds = events
      .map((event: GoogleCalendarEvent) => event.id)
      .filter((value): value is string => Boolean(value));
    const existing = await prisma.todoTask.findMany({
      where: {
        userEmail,
        googleEventId: { in: eventIds },
      },
    });
    const existingMap = new Map(existing.map((item) => [item.googleEventId, item]));
    const timezone = (await getUserTimeZone(userEmail)) || DEFAULT_TIME_ZONE;
    const nowIso = new Date().toISOString();
    const operations = events
      .filter((event: GoogleCalendarEvent) => Boolean(event?.id))
      .map((event: GoogleCalendarEvent) => {
        const eventId = event.id as string;
        const mapped = googleEventToTask(event, timezone);
        const payload = {
          title: mapped.title,
          scheduledDate: mapped.scheduled_date || null,
          scheduledTime: mapped.scheduled_time || null,
          source: "google",
          googleCalendarId: "primary",
          googleEventId: eventId,
        };
        if (existingMap.has(eventId)) {
          return prisma.todoTask.update({
            where: { id: existingMap.get(eventId)!.id },
            data: {
              title: payload.title,
              source: payload.source,
              scheduledDate: payload.scheduledDate,
              scheduledTime: payload.scheduledTime,
              googleCalendarId: payload.googleCalendarId,
              googleEventId: payload.googleEventId,
              updatedAt: nowIso,
            },
          });
        }
        return prisma.todoTask.create({
          data: {
            id: randomUUID(),
            userEmail,
            title: payload.title,
            source: payload.source,
            scheduledDate: payload.scheduledDate,
            scheduledTime: payload.scheduledTime,
            priorityTag: "Medium",
            isDone: 0,
            googleCalendarId: payload.googleCalendarId,
            googleEventId: payload.googleEventId,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        });
      });
    if (operations.length > 0) {
      await prisma.$transaction(operations);
    }
    return jsonOk({ synced: events.length });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "POST /api/calendar/sync",
      message: "Unhandled error while syncing calendar",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to sync calendar", 500);
  }
}
