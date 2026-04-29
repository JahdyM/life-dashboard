export type HabitFieldName =
  | "bibleReading"
  | "bibleStudy"
  | "dissertationWork"
  | "workout"
  | "generalReading"
  | "shower"
  | "dailyText"
  | "meetingAttended"
  | "prepareMeeting"
  | "familyWorship"
  | "writing"
  | "scientificWriting";

export type HabitScheduleRule = "daily" | "meeting_days" | "family_worship_day";

export type HabitFieldConfig = {
  key: string;
  label: string;
  field: HabitFieldName;
  scope: "shared" | "personal";
  schedule: HabitScheduleRule;
  defaultEnabled: boolean;
};

export type CustomHabitTemplate = {
  id: string;
  name: string;
  active: boolean;
};

export const MERGED_BIBLE_HABIT_KEY = "bible_reading";
export const MERGED_BIBLE_HABIT_LABEL = "Bible reading & study";

const MERGED_BIBLE_HABIT_NAMES = new Set([
  "bible reading",
  "bible study",
  "bible reading & study",
  "bible study & reading",
  "bible read",
  "read bible",
  "study bible",
]);

function canonicalMergedHabitName(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*\(books\)/g, "");
}

export function isMergedBibleHabitName(value: string) {
  return MERGED_BIBLE_HABIT_NAMES.has(canonicalMergedHabitName(value));
}

export function getHabitDisplayLabel(key: string, label: string) {
  if (key === MERGED_BIBLE_HABIT_KEY && isMergedBibleHabitName(label)) {
    return MERGED_BIBLE_HABIT_LABEL;
  }
  return label;
}

export function isHabitEntryDone(
  entry: Record<string, unknown> | null | undefined,
  habitKey: string
) {
  if (!entry) return false;
  if (habitKey === MERGED_BIBLE_HABIT_KEY) {
    return Boolean(entry.bibleReading || entry.bibleStudy);
  }
  const field = getHabitField(habitKey);
  return Boolean(field ? entry[field] : false);
}

export const HABIT_FIELD_CONFIGS: HabitFieldConfig[] = [
  {
    key: MERGED_BIBLE_HABIT_KEY,
    label: MERGED_BIBLE_HABIT_LABEL,
    field: "bibleReading",
    scope: "shared",
    schedule: "daily",
    defaultEnabled: true,
  },
  {
    key: "meeting_attended",
    label: "Meeting attended",
    field: "meetingAttended",
    scope: "shared",
    schedule: "meeting_days",
    defaultEnabled: true,
  },
  {
    key: "prepare_meeting",
    label: "Prepare meeting",
    field: "prepareMeeting",
    scope: "shared",
    schedule: "meeting_days",
    defaultEnabled: true,
  },
  {
    key: "workout",
    label: "Workout",
    field: "workout",
    scope: "shared",
    schedule: "daily",
    defaultEnabled: true,
  },
  {
    key: "shower",
    label: "Shower",
    field: "shower",
    scope: "shared",
    schedule: "daily",
    defaultEnabled: true,
  },
  {
    key: "daily_text",
    label: "Daily text",
    field: "dailyText",
    scope: "shared",
    schedule: "daily",
    defaultEnabled: true,
  },
  {
    key: "family_worship",
    label: "Family worship",
    field: "familyWorship",
    scope: "shared",
    schedule: "family_worship_day",
    defaultEnabled: true,
  },
  {
    key: "dissertation_work",
    label: "Dissertation work",
    field: "dissertationWork",
    scope: "personal",
    schedule: "daily",
    defaultEnabled: true,
  },
  {
    key: "general_reading",
    label: "General reading",
    field: "generalReading",
    scope: "personal",
    schedule: "daily",
    defaultEnabled: true,
  },
  {
    key: "writing",
    label: "Writing",
    field: "writing",
    scope: "personal",
    schedule: "daily",
    defaultEnabled: true,
  },
  {
    key: "scientific_writing",
    label: "Scientific writing",
    field: "scientificWriting",
    scope: "personal",
    schedule: "daily",
    defaultEnabled: true,
  },
];

export const FIXED_SHARED_HABITS = HABIT_FIELD_CONFIGS
  .filter((habit) => habit.scope === "shared" && habit.defaultEnabled)
  .map(({ key, label }) => ({ key, label }));

export const PERSONAL_HABIT_KEYS = HABIT_FIELD_CONFIGS
  .filter((habit) => habit.scope === "personal" && habit.defaultEnabled)
  .map(({ key, label }) => ({ key, label }));

export const DEFAULT_CUSTOM_HABIT_TEMPLATES: CustomHabitTemplate[] = [
  { id: "default-dissertation-work", name: "Dissertation work", active: true },
  { id: "default-general-reading", name: "General reading (books)", active: true },
  { id: "default-writing", name: "Writing", active: true },
  { id: "default-scientific-writing", name: "Scientific Writing", active: true },
];

export const HABIT_FIELD_NAMES = HABIT_FIELD_CONFIGS.map((habit) => habit.field);

export const HABIT_DEFAULT_VALUES = HABIT_FIELD_NAMES.reduce(
  (acc, field) => {
    acc[field] = 0;
    return acc;
  },
  {} as Record<HabitFieldName, number>
);

export const HABIT_FIELD_MAP = HABIT_FIELD_CONFIGS.reduce(
  (acc, habit) => {
    acc[habit.key] = habit.field;
    return acc;
  },
  { bible_study: "bibleReading" } as Record<string, HabitFieldName>
);

const HABIT_CONFIG_BY_KEY = new Map(HABIT_FIELD_CONFIGS.map((habit) => [habit.key, habit]));

export const SHARED_HABIT_KEYS = FIXED_SHARED_HABITS.map((item) => item.key);

export const WEEKDAY_LABELS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

export const WEEKDAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const WEEKDAY_LABELS_SUN_FIRST_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const WEEKDAY_LABELS_SHORT_EN = ["S", "M", "T", "W", "T", "F", "S"];

export function getHabitField(key: string) {
  return HABIT_FIELD_MAP[key];
}

export function getHabitConfig(key: string) {
  return HABIT_CONFIG_BY_KEY.get(key) || null;
}

export function isHabitScheduledForWeekday(
  habitKey: string,
  weekday: number,
  meetingDays: number[],
  familyWorshipDay: number
) {
  const config = getHabitConfig(habitKey);
  if (!config || weekday < 0) return false;
  if (config.schedule === "meeting_days") return meetingDays.includes(weekday);
  if (config.schedule === "family_worship_day") return weekday === familyWorshipDay;
  return true;
}
