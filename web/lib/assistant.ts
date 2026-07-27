export const ASSISTANT_ACTION_TYPES = [
  "create_task",
  "update_task",
  "bulk_update_tasks",
  "create_habit",
  "create_area",
  "set_ministry_month_goal",
  "update_ministry_day",
  "set_ministry_recurrence",
  "remove_ministry_recurrence",
  "update_reading_progress",
  "add_dissertation_step",
  "update_dissertation_front",
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
    estimatedMinutes?: number | null;
    priority?: "Low" | "Medium" | "High" | "Critical";
    areaTag?: string | null;
    focusOrder?: number | null;
    habitName?: string;
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
    frontId?: string;
    status?: string;
    dueDate?: string | null;
    taskUpdates?: Array<{
      taskId: string;
      title?: string;
      scheduledDate?: string | null;
      scheduledTime?: string | null;
      estimatedMinutes?: number | null;
      priority?: "Low" | "Medium" | "High" | "Critical";
      areaTag?: string | null;
      focusOrder?: number | null;
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
