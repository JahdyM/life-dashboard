export const DASHBOARD_MODULE_KEYS = [
  "today",
  "calendar",
  "habits",
  "ministry",
  "mood",
  "books",
  "spiritual_goals",
  "spiritual_streaks",
  "stats",
  "couple",
] as const;

export type DashboardModuleKey = (typeof DASHBOARD_MODULE_KEYS)[number];

export type DashboardModuleIconKey =
  | "sparkles"
  | "calendar"
  | "timer"
  | "ministry"
  | "moon"
  | "book"
  | "telescope"
  | "book_heart"
  | "chart"
  | "heart";

export type DashboardModuleConfig = {
  key: DashboardModuleKey;
  label: string;
  href: string;
  navGroup: "primary" | "secondary";
  icon: DashboardModuleIconKey;
  defaultEnabled: boolean;
  order: number;
};

export type DashboardModulePreference = {
  key: DashboardModuleKey;
  label: string;
  enabled: boolean;
  navGroup: DashboardModuleConfig["navGroup"];
  order: number;
};

export type DashboardModuleView = DashboardModuleConfig & {
  defaultLabel: string;
  enabled: boolean;
};

export type WorkspaceMode = "solo" | "shared";

export type DashboardOnboardingPreferences = {
  completed: boolean;
  completedAt: string | null;
  workspaceMode: WorkspaceMode;
  partnerEmail: string | null;
  modules: DashboardModuleView[];
};

export const DASHBOARD_MODULES: DashboardModuleConfig[] = [
  {
    key: "today",
    label: "Today",
    href: "/today",
    navGroup: "primary",
    icon: "sparkles",
    defaultEnabled: true,
    order: 10,
  },
  {
    key: "calendar",
    label: "Calendar",
    href: "/calendar",
    navGroup: "primary",
    icon: "calendar",
    defaultEnabled: true,
    order: 20,
  },
  {
    key: "habits",
    label: "Habits",
    href: "/habits",
    navGroup: "primary",
    icon: "timer",
    defaultEnabled: true,
    order: 30,
  },
  {
    key: "ministry",
    label: "Ministry",
    href: "/ministry",
    navGroup: "primary",
    icon: "ministry",
    defaultEnabled: true,
    order: 40,
  },
  {
    key: "mood",
    label: "Mood",
    href: "/mood",
    navGroup: "primary",
    icon: "moon",
    defaultEnabled: true,
    order: 50,
  },
  {
    key: "books",
    label: "Books",
    href: "/books",
    navGroup: "secondary",
    icon: "book",
    defaultEnabled: true,
    order: 60,
  },
  {
    key: "spiritual_goals",
    label: "Spiritual Goals",
    href: "/spiritual-goals",
    navGroup: "secondary",
    icon: "telescope",
    defaultEnabled: true,
    order: 70,
  },
  {
    key: "spiritual_streaks",
    label: "Spiritual Streaks",
    href: "/spiritual-streaks",
    navGroup: "secondary",
    icon: "book_heart",
    defaultEnabled: true,
    order: 80,
  },
  {
    key: "stats",
    label: "Stats",
    href: "/stats",
    navGroup: "secondary",
    icon: "chart",
    defaultEnabled: true,
    order: 90,
  },
  {
    key: "couple",
    label: "Couple",
    href: "/couple",
    navGroup: "secondary",
    icon: "heart",
    defaultEnabled: true,
    order: 100,
  },
];

export function buildDashboardModuleViews(
  preferences: Partial<DashboardModulePreference>[] = []
): DashboardModuleView[] {
  const preferenceByKey = new Map(preferences.map((item) => [item.key, item]));
  const modules = DASHBOARD_MODULES.map((module) => {
    const preference = preferenceByKey.get(module.key);
    const enabled = module.key === "today" ? true : (preference?.enabled ?? module.defaultEnabled);
    return {
      ...module,
      label: String(preference?.label || module.label).trim() || module.label,
      navGroup: preference?.navGroup || module.navGroup,
      order: preference?.order ?? module.order,
      enabled,
      defaultLabel: module.label,
    } satisfies DashboardModuleView;
  }).sort((a, b) => a.order - b.order);

  if (!modules.some((module) => module.enabled)) {
    return modules.map((module) =>
      module.key === "today" ? { ...module, enabled: true } : module
    );
  }

  return modules;
}

export function getDashboardModules(
  group?: DashboardModuleConfig["navGroup"],
  modules: DashboardModuleView[] = buildDashboardModuleViews()
) {
  return modules
    .filter((module) => module.enabled && (!group || module.navGroup === group))
    .sort((a, b) => a.order - b.order);
}
