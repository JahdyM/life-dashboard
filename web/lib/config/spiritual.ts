import type {
  SpiritualGoalAvatarStyle,
  SpiritualGoalCategory,
  SpiritualStreakBoardKey,
  SpiritualStreakSuccessRule,
} from "../types";

export type SpiritualGoalCategoryConfig = {
  category: SpiritualGoalCategory;
  label: string;
  defaultTitle: string;
  defaultUltimateGoal: string;
  defaultSubtitle: string;
  defaultThemeColor: string;
  defaultAvatarStyle: SpiritualGoalAvatarStyle;
};

export type SpiritualStreakBoardConfig = {
  key: SpiritualStreakBoardKey;
  title: string;
  accentColor: string;
  successRule: SpiritualStreakSuccessRule;
  quickPrompt: string;
  yesLabel: string;
  noLabel: string;
  emptyLabel: string;
};

export const SPIRITUAL_GOAL_CATEGORY_KEYS = [
  "big_goals",
  "christian_qualities",
  "leaving_bad_habits",
  "ministry_skills",
  "prudence",
] as const;

export const SPIRITUAL_GOAL_CATEGORY_CONFIGS: SpiritualGoalCategoryConfig[] = [
  {
    category: "big_goals",
    label: "Big Goals",
    defaultTitle: "Big Goals",
    defaultUltimateGoal: "Keep moving toward the larger calling that matters most.",
    defaultSubtitle: "A wide staircase for the long-range goals that deserve patience and consistency.",
    defaultThemeColor: "#D0A56F",
    defaultAvatarStyle: "compass",
  },
  {
    category: "christian_qualities",
    label: "Christian Qualities",
    defaultTitle: "Christian Qualities",
    defaultUltimateGoal: "Cultivate qualities that shape daily life with gentleness and strength.",
    defaultSubtitle: "Small practices that slowly become part of who you are.",
    defaultThemeColor: "#A8B88B",
    defaultAvatarStyle: "sprout",
  },
  {
    category: "leaving_bad_habits",
    label: "Leaving Bad Habits",
    defaultTitle: "Leaving Bad Habits",
    defaultUltimateGoal: "Replace harmful patterns with calmer, healthier responses.",
    defaultSubtitle: "Not harsh self-judgment, but steady progress away from what weakens you.",
    defaultThemeColor: "#C68A80",
    defaultAvatarStyle: "spark",
  },
  {
    category: "ministry_skills",
    label: "Ministry Skills",
    defaultTitle: "Ministry Skills",
    defaultUltimateGoal: "Grow in confidence, clarity, and warmth in the ministry.",
    defaultSubtitle: "Each step can hold one skill you want to practice with care.",
    defaultThemeColor: "#8DA9C4",
    defaultAvatarStyle: "bookmark",
  },
  {
    category: "prudence",
    label: "Prudence",
    defaultTitle: "Prudence",
    defaultUltimateGoal: "Prepare quietly beforehand so important moments are met with calm readiness.",
    defaultSubtitle: "Thoughtful planning, reminders, and contingency steps that keep life ordered and steady.",
    defaultThemeColor: "#B79D7B",
    defaultAvatarStyle: "compass",
  },
];

export const SPIRITUAL_STREAK_BOARD_KEYS = [
  "daily_text",
  "bible_reading",
  "prayer_on_waking",
  "prayer_before_lunch",
  "prayer_before_sleep",
  "pornography",
  "masturbation",
] as const;

export const SPIRITUAL_STREAK_BOARD_CONFIGS: SpiritualStreakBoardConfig[] = [
  {
    key: "daily_text",
    title: "Daily Text Reading",
    accentColor: "#CDA36E",
    successRule: "completed_today",
    quickPrompt: "Completed today?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
  {
    key: "bible_reading",
    title: "Bible Reading",
    accentColor: "#88AFC5",
    successRule: "completed_today",
    quickPrompt: "Completed today?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
  {
    key: "prayer_on_waking",
    title: "Prayer on waking",
    accentColor: "#D6B67A",
    successRule: "completed_today",
    quickPrompt: "Completed today?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
  {
    key: "prayer_before_lunch",
    title: "Prayer before lunch",
    accentColor: "#91A97E",
    successRule: "completed_today",
    quickPrompt: "Completed today?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
  {
    key: "prayer_before_sleep",
    title: "Prayer before sleep",
    accentColor: "#8E93BC",
    successRule: "completed_today",
    quickPrompt: "Completed today?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
  {
    key: "pornography",
    title: "Pornography",
    accentColor: "#93B79B",
    successRule: "clean_day",
    quickPrompt: "Clean day?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
  {
    key: "masturbation",
    title: "Masturbation",
    accentColor: "#B59EB3",
    successRule: "clean_day",
    quickPrompt: "Clean day?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
];
