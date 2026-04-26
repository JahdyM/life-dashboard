import {
  buildDashboardModuleViews,
  type DashboardModuleConfig,
  type DashboardModuleKey,
  type DashboardModulePreference,
  type DashboardOnboardingPreferences,
  type OnboardingHabitStarterPreference,
  type OnboardingNamedPreference,
  type WorkspaceMode,
} from "@/lib/config/dashboard";
import { MOOD_DEFINITIONS } from "@/lib/moods";
import {
  DEFAULT_CUSTOM_HABIT_TEMPLATES,
  FIXED_SHARED_HABITS,
} from "@/lib/config/habits";
import { SPIRITUAL_STREAK_BOARD_CONFIGS } from "@/lib/config/spiritual";
import {
  canonicalHabitKey,
  getCustomHabits,
  getSetting,
  saveCustomHabits,
  setSetting,
} from "./settings";

type StoredOnboardingPreferences = {
  completed?: boolean;
  completed_at?: string | null;
  workspace_mode?: WorkspaceMode;
  partner_email?: string | null;
  modules?: Array<{
    key?: string;
    label?: string;
    enabled?: boolean;
    nav_group?: DashboardModuleConfig["navGroup"];
    order?: number;
  }>;
  shared_habits?: Array<{ key?: string; label?: string; enabled?: boolean }>;
  custom_habit_starters?: Array<{ id?: string; name?: string; enabled?: boolean }>;
  spiritual_streaks?: Array<{ key?: string; label?: string; enabled?: boolean }>;
  moods?: Array<{ key?: string; label?: string; enabled?: boolean }>;
};

export type OnboardingSaveInput = {
  completed?: boolean;
  workspaceMode?: WorkspaceMode;
  partnerEmail?: string | null;
  modules?: DashboardModulePreference[];
  sharedHabits?: OnboardingNamedPreference<string>[];
  customHabitStarters?: OnboardingHabitStarterPreference[];
  spiritualStreaks?: OnboardingNamedPreference<string>[];
  moods?: OnboardingNamedPreference<string>[];
};

const ONBOARDING_SETTINGS_KEY = "dashboard_onboarding_v1";

function normalizeLabel(value: string | undefined, fallback: string) {
  const clean = String(value || "").trim().slice(0, 36);
  return clean || fallback;
}

function normalizePartnerEmail(value: string | null | undefined) {
  const clean = String(value || "").trim().toLowerCase();
  return clean || null;
}

function normalizeNavGroup(value: string | undefined): DashboardModuleConfig["navGroup"] {
  return value === "secondary" ? "secondary" : "primary";
}

function normalizeNamedPreferences<Key extends string>(
  stored: Array<{ key?: string; label?: string; enabled?: boolean }> | undefined,
  defaults: Array<{ key: Key; label: string } | { key: Key; title: string }>
): OnboardingNamedPreference<Key>[] {
  const byKey = new Map((stored || []).map((item) => [item.key, item]));
  return defaults.map((item) => {
    const label = "label" in item ? item.label : item.title;
    const storedItem = byKey.get(item.key);
    return {
      key: item.key,
      label: normalizeLabel(storedItem?.label, label),
      enabled: storedItem?.enabled ?? true,
    };
  });
}

function normalizeStarterPreferences(
  stored: Array<{ id?: string; name?: string; enabled?: boolean }> | undefined
): OnboardingHabitStarterPreference[] {
  const byId = new Map((stored || []).map((item) => [item.id, item]));
  return DEFAULT_CUSTOM_HABIT_TEMPLATES.map((template) => {
    const storedItem = byId.get(template.id);
    return {
      id: template.id,
      name: normalizeLabel(storedItem?.name, template.name),
      enabled: storedItem?.enabled ?? template.active,
    };
  });
}

function normalizeStoredPreferences(raw: StoredOnboardingPreferences | null): DashboardOnboardingPreferences {
  const modules = buildDashboardModuleViews(
    (raw?.modules || [])
      .filter((item): item is NonNullable<StoredOnboardingPreferences["modules"]>[number] =>
        Boolean(item?.key)
      )
      .map((item) => ({
        key: item.key as DashboardModuleKey,
        label: normalizeLabel(item.label, ""),
        enabled: item.key === "today" ? true : Boolean(item.enabled),
        navGroup: normalizeNavGroup(item.nav_group),
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : 0,
      }))
  );

  return {
    completed: Boolean(raw?.completed),
    completedAt: raw?.completed_at || null,
    workspaceMode: raw?.workspace_mode === "shared" ? "shared" : "solo",
    partnerEmail: normalizePartnerEmail(raw?.partner_email),
    modules,
    sharedHabits: normalizeNamedPreferences(raw?.shared_habits, FIXED_SHARED_HABITS),
    customHabitStarters: normalizeStarterPreferences(raw?.custom_habit_starters),
    spiritualStreaks: normalizeNamedPreferences(raw?.spiritual_streaks, SPIRITUAL_STREAK_BOARD_CONFIGS),
    moods: normalizeNamedPreferences(raw?.moods, MOOD_DEFINITIONS),
  };
}

