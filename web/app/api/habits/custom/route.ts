import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { canonicalHabitKey, ensureDefaultCustomHabits, getCustomHabits, saveCustomHabits } from "@/lib/server/settings";
import { randomUUID } from "crypto";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const items = await ensureDefaultCustomHabits(userEmail);
    return jsonOk({ items });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to list habits", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const payload = await request.json();
    const name = String(payload?.name || "").trim();
    if (!name) return jsonError("Habit name cannot be empty", 400);
    const current = await getCustomHabits(userEmail);
    const newKey = canonicalHabitKey(name);
    if (current.some((habit) => canonicalHabitKey(habit.name) === newKey)) {
      return jsonError("Habit already exists", 400);
    }
    const habit = { id: randomUUID(), name, active: true };
    await saveCustomHabits(userEmail, [...current, habit]);
    return jsonOk({ habit }, 201);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to create habit", 500);
  }
}
