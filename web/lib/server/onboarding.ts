import {
  buildDashboardModuleViews,
  type DashboardModuleConfig,
  type DashboardModuleKey,
  type DashboardModulePreference,
  type DashboardOnboardingPreferences,
  type WorkspaceMode,
} from "@/lib/config/dashboard";
import { getSetting, setSetting } from "./settings";

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
};

export type OnboardingSaveInput = {
  completed?: boolean;
  workspaceMode?: WorkspaceMode;
  partnerEmail?: string | null;
  modules?: DashboardModulePreference[];
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
  };
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

  const completed = input.completed ?? current.completed;
  const next: DashboardOnboardingPreferences = {
    completed,
    completedAt: completed ? current.completedAt || new Date().toISOString() : null,
    workspaceMode: input.workspaceMode || current.workspaceMode,
    partnerEmail: normalizePartnerEmail(input.partnerEmail ?? current.partnerEmail),
    modules,
  };

  await setSetting(userEmail, ONBOARDING_SETTINGS_KEY, JSON.stringify(toStoredPreferences(next)));
  return next;
}
