import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { listCustomHabitDoneRange } from "@/lib/server/settings";
import { rangeQuerySchema } from "@/lib/server/schemas";
import { zodErrorMessage } from "@/lib/server/response";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const parsed = rangeQuerySchema.safeParse({
      start: searchParams.get("start"),
      end: searchParams.get("end"),
    });
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    const { start, end } = parsed.data;
    const items = await listCustomHabitDoneRange(userEmail, start, end);
    return jsonOk({ items });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load habit done", 500);
  }
}
