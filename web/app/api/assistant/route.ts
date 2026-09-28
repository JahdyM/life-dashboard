import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireUserEmail } from "@/lib/server/auth";
import { applyAssistantActions, askAssistant } from "@/lib/server/assistant";
import {
  advanceTaskReviewForAppliedActions,
  stopAssistantTaskReview,
} from "@/lib/server/assistantTaskReview";
import type { AssistantScope } from "@/lib/assistant";
import { handleAuthError, jsonError, jsonOk, zodErrorMessage } from "@/lib/server/response";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";
// Leave room for data loading and response validation around the 45s AI budget.
export const maxDuration = 120;

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
    actions: z.array(z.unknown()).min(1).max(100),
  }),
  z.object({
    mode: z.literal("cancel_task_review"),
  }),
]);

function assistantError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "AI_REQUEST_TIMEOUT") {
    return jsonError("Orbit's AI took too long to respond. No proposed changes were applied. Try again.", 504);
  }
  if (error instanceof z.ZodError) {
    return jsonError("Orbit proposed an invalid change. Ask it to revise the plan.", 400);
  }
  if (error instanceof SyntaxError) {
    return jsonError("The request could not be read. Please send it again.", 400);
  }
  if (message === "AI_NOT_CONFIGURED") {
    return jsonError(
      "Orbit is not configured yet. Add GROQ_API_KEY, CEREBRAS_API_KEY, or GEMINI_API_KEY in Vercel.",
      503
    );
  }
  if (message === "AI_QUOTA_REACHED") {
    return jsonError("The free AI limit was reached on every configured provider. Try again later.", 429);
  }
  if (message === "AI_REQUEST_REJECTED") {
    return jsonError("Orbit could not understand this request. Try rephrasing it.", 502);
  }
  if (message === "AI_AUTH_FAILED") {
    return jsonError("Orbit could not authenticate with its AI provider. Check the API key.", 503);
  }
  if (message === "AI_MODEL_UNAVAILABLE") {
    return jsonError("Orbit could not find an available AI model among its configured providers.", 503);
  }
  if (message === "AI_INVALID_RESPONSE") {
    return jsonError("Orbit returned an invalid plan. Try the request again.", 502);
  }
  if (message === "AI_RESPONSE_TOO_LARGE") {
    return jsonError("This review is too large for one response. Try a smaller group.", 413);
  }
  if (message === "AI_REQUEST_FAILED" || message === "AI_EMPTY_RESPONSE") {
    return jsonError("Orbit could not reach any of its configured AI providers. Try again.", 502);
  }
  if (message === "RESOURCE_NOT_FOUND") {
    return jsonError("One of these tasks no longer exists.", 404);
  }
  if (message === "INVALID_ASSISTANT_ACTION") {
    return jsonError("The proposed plan contains an invalid change.", 400);
  }
  if (message === "INVALID_MINISTRY_RECURRENCE") {
    return jsonError("This ministry routine has invalid dates or time.", 400);
  }
  if (message === "READING_ITEM_NOT_FOUND") {
    return jsonError("This publication is no longer available.", 404);
  }
  if (message === "INVALID_BIBLE_CHAPTER") {
    return jsonError("One of these Bible chapters is invalid.", 400);
  }
  if (message === "INVALID_BOOK") {
    return jsonError("This book change is invalid.", 400);
  }
  if (message === "FUTURE_DATE_NOT_ALLOWED") {
    return jsonError("Future streak days cannot be marked.", 400);
  }
  if (message === "INVALID_BOARD_KEY" || message === "INVALID_ACTION") {
    return jsonError("This dashboard change is invalid.", 400);
  }
  return null;
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  let mode = "validation";
  try {
    const userEmail = await requireUserEmail(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    mode = parsed.data.mode;

    if (parsed.data.mode === "chat") {
      return jsonOk(
        await askAssistant(
          userEmail,
          parsed.data.messages,
          parsed.data.scope as AssistantScope
        )
      );
    }
    if (parsed.data.mode === "cancel_task_review") {
      await stopAssistantTaskReview(userEmail);
      return jsonOk({ ok: true });
    }

    const items = await applyAssistantActions(userEmail, parsed.data.actions);
    let followUp: string | null = null;
    try {
      followUp = await advanceTaskReviewForAppliedActions(
        userEmail,
        parsed.data.actions
      );
    } catch (error) {
      logServerEvent("warn", {
        endpoint: "POST /api/assistant",
        message: "Could not advance guided task review",
        error,
      });
    }
    return jsonOk({ items, followUp });
  } catch (error) {
    logServerEvent("error", {
      endpoint: "POST /api/assistant",
      message: "Assistant request failed",
      error,
      meta: { requestId, mode },
    });
    const authError = handleAuthError(error);
    if (authError) return authError;
    const known = assistantError(error);
    if (known) return known;
    return jsonError(`Orbit could not load or update dashboard data. Refresh to check what was saved before trying again. Reference: ${requestId}`, 500);
  }
}
