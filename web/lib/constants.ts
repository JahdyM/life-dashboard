import { MOOD_PALETTE as MOOD_DEFINITIONS_PALETTE } from "./moods";

export const FIXED_SHARED_HABITS = [
  { key: "bible_reading", label: "Bible reading" },
  { key: "meeting_attended", label: "Meeting attended" },
  { key: "prepare_meeting", label: "Prepare meeting" },
  { key: "workout", label: "Workout" },
  { key: "shower", label: "Shower" },
  { key: "daily_text", label: "Daily text" },
  { key: "family_worship", label: "Family worship" },
];

export const PERSONAL_HABIT_KEYS = [
  { key: "bible_study", label: "Bible study" },
  { key: "dissertation_work", label: "Dissertation work" },
  { key: "general_reading", label: "General reading" },
  { key: "writing", label: "Writing" },
  { key: "scientific_writing", label: "Scientific writing" },
];

export const MOOD_PALETTE = MOOD_DEFINITIONS_PALETTE;

export const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

export const WEEKDAY_LABELS_PT = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sab",
];

export const SHARED_HABIT_KEYS = FIXED_SHARED_HABITS.map((item) => item.key);
