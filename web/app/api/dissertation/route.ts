import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { dissertationProjectSchema } from "@/lib/server/schemas";
import {
  applyDissertationAction,
  loadDissertationProject,
  saveDissertationProject,
} from "@/lib/server/dissertation";
import { reconcileDissertationMirrors } from "@/lib/server/dissertationMirror";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail(request);
    const project = await loadDissertationProject(userEmail);
    return jsonOk({ project });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/dissertation",
      message: "Failed to load dissertation project",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load project", 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail(request);
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = dissertationProjectSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }
    const project = await saveDissertationProject(userEmail, parsed.data);
    try {
      await reconcileDissertationMirrors(userEmail, project);
    } catch (err) {
      logServerEvent("warn", {
        endpoint: "PUT /api/dissertation",
        message: "Mirror reconcile failed after PUT (best-effort)",
        error: err,
      });
    }
    return jsonOk({ project });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PUT /api/dissertation",
      message: "Failed to save dissertation project",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save project", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail(request);
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }
    const project = await applyDissertationAction(userEmail, raw);
    return jsonOk({ project });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACTION") {
      return jsonError("Invalid action payload", 400);
    }
    logServerEvent("error", {
      endpoint: "PATCH /api/dissertation",
      message: "Failed to apply dissertation action",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to apply action", 500);
  }
}
