import "server-only";

import { randomUUID } from "crypto";
import { addDays, subDays } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { BIBLE_BOOKS } from "@/lib/config/bible";
import { MOOD_DEFINITIONS } from "@/lib/moods";
import {
  SPIRITUAL_GOAL_CATEGORY_KEYS,
  SPIRITUAL_STREAK_BOARD_KEYS,
} from "@/lib/config/spiritual";
import {
  ASSISTANT_ACTION_TYPES,
  type AssistantAction,
  type AssistantChatMessage,
  type AssistantReply,
  type AssistantScope,
} from "@/lib/assistant";
import { applyDissertationAction, loadDissertationProject } from "./dissertation";
import { syncDissertationStepFromMirrorTask } from "./dissertationMirror";
import { createBook, getBooksPageData, updateBook, updateBooksGoal } from "./books";
import {
  addBucketItem,
  addCoupleGoal,
  addSavingsGoal,
  getBucketList,
  getCoupleGoals,
  getMonthlyFinance,
  getSavingsGoals,
  saveMonthlyFinance,
  toggleBucketItem,
  updateCoupleGoalProgress,
  updateSavingsGoalAmount,
} from "./coupleSettings";
import {
  getMinistryMonthData,
  getMinistryRecurringPlans,
  removeMinistryRecurringPlan,
  setMinistryDayEntry,
  setMinistryMonthlyGoal,
  upsertMinistryRecurringPlan,
} from "./ministry";
import {
  applyReadingProgressUpdates,
  getReadingAssistantContext,
} from "./reading";
import { getEstimationStats } from "./stats/estimation";
import {
  canonicalHabitKey,
  getAllCustomHabits,
  getCustomHabits,
  getTodayIsoForUser,
  getUserTimeZone,
  saveCustomHabits,
} from "./settings";
import {
  getAssistantPreferences,
  updateAssistantPreferences,
} from "./assistantPreferences";
import {
  getEnergySettings,
  setLowEnergyMode,
  setTaskEffort,
} from "./energy";
import {
  setCustomHabitStatusWithIntegrations,
  SHARED_HABIT_PATCH_KEYS,
  updateDailyEntryWithIntegrations,
} from "./habits";
import { createMoodMoment, getMoodHistory } from "./mood";
import { getEnabledSharedHabitsForUser } from "./onboarding";
import { addPointsOnce, POINTS } from "./rewards";
import { getSpiritualGoalsPageData, applySpiritualGoalAction } from "./spiritualGoals";
import {
  getSpiritualStreaksPageData,
  updateSpiritualStreakEntry,
} from "./spiritualStreaks";
import { createTaskArea, getTaskAreas } from "./taskAreas";
import { createTask, listTasks, updateTask } from "./tasks";
import { logServerEvent } from "./logger";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const isoTime = /^([01]\d|2[0-3]):[0-5]\d$/;
const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/;

const taskUpdateSchema = z.object({
  taskId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200).optional(),
  scheduledDate: z.union([z.string().regex(isoDate), z.null()]).optional(),
  scheduledTime: z.union([z.string().regex(isoTime), z.null()]).optional(),
  plannedTime: z.union([z.string().regex(isoTime), z.null()]).optional(),
  startTime: z.union([z.string().regex(isoTime), z.null()]).optional(),
  endTime: z.union([z.string().regex(isoTime), z.null()]).optional(),
  estimatedMinutes: z.number().int().min(1).max(480).nullable().optional(),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  areaTag: z.string().trim().max(40).nullable().optional(),
  focusOrder: z.number().int().min(1).max(1000).nullable().optional(),
  effort: z.enum(["low", "medium", "high"]).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  scheduleLocked: z.boolean().optional(),
  completed: z.boolean().optional(),
});

const readingUpdateSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("despertai_issue"),
      itemId: z.string().trim().min(1).max(160),
      label: z.string().trim().max(280).optional(),
      read: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("despertai_topic"),
      itemId: z.string().trim().min(1).max(160),
      topicId: z.string().trim().min(1).max(160),
      label: z.string().trim().max(280).optional(),
      read: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.enum([
        "video",
        "broadcasting",
        "article_series",
        "reading_book",
        "tract",
        "apostila",
        "brochure",
        "watchtower",
      ]),
      itemId: z.string().trim().min(1).max(160),
      label: z.string().trim().max(280).optional(),
      read: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("bible_chapters"),
      bookKey: z.string().trim().min(1).max(80),
      chapters: z.array(z.number().int().min(1).max(200)).min(1).max(200),
      label: z.string().trim().max(280).optional(),
      read: z.boolean(),
    })
    .strict(),
]);

const actionSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  type: z.enum(ASSISTANT_ACTION_TYPES),
  title: z.string().trim().min(1).max(160),
  reason: z.string().trim().max(300).default(""),
  payload: z
    .object({
      taskId: z.string().trim().min(1).max(100).optional(),
      title: z.string().trim().min(1).max(200).optional(),
      scheduledDate: z.union([z.string().regex(isoDate), z.null()]).optional(),
      scheduledTime: z.union([z.string().regex(isoTime), z.null()]).optional(),
      plannedTime: z.union([z.string().regex(isoTime), z.null()]).optional(),
      startTime: z.union([z.string().regex(isoTime), z.null()]).optional(),
      endTime: z.union([z.string().regex(isoTime), z.null()]).optional(),
      estimatedMinutes: z.number().int().min(1).max(480).nullable().optional(),
      priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
      areaTag: z.string().trim().max(40).nullable().optional(),
      focusOrder: z.number().int().min(1).max(1000).nullable().optional(),
      effort: z.enum(["low", "medium", "high"]).nullable().optional(),
      scheduleLocked: z.boolean().optional(),
      habitName: z.string().trim().min(1).max(60).optional(),
      habitKey: z.string().trim().min(1).max(80).optional(),
      completed: z.boolean().optional(),
      loggedTime: z.string().regex(isoTime).optional(),
      moodCategory: z.string().trim().min(1).max(80).optional(),
      sleepHours: z.number().min(0).max(24).nullable().optional(),
      anxietyLevel: z.number().int().min(0).max(10).nullable().optional(),
      workHours: z.number().min(0).max(24).nullable().optional(),
      boredomMinutes: z.number().int().min(0).max(1440).nullable().optional(),
      enabled: z.boolean().optional(),
      areaLabel: z.string().trim().min(1).max(28).optional(),
      areaColor: z
        .union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.null()])
        .optional(),
      month: z.string().regex(monthKey).optional(),
      targetMinutes: z.number().int().min(0).max(60_000).nullable().optional(),
      date: z.string().regex(isoDate).optional(),
      goalMinutes: z.number().int().min(0).max(1440).nullable().optional(),
      actualMinutes: z.number().int().min(0).max(1440).nullable().optional(),
      notes: z.string().trim().max(4000).nullable().optional(),
      recurrenceId: z.string().trim().min(1).max(120).optional(),
      recurrenceLabel: z.string().trim().min(1).max(120).optional(),
      weekday: z.number().int().min(0).max(6).optional(),
      startDate: z.string().regex(isoDate).optional(),
      endDate: z.union([z.string().regex(isoDate), z.null()]).optional(),
      readingUpdates: z.array(readingUpdateSchema).min(1).max(500).optional(),
      year: z.number().int().min(2000).max(2100).optional(),
      yearlyGoal: z.number().int().min(0).max(500).optional(),
      bookId: z.string().trim().min(1).max(160).optional(),
      author: z.string().trim().max(200).nullable().optional(),
      coverUrl: z.string().trim().url().max(2000).nullable().optional(),
      totalPages: z.number().int().min(1).max(20_000).nullable().optional(),
      pagesRead: z.number().int().min(0).max(20_000).optional(),
      bookStatus: z.enum(["planned", "reading", "finished"]).optional(),
      rating: z.number().int().min(1).max(5).nullable().optional(),
      boardKey: z.enum(SPIRITUAL_STREAK_BOARD_KEYS).optional(),
      success: z.boolean().nullable().optional(),
      spiritualCategory: z.enum(SPIRITUAL_GOAL_CATEGORY_KEYS).optional(),
      spiritualOperation: z
        .enum([
          "complete_current",
          "move_back",
          "add_task",
          "toggle_task",
          "save_step_notes",
          "save_general_notes",
        ])
        .optional(),
      stepId: z.string().trim().min(1).max(160).optional(),
      taskCompleted: z.boolean().optional(),
      frontId: z.string().trim().min(1).max(120).optional(),
      status: z.string().trim().max(500).optional(),
      dueDate: z.union([z.string().regex(isoDate), z.null()]).optional(),
      askWhenUncertain: z.boolean().optional(),
      goalId: z.string().trim().min(1).max(160).optional(),
      category: z.string().trim().min(1).max(80).optional(),
      size: z.string().trim().min(1).max(80).optional(),
      emoji: z.string().trim().min(1).max(20).optional(),
      progress: z.number().min(0).max(100).optional(),
      targetDate: z.union([z.string().regex(isoDate), z.null()]).optional(),
      savingsGoalId: z.string().trim().min(1).max(160).optional(),
      targetAmount: z.number().min(0).max(1_000_000_000).optional(),
      currentAmount: z.number().min(0).max(1_000_000_000).optional(),
      bucketItemId: z.string().trim().min(1).max(160).optional(),
      expenseId: z.string().trim().min(1).max(160).optional(),
      amount: z.number().min(0).max(1_000_000_000).optional(),
      paid: z.boolean().optional(),
      debtKey: z.string().trim().min(1).max(80).optional(),
      totalAmount: z.number().min(0).max(1_000_000_000).optional(),
      monthlyAmount: z.number().min(0).max(1_000_000_000).optional(),
      paidAmount: z.number().min(0).max(1_000_000_000).optional(),
      incomeKey: z.enum(["gui", "jahdy", "extras"]).optional(),
      fixedCostId: z.string().trim().min(1).max(160).optional(),
      budget: z.number().min(0).max(1_000_000_000).optional(),
      actual: z.number().min(0).max(1_000_000_000).nullable().optional(),
      taskUpdates: z.array(taskUpdateSchema).min(1).max(500).optional(),
    })
    .strict(),
});

const replySchema = z.object({
  message: z.string().trim().min(1).max(5000),
  actions: z.array(actionSchema).max(100).default([]),
});

