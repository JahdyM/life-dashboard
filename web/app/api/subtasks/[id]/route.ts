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
    const nextPayload: Record<string, string | number | null> = {};
    if ("title" in payload) nextPayload.title = payload.title;
    if ("priority_tag" in payload) nextPayload.priorityTag = payload.priority_tag;
    if ("estimated_minutes" in payload) {
      nextPayload.estimatedMinutes = payload.estimated_minutes ?? null;
    }
    if ("actual_minutes" in payload) {
      nextPayload.actualMinutes = payload.actual_minutes ?? null;
    }
    if ("is_done" in payload) {
      nextPayload.isDone = payload.is_done ? 1 : 0;
    }
    if ("completed_at" in payload) {
      nextPayload.completedAt = payload.completed_at ?? null;
    }
    const subtask = await updateSubtask(userEmail, idParsed.data, nextPayload);
    return jsonOk({ subtask });
  } catch (err) {
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
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to delete subtask", 500);
  }
}
