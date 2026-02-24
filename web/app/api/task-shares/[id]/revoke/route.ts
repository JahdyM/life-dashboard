import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { taskIdSchema } from "@/lib/server/schemas";
import { revokeTaskShareInvite } from "@/lib/server/sharedTasks";
import { logServerEvent } from "@/lib/server/logger";

export async function POST(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const idParsed = taskIdSchema.safeParse(context.params.id);
    if (!idParsed.success) return jsonError(zodErrorMessage(idParsed.error), 400);
    const invite = await revokeTaskShareInvite(userEmail, idParsed.data);
    return jsonOk({ invite });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "POST /api/task-shares/[id]/revoke",
      message: "Unhandled error while revoking task share invite",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return jsonError("You cannot revoke this share invite", 403);
    }
    if (err instanceof Error && err.message === "RESOURCE_NOT_FOUND") {
      return jsonError("Share invite not found", 404);
    }
    return jsonError("Failed to revoke shared task", 500);
  }
}