const applySchema = z.array(actionSchema).min(1).max(100);

type AssistantContext = Awaited<ReturnType<typeof buildAssistantContext>>;
type EstimationHistoryItem = AssistantContext["completedTaskHistory"][number];

const payloadAliases: Record<string, string[]> = {
  taskId: ["task_id", "id"],
  title: ["name"],
  scheduledDate: ["scheduled_date"],
  scheduledTime: ["scheduled_time", "time"],
  plannedTime: ["planned_time"],
  startTime: ["start_time", "actual_start_time"],
  endTime: ["end_time", "actual_end_time"],
  estimatedMinutes: [
    "estimated_minutes",
    "estimate_minutes",
    "estimate",
    "duration_minutes",
    "durationMinutes",
    "duration",
  ],
  areaTag: ["area_tag", "tag"],
  focusOrder: ["focus_order", "order"],
  effort: ["effort_level", "energy", "energy_level"],
  scheduleLocked: ["schedule_locked", "fixed_time", "lock_schedule"],
  habitName: ["habit_name"],
  habitKey: ["habit_key"],
  loggedTime: ["logged_time"],
  moodCategory: ["mood_category", "mood"],
  sleepHours: ["sleep_hours"],
  anxietyLevel: ["anxiety_level"],
  workHours: ["work_hours"],
  boredomMinutes: ["boredom_minutes"],
  areaLabel: ["area_label"],
  areaColor: ["area_color"],
  targetMinutes: ["target_minutes"],
  goalMinutes: ["goal_minutes"],
  actualMinutes: ["actual_minutes"],
  recurrenceId: ["recurrence_id", "rule_id"],
  recurrenceLabel: ["recurrence_label"],
  startDate: ["start_date", "from_date"],
  endDate: ["end_date", "until_date"],
  readingUpdates: ["reading_updates", "reading", "progress_updates"],
  yearlyGoal: ["yearly_goal"],
  bookId: ["book_id"],
  coverUrl: ["cover_url"],
  totalPages: ["total_pages"],
  pagesRead: ["pages_read"],
  bookStatus: ["book_status"],
  boardKey: ["board_key", "streak_key"],
  spiritualCategory: ["spiritual_category", "staircase_category"],
  spiritualOperation: ["spiritual_operation", "operation"],
  stepId: ["step_id"],
  taskCompleted: ["task_completed"],
  frontId: ["front_id"],
  dueDate: ["due_date"],
  askWhenUncertain: [
    "ask_when_uncertain",
    "ask_when_ambiguous",
    "clarify_when_uncertain",
  ],
  goalId: ["goal_id"],
  targetDate: ["target_date"],
  savingsGoalId: ["savings_goal_id"],
  targetAmount: ["target_amount"],
  currentAmount: ["current_amount"],
  bucketItemId: ["bucket_item_id"],
  expenseId: ["expense_id"],
  debtKey: ["debt_key"],
  totalAmount: ["total_amount"],
  monthlyAmount: ["monthly_amount"],
  paidAmount: ["paid_amount"],
  incomeKey: ["income_key"],
  fixedCostId: ["fixed_cost_id"],
  taskUpdates: ["task_updates", "updates", "changes", "tasks"],
};

const actionTypeAliases: Record<string, (typeof ASSISTANT_ACTION_TYPES)[number]> = {
  create_ministry_recurrence: "set_ministry_recurrence",
  update_ministry_recurrence: "set_ministry_recurrence",
  delete_ministry_recurrence: "remove_ministry_recurrence",
  mark_reading_progress: "update_reading_progress",
  update_publication_progress: "update_reading_progress",
  mark_publication: "update_reading_progress",
  mark_bible_chapter: "update_reading_progress",
  update_assistant_preferences: "set_assistant_preferences",
  configure_assistant: "set_assistant_preferences",
  create_mood: "log_mood",
  log_mood_moment: "log_mood",
  update_metrics: "update_day_metrics",
  complete_habit: "set_habit_status",
  set_habit_completion: "set_habit_status",
  update_streak: "update_spiritual_streak",
  set_book_goal: "set_books_goal",
  create_reading_book: "create_book",
  update_reading_book: "update_book",
  spiritual_goal_action: "update_spiritual_goal",
  create_couple_goal: "add_couple_goal",
  create_savings_goal: "add_savings_goal",
  create_bucket_item: "add_bucket_item",
  set_finance_debt: "upsert_finance_debt",
};

function normalizeMinutes(value: unknown) {
  if (typeof value === "number") return Math.round(value);
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase().replace(",", ".");
  const hours = normalized.match(/(\d+(?:\.\d+)?)\s*(?:h|hour|hours|hora|horas)\b/);
  const minutes = normalized.match(/(\d+)\s*(?:m|min|mins|minute|minutes|minuto|minutos)\b/);
  if (hours || minutes) {
    return Math.round(Number(hours?.[1] || 0) * 60 + Number(minutes?.[1] || 0));
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? Math.round(numeric) : value;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : value;
}

function normalizeWeekday(value: unknown) {
  if (typeof value === "number") return Math.round(value);
  if (typeof value !== "string") return value;
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const aliases: Record<string, number> = {
    sunday: 0,
    domingo: 0,
    monday: 1,
    segunda: 1,
    "segunda feira": 1,
    tuesday: 2,
    terca: 2,
    "terca feira": 2,
    wednesday: 3,
    quarta: 3,
    "quarta feira": 3,
    thursday: 4,
    quinta: 4,
    "quinta feira": 4,
    friday: 5,
    sexta: 5,
    "sexta feira": 5,
    saturday: 6,
    sabado: 6,
  };
  return aliases[normalized] ?? value;
}

function normalizeClockTime(value: unknown) {
  if (typeof value !== "string") return value;
  const match = value.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : value;
}

function normalizeEffort(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = normalizeIntentText(value).trim();
  const aliases: Record<string, "low" | "medium" | "high"> = {
    low: "low",
    light: "low",
    leve: "low",
    baixo: "low",
    baixa: "low",
    medium: "medium",
    medio: "medium",
    media: "medium",
    moderate: "medium",
    moderado: "medium",
    moderada: "medium",
    high: "high",
    deep: "high",
    alto: "high",
    alta: "high",
    profundo: "high",
    profunda: "high",
  };
  return aliases[normalized] ?? value;
}

function normalizeSpiritualStreakKey(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = normalizeIntentText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliases: Record<string, (typeof SPIRITUAL_STREAK_BOARD_KEYS)[number]> = {
    "daily text": "daily_text",
    "daily text reading": "daily_text",
    "texto diario": "daily_text",
    "bible reading": "bible_reading",
    "leitura da biblia": "bible_reading",
    "prayer on waking": "prayer_on_waking",
    "oracao ao acordar": "prayer_on_waking",
    "prayer before lunch": "prayer_before_lunch",
    "oracao antes do almoco": "prayer_before_lunch",
    "prayer before sleep": "prayer_before_sleep",
    "oracao antes de dormir": "prayer_before_sleep",
    pornography: "pornography",
    pornografia: "pornography",
    masturbation: "masturbation",
    masturbacao: "masturbation",
  };
  return aliases[normalized] ?? value;
}

function normalizePriority(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = normalizeIntentText(value).trim();
  const aliases: Record<string, "Low" | "Medium" | "High" | "Critical"> = {
    low: "Low",
    baixa: "Low",
    baixo: "Low",
    medium: "Medium",
    media: "Medium",
    medio: "Medium",
    high: "High",
    alta: "High",
    alto: "High",
    critical: "Critical",
    critica: "Critical",
    critico: "Critical",
  };
  return aliases[normalized] ?? value;
}

function normalizeBookStatus(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = normalizeIntentText(value).trim();
  const aliases: Record<string, "planned" | "reading" | "finished"> = {
    planned: "planned",
    planeado: "planned",
    planejado: "planned",
    reading: "reading",
    lendo: "reading",
    finished: "finished",
    complete: "finished",
    completed: "finished",
    terminado: "finished",
    finalizado: "finished",
    lido: "finished",
  };
  return aliases[normalized] ?? value;
}

function normalizeSpiritualCategory(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = normalizeIntentText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliases: Record<string, (typeof SPIRITUAL_GOAL_CATEGORY_KEYS)[number]> = {
    "big goals": "big_goals",
    "grandes metas": "big_goals",
    "christian qualities": "christian_qualities",
    "qualidades cristas": "christian_qualities",
    "leaving bad habits": "leaving_bad_habits",
    "deixar maus habitos": "leaving_bad_habits",
    "ministry skills": "ministry_skills",
    "habilidades de ministerio": "ministry_skills",
    prudence: "prudence",
    prudencia: "prudence",
  };
  return aliases[normalized] ?? value;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value !== "string") return value;
  const normalized = normalizeIntentText(value).trim();
  if (["true", "yes", "sim", "done", "feito", "pago", "on"].includes(normalized)) {
    return true;
  }
  if (
    ["false", "no", "nao", "undone", "nao feito", "nao pago", "off"].includes(
      normalized
    )
  ) {
    return false;
  }
  return value;
}

