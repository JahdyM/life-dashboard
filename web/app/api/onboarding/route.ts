import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import {
  handleAuthError,
  jsonError,
  jsonOk,
  zodErrorMessage,
} from "@/lib/server/response";
import {
  getDashboardOnboardingPreferences,
  saveDashboardOnboardingPreferences,
} from "@/lib/server/onboarding";
import { onboardingPreferencesSchema } from "@/lib/server/schemas";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const preferences = await getDashboardOnboardingPreferences(userEmail);
    return jsonOk({ preferences });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/onboarding",
      message: "Unhandled error while loading onboarding",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load onboarding", 500);
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

    const parsed = onboardingPreferencesSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);

    const preferences = await saveDashboardOnboardingPreferences(userEmail, {
      completed: parsed.data.completed,
      workspaceMode: parsed.data.workspace_mode,
      partnerEmail: parsed.data.partner_email ?? null,
      modules: parsed.data.modules.map((module, index) => ({
        key: module.key,
        label: module.label,
        enabled: module.enabled,
        navGroup: module.nav_group,
        order: module.order ?? (index + 1) * 10,
      })),
    });

    return jsonOk({ preferences });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PUT /api/onboarding",
      message: "Unhandled error while saving onboarding",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save onboarding", 500);
  }
}
