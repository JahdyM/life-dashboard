import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { loadDissertationProject } from "@/lib/server/dissertation";
import { reconcileDissertationMirrors } from "@/lib/server/dissertationMirror";
import { prisma } from "@/lib/db/prisma";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

/**
 * On-demand reconcile + count. Lets the user (or a debug widget) verify
 * that dissertation steps are mirrored into the calendar's TodoTask
 * table. Returns the post-reconcile mirror count, the number of steps
 * the project carries, and any error message if reconcile threw.
 */
export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail(request);
    const project = await loadDissertationProject(userEmail);
    let reconcileError: string | null = null;
    try {
      await reconcileDissertationMirrors(userEmail, project);
    } catch (error) {
      reconcileError =
        error instanceof Error ? error.message : "Unknown reconcile error";
      logServerEvent("error", {
        endpoint: "POST /api/dissertation/sync",
        message: "reconcile failed",
        error,
      });
    }
    const mirrorCount = await prisma.todoTask.count({
      where: { userEmail, source: "dissertation" },
    });
    const stepCount = project.fronts.reduce(
      (total, front) => total + front.steps.length,
      0
    );
    return jsonOk({
      ok: !reconcileError,
      mirrorCount,
      stepCount,
      reconcileError,
    });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to sync dissertation mirrors", 500);
  }
}
