import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { logServerEvent } from "@/lib/server/logger";
import { handleAuthError, jsonError, jsonOk, zodErrorMessage } from "@/lib/server/response";
import {
  spiritualStreakBoardKeySchema,
  spiritualStreakUpdateSchema,
} from "@/lib/server/schemas";
import { updateSpiritualStreakEntry } from "@/lib/server/spiritualStreaks";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: { boardKey: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const boardKeyParsed = spiritualStreakBoardKeySchema.safeParse(context.params.boardKey);
    if (!boardKeyParsed.success) {
      return jsonError(zodErrorMessage(boardKeyParsed.error), 400);
    }

    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_error) {
      return jsonError("Invalid JSON body", 400);
    }

    const parsed = spiritualStreakUpdateSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }

    const item = await updateSpiritualStreakEntry({
      userEmail,
      boardKey: boardKeyParsed.data,
      monthKey: parsed.data.month,
      date: parsed.data.date,
      success: parsed.data.success,
      note: parsed.data.note ?? null,
    });

    return jsonOk({ item });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PATCH /api/spiritual-streaks/[boardKey]",
      message: "Unhandled error while updating spiritual streak",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    if (err instanceof Error && err.message === "FUTURE_DATE_NOT_ALLOWED") {
      return jsonError("Future days cannot be marked yet.", 400);
    }
    if (err instanceof Error && err.message === "INVALID_BOARD_KEY") {
      return jsonError("Invalid streak board.", 400);
    }
    return jsonError("Failed to update spiritual streak", 500);
  }
}
