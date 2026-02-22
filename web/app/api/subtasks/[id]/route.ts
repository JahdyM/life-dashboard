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
    const subtask = await updateSubtask(userEmail, idParsed.data, {
      title: payload.title,
      priorityTag: payload.priority_tag,
      estimatedMinutes: payload.estimated_minutes ?? null,
      actualMinutes: payload.actual_minutes ?? null,
      isDone: payload.is_done ? 1 : 0,
    });
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
