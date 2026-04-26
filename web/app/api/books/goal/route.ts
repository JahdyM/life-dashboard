import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { updateBooksGoal } from "@/lib/server/books";
import { logServerEvent } from "@/lib/server/logger";
import { booksGoalUpdateSchema } from "@/lib/server/schemas";
import { handleAuthError, jsonError, jsonOk, zodErrorMessage } from "@/lib/server/response";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();

    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_error) {
      return jsonError("Invalid JSON body", 400);
    }

    const parsed = booksGoalUpdateSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);

    const data = await updateBooksGoal({
      userEmail,
      year: parsed.data.year,
      yearlyGoal: parsed.data.yearly_goal,
    });

    return jsonOk(data);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PUT /api/books/goal",
      message: "Unhandled error while updating books goal",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update yearly goal", 500);
  }
}
