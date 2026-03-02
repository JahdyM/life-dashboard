import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { updateSubtask, deleteSubtask } from "@/lib/server/tasks";
import { subtaskIdSchema, subtaskPatchSchema } from "@/lib/server/schemas";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const idParsed = subtaskIdSchema.safeParse(context.params.id);
    if (!idParsed.success) return jsonError(zodErrorMessage(idParsed.error), 400);
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = subtaskPatchSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    const payload = parsed.data;
    const nextPayload: Parameters<typeof updateSubtask>[2] = {};
    if (payload.title !== undefined) nextPayload.title = payload.title;
    if (payload.priority_tag !== undefined) nextPayload.priorityTag = payload.priority_tag;
    if (payload.estimated_minutes !== undefined) {
      nextPayload.estimatedMinutes = payload.estimated_minutes ?? null;
    }
    if (payload.actual_minutes !== undefined) {
      nextPayload.actualMinutes = payload.actual_minutes ?? null;
    }
    if (payload.is_done !== undefined) {
      nextPayload.isDone = payload.is_done ? 1 : 0;
    }
    if (payload.completed_at !== undefined) {
      nextPayload.completedAt = payload.completed_at ?? null;
    }
    const subtask = await updateSubtask(userEmail, idParsed.data, nextPayload);
    return jsonOk({ subtask });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PATCH /api/subtasks/[id]",
      message: "Unhandled error while updating subtask",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update subtask", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const idParsed = subtaskIdSchema.safeParse(context.params.id);
    if (!idParsed.success) return jsonError(zodErrorMessage(idParsed.error), 400);
    await deleteSubtask(userEmail, idParsed.data);
    return jsonOk({ ok: true });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "DELETE /api/subtasks/[id]",
      message: "Unhandled error while deleting subtask",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to delete subtask", 500);
  }
}