function normalizeAssistantReply(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const reply = value as Record<string, unknown>;
  const actions = Array.isArray(reply.actions) ? reply.actions : [];
  const message =
    reply.message ??
    reply.response ??
    reply.reply ??
    reply.text ??
    reply.content ??
    (actions.length ? "Review the proposed changes." : undefined);

  return {
    ...reply,
    message,
    actions: actions.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const action = item as Record<string, unknown>;
      const normalizedActionType =
        typeof action.type === "string"
          ? normalizeIntentText(action.type)
              .trim()
              .replace(/[\s-]+/g, "_")
          : action.type;
      const actionType =
        typeof normalizedActionType === "string" &&
        actionTypeAliases[normalizedActionType]
          ? actionTypeAliases[normalizedActionType]
          : normalizedActionType;
      const rawPayload =
        action.payload && typeof action.payload === "object" && !Array.isArray(action.payload)
          ? (action.payload as Record<string, unknown>)
          : {};
      const payload = { ...rawPayload };

      Object.entries(payloadAliases).forEach(([canonical, aliases]) => {
        if (payload[canonical] === undefined) {
          const alias = aliases.find((candidate) => payload[candidate] !== undefined);
          if (alias) payload[canonical] = payload[alias];
        }
        aliases.forEach((alias) => delete payload[alias]);
      });
      if (
        (actionType === "create_task" || actionType === "update_task") &&
        payload.scheduledDate === undefined &&
        typeof payload.date === "string"
      ) {
        payload.scheduledDate = payload.date;
        delete payload.date;
      }

      ["estimatedMinutes", "focusOrder", "targetMinutes", "goalMinutes", "actualMinutes"].forEach(
        (field) => {
          if (payload[field] !== undefined && payload[field] !== null) {
            payload[field] = normalizeMinutes(payload[field]);
          }
        }
      );
      [
        "sleepHours",
        "anxietyLevel",
        "workHours",
        "boredomMinutes",
        "year",
        "yearlyGoal",
        "totalPages",
        "pagesRead",
        "rating",
        "progress",
        "targetAmount",
        "currentAmount",
        "amount",
        "totalAmount",
        "monthlyAmount",
        "paidAmount",
        "budget",
        "actual",
      ].forEach((field) => {
        if (payload[field] !== undefined && payload[field] !== null) {
          payload[field] = normalizeNumber(payload[field]);
        }
      });
      if (payload.weekday !== undefined) {
        payload.weekday = normalizeWeekday(payload.weekday);
      }
      if (payload.effort !== undefined && payload.effort !== null) {
        payload.effort = normalizeEffort(payload.effort);
      }
      if (payload.boardKey !== undefined) {
        payload.boardKey = normalizeSpiritualStreakKey(payload.boardKey);
      }
      if (payload.priority !== undefined) {
        payload.priority = normalizePriority(payload.priority);
      }
      if (payload.bookStatus !== undefined) {
        payload.bookStatus = normalizeBookStatus(payload.bookStatus);
      }
      if (payload.spiritualCategory !== undefined) {
        payload.spiritualCategory = normalizeSpiritualCategory(
          payload.spiritualCategory
        );
      }
      [
        "completed",
        "enabled",
        "success",
        "taskCompleted",
        "paid",
        "scheduleLocked",
        "askWhenUncertain",
      ].forEach((field) => {
        if (payload[field] !== undefined) {
          payload[field] = normalizeBoolean(payload[field]);
        }
      });
      if (
        actionType === "set_ministry_recurrence" &&
        payload.goalMinutes === undefined &&
        payload.estimatedMinutes !== undefined
      ) {
        payload.goalMinutes = payload.estimatedMinutes;
        delete payload.estimatedMinutes;
      }
      if (
        actionType === "set_ministry_recurrence" &&
        payload.recurrenceLabel === undefined &&
        typeof payload.label === "string"
      ) {
        payload.recurrenceLabel = payload.label;
        delete payload.label;
      }
      if (
        payload.title === undefined &&
        typeof payload.label === "string"
      ) {
        payload.title = payload.label;
        delete payload.label;
      }
      if (
        (actionType === "set_ministry_recurrence" ||
          actionType === "remove_ministry_recurrence") &&
        payload.recurrenceId === undefined &&
        typeof payload.taskId === "string"
      ) {
        payload.recurrenceId = payload.taskId;
        delete payload.taskId;
      }
      const entityIdFields: Partial<
        Record<(typeof ASSISTANT_ACTION_TYPES)[number], string>
      > = {
        update_book: "bookId",
        update_couple_goal: "goalId",
        update_savings_goal: "savingsGoalId",
        toggle_bucket_item: "bucketItemId",
        update_finance_fixed_cost: "fixedCostId",
      };
      const entityIdField =
        typeof actionType === "string"
          ? entityIdFields[
              actionType as (typeof ASSISTANT_ACTION_TYPES)[number]
            ]
          : undefined;
      if (
        entityIdField &&
        payload[entityIdField] === undefined &&
        typeof payload.taskId === "string"
      ) {
        payload[entityIdField] = payload.taskId;
        delete payload.taskId;
      }
      if (
        actionType === "update_reading_progress" &&
        payload.readingUpdates === undefined &&
        Array.isArray(payload.taskUpdates)
      ) {
        payload.readingUpdates = payload.taskUpdates;
        delete payload.taskUpdates;
      }

      ["scheduledTime", "plannedTime", "startTime", "endTime", "loggedTime"].forEach((field) => {
        if (payload[field] !== undefined && payload[field] !== null) {
          payload[field] = normalizeClockTime(payload[field]);
        }
      });

      if (Array.isArray(payload.taskUpdates)) {
        payload.taskUpdates = payload.taskUpdates.map((update) => {
          if (!update || typeof update !== "object" || Array.isArray(update)) return update;
          const normalized = { ...(update as Record<string, unknown>) };
          Object.entries(payloadAliases).forEach(([canonical, aliases]) => {
            if (canonical === "taskUpdates") return;
            if (normalized[canonical] === undefined) {
              const alias = aliases.find((candidate) => normalized[candidate] !== undefined);
              if (alias) normalized[canonical] = normalized[alias];
            }
            aliases.forEach((alias) => delete normalized[alias]);
          });
          if (
            normalized.scheduledDate === undefined &&
            typeof normalized.date === "string"
          ) {
            normalized.scheduledDate = normalized.date;
          }
          delete normalized.date;
          if (normalized.estimatedMinutes !== undefined) {
            normalized.estimatedMinutes = normalizeMinutes(normalized.estimatedMinutes);
          }
          if (normalized.focusOrder !== undefined) {
            normalized.focusOrder = normalizeMinutes(normalized.focusOrder);
          }
          if (normalized.effort !== undefined && normalized.effort !== null) {
            normalized.effort = normalizeEffort(normalized.effort);
          }
          if (normalized.priority !== undefined) {
            normalized.priority = normalizePriority(normalized.priority);
          }
          if (normalized.scheduleLocked !== undefined) {
            normalized.scheduleLocked = normalizeBoolean(normalized.scheduleLocked);
          }
          if (normalized.completed !== undefined) {
            normalized.completed = normalizeBoolean(normalized.completed);
          }
          ["scheduledTime", "plannedTime", "startTime", "endTime"].forEach((field) => {
            if (normalized[field] !== undefined && normalized[field] !== null) {
              normalized[field] = normalizeClockTime(normalized[field]);
            }
          });
          return normalized;
        });
      }

      if (Array.isArray(payload.readingUpdates)) {
        payload.readingUpdates = payload.readingUpdates.map((update) => {
          if (!update || typeof update !== "object" || Array.isArray(update)) return update;
          const normalized = { ...(update as Record<string, unknown>) };
          const kindAliases: Record<string, string> = {
            bible_chapter: "bible_chapters",
            reading_video: "video",
            broadcasting_video: "broadcasting",
            despertai: "despertai_issue",
            topic: "despertai_topic",
          };
          if (typeof normalized.kind === "string" && kindAliases[normalized.kind]) {
            normalized.kind = kindAliases[normalized.kind];
          }
          const aliases: Record<string, string[]> = {
            itemId: ["item_id", "issue_id", "video_id"],
            topicId: ["topic_id"],
            bookKey: ["book_key"],
          };
          Object.entries(aliases).forEach(([canonical, candidates]) => {
            if (normalized[canonical] === undefined) {
              const alias = candidates.find(
                (candidate) => normalized[candidate] !== undefined
              );
              if (alias) normalized[canonical] = normalized[alias];
            }
            candidates.forEach((alias) => delete normalized[alias]);
          });
          if (!Array.isArray(normalized.chapters) && normalized.chapter !== undefined) {
            normalized.chapters = [normalized.chapter];
          }
          delete normalized.chapter;
          if (typeof normalized.read === "string") {
            const read = normalizeIntentText(normalized.read);
            if (["true", "yes", "sim", "read", "lido", "lida"].includes(read)) {
              normalized.read = true;
            } else if (
              ["false", "no", "nao", "unread", "nao lido", "nao lida"].includes(read)
            ) {
              normalized.read = false;
            }
          }
          return normalized;
        });
      }

      const previewTitle =
        typeof action.title === "string" && action.title.trim()
          ? action.title.trim()
          : typeof action.label === "string" && action.label.trim()
            ? action.label.trim()
            : typeof actionType === "string"
              ? actionType.replace(/_/g, " ")
              : "Dashboard change";
      return {
        ...action,
        type: actionType,
        title: previewTitle,
        payload,
      };
    }),
  };
}

function dayOffset(dayIso: string, offset: number) {
  const [year, month, day] = dayIso.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day, 12));
  return (offset >= 0 ? addDays(base, offset) : subDays(base, Math.abs(offset)))
    .toISOString()
    .slice(0, 10);
}

async function currentTimeForUser(userEmail: string) {
  const timeZone = (await getUserTimeZone(userEmail)) || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    return hour && minute ? `${hour}:${minute}` : new Date().toISOString().slice(11, 16);
  } catch {
    return new Date().toISOString().slice(11, 16);
  }
}

function assistantModel() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

