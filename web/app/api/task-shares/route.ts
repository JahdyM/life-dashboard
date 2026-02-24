import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { taskShareCreateSchema } from "@/lib/server/schemas";
import {
  createTaskShareInvite,
  listPendingTaskShareInvites,
} from "@/lib/server/sharedTasks";
import { logServerEvent } from "@/lib/server/logger";

function knownShareError(message: string) {
  return (
    message.includes("Cannot share a task with yourself") ||
    message.includes("Recipient is not allowed") ||
    message.includes("Partner not configured")
  );
}

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const items = await listPendingTaskShareInvites(userEmail);
    return jsonOk({ items });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/task-shares",
      message: "Unhandled error while listing task share invites",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to list task shares", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_error) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = taskShareCreateSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    const invite = await createTaskShareInvite(
      userEmail,
      parsed.data.task_id,
      parsed.data.to_email || null
    );
    return jsonOk({ invite }, 201);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "POST /api/task-shares",
      message: "Unhandled error while creating task share invite",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    if (err instanceof Error && knownShareError(err.message)) {
      return jsonError(err.message, 400);
    }
    if (err instanceof Error && err.message === "RESOURCE_NOT_FOUND") {
      return jsonError("Task not found", 404);
    }
    return jsonError("Failed to share task", 500);
  }
}
