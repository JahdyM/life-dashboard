import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserEmail } from "@/lib/server/auth";
import { applyAssistantActions, askAssistant } from "@/lib/server/assistant";
import type { AssistantScope } from "@/lib/assistant";
import { handleAuthError, jsonError, jsonOk, zodErrorMessage } from "@/lib/server/response";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(6000),
});

const scopeSchema = z.enum([
  "all",
  "today",
  "calendar",
  "habits",
  "ministry",
  "mood",
  "dissertation",
  "stats",
  "finances",
  "books",
  "publications",
  "goals",
  "spiritual",
  "couple",
]);

const requestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("chat"),
    scope: scopeSchema.default("all"),
    messages: z.array(messageSchema).min(1).max(16),
  }),
  z.object({
    mode: z.literal("apply"),
    actions: z.array(z.unknown()).min(1).max(40),
  }),
]);

function assistantError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "AI_NOT_CONFIGURED") {
    return jsonError("Orbit is not configured yet. Add GEMINI_API_KEY in Vercel.", 503);
  }
  if (message === "AI_QUOTA_REACHED") {
    return jsonError("The free AI limit was reached. Try again later.", 429);
  }
  if (message === "AI_REQUEST_REJECTED") {
    return jsonError("Orbit could not understand this request. Try rephrasing it.", 502);
  }
  if (message === "AI_AUTH_FAILED") {
    return jsonError("Orbit could not connect to Gemini. Check the API key.", 503);
  }
  if (message === "AI_MODEL_UNAVAILABLE") {
    return jsonError("Orbit could not find an available Gemini model.", 503);
  }
  if (message === "AI_REQUEST_FAILED" || message === "AI_EMPTY_RESPONSE") {
    return jsonError("Orbit could not reach Gemini. Try again.", 502);
  }
  if (message === "RESOURCE_NOT_FOUND") {
    return jsonError("One of these tasks no longer exists.", 404);
  }
  if (message === "INVALID_ASSISTANT_ACTION") {
    return jsonError("The proposed plan contains an invalid change.", 400);
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);

    if (parsed.data.mode === "chat") {
      return jsonOk(
        await askAssistant(
          userEmail,
          parsed.data.messages,
          parsed.data.scope as AssistantScope
        )
      );
    }

    const items = await applyAssistantActions(userEmail, parsed.data.actions);
    return jsonOk({ items });
  } catch (error) {
    const known = assistantError(error);
    if (known) return known;
    logServerEvent("error", {
      endpoint: "POST /api/assistant",
      message: "Assistant request failed",
      error,
    });
    const authError = handleAuthError(error);
    if (authError) return authError;
    return jsonError("Orbit could not complete this request.", 500);
  }
}
