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
  createGoogleEvent,
} from "@/lib/server/googleCalendar";
import { getUserTimeZone } from "@/lib/server/settings";
import { DEFAULT_TIME_ZONE } from "@/lib/constants";
import { taskCreateSchema, taskListQuerySchema } from "@/lib/server/schemas";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

function googleCreateWarning(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();
  if (
    normalized.includes("google authorization expired") ||
    normalized.includes("google calendar not connected") ||
    normalized.includes("reconnect your account")
  ) {
    return "Saved locally. Reconnect Google to sync.";
  }
  return "Saved locally. Google sync failed.";
}

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail(request);
    const { searchParams } = new URL(request.url);
    const queryParsed = taskListQuerySchema.safeParse({
      start: searchParams.get("start"),
      end: searchParams.get("end"),
      include_unscheduled: searchParams.get("include_unscheduled") || undefined,
    });
    if (!queryParsed.success) {
      return jsonError(zodErrorMessage(queryParsed.error), 400);
    }
    const { start, end, include_unscheduled } = queryParsed.data;
    const includeUnscheduled = include_unscheduled === "1";
    const tasks = await listTasks(userEmail, start, end, includeUnscheduled);
    return jsonOk({ items: tasks, warning: null });
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
    const userEmail = await requireUserEmail(request);
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
    const scheduledTimeInput = payload.scheduled_time ?? payload.planned_time ?? null;
    let googleEventId: string | null = null;
    let warning: string | null = null;
    if (payload.sync_google && payload.scheduled_date) {
      try {
        const timezone = (await getUserTimeZone(userEmail)) || DEFAULT_TIME_ZONE;
        const event = await createGoogleEvent(userEmail, "primary", {
          title,
          scheduledDate: payload.scheduled_date,
          scheduledTime: scheduledTimeInput,
          estimatedMinutes: payload.estimated_minutes || null,
          timeZone: timezone,
        });
        googleEventId = event.id || null;
      } catch (error) {
        warning = googleCreateWarning(error);
        logServerEvent("warn", {
          endpoint: "POST /api/tasks",
          userEmail,
          message: "Task saved locally after Google event creation failed",
          error,
          meta: {
            scheduledDate: payload.scheduled_date,
            scheduledTime: scheduledTimeInput,
          },
        });
      }
    }
    const task = await createTask(userEmail, {
      title,
      source: payload.source || "manual",
      externalEventKey: googleEventId ? `google:primary:${googleEventId}` : null,
      scheduledDate: payload.scheduled_date || null,
      scheduledTime: scheduledTimeInput,
      plannedTime: payload.planned_time ?? scheduledTimeInput,
      startTime: payload.start_time ?? null,
      endTime: payload.end_time ?? null,
      notes: payload.notes ?? null,
      focusOrder: payload.focus_order ?? null,
      priorityTag: payload.priority_tag || "Medium",
      estimatedMinutes: payload.estimated_minutes || null,
      actualMinutes: payload.actual_minutes || null,
      isDone: payload.is_done ? 1 : 0,
      completedAt: payload.completed_at || null,
      googleCalendarId: googleEventId ? "primary" : null,
      googleEventId,
    });
    return jsonOk({ task, warning }, 201);
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
