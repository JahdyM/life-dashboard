import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { createSubtask } from "@/lib/server/tasks";
import { subtaskCreateSchema } from "@/lib/server/schemas";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = subtaskCreateSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    const taskExists = await prisma.todoTask.findFirst({
      where: { id: parsed.data.task_id, userEmail },
      select: { id: true },
    });
    if (!taskExists) return jsonError("Task not found", 404);
    const subtask = await createSubtask(userEmail, parsed.data.task_id, parsed.data.title);
    return jsonOk({ subtask }, 201);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to create subtask", 500);
  }
}
