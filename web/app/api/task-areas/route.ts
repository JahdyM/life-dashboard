import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { createTaskArea, getTaskAreas } from "@/lib/server/taskAreas";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail(request);
    const items = await getTaskAreas(userEmail);
    return jsonOk({ items });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/task-areas",
      message: "Unhandled error while loading task areas",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load task areas", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch (_error) {
      return jsonError("Invalid JSON body", 400);
    }

    const payload =
      body && typeof body === "object"
        ? (body as { label?: unknown; color?: unknown })
        : {};
    const area = await createTaskArea(userEmail, {
      label: String(payload.label || ""),
      color: typeof payload.color === "string" ? payload.color : null,
    });
    const items = await getTaskAreas(userEmail);
    return jsonOk({ area, items }, 201);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "POST /api/task-areas",
      message: "Unhandled error while creating task area",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    if (err instanceof Error && err.message === "INVALID_AREA_LABEL") {
      return jsonError("Invalid area label", 400);
    }
    return jsonError("Failed to create task area", 500);
  }
}
