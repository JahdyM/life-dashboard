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

export type TaskShareInvite = {
  id: string;
  sourceTaskId: string;
  title: string;
  fromEmail: string;
  toEmail: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  estimatedMinutes: number | null;
  priorityTag: string | null;
  status: "pending" | "accepted" | "declined" | "revoked";
  createdAt: string;
  respondedAt: string | null;
  recipientTaskId: string | null;
};

export type QuickNote = {
  id: string;
  text: string;
  done: number;
};

export type TodoSubtask = {
  id: string;
  taskId: string;
  userEmail: string;
  title: string;
  order?: number | null;
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
  plannedTime?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
  focusOrder?: number | null;
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

export type MoodMomentEntry = {
  id: string;
  dayIso: string;
  loggedAt: string;
  moodCategory: string | null;
  moodNote: string | null;
  source: "moment" | "legacy_summary";
};

export type MoodDaySummary = {
  date: string;
  moodCategory: string | null;
  moodNote: string | null;
  totalEntries: number;
  latestLoggedAt: string | null;
  source: "moments" | "legacy";
};

export type MoodHistoryResponse = {
  entries: MoodMomentEntry[];
  dailySummaries: MoodDaySummary[];
  historyStart: string | null;
  historyEnd: string | null;
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
  byWeekday?: EstimationBucket[];
  bySource?: EstimationBucket[];
  trend?: {
    currentRatio: number | null;
    previousRatio: number | null;
    delta: number | null;
    message: string;
  };
  points: EstimationPoint[];
};

export type HabitCorrelationItem = {
  key: string;
  label: string;
  withHabitRate: number | null;
  withoutHabitRate: number | null;
  impact: number | null;
  withHabitDays: number;
  withoutHabitDays: number;
};

export type MoodCorrelationResponse = {
  period: "30d" | "90d" | "all";
  positiveMoods: string[];
  rows: HabitCorrelationItem[];
  insight: string;
};

export type AnxietyTrendPoint = {
  date: string;
  anxiety: number;
  movingAverage7: number;
};

export type AnxietyTrendResponse = {
  periodDays: 30 | 90;
  points: AnxietyTrendPoint[];
  highAnxietyCurrentStreak: number;
  highAnxietyMaxStreak: number;
  alert: string | null;
  sleepCorrelation: {
    lowSleepAverage: number | null;
    regularSleepAverage: number | null;
    sampleLowSleep: number;
    sampleRegularSleep: number;
  };
};

export type SleepScoreResponse = {
  score: number;
  components: {
    duration: number;
    consistency: number;
    impact: number;
  };
  trend14: Array<{ date: string; score: number }>;
  insight: string;
};

export type WeeklyReportResponse = {
  week: string;
  habitsCompletionPercent: number;
  moodPredominant: string | null;
  negativeMoodDays: number;
  workHoursTotal: number;
  topHabits: Array<{ key: string; label: string; value: number }>;
  comparison: {
    habitsDelta: number;
    workHoursDelta: number;
    negativeMoodDelta: number;
  };
  message: string;
};

export type ProductivityHeatmapResponse = {
  period: "30d" | "90d" | "all";
  weeks: string[];
  weekdays: Array<{ index: number; label: string; averageScore: number }>;
  matrix: number[][];
  insight: string;
};

export type LifeBalanceResponse = {
  score: number;
  breakdown: {
    physical: number;
    mental: number;
    spiritual: number;
    productivity: number;
  };
  trend: Array<{ date: string; score: number }>;
  insight: string;
};

export type CoupleComparisonResponse = {
  periodDays: number;
  users: Array<{
    email: string;
    name: string;
    sleepAvg: number | null;
    anxietyAvg: number | null;
    habitCompletionRate: number | null;
  }>;
  notes: string[];
};

export type MinistryPaceStatus = "ahead" | "on_track" | "behind" | "no_plan";

export type MinistryDayStatus =
  | "no_goal"
  | "planned"
  | "missed"
  | "partial"
  | "met"
  | "exceeded";

export type MinistryMonthlyGoal = {
  id: string;
  userEmail?: string;
  year: number;
  month: number;
  targetMinutes: number;
  createdAt?: string;
  updatedAt?: string;
};

export type MinistryDailyEntry = {
  id: string;
  userEmail?: string;
  date: string;
  goalMinutes: number | null;
  actualMinutes: number | null;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type MinistryDayComputed = {
  date: string;
  goalMinutes: number | null;
  actualMinutes: number | null;
  notes: string | null;
  differenceMinutes: number | null;
  status: MinistryDayStatus;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
};

export type MinistryMonthSummary = {
  monthKey: string;
  targetMinutes: number | null;
  totalPlannedMinutes: number;
  plannedDifferenceFromTargetMinutes: number | null;
  totalCompletedMinutes: number;
  completedSoFarMinutes: number;
  totalRemainingMinutes: number | null;
  completionPercent: number | null;
  daysInMonth: number;
  elapsedDaysInMonth: number;
  dailyTargetMinutes: number | null;
  expectedByTodayMinutes: number | null;
  paceDifferenceMinutes: number | null;
  paceStatus: MinistryPaceStatus;
  paceLabel: string;
};

export type MinistryMonthPayload = {
  monthKey: string;
  todayIso: string;
  goal: MinistryMonthlyGoal | null;
  entries: MinistryDailyEntry[];
  days: MinistryDayComputed[];
  summary: MinistryMonthSummary;
};

export type SpiritualGoalCategory =
  | "big_goals"
  | "christian_qualities"
  | "leaving_bad_habits"
  | "ministry_skills"
  | "prudence";

export type SpiritualGoalAvatarStyle = "sprout" | "spark" | "compass" | "bookmark";

export type SpiritualGoalStepTask = {
  id: string;
  title: string;
  completed: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type SpiritualGoalStep = {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  completedAt: string | null;
  tasks: SpiritualGoalStepTask[];
};

export type SpiritualGoalStaircase = {
  category: SpiritualGoalCategory;
  title: string;
  ultimateGoal: string;
  subtitle: string | null;
  themeColor: string | null;
  avatarStyle: SpiritualGoalAvatarStyle | null;
  generalNotes: string | null;
  createdAt?: string;
  updatedAt?: string;
  steps: SpiritualGoalStep[];
};

export type SpiritualGoalStepState = "locked" | "available" | "current" | "completed";

export type SpiritualGoalComputedStep = SpiritualGoalStep & {
  stepOrder: number;
  state: SpiritualGoalStepState;
  isCompleted: boolean;
  isCurrent: boolean;
  isAvailable: boolean;
  isLocked: boolean;
};

export type SpiritualGoalComputedStaircase = Omit<SpiritualGoalStaircase, "steps"> & {
  steps: SpiritualGoalComputedStep[];
  accentColor: string;
  totalSteps: number;
  completedSteps: number;
  progressPercent: number;
  currentStepIndex: number | null;
  currentStepId: string | null;
  currentStepTitle: string | null;
  summaryText: string;
};

export type SpiritualGoalsPageData = {
  items: SpiritualGoalComputedStaircase[];
};

export type SpiritualStreakBoardKey =
  | "daily_text"
  | "bible_reading"
  | "prayer_on_waking"
  | "prayer_before_lunch"
  | "prayer_before_sleep"
  | "pornography"
  | "masturbation";

export type SpiritualStreakSuccessRule = "completed_today" | "clean_day";

export type SpiritualStreakEntry = {
  date: string;
  success: boolean;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SpiritualStreakDayCellState = "success" | "failure" | "unmarked";

export type SpiritualStreakDayCell = {
  date: string;
  dayNumber: number;
  success: boolean | null;
  note: string | null;
  isToday: boolean;
  isFuture: boolean;
  state: SpiritualStreakDayCellState;
};

export type SpiritualStreakBoard = {
  key: SpiritualStreakBoardKey;
  title: string;
  accentColor: string;
  successRule: SpiritualStreakSuccessRule;
  quickPrompt: string;
  yesLabel: string;
  noLabel: string;
  emptyLabel: string;
  currentStreak: number;
  bestStreak: number;
  monthSuccessDays: number;
  monthMarkedDays: number;
  monthTotalDays: number;
  firstWeekday: number;
  summaryText: string;
  todayStatus: boolean | null;
  cells: SpiritualStreakDayCell[];
};

export type SpiritualStreaksPageData = {
  monthKey: string;
  monthLabel: string;
  todayIso: string;
  boards: SpiritualStreakBoard[];
};

export type BookEntryStatus = "reading" | "finished" | "planned";

export type BookEntry = {
  id: string;
  year: number;
  title: string;
  author: string | null;
  coverUrl: string | null;
  totalPages: number | null;
  pagesRead: number;
  status: BookEntryStatus;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
};

export type BooksPageData = {
  year: number;
  yearlyGoal: number;
  finishedCount: number;
  readingCount: number;
  totalCount: number;
  progressPercent: number;
  items: BookEntry[];
};

export type DespertaiTopic = {
  id: string;
  title: string;
  read: boolean;
};

export type DespertaiIssue = {
  id: string;
  year: number;
  dateLabel: string | null;
  title: string;
  url: string | null;
  topics: DespertaiTopic[];
  readCount: number;
  totalTopics: number;
  progressPercent: number;
  isFinished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReadingVideo = {
  id: string;
  title: string;
  durationSeconds: number;
  naturalKey: string | null;
  documentId: string | null;
  url: string | null;
  read: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BibleBookProgress = {
  key: string;
  name: string;
  chapters: number;
  readChapters: number[];
  readCount: number;
  progressPercent: number;
};

export type BibleSectionProgress = {
  title: string;
  books: BibleBookProgress[];
};

export type ReadingPageData = {
  despertai: {
    totalIssues: number;
    finishedIssues: number;
    totalTopics: number;
    readTopics: number;
    progressPercent: number;
    pendingIssues: DespertaiIssue[];
    finishedIssuesList: DespertaiIssue[];
  };
  videos: {
    totalVideos: number;
    finishedVideos: number;
    pendingVideos: number;
    totalDurationSeconds: number;
    watchedDurationSeconds: number;
    progressPercent: number;
    pendingVideosList: ReadingVideo[];
    finishedVideosList: ReadingVideo[];
  };
  bible: {
    totalChapters: number;
    readChapters: number;
    progressPercent: number;
    sections: BibleSectionProgress[];
  };
};
