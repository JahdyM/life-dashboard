import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { getUserTimeZone, setUserTimeZone } from "@/lib/server/settings";
import { timezoneSchema } from "@/lib/server/schemas";
import { logServerEvent } from "@/lib/server/logger";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const timezone = await getUserTimeZone(userEmail);
    return jsonOk({ timezone });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/settings/timezone",
      message: "Unhandled error while loading timezone",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load timezone", 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = timezoneSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    await setUserTimeZone(userEmail, parsed.data.timezone);
    return jsonOk({ ok: true });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PUT /api/settings/timezone",
      message: "Unhandled error while updating timezone",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update timezone", 500);
  }
}