type GeminiPayload = {
  error?: { code?: number; status?: string; message?: string };
  candidates?: Array<{
    finishReason?: string;
    finishMessage?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

let resolvedFallbackModel: string | null = null;

function modelScore(name: string) {
  let score = 0;
  const version = name.match(/^gemini-(\d+)(?:\.(\d+))?-/);
  if (version) score += Number(version[1]) * 100 + Number(version[2] || 0) * 10;
  if (/^gemini-\d+(?:\.\d+)?-flash$/.test(name)) score += 120;
  else if (name.includes("flash-latest")) score += 110;
  else if (name.includes("flash")) score += 90;
  else if (name.includes("pro")) score += 50;
  if (name.includes("lite")) score -= 5;
  if (/(preview|experimental|exp-)/.test(name)) score -= 25;
  if (/(image|audio|tts|live|embedding|robotics|computer-use)/.test(name)) {
    score -= 200;
  }
  return score;
}

async function findAvailableGeminiModels(
  apiKey: string,
  excludedModels: Set<string>,
  signal: AbortSignal
) {
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": apiKey },
      signal,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    return (payload.models || [])
      .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => (model.name || "").replace(/^models\//, ""))
      .filter((name) => name && !excludedModels.has(name) && modelScore(name) > 0)
      .sort((left, right) => modelScore(right) - modelScore(left));
  } catch {
    return [];
  }
}

function geminiEndpoint(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;
}

function normalizeIntentText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasIntent(value: string, terms: string[]) {
  const normalized = normalizeIntentText(value);
  return terms.some((term) => normalized.includes(term));
}

function normalizeWords(value: string) {
  return new Set(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

function titleSimilarity(left: string, right: string) {
  const a = normalizeWords(left);
  const b = normalizeWords(right);
  if (!a.size || !b.size) return 0;
  const common = [...a].filter((word) => b.has(word)).length;
  return common / Math.max(a.size, b.size);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function calibrateRepeatedTask(
  action: z.infer<typeof actionSchema>,
  history: EstimationHistoryItem[]
) {
  if (action.type !== "create_task") return action;
  const title = action.payload.title || action.title;
  const similar = history.filter(
    (item) =>
      titleSimilarity(title, item.title) >= 0.58 ||
      item.title.toLowerCase() === title.toLowerCase()
  );
  if (!similar.length) return action;

  const actuals = similar
    .map((item) => item.actualMinutes)
    .filter((value): value is number => typeof value === "number" && value > 0);
  if (!actuals.length) return action;

  const estimate = Math.max(1, Math.min(480, median(actuals)));
  const historyReason = `${similar.length} tarefa${similar.length === 1 ? "" : "s"} semelhante${
    similar.length === 1 ? "" : "s"
  }: mediana real de ${estimate} min.`;
  return {
    ...action,
    reason: action.reason ? `${action.reason} ${historyReason}` : historyReason,
    payload: {
      ...action.payload,
      estimatedMinutes: estimate,
    },
  };
}

function clarificationPreferenceFromMessage(value: string): boolean | null {
  const normalized = normalizeIntentText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const mentionsQuestions =
    /\b(pergunt|pergunta|ask|clarif|duvida|ambig|contexto|detalh)/.test(normalized);
  if (!mentionsQuestions) return null;

  if (
    /\b(nao pergunte|sem perguntar|nao precisa perguntar|do not ask|dont ask|never ask)\b/.test(
      normalized
    )
  ) {
    return false;
  }

  if (
    /\b(me pergunte|pode perguntar|quero que .*pergunt|caso .*duvida|se .*duvida|ask me|ask when|clarify when)\b/.test(
      normalized
    )
  ) {
    return true;
  }

  return null;
}

function responseTextCandidates(text: string) {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  return Array.from(
    new Set(
      [
        trimmed,
        unfenced,
        firstBrace >= 0 && lastBrace > firstBrace
          ? unfenced.slice(firstBrace, lastBrace + 1)
          : "",
      ].filter(Boolean)
    )
  );
}

function parseAssistantResponseText(text: string) {
  let validationError: unknown = null;
  for (const candidate of responseTextCandidates(text)) {
    try {
      return replySchema.parse(normalizeAssistantReply(JSON.parse(candidate)));
    } catch (error) {
      validationError = error;
    }
  }

  const plainText = text
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (plainText && !plainText.startsWith("{") && !plainText.startsWith("[")) {
    return replySchema.parse({
      message: plainText.slice(0, 5000),
      actions: [],
    });
  }

  throw validationError || new Error("AI_INVALID_RESPONSE");
}

async function buildAssistantContext(
  userEmail: string,
  scope: AssistantScope,
  queryText: string
) {
  const todayIso = await getTodayIsoForUser(userEmail);
  const startIso = dayOffset(todayIso, -14);
  const endIso = dayOffset(todayIso, 14);
  const currentMonth = todayIso.slice(0, 7);
  const taskIntent = hasIntent(queryText, [
    "task",
    "tarefa",
    "agenda",
    "horario",
    "prioridade",
    "reorgan",
    "estim",
    "esforco",
    "effort",
    "duracao",
    "nota",
    "tag",
  ]);
  const habitIntent = hasIntent(queryText, ["habit", "habito", "rotina"]);
  const metricIntent = hasIntent(queryText, ["mood", "humor", "sono", "ansiedade", "stat"]);
  const ministryIntent = hasIntent(queryText, [
    "minister",
    "campo",
    "field service",
    "horas de servico",
  ]);
  const dissertationIntent = hasIntent(queryText, [
    "dissert",
    "mestrado",
    "artigo",
    "defesa",
  ]);
  const booksIntent = hasIntent(queryText, [
    "livro",
    "book",
    "meus livros",
    "livro que estou",
    "livro lido",
    "meta de livros",
    "book tracker",
    "reading goal",
    "paginas",
    "pages read",
  ]);
  const spiritualIntent = hasIntent(queryText, [
    "streak",
    "oracao",
    "prayer",
    "streak espiritual",
    "spiritual streak",
    "meta espiritual",
    "spiritual goal",
    "escada",
    "staircase",
    "pornografia",
    "masturbacao",
    "oracao ao",
    "prayer before",
    "prayer on",
  ]);
  const financeIntent = hasIntent(queryText, [
    "financa",
    "finance",
    "divida",
    "debt",
    "despesa",
    "expense",
    "renda",
    "income",
    "conta paga",
    "savings",
    "economia",
  ]);
  const coupleIntent = hasIntent(queryText, [
    "casal",
    "couple",
    "bucket",
    "meta conjunta",
    "objetivo conjunto",
  ]);
  const readingIntent = hasIntent(queryText, [
    "publica",
    "despertai",
    "sentinela",
    "watchtower",
    "biblia",
    "bible",
    "capitulo",
    "topico",
    "video",
    "broadcasting",
    "apostila",
    "brochura",
    "livreto",
    "folheto",
    "serie de artigos",
  ]) ||
    BIBLE_BOOKS.some((book) =>
      normalizeIntentText(queryText).includes(normalizeIntentText(book.name))
    );
  const hasExplicitIntent =
    taskIntent ||
    habitIntent ||
    metricIntent ||
    ministryIntent ||
    dissertationIntent ||
    booksIntent ||
    spiritualIntent ||
    financeIntent ||
    coupleIntent ||
    readingIntent;
  const fullDefault = scope === "all" && !hasExplicitIntent;
  const taskContext =
    ["today", "calendar"].includes(scope) || taskIntent || fullDefault;
  const habitContext =
    ["today", "calendar", "habits"].includes(scope) || habitIntent || fullDefault;
  const metricContext =
    ["today", "mood", "stats"].includes(scope) || metricIntent || fullDefault;
  const ministryContext = scope === "ministry" || ministryIntent;
  const dissertationContext = scope === "dissertation" || dissertationIntent;
  const readingContext = scope === "publications" || readingIntent;
  const booksContext = scope === "books" || booksIntent;
  const spiritualContext = scope === "spiritual" || spiritualIntent;
  const financeContext = scope === "finances" || financeIntent;
  const coupleContext =
    scope === "couple" || scope === "goals" || coupleIntent || financeContext;
  const [currentYear, currentMonthNumber] = currentMonth.split("-").map(Number);

  const [
    tasks,
    habits,
    sharedHabits,
    estimation,
    metrics,
    areas,
    ministry,
    ministryRecurrences,
    dissertation,
    reading,
    assistantPreferences,
    energy,
    moodHistory,
    books,
    spiritualStreaks,
    spiritualGoals,
    finance,
    coupleGoals,
    savingsGoals,
    bucketList,
  ] = await Promise.all([
      taskContext ? listTasks(userEmail, todayIso, endIso, true) : Promise.resolve([]),
      habitContext ? getCustomHabits(userEmail) : Promise.resolve([]),
      habitContext ? getEnabledSharedHabitsForUser(userEmail) : Promise.resolve([]),
      taskContext
        ? getEstimationStats(userEmail, "all")
        : Promise.resolve(null),
      metricContext
        ? prisma.dailyEntryUser.findMany({
            where: { userEmail, date: { gte: startIso, lte: todayIso } },
            select: {
              date: true,
              sleepHours: true,
              anxietyLevel: true,
              workHours: true,
              moodCategory: true,
            },
            orderBy: { date: "asc" },
          })
        : Promise.resolve([]),
      taskContext ? getTaskAreas(userEmail) : Promise.resolve([]),
      ministryContext
        ? getMinistryMonthData(userEmail, currentMonth)
        : Promise.resolve(null),
      ministryContext ? getMinistryRecurringPlans(userEmail) : Promise.resolve([]),
      dissertationContext
        ? loadDissertationProject(userEmail)
        : Promise.resolve(null),
      readingContext
        ? getReadingAssistantContext(userEmail, queryText)
        : Promise.resolve(null),
      getAssistantPreferences(userEmail),
      taskContext ? getEnergySettings(userEmail) : Promise.resolve(null),
      metricContext || scope === "mood"
        ? getMoodHistory(userEmail)
        : Promise.resolve(null),
      booksContext
        ? getBooksPageData(userEmail, currentYear)
        : Promise.resolve(null),
      spiritualContext
        ? getSpiritualStreaksPageData(userEmail, currentMonth)
        : Promise.resolve(null),
      spiritualContext
        ? getSpiritualGoalsPageData(userEmail)
        : Promise.resolve(null),
      financeContext
        ? getMonthlyFinance(userEmail, currentYear, currentMonthNumber)
        : Promise.resolve(null),
      coupleContext ? getCoupleGoals(userEmail) : Promise.resolve([]),
      coupleContext ? getSavingsGoals(userEmail) : Promise.resolve([]),
      coupleContext ? getBucketList(userEmail) : Promise.resolve([]),
    ]);

  const pendingTasks = tasks
    .filter((task) => !task.isDone && !task.missedAt)
    .slice(0, 500)
    .map((task) => ({
      id: task.id,
      title: task.title,
      date: task.scheduledDate || null,
      time: task.scheduledTime || null,
      plannedTime: task.plannedTime || null,
      startTime: task.startTime || null,
      endTime: task.endTime || null,
      estimate: task.estimatedMinutes || null,
      priority: task.priorityTag || "Medium",
      area: task.areaTag || null,
      order: task.focusOrder || null,
      effort: energy?.taskEffort[task.id] || null,
      scheduleLocked: task.scheduleLocked,
      notes: task.notes?.slice(0, 500) || null,
      subtasks: task.subtasks.slice(0, 20).map((subtask) => ({
        id: subtask.id,
        title: subtask.title,
        done: Boolean(subtask.isDone),
        order: subtask.order,
      })),
    }));
  const recentCompletedTasks = tasks
    .filter((task) => Boolean(task.isDone))
    .slice(-100)
    .map((task) => ({
      id: task.id,
      title: task.title,
      date: task.scheduledDate || null,
      time: task.scheduledTime || null,
      estimate: task.estimatedMinutes || null,
      actual: task.actualMinutes || null,
      area: task.areaTag || null,
    }));

  const historyPoints = estimation?.points.slice(0, 100) || [];
  const ratiosByArea = new Map<string, number[]>();
  historyPoints.forEach((point) => {
    const key = point.areaTag || "untagged";
    const values = ratiosByArea.get(key) || [];
    values.push(point.ratio);
    ratiosByArea.set(key, values);
  });

  return {
    scope,
    today: todayIso,
    currentMonth,
    assistantPreferences,
    availableServices: [
      "today",
      "calendar",
      "tasks",
      "habits",
      "mood",
      "ministry",
      "publications",
      "books",
      "dissertation",
      "spiritual goals",
      "spiritual streaks",
      "stats",
      "finances",
      "couple",
      "dashboard settings",
    ],
    pendingTasks,
    recentCompletedTasks,
    taskAreas: areas,
    completedTaskHistory: historyPoints.map((point) => ({
      title: point.title,
      estimatedMinutes: point.estimatedMinutes,
      actualMinutes: point.actualMinutes,
      area: point.areaTag,
      date: point.scheduledDate,
    })),
    habits: {
      custom: habits.map((habit) => ({ id: habit.id, name: habit.name })),
      daily: sharedHabits.map((habit) => ({
        key: habit.key,
        label: habit.label,
      })),
    },
    recentMetrics: metrics,
    mood: moodHistory
      ? {
          definitions: MOOD_DEFINITIONS.map((mood) => ({
            key: mood.key,
            label: mood.label,
            emoji: mood.emoji,
            group: mood.group,
          })),
          recentEntries: moodHistory.entries.slice(-60).map((entry) => ({
            id: entry.id,
            date: entry.dayIso,
            time: entry.loggedAt.slice(11, 16),
            mood: entry.moodCategory,
          })),
        }
      : null,
    estimation: estimation
      ? {
          samples: estimation.summary.totalSamples,
          averageRatio: estimation.summary.averageRatio,
          tendency: estimation.summary.tendency,
          byArea: Array.from(ratiosByArea.entries()).map(([area, ratios]) => ({
            area,
            samples: ratios.length,
            averageRatio:
              Math.round(
                (ratios.reduce((sum, value) => sum + value, 0) / ratios.length) * 100
              ) / 100,
          })),
        }
      : null,
    ministry: ministry
      ? {
          month: currentMonth,
          targetMinutes: ministry.goal?.targetMinutes ?? null,
          totalActualMinutes: ministry.summary.totalCompletedMinutes,
          entries: ministry.entries.map((entry) => ({
            date: entry.date,
            goalMinutes: entry.goalMinutes,
            actualMinutes: entry.actualMinutes,
            notes: entry.notes,
          })),
          recurrences: ministryRecurrences.map((plan) => ({
            id: plan.id,
            label: plan.label,
            weekday: plan.weekday,
            goalMinutes: plan.goalMinutes,
            startDate: plan.startDate,
            endDate: plan.endDate,
          })),
        }
      : null,
    dissertation: dissertation
      ? {
          title: dissertation.title,
          fronts: dissertation.fronts.map((front) => ({
            id: front.id,
            title: front.title,
            status: front.status,
            targetDate: front.targetDate,
            steps: front.steps.map((step) => ({
              id: step.id,
              title: step.title,
              done: step.done,
              dueDate: step.dueDate,
            })),
          })),
        }
      : null,
    reading,
    books: books
      ? {
          year: books.year,
          yearlyGoal: books.yearlyGoal,
          finishedCount: books.finishedCount,
          items: books.items.slice(0, 100).map((book) => ({
            id: book.id,
            title: book.title,
            author: book.author,
            pagesRead: book.pagesRead,
            totalPages: book.totalPages,
            status: book.status,
            rating: book.rating,
          })),
        }
      : null,
    spiritual: spiritualContext
      ? {
          streaks: spiritualStreaks?.boards.map((board) => ({
            key: board.key,
            title: board.title,
            currentStreak: board.currentStreak,
            bestStreak: board.bestStreak,
            monthEntries: board.cells
              .filter((cell) => cell.success !== null)
              .map((cell) => ({ date: cell.date, success: cell.success })),
          })),
          goals: spiritualGoals?.items.map((item) => ({
            category: item.category,
            title: item.title,
            ultimateGoal: item.ultimateGoal,
            currentStepId: item.currentStepId,
            currentStepTitle: item.currentStepTitle,
            progressPercent: item.progressPercent,
            generalNotes: item.generalNotes,
            steps: item.steps.map((step) => ({
              id: step.id,
              title: step.title,
              state: step.state,
              notes: step.notes,
              tasks: step.tasks.map((task) => ({
                id: task.id,
                title: task.title,
                completed: task.completed,
              })),
            })),
          })),
        }
      : null,
    finances: finance
      ? {
          month: currentMonth,
          income: finance.income,
          fixedCosts: finance.fixedCosts,
          debts: finance.debts,
          extraExpenses: finance.extraExpenses,
        }
      : null,
    couple: coupleContext
      ? {
          goals: coupleGoals,
          savingsGoals,
          bucketList,
        }
      : null,
  };
}

function systemInstruction(context: AssistantContext) {
  const scopeRule =
    context.scope === "all"
      ? "You are on the full Orbit page and may coordinate every supplied dashboard area."
      : `You are embedded in the ${context.scope} page. Prioritize that page and its supplied data.`;

  return [
    "You are Orbit, an action-oriented assistant inside a private Life Dashboard.",
    "Reply in the same language as the user. Be concise, specific, and collaborative.",
    `Today is ${context.today}. ${scopeRule}`,
    "You can coordinate any dashboard service represented in the supplied context, even when the user is currently on a different page. Never refuse only because of the current page.",
    "Return actions whenever the user asks to create, change, organize, prioritize, tag, estimate, or plan something.",
    "Every action is a preview and requires one user review. Never claim it was already applied.",
    context.assistantPreferences.askWhenUncertain
      ? "CLARIFICATION MODE IS ON: when a task is new or its meaning, deliverable, volume, depth, deadline, or constraints materially affect duration, tag, effort, or schedule, ask 1 to 3 short targeted questions and return actions: []. Do not invent a generic 30-minute estimate. Do not ask when existing task history or the user's wording already provides enough evidence. After the user answers, infer the remaining details and return the concrete preview."
      : "CLARIFICATION MODE IS OFF: make a best-effort estimate from history and context, state assumptions briefly, and return a preview.",
    "When asking about an unclear task, prioritize only the missing facts that change the plan: desired outcome, amount/depth, deadline or fixed constraints. Avoid questionnaires.",
    "TASK ESTIMATION: first compare the title and meaning with completedTaskHistory. For repeated or similar work, use real actualMinutes. For new work, infer its steps and complexity, then calibrate with the user's averageRatio and area history. Explain the basis briefly.",
    'BULK TASK REVIEWS: use one bulk_update_tasks action with payload.taskUpdates. Each item must contain taskId and only changed fields: scheduledDate, scheduledTime, plannedTime, startTime, endTime, estimatedMinutes, priority, areaTag, focusOrder, effort, notes, scheduleLocked, or completed. Do not emit one update_task action per task. This supports large reviews while keeping JSON compact.',
    "TASK ORGANIZATION: update existing tasks by ID. Use scheduledTime for real clock scheduling. Use focusOrder for execution order without requiring a time. Avoid overlaps and add realistic breathing room.",
    "TASK EFFORT: use low for light/quick work, medium for ordinary focused work, and high for cognitively or physically deep work. Keep effort distinct from priority.",
    "TASK DETAILS: plannedTime is the intended time; startTime and endTime are actual execution facts and must only be changed when the user explicitly gives them. scheduleLocked=true means automatic reordering must preserve that time.",
    "TASK COMPLETION: only set completed when the user explicitly asks to mark or unmark a task. Never infer completion from planning language.",
    "TASK TAGS: use an existing taskAreas key. If the requested tag does not exist, propose create_area before assigning it.",
    "PRIORITY: use Low, Medium, High, or Critical based on consequence and deadline, not anxiety.",
    "HABITS AND DAY: use set_habit_status with an exact habits.daily key, a date, and completed. This action keeps Habits, Today, Spiritual Streaks, points, and habit tasks synchronized. Use update_day_metrics for sleepHours, anxietyLevel, workHours, or boredomMinutes.",
    "MOOD: use log_mood with an exact mood.definitions key, date, and loggedTime. A mood is a moment, not a whole-day replacement. Do not add a note unless the user explicitly asks and the action supports it.",
    "ENERGY: use set_low_energy_mode for the global low-energy view. Task effort belongs in task actions.",
    "MINISTRY: daily goals are always manual. You may set a monthly goal and specific daily plans, but never auto-distribute the monthly target unless the user explicitly asks you to create a proposed schedule. Preserve logged actual time unless the user explicitly changes it.",
    "MINISTRY RECURRENCE: when the user explicitly says every/each weekday, use set_ministry_recurrence instead of many update_ministry_day actions. Payload keys are recurrenceLabel, weekday (Sunday=0 through Saturday=6), goalMinutes, startDate, and endDate (null means ongoing). Reuse recurrenceId from context to edit an existing rule. Use remove_ministry_recurrence with recurrenceId only when explicitly asked to stop one.",
    "READING: use one update_reading_progress action with payload.readingUpdates. Use only exact IDs/keys supplied in reading candidates. Kinds are despertai_issue, despertai_topic, video, broadcasting, article_series, reading_book, tract, apostila, brochure, watchtower, and bible_chapters. A whole Despertai issue marks every topic; a topic update needs itemId and topicId. Bible updates need bookKey plus a chapters array. read=true marks read; read=false unmarks. If the requested title/topic is ambiguous or absent from candidates, ask a short clarifying question and return no action.",
    "BOOKS: set_books_goal changes the annual target. create_book adds a personal book. update_book must use an exact books.items ID and may change pagesRead, totalPages, status, rating, title, author, or coverUrl.",
    "SPIRITUAL STREAKS: use update_spiritual_streak with an exact boardKey, date, and success. true is a positive/clean day, false is a failed day, and null clears the mark.",
    "SPIRITUAL GOALS: use update_spiritual_goal with an exact category and spiritualOperation. Use exact stepId/taskId from context. Completing the current step uses complete_current; notes and checklist operations must identify the right step.",
    "DISSERTATION: use front IDs from context when adding a next step or changing a front status.",
    "COUPLE AND GOALS: use exact goal IDs when updating progress. New couple goals, savings goals, and bucket items use their dedicated actions.",
    "FINANCES: use the current finances IDs/keys. add_finance_expense adds one expense; upsert_finance_debt edits one debt; update_finance_income edits one income field; update_finance_fixed_cost edits one fixed-cost row. Monetary values are numbers, never formatted strings. Ask before guessing an amount.",
    "A direct request to change how Orbit asks questions is already persisted before this prompt; acknowledge it without returning a duplicate action.",
    `Allowed actions: ${ASSISTANT_ACTION_TYPES.join(", ")}.`,
    'Return only one JSON object shaped as {"message":"short answer","actions":[{"type":"allowed action","title":"short preview title","reason":"brief reason","payload":{}}]}. Use an empty actions array when no change is needed. Never add keys outside this structure.',
    "The action-level title is only the preview label. Put the actual task, book, goal, expense, debt, or checklist title in payload.title.",
    "Common payload signatures: set_habit_status={habitKey,date,completed}; log_mood={moodCategory,date,loggedTime}; update_day_metrics={date,sleepHours,anxietyLevel,workHours,boredomMinutes}; update_spiritual_streak={boardKey,date,success}; set_books_goal={year,yearlyGoal}; create_book={title,year,author,totalPages,pagesRead,bookStatus,rating}; update_book={bookId plus changed book fields}; update_spiritual_goal={spiritualCategory,spiritualOperation,stepId,taskId,taskCompleted,notes,title as needed}.",
    "For task duration, the payload key is estimatedMinutes (integer minutes). For a fixed task time, use scheduledTime in HH:mm. For task effort, use effort. Never use estimate, duration, energy, or time as payload keys.",
    "Never delete or mark tasks missed. Task completion is allowed only when explicitly requested. Do not alter sensitive metrics without an explicit value. If the requested operation has no supported safe action, explain what is missing instead of pretending.",
    `Dashboard context: ${JSON.stringify(context)}`,
  ].join("\n");
}

export async function askAssistant(
  userEmail: string,
  messages: AssistantChatMessage[],
  scope: AssistantScope = "all"
): Promise<AssistantReply> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");

  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const requestedClarificationPreference =
    clarificationPreferenceFromMessage(latestUserMessage);
  if (requestedClarificationPreference !== null) {
    await updateAssistantPreferences(userEmail, {
      askWhenUncertain: requestedClarificationPreference,
    });
  }
  const context = await buildAssistantContext(userEmail, scope, latestUserMessage);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction(context) }] },
      contents: messages.slice(-16).map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });
    const requestModel = async (model: string) => {
      const response = await fetch(geminiEndpoint(model), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: requestBody,
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as GeminiPayload | null;
      return { response, payload };
    };

    let model = resolvedFallbackModel || assistantModel();
    const attemptedModels = [model];
    let result = await requestModel(model);

    if (result.response.status === 404 || result.response.status === 429) {
      const fallbacks = await findAvailableGeminiModels(
        apiKey,
        new Set(attemptedModels),
        controller.signal
      );
      for (const fallback of fallbacks.slice(0, 4)) {
        model = fallback;
        attemptedModels.push(fallback);
        result = await requestModel(model);
        if (result.response.ok) {
          resolvedFallbackModel = fallback;
          break;
        }
        if (result.response.status !== 404 && result.response.status !== 429) break;
      }
    }

    if (result.response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      result = await requestModel(model);
    }

    const { response, payload } = result;
    if (!response.ok) {
      logServerEvent("error", {
        endpoint: "Gemini generateContent",
        message: "Gemini rejected the Orbit request",
        meta: {
          status: response.status,
          model,
          attemptedModels,
          providerStatus: payload?.error?.status || null,
          providerMessage: payload?.error?.message?.slice(0, 600) || null,
        },
      });
      if (response.status === 429) throw new Error("AI_QUOTA_REACHED");
      if (response.status === 400) throw new Error("AI_REQUEST_REJECTED");
      if (response.status === 401 || response.status === 403) {
        throw new Error("AI_AUTH_FAILED");
      }
      if (response.status === 404) throw new Error("AI_MODEL_UNAVAILABLE");
      throw new Error("AI_REQUEST_FAILED");
    }

    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();
    if (!text) throw new Error("AI_EMPTY_RESPONSE");

    let parsed: z.infer<typeof replySchema>;
    try {
      parsed = parseAssistantResponseText(text);
    } catch (error) {
      const candidate = payload?.candidates?.[0];
      logServerEvent("error", {
        endpoint: "Gemini response validation",
        message: "Orbit received an invalid action payload",
        error,
        meta: {
          finishReason: candidate?.finishReason || null,
          finishMessage: candidate?.finishMessage || null,
          responseLength: text.length,
        },
      });
      if (candidate?.finishReason === "MAX_TOKENS") {
        throw new Error("AI_RESPONSE_TOO_LARGE");
      }
      throw new Error("AI_INVALID_RESPONSE");
    }
    const taskTitles = new Map(
      [...context.pendingTasks, ...context.recentCompletedTasks].map(
        (task) => [task.id, task.title] as const
      )
    );
    const habitKeys = new Map<string, string>();
    context.habits.daily.forEach((habit) => {
      habitKeys.set(normalizeIntentText(habit.key), habit.key);
      habitKeys.set(normalizeIntentText(habit.label), habit.key);
    });
    context.habits.custom.forEach((habit) => {
      habitKeys.set(normalizeIntentText(habit.id), habit.id);
      habitKeys.set(normalizeIntentText(habit.name), habit.id);
    });
    const moodKeys = new Map<string, string>();
    context.mood?.definitions.forEach((mood) => {
      moodKeys.set(normalizeIntentText(mood.key), mood.key);
      moodKeys.set(normalizeIntentText(mood.label), mood.key);
    });
    const streakKeys = new Map<string, string>();
    context.spiritual?.streaks?.forEach((board) => {
      streakKeys.set(normalizeIntentText(board.key), board.key);
      streakKeys.set(normalizeIntentText(board.title), board.key);
    });
    const readingLabels = new Map<string, string>();
    context.reading?.despertai.candidates.forEach((issue) => {
      readingLabels.set(`despertai_issue:${issue.id}`, issue.title);
      issue.topicCandidates.forEach((topic) => {
        readingLabels.set(
          `despertai_topic:${issue.id}:${topic.id}`,
          `${issue.title} — ${topic.title}`
        );
      });
    });
    context.reading?.collections.forEach((collection) => {
      collection.candidates.forEach((item) => {
        readingLabels.set(`${collection.kind}:${item.id}`, item.title);
      });
    });
    context.reading?.bible.bookIndex.forEach((book) => {
      readingLabels.set(`bible_chapters:${book.key}`, book.name);
    });

    return {
      message: parsed.message,
      actions: parsed.actions.map((action) => {
        const calibrated = calibrateRepeatedTask(action, context.completedTaskHistory);
        let nextPayload = calibrated.payload;
        if (calibrated.type === "set_habit_status" && calibrated.payload.habitKey) {
          nextPayload = {
            ...nextPayload,
            habitKey:
              habitKeys.get(normalizeIntentText(calibrated.payload.habitKey)) ||
              calibrated.payload.habitKey,
          };
        }
        if (calibrated.type === "log_mood" && calibrated.payload.moodCategory) {
          nextPayload = {
            ...nextPayload,
            moodCategory:
              moodKeys.get(normalizeIntentText(calibrated.payload.moodCategory)) ||
              calibrated.payload.moodCategory,
          };
        }
        if (
          calibrated.type === "update_spiritual_streak" &&
          calibrated.payload.boardKey
        ) {
          nextPayload = {
            ...nextPayload,
            boardKey:
              (streakKeys.get(
                normalizeIntentText(calibrated.payload.boardKey)
              ) as typeof calibrated.payload.boardKey | undefined) ||
              calibrated.payload.boardKey,
          };
        }
        if (
          calibrated.type === "bulk_update_tasks" &&
          calibrated.payload.taskUpdates
        ) {
          nextPayload = {
            ...calibrated.payload,
            taskUpdates: calibrated.payload.taskUpdates.map((update) => ({
              ...update,
              title: update.title || taskTitles.get(update.taskId),
            })),
          };
        }
        if (
          calibrated.type === "update_reading_progress" &&
          calibrated.payload.readingUpdates
        ) {
          nextPayload = {
            ...calibrated.payload,
            readingUpdates: calibrated.payload.readingUpdates.map((update) => {
              const key =
                update.kind === "despertai_topic"
                  ? `${update.kind}:${update.itemId}:${update.topicId}`
                  : update.kind === "bible_chapters"
                    ? `${update.kind}:${update.bookKey}`
                    : `${update.kind}:${update.itemId}`;
              return {
                ...update,
                label: update.label || readingLabels.get(key),
              };
            }),
          };
        }
        return {
          ...calibrated,
          id: action.id || randomUUID(),
          payload: nextPayload,
        };
      }) as AssistantAction[],
    };
  } finally {
    clearTimeout(timeout);
  }
}

