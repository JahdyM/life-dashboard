import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { getCustomHabitDone, getCustomHabits, setCustomHabitDone } from "@/lib/server/settings";
import { customHabitDoneSchema, dateParamSchema } from "@/lib/server/schemas";
import { logServerEvent } from "@/lib/server/logger";
import { addPointsOnce, POINTS } from "@/lib/server/rewards";
import { syncHabitAgendaTasks } from "@/lib/server/habitTaskSync";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: { date: string } }
) {
  try {
    const userEmail = await requireUserEmail(request);
    const paramsParsed = dateParamSchema.safeParse(context.params);
    if (!paramsParsed.success) return jsonError(zodErrorMessage(paramsParsed.error), 400);
    const payload = await getCustomHabitDone(userEmail, paramsParsed.data.date);
    return jsonOk({ done: payload });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/habits/custom/done/[date]",
      message: "Unhandled error while loading custom habit done for day",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load custom habits", 500);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: { date: string } }
) {
  try {
    const userEmail = await requireUserEmail(request);
    const paramsParsed = dateParamSchema.safeParse(context.params);
    if (!paramsParsed.success) return jsonError(zodErrorMessage(paramsParsed.error), 400);
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = customHabitDoneSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    const dateIso = paramsParsed.data.date;
    const newDone = parsed.data.done;

    // Detect which habits just turned ON to award points
    const oldDone = await getCustomHabitDone(userEmail, dateIso);
    await setCustomHabitDone(userEmail, dateIso, newDone);

    // Award +1 per custom habit newly toggled ON (idempotent via ledger)
    const newlyOn = Object.entries(newDone)
      .filter(([id, v]) => v === 1 && !oldDone[id])
      .map(([id]) => id);
    if (newlyOn.length > 0) {
      await Promise.all(
        newlyOn.map((id) =>
          addPointsOnce(userEmail, `habit::custom::${dateIso}::${id}`, POINTS.customHabit)
        )
      );
    }

    const customHabits = await getCustomHabits(userEmail);
    await Promise.all(
      customHabits
        .filter((habit) => Boolean(oldDone[habit.id]) !== Boolean(newDone[habit.id]))
        .map(async (habit) => {
          try {
            await syncHabitAgendaTasks({
              userEmail,
              dateIso,
              titles: [habit.name],
              done: Boolean(newDone[habit.id]),
            });
          } catch (error) {
            logServerEvent("warn", {
              endpoint: "PUT /api/habits/custom/done/[date]",
              message: "Failed to sync custom habit agenda tasks",
              error,
              meta: { habitId: habit.id, dateIso },
            });
          }
        })
    );

    return jsonOk({ ok: true });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PUT /api/habits/custom/done/[date]",
      message: "Unhandled error while updating custom habit done for day",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update custom habits", 500);
  }
}
