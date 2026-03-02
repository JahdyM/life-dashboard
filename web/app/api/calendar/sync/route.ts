import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import {
  listGoogleEventsAcrossCalendars,
  googleEventToTask,
  type GoogleCalendarEventItem,
} from "@/lib/server/googleCalendar";
import { prisma } from "@/lib/db/prisma";
import { getUserTimeZone } from "@/lib/server/settings";
import { DEFAULT_TIME_ZONE } from "@/lib/constants";
import { rangeQuerySchema } from "@/lib/server/schemas";
import { randomUUID } from "crypto";
import { logServerEvent } from "@/lib/server/logger";
import { ensureTaskCompletionColumns } from "@/lib/server/dbCompat";

export const dynamic = "force-dynamic";

function knownCalendarSyncError(message: string) {
  return (
    message.includes("Google calendar not connected") ||
    message.includes("Google authorization expired") ||
    message.includes("Reconnect your account")
  );
}

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
    await ensureTaskCompletionColumns();
    const items = await listGoogleEventsAcrossCalendars(userEmail, start, end);
    if (!items.length) {
      return jsonOk({ synced: 0 });
    }
    const eventIds = items
      .map((item: GoogleCalendarEventItem) => item.event?.id)
      .filter((value): value is string => Boolean(value));
    const eventKeys = items
      .map((item: GoogleCalendarEventItem) =>
        item.event?.id ? `google:${item.calendarId}:${item.event.id}` : null
      )
      .filter((value): value is string => Boolean(value));
    const calendarIds = Array.from(new Set(items.map((item) => item.calendarId)));
    const existing = await prisma.todoTask.findMany({
      where: {
        userEmail,
        OR: [
          { externalEventKey: { in: eventKeys } },
          {
            googleEventId: { in: eventIds },
            googleCalendarId: { in: calendarIds },
          },
        ],
      },
    });
    const existingByExternalKey = new Map(
      existing
        .filter((item) => Boolean(item.externalEventKey))
        .map((item) => [item.externalEventKey as string, item])
    );
    const existingByLegacyPair = new Map(
      existing
        .filter((item) => Boolean(item.googleEventId))
        .map((item) => [
          `${item.googleCalendarId || "primary"}:${item.googleEventId}`,
          item,
        ])
    );
    const timezone = (await getUserTimeZone(userEmail)) || DEFAULT_TIME_ZONE;
    const nowIso = new Date().toISOString();
    const operations = items
      .filter((item: GoogleCalendarEventItem) => Boolean(item.event?.id))
      .map((item: GoogleCalendarEventItem) => {
        const eventId = item.event.id as string;
        const externalEventKey = `google:${item.calendarId}:${eventId}`;
        const mapped = googleEventToTask(item.event, timezone, {
          calendarId: item.calendarId,
          userEmail,
        });
        const payload = {
          title: mapped.title,
          scheduledDate: mapped.scheduled_date || null,
          scheduledTime: mapped.scheduled_time || null,
          estimatedMinutes: mapped.estimated_minutes ?? null,
          source: mapped.source,
          googleCalendarId: item.calendarId,
          googleEventId: eventId,
          externalEventKey,
        };
        const existingTask =
          existingByExternalKey.get(externalEventKey) ||
          existingByLegacyPair.get(`${item.calendarId}:${eventId}`);
        if (existingTask) {
          const nextSource =
            existingTask.source === "google" ||
            existingTask.source === "google_shared"
              ? payload.source
              : existingTask.source;
          return prisma.todoTask.update({
            where: { id: existingTask.id },
            data: {
              title: payload.title,
              source: nextSource,
              externalEventKey: payload.externalEventKey,
              scheduledDate: payload.scheduledDate,
              scheduledTime: payload.scheduledTime,
              estimatedMinutes: payload.estimatedMinutes,
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
            externalEventKey: payload.externalEventKey,
            scheduledDate: payload.scheduledDate,
            scheduledTime: payload.scheduledTime,
            estimatedMinutes: payload.estimatedMinutes,
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
    return jsonOk({ synced: items.length });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "POST /api/calendar/sync",
      message: "Unhandled error while syncing calendar",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    if (err instanceof Error && err.message) {
      if (knownCalendarSyncError(err.message)) {
        return jsonError(err.message, 400);
      }
      return jsonError(err.message, 500);
    }
    return jsonError("Failed to sync calendar", 500);
  }
}
