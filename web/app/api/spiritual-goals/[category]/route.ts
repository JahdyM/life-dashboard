import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserEmail } from "@/lib/server/auth";
import {
  applySpiritualGoalAction,
  saveSpiritualGoalConfig,
} from "@/lib/server/spiritualGoals";
import {
  spiritualGoalActionSchema,
  spiritualGoalCategorySchema,
  spiritualGoalStaircaseSchema,
} from "@/lib/server/schemas";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import { logServerEvent } from "@/lib/server/logger";
import type { SpiritualGoalCategory, SpiritualGoalStaircase } from "@/lib/types";

export const dynamic = "force-dynamic";

type SpiritualGoalStaircasePayload = z.infer<typeof spiritualGoalStaircaseSchema>;

function parseCategory(value: string) {
  return spiritualGoalCategorySchema.safeParse(value);
}

function toInternalStaircase(
  category: SpiritualGoalCategory,
  raw: SpiritualGoalStaircasePayload
): SpiritualGoalStaircase {
  return {
    category,
    title: raw.title,
    ultimateGoal: raw.ultimate_goal,
    subtitle: raw.subtitle ?? null,
    themeColor: raw.theme_color ?? null,
    avatarStyle: raw.avatar_style ?? null,
    generalNotes: raw.general_notes ?? null,
    steps: raw.steps.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description ?? null,
      notes: step.notes ?? null,
      completedAt: step.completed_at ?? null,
      tasks: step.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        completed: task.completed,
        createdAt: task.created_at ?? undefined,
        updatedAt: task.updated_at ?? undefined,
      })),
    })),
  };
}

export async function PUT(
  request: NextRequest,
  context: { params: { category: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const categoryParsed = parseCategory(context.params.category);
    if (!categoryParsed.success) {
      return jsonError(zodErrorMessage(categoryParsed.error), 400);
    }

    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_error) {
      return jsonError("Invalid JSON body", 400);
    }

    const payloadWithCategory =
      rawPayload && typeof rawPayload === "object"
        ? { ...(rawPayload as Record<string, unknown>), category: categoryParsed.data }
        : rawPayload;

    const parsed = spiritualGoalStaircaseSchema.safeParse(payloadWithCategory);
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }

    const staircase = toInternalStaircase(categoryParsed.data, parsed.data);
    const item = await saveSpiritualGoalConfig(userEmail, staircase);
    return jsonOk({ item });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PUT /api/spiritual-goals/[category]",
      message: "Unhandled error while saving spiritual goal config",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save spiritual goal", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: { category: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const categoryParsed = parseCategory(context.params.category);
    if (!categoryParsed.success) {
      return jsonError(zodErrorMessage(categoryParsed.error), 400);
    }

    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_error) {
      return jsonError("Invalid JSON body", 400);
    }

    const parsed = spiritualGoalActionSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }

    const item = await applySpiritualGoalAction(
      userEmail,
      categoryParsed.data,
      parsed.data
    );
    return jsonOk({ item });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PATCH /api/spiritual-goals/[category]",
      message: "Unhandled error while applying spiritual goal action",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    if (err instanceof Error && err.message === "CONFIRMATION_REQUIRED") {
      return jsonError("Please confirm before moving the character.", 400);
    }
    if (err instanceof Error && err.message === "INVALID_ACTION") {
      return jsonError("Invalid spiritual goal action.", 400);
    }
    return jsonError("Failed to update spiritual goal", 500);
  }
}
