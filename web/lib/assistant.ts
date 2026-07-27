export const ASSISTANT_ACTION_TYPES = [
  "create_task",
  "update_task",
  "create_habit",
] as const;

export type AssistantActionType = (typeof ASSISTANT_ACTION_TYPES)[number];

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
