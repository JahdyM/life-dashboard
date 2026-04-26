export type DashboardModuleKey =
  | "today"
  | "calendar"
  | "habits"
  | "ministry"
  | "mood"
  | "books"
  | "spiritual_goals"
  | "spiritual_streaks"
  | "stats"
  | "couple";

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

export function getDashboardModules(group?: DashboardModuleConfig["navGroup"]) {
  return DASHBOARD_MODULES
    .filter((module) => module.defaultEnabled && (!group || module.navGroup === group))
    .sort((a, b) => a.order - b.order);
}