type AssistantTaskChange =
  NonNullable<AssistantAction["payload"]["taskUpdates"]>[number];

async function updateTaskFromAssistant(
  userEmail: string,
  change: AssistantTaskChange
) {
  const existing = await prisma.todoTask.findFirst({
    where: { id: change.taskId, userEmail },
    select: {
      id: true,
      source: true,
      externalEventKey: true,
      isDone: true,
      estimatedMinutes: true,
    },
  });
  if (!existing) throw new Error("RESOURCE_NOT_FOUND");

  const task = await updateTask(userEmail, change.taskId, {
    title: change.title,
    scheduledDate: change.scheduledDate,
    scheduledTime: change.scheduledTime,
    plannedTime:
      change.plannedTime !== undefined
        ? change.plannedTime
        : change.scheduledTime,
    startTime: change.startTime,
    endTime: change.endTime,
    notes: change.notes,
    estimatedMinutes: change.estimatedMinutes,
    priorityTag: change.priority,
    areaTag: change.areaTag,
    focusOrder: change.focusOrder,
    scheduleLocked: change.scheduleLocked,
    isDone:
      change.completed === undefined ? undefined : change.completed ? 1 : 0,
  });

  if (change.effort !== undefined) {
    await setTaskEffort(userEmail, task.id, change.effort);
  }

  if (change.completed && !existing.isDone) {
    const minutes = existing.estimatedMinutes ?? change.estimatedMinutes ?? 0;
    const points =
      minutes >= 60
        ? POINTS.taskDeep
        : minutes >= 30
          ? POINTS.taskMedium
          : POINTS.taskShort;
    await addPointsOnce(userEmail, `task::done::${task.id}`, points);
  }

  if (
    existing.source === "dissertation" &&
    existing.externalEventKey &&
    (change.completed !== undefined || change.scheduledDate !== undefined)
  ) {
    try {
      await syncDissertationStepFromMirrorTask(userEmail, task.id);
    } catch (error) {
      logServerEvent("warn", {
        endpoint: "Orbit task integration",
        message: "Failed to sync an Orbit task change into dissertation",
        error,
        meta: { taskId: task.id },
      });
    }
  }

  return task;
}

