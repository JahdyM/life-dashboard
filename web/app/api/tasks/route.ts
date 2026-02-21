import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { createTask, listTasks, updateTask } from "@/lib/server/tasks";
import { listGoogleEvents, googleEventToTask, createGoogleEvent } from "@/lib/server/googleCalendar";
import { prisma } from "@/lib/db/prisma";
import { getUserTimeZone } from "@/lib/server/settings";
import { DEFAULT_TIME_ZONE } from "@/lib/constants";

async function syncGoogleTasks(userEmail: string, start: string, end: string) {
  const events = await listGoogleEvents(userEmail, start, end, "primary");
  if (!events.length) return;
  const eventIds = events.map((event: any) => event.id).filter(Boolean);
  if (!eventIds.length) return;
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
    };
    if (existingMap.has(event.id)) {
      await updateTask(userEmail, existingMap.get(event.id)!.id, payload as any);
    } else {
      await createTask(userEmail, {
        title: payload.title,
        source: payload.source,
        scheduledDate: payload.scheduledDate || null,
        scheduledTime: payload.scheduledTime || null,
        googleCalendarId: payload.googleCalendarId,
        googleEventId: payload.googleEventId,
      });
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const sync = searchParams.get("sync") === "1";
    const includeUnscheduled = searchParams.get("include_unscheduled") === "1";
    if (!start || !end) return jsonError("Missing start/end", 400);
    let syncWarning: string | null = null;
    if (sync) {
      try {
        await syncGoogleTasks(userEmail, start, end);
      } catch (_err) {
        syncWarning = "Google sync failed";
      }
    }
    const tasks = await listTasks(userEmail, start, end, includeUnscheduled);
    return jsonOk({ items: tasks, warning: syncWarning });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to list tasks", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const payload = await request.json();
    const title = String(payload?.title || "").trim();
    if (!title) return jsonError("Title cannot be empty", 400);
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
      googleCalendarId: googleEventId ? "primary" : null,
      googleEventId,
    });
    return jsonOk({ task }, 201);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to create task", 500);
  }
}
