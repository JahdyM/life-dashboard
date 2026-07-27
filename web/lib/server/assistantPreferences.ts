import "server-only";

import { getSetting, setSetting } from "./settings";

const ASSISTANT_PREFERENCES_KEY = "assistant_preferences_v1";

export type AssistantPreferences = {
  askWhenUncertain: boolean;
};

const DEFAULT_ASSISTANT_PREFERENCES: AssistantPreferences = {
  askWhenUncertain: true,
};

export async function getAssistantPreferences(
  userEmail: string
): Promise<AssistantPreferences> {
  const raw = await getSetting(userEmail, ASSISTANT_PREFERENCES_KEY);
  if (!raw) return DEFAULT_ASSISTANT_PREFERENCES;

  try {
    const parsed = JSON.parse(raw) as Partial<AssistantPreferences>;
    return {
      askWhenUncertain:
        typeof parsed.askWhenUncertain === "boolean"
          ? parsed.askWhenUncertain
          : DEFAULT_ASSISTANT_PREFERENCES.askWhenUncertain,
    };
  } catch {
    return DEFAULT_ASSISTANT_PREFERENCES;
  }
}

export async function updateAssistantPreferences(
  userEmail: string,
  patch: Partial<AssistantPreferences>
): Promise<AssistantPreferences> {
  const current = await getAssistantPreferences(userEmail);
  const next = {
    ...current,
    ...(typeof patch.askWhenUncertain === "boolean"
      ? { askWhenUncertain: patch.askWhenUncertain }
      : {}),
  };
  await setSetting(userEmail, ASSISTANT_PREFERENCES_KEY, JSON.stringify(next));
  return next;
}
