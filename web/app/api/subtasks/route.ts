import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { createSubtask } from "@/lib/server/tasks";

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const payload = await request.json();
    const taskId = String(payload?.task_id || "");
    const title = String(payload?.title || "").trim();
    if (!taskId || !title) return jsonError("Missing task or title", 400);
    const subtask = await createSubtask(userEmail, taskId, title);
    return jsonOk({ subtask }, 201);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to create subtask", 500);
  }
}
