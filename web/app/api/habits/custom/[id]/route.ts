import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { canonicalHabitKey, getCustomHabits, saveCustomHabits } from "@/lib/server/settings";
import { customHabitSchema, taskIdSchema } from "@/lib/server/schemas";
import { zodErrorMessage } from "@/lib/server/response";

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const idParsed = taskIdSchema.safeParse(context.params.id);
    if (!idParsed.success) return jsonError(zodErrorMessage(idParsed.error), 400);
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = customHabitSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    const name = parsed.data.name;
    const habits = await getCustomHabits(userEmail);
    const newKey = canonicalHabitKey(name);
    if (
      habits.some(
        (habit) => habit.id !== context.params.id && canonicalHabitKey(habit.name) === newKey
      )
    ) {
      return jsonError("Habit already exists", 400);
    }
    let updated = false;
    const next = habits.map((habit) => {
      if (habit.id === context.params.id) {
        updated = true;
        return { ...habit, name };
      }
      return habit;
    });
    if (!updated) return jsonError("Habit not found", 404);
    await saveCustomHabits(userEmail, next);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update habit", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const idParsed = taskIdSchema.safeParse(context.params.id);
    if (!idParsed.success) return jsonError(zodErrorMessage(idParsed.error), 400);
    const habits = await getCustomHabits(userEmail);
    const next = habits.map((habit) =>
      habit.id === context.params.id ? { ...habit, active: false } : habit
    );
    await saveCustomHabits(userEmail, next);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to delete habit", 500);
  }
}
