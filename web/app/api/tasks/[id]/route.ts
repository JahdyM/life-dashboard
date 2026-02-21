import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { updateTask, deleteTask } from "@/lib/server/tasks";
import { prisma } from "@/lib/db/prisma";
import { updateGoogleEvent, deleteGoogleEvent } from "@/lib/server/googleCalendar";
import { getUserTimeZone } from "@/lib/server/settings";
import { DEFAULT_TIME_ZONE } from "@/lib/constants";

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const taskId = context.params.id;
    const payload = await request.json();
    const existing = await prisma.todoTask.findUnique({ where: { id: taskId } });
    if (!existing || existing.userEmail !== userEmail) return jsonError("Task not found", 404);
    const updated = await updateTask(userEmail, taskId, {
      title: payload.title,
      scheduledDate: payload.scheduled_date,
      scheduledTime: payload.scheduled_time,
      priorityTag: payload.priority_tag,
      estimatedMinutes: payload.estimated_minutes,
      actualMinutes: payload.actual_minutes,
      isDone: payload.is_done ? 1 : 0,
    });
    if (payload.sync_google && existing.googleEventId) {
      const timezone = (await getUserTimeZone(userEmail)) || DEFAULT_TIME_ZONE;
      await updateGoogleEvent(userEmail, existing.googleCalendarId || "primary", existing.googleEventId, {
        title: payload.title,
        scheduledDate: payload.scheduled_date,
        scheduledTime: payload.scheduled_time,
        estimatedMinutes: payload.estimated_minutes,
        timeZone: timezone,
      });
    }
    return jsonOk({ task: updated });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update task", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const taskId = context.params.id;
    const existing = await prisma.todoTask.findUnique({ where: { id: taskId } });
    if (!existing || existing.userEmail !== userEmail) return jsonError("Task not found", 404);
    if (existing.googleEventId) {
      await deleteGoogleEvent(userEmail, existing.googleCalendarId || "primary", existing.googleEventId);
    }
    await deleteTask(userEmail, taskId);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to delete task", 500);
  }
}
