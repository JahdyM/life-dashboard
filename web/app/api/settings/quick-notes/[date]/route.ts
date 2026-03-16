import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { dateParamSchema, quickNoteTextSchema } from "@/lib/server/schemas";
import { getQuickNotesText, setQuickNotesText } from "@/lib/server/settings";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: { date: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const paramsParsed = dateParamSchema.safeParse(context.params);
    if (!paramsParsed.success) return jsonError(zodErrorMessage(paramsParsed.error), 400);
    const text = await getQuickNotesText(userEmail, paramsParsed.data.date);
    return jsonOk({ text });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/settings/quick-notes/[date]",
      message: "Unhandled error while loading quick notes",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load quick notes", 500);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: { date: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const paramsParsed = dateParamSchema.safeParse(context.params);
    if (!paramsParsed.success) return jsonError(zodErrorMessage(paramsParsed.error), 400);
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = quickNoteTextSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    await setQuickNotesText(userEmail, paramsParsed.data.date, parsed.data.text);
    return jsonOk({ ok: true });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PUT /api/settings/quick-notes/[date]",
      message: "Unhandled error while updating quick notes",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update quick notes", 500);
  }
}
