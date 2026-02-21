import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getCustomHabits, saveCustomHabits } from "@/lib/server/settings";

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const payload = await request.json();
    const name = String(payload?.name || "").trim();
    if (!name) return jsonError("Habit name cannot be empty", 400);
    const habits = await getCustomHabits(userEmail);
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
