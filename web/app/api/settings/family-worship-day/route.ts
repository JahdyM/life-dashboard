import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { getFamilyWorshipDay, setFamilyWorshipDay } from "@/lib/server/settings";
import { familyWorshipDaySchema } from "@/lib/server/schemas";
import { logServerEvent } from "@/lib/server/logger";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const day = await getFamilyWorshipDay(userEmail);
    return jsonOk({ day });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/settings/family-worship-day",
      message: "Unhandled error while loading family worship day",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load family worship day", 500);
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
    const parsed = familyWorshipDaySchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    await setFamilyWorshipDay(userEmail, parsed.data.day);
    return jsonOk({ ok: true });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PUT /api/settings/family-worship-day",
      message: "Unhandled error while updating family worship day",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update family worship day", 500);
  }
}
