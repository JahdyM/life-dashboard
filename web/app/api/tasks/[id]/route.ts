import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { updateTask, deleteTask } from "@/lib/server/tasks";
import { prisma } from "@/lib/db/prisma";
import { updateGoogleEvent, deleteGoogleEvent } from "@/lib/server/googleCalendar";
import { getUserTimeZone } from "@/lib/server/settings";
import { DEFAULT_TIME_ZONE } from "@/lib/constants";
import { taskIdSchema, taskPatchSchema } from "@/lib/server/schemas";

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const idParsed = taskIdSchema.safeParse(context.params.id);
    if (!idParsed.success) return jsonError(zodErrorMessage(idParsed.error), 400);
    const taskId = idParsed.data;
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = taskPatchSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    const payload = parsed.data;
    const existing = await prisma.todoTask.findUnique({ where: { id: taskId } });
    if (!existing || existing.userEmail !== userEmail) return jsonError("Task not found", 404);
    const updatePayload: Record<string, any> = {};
    if ("title" in payload) updatePayload.title = payload.title;
    if ("scheduled_date" in payload) updatePayload.scheduledDate = payload.scheduled_date;
    if ("scheduled_time" in payload) updatePayload.scheduledTime = payload.scheduled_time;
    if ("priority_tag" in payload) updatePayload.priorityTag = payload.priority_tag;
    if ("estimated_minutes" in payload) updatePayload.estimatedMinutes = payload.estimated_minutes;
    if ("actual_minutes" in payload) updatePayload.actualMinutes = payload.actual_minutes;
    if ("is_done" in payload) updatePayload.isDone = payload.is_done ? 1 : 0;
    if ("completed_at" in payload) updatePayload.completedAt = payload.completed_at;

    const updated = await updateTask(userEmail, taskId, updatePayload);
    if (payload.sync_google && existing.googleEventId) {
      const timezone = (await getUserTimeZone(userEmail)) || DEFAULT_TIME_ZONE;
      const googlePatch: Record<string, any> = { timeZone: timezone };
      if ("title" in payload) googlePatch.title = payload.title;
      if ("scheduled_date" in payload) googlePatch.scheduledDate = payload.scheduled_date;
      if ("scheduled_time" in payload) googlePatch.scheduledTime = payload.scheduled_time;
      if ("estimated_minutes" in payload) googlePatch.estimatedMinutes = payload.estimated_minutes;
      await updateGoogleEvent(userEmail, existing.googleCalendarId || "primary", existing.googleEventId, {
        ...googlePatch,
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
    const idParsed = taskIdSchema.safeParse(context.params.id);
    if (!idParsed.success) return jsonError(zodErrorMessage(idParsed.error), 400);
    const taskId = idParsed.data;
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
