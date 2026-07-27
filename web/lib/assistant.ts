export const ASSISTANT_ACTION_TYPES = [
  "create_task",
  "update_task",
  "bulk_update_tasks",
  "create_habit",
  "create_area",
  "set_habit_status",
  "log_mood",
  "update_day_metrics",
  "set_low_energy_mode",
  "set_ministry_month_goal",
  "update_ministry_day",
  "set_ministry_recurrence",
  "remove_ministry_recurrence",
  "update_reading_progress",
  "set_books_goal",
  "create_book",
  "update_book",
  "update_spiritual_streak",
  "update_spiritual_goal",
  "add_dissertation_step",
  "update_dissertation_front",
  "add_couple_goal",
  "update_couple_goal",
  "add_savings_goal",
  "update_savings_goal",
  "add_bucket_item",
  "toggle_bucket_item",
  "add_finance_expense",
  "upsert_finance_debt",
  "update_finance_income",
  "update_finance_fixed_cost",
  "set_assistant_preferences",
] as const;

export type AssistantActionType = (typeof ASSISTANT_ACTION_TYPES)[number];
export type AssistantScope =
  | "all"
  | "today"
  | "calendar"
  | "habits"
  | "ministry"
  | "mood"
  | "dissertation"
  | "stats"
  | "finances"
  | "books"
  | "publications"
  | "goals"
  | "spiritual"
  | "couple";

export type AssistantAction = {
  id: string;
  type: AssistantActionType;
  title: string;
  reason: string;
  payload: {
    taskId?: string;
    title?: string;
    scheduledDate?: string | null;
    scheduledTime?: string | null;
    plannedTime?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    estimatedMinutes?: number | null;
    priority?: "Low" | "Medium" | "High" | "Critical";
    areaTag?: string | null;
    focusOrder?: number | null;
    effort?: "low" | "medium" | "high" | null;
    scheduleLocked?: boolean;
    habitName?: string;
    habitKey?: string;
    completed?: boolean;
    loggedTime?: string;
    moodCategory?: string;
    sleepHours?: number | null;
    anxietyLevel?: number | null;
    workHours?: number | null;
    boredomMinutes?: number | null;
    enabled?: boolean;
    areaLabel?: string;
    areaColor?: string | null;
    month?: string;
    targetMinutes?: number | null;
    date?: string;
    goalMinutes?: number | null;
    actualMinutes?: number | null;
    notes?: string | null;
    recurrenceId?: string;
    recurrenceLabel?: string;
    weekday?: number;
    startDate?: string;
    endDate?: string | null;
    readingUpdates?: AssistantReadingUpdate[];
    year?: number;
    yearlyGoal?: number;
    bookId?: string;
    author?: string | null;
    coverUrl?: string | null;
    totalPages?: number | null;
    pagesRead?: number;
    bookStatus?: "planned" | "reading" | "finished";
    rating?: number | null;
    boardKey?:
      | "daily_text"
      | "bible_reading"
      | "prayer_on_waking"
      | "prayer_before_lunch"
      | "prayer_before_sleep"
      | "pornography"
      | "masturbation";
    success?: boolean | null;
    spiritualCategory?:
      | "big_goals"
      | "christian_qualities"
      | "leaving_bad_habits"
      | "ministry_skills"
      | "prudence";
    spiritualOperation?:
      | "complete_current"
      | "move_back"
      | "add_task"
      | "toggle_task"
      | "save_step_notes"
      | "save_general_notes";
    stepId?: string;
    taskCompleted?: boolean;
    frontId?: string;
    status?: string;
    dueDate?: string | null;
    askWhenUncertain?: boolean;
    goalId?: string;
    category?: string;
    size?: string;
    emoji?: string;
    progress?: number;
    targetDate?: string | null;
    savingsGoalId?: string;
    targetAmount?: number;
    currentAmount?: number;
    bucketItemId?: string;
    expenseId?: string;
    amount?: number;
    paid?: boolean;
    debtKey?: string;
    totalAmount?: number;
    monthlyAmount?: number;
    paidAmount?: number;
    incomeKey?: "gui" | "jahdy" | "extras";
    fixedCostId?: string;
    budget?: number;
    actual?: number | null;
    taskUpdates?: Array<{
      taskId: string;
      title?: string;
      scheduledDate?: string | null;
      scheduledTime?: string | null;
      plannedTime?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      estimatedMinutes?: number | null;
      priority?: "Low" | "Medium" | "High" | "Critical";
      areaTag?: string | null;
      focusOrder?: number | null;
      effort?: "low" | "medium" | "high" | null;
      notes?: string | null;
      scheduleLocked?: boolean;
      completed?: boolean;
    }>;
  };
};

export type AssistantReply = {
  message: string;
  actions: AssistantAction[];
};

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantReadingUpdate =
  | {
      kind: "despertai_issue";
      itemId: string;
      label?: string;
      read: boolean;
    }
  | {
      kind: "despertai_topic";
      itemId: string;
      topicId: string;
      label?: string;
      read: boolean;
    }
  | {
      kind:
        | "video"
        | "broadcasting"
        | "article_series"
        | "reading_book"
        | "tract"
        | "apostila"
        | "brochure"
        | "watchtower";
      itemId: string;
      label?: string;
      read: boolean;
    }
  | {
      kind: "bible_chapters";
      bookKey: string;
      chapters: number[];
      label?: string;
      read: boolean;
    };
