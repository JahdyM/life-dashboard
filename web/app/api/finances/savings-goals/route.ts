import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import {
  getSavingsGoals,
  addSavingsGoal,
  updateSavingsGoalAmount,
  removeSavingsGoal,
} from "@/lib/server/coupleSettings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userEmail = await requireUserEmail();
    const items = await getSavingsGoals(userEmail);
    return jsonOk({ goals: items });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load savings goals", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const body = await request.json();
    const { title, target, emoji } = body;
    if (!title || !target) return jsonError("title and target required", 400);
    const record = await addSavingsGoal(userEmail, {
      title: String(title),
      target: Number(target),
      emoji: emoji ? String(emoji) : "💰",
    });
    return jsonOk(record, 201);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to add savings goal", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const body = await request.json();
    const { id, current } = body;
    if (!id || current === undefined) return jsonError("id and current required", 400);
    await updateSavingsGoalAmount(userEmail, String(id), Number(current));
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update savings goal", 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("id required", 400);
    await removeSavingsGoal(userEmail, id);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to delete savings goal", 500);
  }
}
