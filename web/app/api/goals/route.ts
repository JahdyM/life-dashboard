import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import {
  getCoupleGoals,
  addCoupleGoal,
  updateCoupleGoalProgress,
  removeCoupleGoal,
} from "@/lib/server/coupleSettings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userEmail = await requireUserEmail();
    const items = await getCoupleGoals(userEmail);
    return jsonOk({ goals: items });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load goals", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const body = await request.json();
    const { title, category, size, emoji, targetDate, createdBy } = body;
    if (!title || !category || !size) return jsonError("title, category, size required", 400);
    const record = await addCoupleGoal(userEmail, {
      title: String(title),
      category: String(category),
      size: String(size),
      emoji: emoji ? String(emoji) : "🎯",
      targetDate: targetDate ? String(targetDate) : null,
      createdBy: createdBy ? String(createdBy) : userEmail,
    });
    return jsonOk(record, 201);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to add goal", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const body = await request.json();
    const { id, progress } = body;
    if (!id || progress === undefined) return jsonError("id and progress required", 400);
    await updateCoupleGoalProgress(userEmail, String(id), Number(progress));
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update goal", 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("id required", 400);
    await removeCoupleGoal(userEmail, id);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to delete goal", 500);
  }
}
