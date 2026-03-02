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
import { logServerEvent } from "@/lib/server/logger";
import type { TaskPayload } from "@/lib/server/tasks";

export const dynamic = "force-dynamic";

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
    const updatePayload: Partial<TaskPayload> = {};
    if (payload.title !== undefined) updatePayload.title = payload.title;
    if (payload.scheduled_date !== undefined) updatePayload.scheduledDate = payload.scheduled_date;
    if (payload.scheduled_time !== undefined) updatePayload.scheduledTime = payload.scheduled_time;
    if (payload.priority_tag !== undefined) updatePayload.priorityTag = payload.priority_tag;
    if (payload.estimated_minutes !== undefined) {
      updatePayload.estimatedMinutes = payload.estimated_minutes;
    }
    if (payload.actual_minutes !== undefined) {
      updatePayload.actualMinutes = payload.actual_minutes;
    }
    if (payload.is_done !== undefined) updatePayload.isDone = payload.is_done ? 1 : 0;
    if (payload.completed_at !== undefined) updatePayload.completedAt = payload.completed_at;

    const updated = await updateTask(userEmail, taskId, updatePayload);
    if (
      payload.sync_google &&
      existing.googleEventId &&
      existing.source !== "google_shared"
    ) {
      const timezone = (await getUserTimeZone(userEmail)) || DEFAULT_TIME_ZONE;
      const googlePatch: Parameters<typeof updateGoogleEvent>[3] = { timeZone: timezone };
      if (payload.title !== undefined) googlePatch.title = payload.title;
      if (payload.scheduled_date !== undefined && payload.scheduled_date !== null) {
        googlePatch.scheduledDate = payload.scheduled_date;
      }
      if (payload.scheduled_time !== undefined) {
        googlePatch.scheduledTime = payload.scheduled_time;
      }
      if (payload.estimated_minutes !== undefined) {
        googlePatch.estimatedMinutes = payload.estimated_minutes;
      }
      await updateGoogleEvent(userEmail, existing.googleCalendarId || "primary", existing.googleEventId, {
        ...googlePatch,
      });
    }
    return jsonOk({ task: updated });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PATCH /api/tasks/[id]",
      message: "Unhandled error while updating task",
      error: err,
    });
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
    if (existing.googleEventId && existing.source !== "google_shared") {
      try {
        await deleteGoogleEvent(
          userEmail,
          existing.googleCalendarId || "primary",
          existing.googleEventId
        );
      } catch (error) {
        logServerEvent("warn", {
          endpoint: "DELETE /api/tasks/[id]",
          userEmail,
          message: "Google event delete failed; task will still be removed locally",
          error,
          meta: { taskId, googleEventId: existing.googleEventId },
        });
      }
    }
    await deleteTask(userEmail, taskId);
    return jsonOk({ ok: true });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "DELETE /api/tasks/[id]",
      message: "Unhandled error while deleting task",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to delete task", 500);
  }
}
