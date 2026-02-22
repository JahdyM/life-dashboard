export type PriorityTag = "Low" | "Medium" | "High" | "Critical";

export type DayEntry = {
  userEmail?: string;
  date?: string;
  bibleReading?: number | null;
  bibleStudy?: number | null;
  dissertationWork?: number | null;
  workout?: number | null;
  generalReading?: number | null;
  shower?: number | null;
  dailyText?: number | null;
  meetingAttended?: number | null;
  prepareMeeting?: number | null;
  familyWorship?: number | null;
  writing?: number | null;
  scientificWriting?: number | null;
  sleepHours?: number | null;
  anxietyLevel?: number | null;
  workHours?: number | null;
  boredomMinutes?: number | null;
  moodCategory?: string | null;
  priorityLabel?: string | null;
  priorityDone?: number | null;
  moodNote?: string | null;
  moodMediaUrl?: string | null;
  moodTagsJson?: string | null;
};

export type CustomHabit = {
  id: string;
  name: string;
  active?: boolean;
};

export type TodoSubtask = {
  id: string;
  taskId: string;
  userEmail: string;
  title: string;
  priorityTag: PriorityTag | string | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  isDone: number | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

export type TodoTask = {
  id: string;
  userEmail: string;
  title: string;
  source: string;
  externalEventKey?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  priorityTag?: PriorityTag | string | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  isDone?: number | null;
  completedAt?: string | null;
  googleCalendarId?: string | null;
  googleEventId?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  subtasks?: TodoSubtask[];
};

export type MoodEntry = {
  date: string;
  moodCategory?: string | null;
  moodNote?: string | null;
};

export type SharedStreakItem = {
  habit_key: string;
  label: string;
  user: {
    email: string;
    streak: number;
    max_streak?: number;
    today_done: boolean;
    today_applicable?: boolean;
  };
  partner: {
    email: string;
    streak: number;
    max_streak?: number;
    today_done: boolean;
    today_applicable?: boolean;
  };
};

export type StreakData = {
  items: SharedStreakItem[];
  warning?: string;
};

export type CoupleMoodboardData = {
  x_labels: string[];
  y_labels: string[];
  z: Array<Array<string | null>>;
  hover_text?: string[][];
  warning?: string;
};

export type InitData = {
  header: {
    date: string;
    habits_completed: number;
    habits_total: number;
    habits_percent: number;
  };
  meeting_days: number[];
  family_worship_day: number;
  pending_tasks: number;
  timezone?: string | null;
};

export type EntryMetric = {
  date: string;
  sleepHours?: number | null;
  workHours?: number | null;
  anxietyLevel?: number | null;
  boredomMinutes?: number | null;
};

export type EstimationSummary = {
  totalSamples: number;
  averageRatio: number | null;
  averageErrorMinutes: number | null;
  averageErrorPercent: number | null;
  averageAbsoluteErrorPercent: number | null;
  planningFallacyScore: number | null;
  tendency: "underestimate" | "overestimate" | "balanced" | "insufficient_data";
  recommendation: string;
};

export type EstimationBucket = {
  label: string;
  count: number;
  averageRatio: number | null;
  averageErrorPercent: number | null;
};

export type EstimationPoint = {
  taskId: string;
  title: string;
  estimatedMinutes: number;
  actualMinutes: number;
  ratio: number;
  errorMinutes: number;
  errorPercent: number;
  priorityTag: string;
  scheduledDate: string | null;
};

export type EstimationResponse = {
  summary: EstimationSummary;
  byPriority: EstimationBucket[];
  byDuration: EstimationBucket[];
  points: EstimationPoint[];
};
