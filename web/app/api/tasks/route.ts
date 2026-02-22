import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { createTask, listTasks } from "@/lib/server/tasks";
import {
  listGoogleEvents,
  googleEventToTask,
  createGoogleEvent,
  type GoogleCalendarEvent,
} from "@/lib/server/googleCalendar";
import { prisma } from "@/lib/db/prisma";
import { getUserTimeZone } from "@/lib/server/settings";
import { DEFAULT_TIME_ZONE } from "@/lib/constants";
import { taskCreateSchema, taskListQuerySchema } from "@/lib/server/schemas";
import { logServerEvent } from "@/lib/server/logger";
import { randomUUID } from "crypto";

async function syncGoogleTasks(userEmail: string, start: string, end: string) {
  const events = await listGoogleEvents(userEmail, start, end, "primary");
  if (!events.length) return;
  const eventIds = events
    .map((event: GoogleCalendarEvent) => event.id)
    .filter((value): value is string => Boolean(value));
  if (!eventIds.length) return;
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
          scheduledDate: payload.scheduledDate || null,
          scheduledTime: payload.scheduledTime || null,
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
}

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const queryParsed = taskListQuerySchema.safeParse({
      start: searchParams.get("start"),
      end: searchParams.get("end"),
      sync: searchParams.get("sync") || undefined,
      include_unscheduled: searchParams.get("include_unscheduled") || undefined,
    });
    if (!queryParsed.success) {
      return jsonError(zodErrorMessage(queryParsed.error), 400);
    }
    const { start, end, sync, include_unscheduled } = queryParsed.data;
    const shouldSync = sync === "1";
    const includeUnscheduled = include_unscheduled === "1";
    let syncWarning: string | null = null;
    if (shouldSync) {
      try {
        await syncGoogleTasks(userEmail, start, end);
      } catch (error) {
        logServerEvent("warn", {
          endpoint: "GET /api/tasks",
          userEmail,
          message: "Google sync failed while listing tasks",
          error,
          meta: { start, end },
        });
        syncWarning = "Google sync failed";
      }
    }
    const tasks = await listTasks(userEmail, start, end, includeUnscheduled);
    return jsonOk({ items: tasks, warning: syncWarning });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/tasks",
      message: "Unhandled error while listing tasks",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to list tasks", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = taskCreateSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }
    const payload = parsed.data;
    const title = payload.title;
    const timezone = (await getUserTimeZone(userEmail)) || DEFAULT_TIME_ZONE;
    let googleEventId: string | null = null;
    if (payload.sync_google) {
      const event = await createGoogleEvent(userEmail, "primary", {
        title,
        scheduledDate: payload.scheduled_date,
        scheduledTime: payload.scheduled_time || null,
        estimatedMinutes: payload.estimated_minutes || null,
        timeZone: timezone,
      });
      googleEventId = event.id || null;
    }
    const task = await createTask(userEmail, {
      title,
      source: payload.source || "manual",
      scheduledDate: payload.scheduled_date || null,
      scheduledTime: payload.scheduled_time || null,
      priorityTag: payload.priority_tag || "Medium",
      estimatedMinutes: payload.estimated_minutes || null,
      actualMinutes: payload.actual_minutes || null,
      isDone: payload.is_done ? 1 : 0,
      completedAt: payload.completed_at || null,
      googleCalendarId: googleEventId ? "primary" : null,
      googleEventId,
    });
    return jsonOk({ task }, 201);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "POST /api/tasks",
      message: "Unhandled error while creating task",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to create task", 500);
  }
}
