import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { updateSubtask, deleteSubtask } from "@/lib/server/tasks";

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const payload = await request.json();
    const subtask = await updateSubtask(userEmail, context.params.id, {
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
    await deleteSubtask(userEmail, context.params.id);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to delete subtask", 500);
  }
}
