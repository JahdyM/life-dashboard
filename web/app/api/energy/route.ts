import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { isEffortLevel } from "@/lib/energy";
import { getEnergySettings, setHabitEffort, setLowEnergyMode, setTaskEffort } from "@/lib/server/energy";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userEmail = await requireUserEmail();
    return jsonOk(await getEnergySettings(userEmail));
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/energy",
      message: "Unhandled error while loading energy settings",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load energy settings", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    let body: unknown;
    try {
      body = await request.json();
    } catch (_error) {
      return jsonError("Invalid JSON body", 400);
    }
    const payload = body as {
      low_energy_mode?: unknown;
      task_effort?: { id?: unknown; effort?: unknown };
      habit_effort?: { id?: unknown; effort?: unknown };
    };

    if (typeof payload.low_energy_mode === "boolean") {
      await setLowEnergyMode(userEmail, payload.low_energy_mode);
    }

    if (payload.task_effort) {
      const id = String(payload.task_effort.id || "").trim();
      const effort = payload.task_effort.effort === null ? null : payload.task_effort.effort;
      if (!id) return jsonError("Missing task id", 400);
      if (effort !== null && !isEffortLevel(effort)) return jsonError("Invalid effort", 400);
      await setTaskEffort(userEmail, id, effort);
    }

    if (payload.habit_effort) {
      const id = String(payload.habit_effort.id || "").trim();
      const effort = payload.habit_effort.effort === null ? null : payload.habit_effort.effort;
      if (!id) return jsonError("Missing habit id", 400);
      if (effort !== null && !isEffortLevel(effort)) return jsonError("Invalid effort", 400);
      await setHabitEffort(userEmail, id, effort);
    }

    return jsonOk(await getEnergySettings(userEmail));
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PATCH /api/energy",
      message: "Unhandled error while saving energy settings",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save energy settings", 500);
  }
}