export async function applyAssistantActions(userEmail: string, rawActions: unknown) {
  const actions = applySchema.parse(rawActions);
  const todayIso = await getTodayIsoForUser(userEmail);
  const taskIds = actions
    .flatMap((action) => {
      if (action.type === "update_task") return [action.payload.taskId];
      if (action.type === "bulk_update_tasks") {
        return (action.payload.taskUpdates || []).map((update) => update.taskId);
      }
      return [];
    })
    .filter((id): id is string => Boolean(id));
  if (taskIds.length) {
    const owned = await prisma.todoTask.count({ where: { userEmail, id: { in: taskIds } } });
    if (owned !== new Set(taskIds).size) throw new Error("RESOURCE_NOT_FOUND");
  }

  const allHabits = await getAllCustomHabits(userEmail);
  const habitKeys = new Set(allHabits.map((habit) => canonicalHabitKey(habit.name)));
  const nextHabits = [...allHabits];
  const results: Array<{ id: string; type: string; title: string }> = [];

  // Areas must exist before a later task action can assign them.
  for (const action of actions.filter((item) => item.type === "create_area")) {
    const label = action.payload.areaLabel || action.title;
    const area = await createTaskArea(userEmail, {
      label,
      color: action.payload.areaColor,
    });
    results.push({ id: area.key, type: action.type, title: area.label });
  }

  for (const action of actions) {
    if (action.type === "create_area") continue;

    if (action.type === "create_task") {
      const title = (action.payload.title || action.title).trim();
      const task = await createTask(userEmail, {
        title,
        source: "assistant",
        scheduledDate: action.payload.scheduledDate ?? todayIso,
        scheduledTime: action.payload.scheduledTime ?? null,
        plannedTime:
          action.payload.plannedTime ?? action.payload.scheduledTime ?? null,
        startTime: action.payload.startTime ?? null,
        endTime: action.payload.endTime ?? null,
        notes: action.payload.notes ?? null,
        estimatedMinutes: action.payload.estimatedMinutes ?? null,
        priorityTag: action.payload.priority || "Medium",
        areaTag: action.payload.areaTag ?? null,
        focusOrder: action.payload.focusOrder ?? null,
        scheduleLocked: action.payload.scheduleLocked ?? null,
      });
      if (action.payload.effort !== undefined) {
        await setTaskEffort(userEmail, task.id, action.payload.effort);
      }
      results.push({ id: task.id, type: action.type, title: task.title });
      continue;
    }

    if (action.type === "update_task") {
      const taskId = action.payload.taskId;
      if (!taskId) throw new Error("INVALID_ASSISTANT_ACTION");
      const task = await updateTaskFromAssistant(userEmail, {
        taskId,
        title: action.payload.title,
        scheduledDate: action.payload.scheduledDate,
        scheduledTime: action.payload.scheduledTime,
        plannedTime: action.payload.plannedTime,
        startTime: action.payload.startTime,
        endTime: action.payload.endTime,
        notes: action.payload.notes,
        estimatedMinutes: action.payload.estimatedMinutes,
        priority: action.payload.priority,
        areaTag: action.payload.areaTag,
        focusOrder: action.payload.focusOrder,
        scheduleLocked: action.payload.scheduleLocked,
        effort: action.payload.effort,
        completed: action.payload.completed,
      });
      results.push({ id: task.id, type: action.type, title: task.title });
      continue;
    }

    if (action.type === "bulk_update_tasks") {
      const updates = action.payload.taskUpdates;
      if (!updates?.length) throw new Error("INVALID_ASSISTANT_ACTION");
      for (let index = 0; index < updates.length; index += 8) {
        const batch = updates.slice(index, index + 8);
        const updatedTasks = await Promise.all(
          batch.map((update) => updateTaskFromAssistant(userEmail, update))
        );
        updatedTasks.forEach((task) => {
          results.push({ id: task.id, type: action.type, title: task.title });
        });
      }
      continue;
    }

    if (action.type === "create_habit") {
      const habitName = (action.payload.habitName || action.title).trim();
      const key = canonicalHabitKey(habitName);
      if (!habitKeys.has(key)) {
        nextHabits.push({ id: randomUUID(), name: habitName, active: true });
        habitKeys.add(key);
        results.push({ id: key, type: action.type, title: habitName });
      }
      continue;
    }

    if (action.type === "set_habit_status") {
      const habitKey = action.payload.habitKey;
      const completed = action.payload.completed;
      const date = action.payload.date || todayIso;
      if (!habitKey || completed === undefined) {
        throw new Error("INVALID_ASSISTANT_ACTION");
      }
      if (SHARED_HABIT_PATCH_KEYS.has(habitKey)) {
        await updateDailyEntryWithIntegrations(userEmail, date, {
          [habitKey]: completed ? 1 : 0,
        });
      } else {
        await setCustomHabitStatusWithIntegrations(
          userEmail,
          date,
          habitKey,
          completed
        );
      }
      results.push({ id: `${date}:${habitKey}`, type: action.type, title: action.title });
      continue;
    }

    if (action.type === "log_mood") {
      const moodCategory = action.payload.moodCategory;
      const date = action.payload.date || todayIso;
      if (!moodCategory) throw new Error("INVALID_ASSISTANT_ACTION");
      await createMoodMoment(userEmail, {
        dayIso: date,
        loggedTime:
          action.payload.loggedTime || (await currentTimeForUser(userEmail)),
        moodCategory,
      });
      results.push({ id: `${date}:${randomUUID()}`, type: action.type, title: action.title });
      continue;
    }

    if (action.type === "update_day_metrics") {
      const payload: Record<string, unknown> = {};
      if (action.payload.sleepHours !== undefined) {
        payload.sleep_hours = action.payload.sleepHours;
      }
      if (action.payload.anxietyLevel !== undefined) {
        payload.anxiety_level = action.payload.anxietyLevel;
      }
      if (action.payload.workHours !== undefined) {
        payload.work_hours = action.payload.workHours;
      }
      if (action.payload.boredomMinutes !== undefined) {
        payload.boredom_minutes = action.payload.boredomMinutes;
      }
      if (!Object.keys(payload).length) throw new Error("INVALID_ASSISTANT_ACTION");
      const date = action.payload.date || todayIso;
      await updateDailyEntryWithIntegrations(userEmail, date, payload);
      results.push({ id: date, type: action.type, title: action.title });
      continue;
    }

    if (action.type === "set_low_energy_mode") {
      if (action.payload.enabled === undefined) {
        throw new Error("INVALID_ASSISTANT_ACTION");
      }
      await setLowEnergyMode(userEmail, action.payload.enabled);
      results.push({
        id: "low-energy-mode",
        type: action.type,
        title: action.title,
      });
      continue;
    }

    if (action.type === "set_ministry_month_goal") {
      const month = action.payload.month || todayIso.slice(0, 7);
      const targetMinutes = action.payload.targetMinutes;
      if (targetMinutes === undefined) throw new Error("INVALID_ASSISTANT_ACTION");
      await setMinistryMonthlyGoal(userEmail, month, targetMinutes);
      results.push({ id: month, type: action.type, title: action.title });
      continue;
    }

    if (action.type === "update_ministry_day") {
      const date = action.payload.date;
      if (!date) throw new Error("INVALID_ASSISTANT_ACTION");
      const existing = await prisma.ministryDailyEntry.findFirst({ where: { userEmail, date } });
      await setMinistryDayEntry(userEmail, date, {
        goalMinutes:
          action.payload.goalMinutes === undefined
            ? existing?.goalMinutes ?? null
            : action.payload.goalMinutes,
        actualMinutes:
          action.payload.actualMinutes === undefined
            ? existing?.actualMinutes ?? null
            : action.payload.actualMinutes,
        notes:
          action.payload.notes === undefined ? existing?.notes ?? null : action.payload.notes,
      });
      results.push({ id: date, type: action.type, title: action.title });
      continue;
    }

    if (action.type === "set_ministry_recurrence") {
      const weekday = action.payload.weekday;
      const goalMinutes = action.payload.goalMinutes;
      const label = action.payload.recurrenceLabel || action.title;
      if (weekday === undefined || goalMinutes == null || goalMinutes <= 0) {
        throw new Error("INVALID_ASSISTANT_ACTION");
      }
      const recurrence = await upsertMinistryRecurringPlan(userEmail, {
        id: action.payload.recurrenceId,
        label,
        weekday,
        goalMinutes,
        startDate: action.payload.startDate || todayIso,
        endDate: action.payload.endDate ?? null,
      });
      results.push({
        id: recurrence.id,
        type: action.type,
        title: recurrence.label,
      });
      continue;
    }

    if (action.type === "remove_ministry_recurrence") {
      const recurrenceId = action.payload.recurrenceId;
      if (!recurrenceId) throw new Error("INVALID_ASSISTANT_ACTION");
      const recurrence = await removeMinistryRecurringPlan(userEmail, recurrenceId);
      results.push({
        id: recurrence.id,
        type: action.type,
        title: recurrence.label,
      });
      continue;
    }

    if (action.type === "update_reading_progress") {
      const updates = action.payload.readingUpdates;
      if (!updates?.length) throw new Error("INVALID_ASSISTANT_ACTION");
      await applyReadingProgressUpdates(userEmail, updates);
      results.push({
        id: action.id || randomUUID(),
        type: action.type,
        title: action.title,
      });
      continue;
    }

    if (action.type === "set_books_goal") {
      const year = action.payload.year || Number(todayIso.slice(0, 4));
      const yearlyGoal = action.payload.yearlyGoal;
      if (yearlyGoal === undefined) throw new Error("INVALID_ASSISTANT_ACTION");
      await updateBooksGoal({ userEmail, year, yearlyGoal });
      results.push({ id: String(year), type: action.type, title: action.title });
      continue;
    }

    if (action.type === "create_book") {
      const title = action.payload.title?.trim();
      if (!title) throw new Error("INVALID_ASSISTANT_ACTION");
      const created = await createBook({
        userEmail,
        year: action.payload.year || Number(todayIso.slice(0, 4)),
        title,
        author: action.payload.author,
        coverUrl: action.payload.coverUrl,
        totalPages: action.payload.totalPages,
        pagesRead: action.payload.pagesRead,
        status: action.payload.bookStatus,
        rating: action.payload.rating,
      });
      results.push({ id: created.item.id, type: action.type, title: created.item.title });
      continue;
    }

    if (action.type === "update_book") {
      const bookId = action.payload.bookId;
      if (!bookId) throw new Error("INVALID_ASSISTANT_ACTION");
      const updated = await updateBook({
        userEmail,
        bookId,
        patch: {
          year: action.payload.year,
          title: action.payload.title,
          author: action.payload.author,
          coverUrl: action.payload.coverUrl,
          totalPages: action.payload.totalPages,
          pagesRead: action.payload.pagesRead,
          status: action.payload.bookStatus,
          rating: action.payload.rating,
        },
      });
      results.push({ id: updated.item.id, type: action.type, title: updated.item.title });
      continue;
    }

    if (action.type === "update_spiritual_streak") {
      const boardKey = action.payload.boardKey;
      const date = action.payload.date || todayIso;
      if (!boardKey || action.payload.success === undefined) {
        throw new Error("INVALID_ASSISTANT_ACTION");
      }
      await updateSpiritualStreakEntry({
        userEmail,
        boardKey,
        monthKey: date.slice(0, 7),
        date,
        success: action.payload.success,
      });
      results.push({ id: `${boardKey}:${date}`, type: action.type, title: action.title });
      continue;
    }

    if (action.type === "update_spiritual_goal") {
      const category = action.payload.spiritualCategory;
      const operation = action.payload.spiritualOperation;
      if (!category || !operation) throw new Error("INVALID_ASSISTANT_ACTION");

      if (operation === "complete_current" || operation === "move_back") {
        await applySpiritualGoalAction(userEmail, category, { type: operation });
      } else if (operation === "add_task") {
        if (!action.payload.stepId || !action.payload.title) {
          throw new Error("INVALID_ASSISTANT_ACTION");
        }
        await applySpiritualGoalAction(userEmail, category, {
          type: operation,
          step_id: action.payload.stepId,
          title: action.payload.title,
        });
      } else if (operation === "toggle_task") {
        if (
          !action.payload.stepId ||
          !action.payload.taskId ||
          action.payload.taskCompleted === undefined
        ) {
          throw new Error("INVALID_ASSISTANT_ACTION");
        }
        await applySpiritualGoalAction(userEmail, category, {
          type: operation,
          step_id: action.payload.stepId,
          task_id: action.payload.taskId,
          completed: action.payload.taskCompleted,
        });
      } else if (operation === "save_step_notes") {
        if (!action.payload.stepId) throw new Error("INVALID_ASSISTANT_ACTION");
        await applySpiritualGoalAction(userEmail, category, {
          type: operation,
          step_id: action.payload.stepId,
          notes: action.payload.notes,
        });
      } else {
        await applySpiritualGoalAction(userEmail, category, {
          type: "save_general_notes",
          notes: action.payload.notes,
        });
      }
      results.push({ id: category, type: action.type, title: action.title });
      continue;
    }

    if (action.type === "add_dissertation_step") {
      if (!action.payload.frontId) throw new Error("INVALID_ASSISTANT_ACTION");
      await applyDissertationAction(userEmail, {
        type: "add_step",
        frontId: action.payload.frontId,
        title: action.payload.title || action.title,
        dueDate: action.payload.dueDate,
      });
      results.push({
        id: action.payload.frontId,
        type: action.type,
        title: action.payload.title || action.title,
      });
      continue;
    }

    if (action.type === "update_dissertation_front") {
      if (!action.payload.frontId) throw new Error("INVALID_ASSISTANT_ACTION");
      await applyDissertationAction(userEmail, {
        type: "update_front",
        frontId: action.payload.frontId,
        status: action.payload.status,
        targetDate: action.payload.dueDate,
      });
      results.push({ id: action.payload.frontId, type: action.type, title: action.title });
      continue;
    }

    if (action.type === "add_couple_goal") {
      const title = action.payload.title?.trim();
      if (!title) throw new Error("INVALID_ASSISTANT_ACTION");
      const goal = await addCoupleGoal(userEmail, {
        title,
        category: action.payload.category || "Shared",
        size: action.payload.size || "medium",
        emoji: action.payload.emoji,
        targetDate: action.payload.targetDate,
        createdBy: userEmail,
      });
      results.push({ id: goal.id, type: action.type, title: goal.title });
      continue;
    }

    if (action.type === "update_couple_goal") {
      if (
        !action.payload.goalId ||
        action.payload.progress === undefined
      ) {
        throw new Error("INVALID_ASSISTANT_ACTION");
      }
      await updateCoupleGoalProgress(
        userEmail,
        action.payload.goalId,
        action.payload.progress
      );
      results.push({
        id: action.payload.goalId,
        type: action.type,
        title: action.title,
      });
      continue;
    }

    if (action.type === "add_savings_goal") {
      const title = action.payload.title?.trim();
      if (!title || action.payload.targetAmount === undefined) {
        throw new Error("INVALID_ASSISTANT_ACTION");
      }
      const goal = await addSavingsGoal(userEmail, {
        title,
        target: action.payload.targetAmount,
        emoji: action.payload.emoji,
      });
      results.push({ id: goal.id, type: action.type, title: goal.title });
      continue;
    }

    if (action.type === "update_savings_goal") {
      if (
        !action.payload.savingsGoalId ||
        action.payload.currentAmount === undefined
      ) {
        throw new Error("INVALID_ASSISTANT_ACTION");
      }
      await updateSavingsGoalAmount(
        userEmail,
        action.payload.savingsGoalId,
        action.payload.currentAmount
      );
      results.push({
        id: action.payload.savingsGoalId,
        type: action.type,
        title: action.title,
      });
      continue;
    }

    if (action.type === "add_bucket_item") {
      const title = action.payload.title?.trim();
      if (!title) throw new Error("INVALID_ASSISTANT_ACTION");
      const item = await addBucketItem(userEmail, title);
      results.push({ id: item.id, type: action.type, title: item.title });
      continue;
    }

    if (action.type === "toggle_bucket_item") {
      if (!action.payload.bucketItemId) {
        throw new Error("INVALID_ASSISTANT_ACTION");
      }
      await toggleBucketItem(userEmail, action.payload.bucketItemId);
      results.push({
        id: action.payload.bucketItemId,
        type: action.type,
        title: action.title,
      });
      continue;
    }

    if (
      action.type === "add_finance_expense" ||
      action.type === "upsert_finance_debt" ||
      action.type === "update_finance_income" ||
      action.type === "update_finance_fixed_cost"
    ) {
      const financeMonth = action.payload.month || todayIso.slice(0, 7);
      const [year, month] = financeMonth.split("-").map(Number);
      if (!year || !month) throw new Error("INVALID_ASSISTANT_ACTION");
      const finance = await getMonthlyFinance(userEmail, year, month);

      if (action.type === "add_finance_expense") {
        const label = action.payload.title?.trim();
        if (!label || action.payload.amount === undefined) {
          throw new Error("INVALID_ASSISTANT_ACTION");
        }
        finance.extraExpenses.push({
          id: action.payload.expenseId || randomUUID(),
          label,
          amount: action.payload.amount,
          paid: action.payload.paid ?? false,
        });
      } else if (action.type === "upsert_finance_debt") {
        const debtKey = action.payload.debtKey;
        if (!debtKey) throw new Error("INVALID_ASSISTANT_ACTION");
        const current = finance.debts[debtKey] || {
          label: action.payload.title || debtKey,
          total: 0,
          monthly: 0,
          paid: 0,
        };
        finance.debts[debtKey] = {
          label: action.payload.title?.trim() || current.label,
          total: action.payload.totalAmount ?? current.total,
          monthly: action.payload.monthlyAmount ?? current.monthly,
          paid: action.payload.paidAmount ?? current.paid,
        };
      } else if (action.type === "update_finance_income") {
        if (!action.payload.incomeKey || action.payload.amount === undefined) {
          throw new Error("INVALID_ASSISTANT_ACTION");
        }
        finance.income[action.payload.incomeKey] = action.payload.amount;
      } else {
        const fixedCostId = action.payload.fixedCostId;
        const item = finance.fixedCosts.find((cost) => cost.id === fixedCostId);
        if (!item) throw new Error("RESOURCE_NOT_FOUND");
        if (action.payload.title) item.label = action.payload.title;
        if (action.payload.budget !== undefined) item.budget = action.payload.budget;
        if (action.payload.actual !== undefined) item.actual = action.payload.actual;
        if (action.payload.paid !== undefined) {
          item.paid = action.payload.paid ? "pago" : "nao_pago";
        }
      }

      await saveMonthlyFinance(userEmail, year, month, finance);
      results.push({ id: financeMonth, type: action.type, title: action.title });
      continue;
    }

    if (action.type === "set_assistant_preferences") {
      if (action.payload.askWhenUncertain === undefined) {
        throw new Error("INVALID_ASSISTANT_ACTION");
      }
      await updateAssistantPreferences(userEmail, {
        askWhenUncertain: action.payload.askWhenUncertain,
      });
      results.push({
        id: action.id || randomUUID(),
        type: action.type,
        title: action.title,
      });
    }
  }

  if (nextHabits.length !== allHabits.length) {
    await saveCustomHabits(userEmail, nextHabits);
  }
  return results;
}