function toStoredPreferences(preferences: DashboardOnboardingPreferences): StoredOnboardingPreferences {
  return {
    completed: preferences.completed,
    completed_at: preferences.completedAt,
    workspace_mode: preferences.workspaceMode,
    partner_email: preferences.partnerEmail,
    modules: preferences.modules.map((module) => ({
      key: module.key,
      label: module.label,
      enabled: module.enabled,
      nav_group: module.navGroup,
      order: module.order,
    })),
    shared_habits: preferences.sharedHabits.map((habit) => ({
      key: habit.key,
      label: habit.label,
      enabled: habit.enabled,
    })),
    custom_habit_starters: preferences.customHabitStarters.map((habit) => ({
      id: habit.id,
      name: habit.name,
      enabled: habit.enabled,
    })),
    spiritual_streaks: preferences.spiritualStreaks.map((board) => ({
      key: board.key,
      label: board.label,
      enabled: board.enabled,
    })),
    moods: preferences.moods.map((mood) => ({
      key: mood.key,
      label: mood.label,
      enabled: mood.enabled,
    })),
  };
}

async function applyStarterHabits(
  userEmail: string,
  starters: OnboardingHabitStarterPreference[]
) {
  const enabled = starters.filter((habit) => habit.enabled && habit.name.trim());
  if (!enabled.length) return;

  const current = await getCustomHabits(userEmail);
  const seen = new Set(current.map((habit) => canonicalHabitKey(habit.name)));
  const seenIds = new Set(current.map((habit) => habit.id));
  const next = [...current];

  enabled.forEach((starter) => {
    const key = canonicalHabitKey(starter.name);
    if (!key || seen.has(key) || seenIds.has(starter.id)) return;
    seen.add(key);
    seenIds.add(starter.id);
    next.push({
      id: starter.id,
      name: starter.name.trim(),
      active: true,
    });
  });

  if (next.length !== current.length) {
    await saveCustomHabits(userEmail, next);
  }
}

export async function getDashboardOnboardingPreferences(
  userEmail: string
): Promise<DashboardOnboardingPreferences> {
  const raw = await getSetting(userEmail, ONBOARDING_SETTINGS_KEY);
  if (!raw) return normalizeStoredPreferences(null);

  try {
    const parsed = JSON.parse(raw) as StoredOnboardingPreferences;
    return normalizeStoredPreferences(parsed);
  } catch (_error) {
    return normalizeStoredPreferences(null);
  }
}

export async function saveDashboardOnboardingPreferences(
  userEmail: string,
  input: OnboardingSaveInput
): Promise<DashboardOnboardingPreferences> {
  const current = await getDashboardOnboardingPreferences(userEmail);
  const modules = buildDashboardModuleViews(
    (input.modules || current.modules).map((module, index) => ({
      key: module.key,
      label: normalizeLabel(module.label, module.label),
      enabled: module.key === "today" ? true : Boolean(module.enabled),
      navGroup: module.navGroup,
      order: Number.isFinite(Number(module.order)) ? Number(module.order) : (index + 1) * 10,
    }))
  );

  const sharedHabits = normalizeNamedPreferences(
    input.sharedHabits ?? current.sharedHabits,
    FIXED_SHARED_HABITS
  );
  const customHabitStarters = normalizeStarterPreferences(
    input.customHabitStarters ?? current.customHabitStarters
  );
  const spiritualStreaks = normalizeNamedPreferences(
    input.spiritualStreaks ?? current.spiritualStreaks,
    SPIRITUAL_STREAK_BOARD_CONFIGS
  );
  const moods = normalizeNamedPreferences(input.moods ?? current.moods, MOOD_DEFINITIONS);
  if (!moods.some((mood) => mood.enabled)) {
    const neutral = moods.find((mood) => mood.key === "neutral") || moods[0];
    if (neutral) neutral.enabled = true;
  }

  const completed = input.completed ?? current.completed;
  const next: DashboardOnboardingPreferences = {
    completed,
    completedAt: completed ? current.completedAt || new Date().toISOString() : null,
    workspaceMode: input.workspaceMode || current.workspaceMode,
    partnerEmail: normalizePartnerEmail(input.partnerEmail ?? current.partnerEmail),
    modules,
    sharedHabits,
    customHabitStarters,
    spiritualStreaks,
    moods,
  };

  if (completed) {
    await applyStarterHabits(userEmail, customHabitStarters);
  }

  await setSetting(userEmail, ONBOARDING_SETTINGS_KEY, JSON.stringify(toStoredPreferences(next)));
  return next;
}

export async function getEnabledSharedHabitsForUser(userEmail: string) {
  const preferences = await getDashboardOnboardingPreferences(userEmail);
  return preferences.sharedHabits
    .filter((habit) => habit.enabled)
    .map((habit) => ({ key: habit.key, label: habit.label }));
}

export async function getEnabledSpiritualStreakConfigsForUser(userEmail: string) {
  const preferences = await getDashboardOnboardingPreferences(userEmail);
  const byKey = new Map(SPIRITUAL_STREAK_BOARD_CONFIGS.map((board) => [board.key, board]));
  return preferences.spiritualStreaks
    .filter((board) => board.enabled)
    .map((board) => {
      const config = byKey.get(board.key as (typeof SPIRITUAL_STREAK_BOARD_CONFIGS)[number]["key"]);
      return config ? { ...config, title: board.label } : null;
    })
    .filter((board): board is NonNullable<typeof board> => Boolean(board));
}
