import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { listEntries } from "@/lib/server/habits";
import { rangeQuerySchema } from "@/lib/server/schemas";
import { logServerEvent } from "@/lib/server/logger";

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
    const items = await listEntries(userEmail, start, end);
    return jsonOk({ items });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/entries",
      message: "Unhandled error while loading entries",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load entries", 500);
  }
}
