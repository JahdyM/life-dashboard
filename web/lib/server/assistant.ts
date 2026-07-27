import "server-only";

import { randomUUID } from "crypto";
import { addDays, subDays } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  ASSISTANT_ACTION_TYPES,
  type AssistantAction,
  type AssistantChatMessage,
  type AssistantReply,
  type AssistantScope,
} from "@/lib/assistant";
import { applyDissertationAction, loadDissertationProject } from "./dissertation";
import { getMinistryMonthData, setMinistryDayEntry, setMinistryMonthlyGoal } from "./ministry";
import { getEstimationStats } from "./stats/estimation";
import {
  canonicalHabitKey,
  getAllCustomHabits,
  getCustomHabits,
  getTodayIsoForUser,
  saveCustomHabits,
} from "./settings";
import { createTaskArea, getTaskAreas } from "./taskAreas";
import { createTask, listTasks, updateTask } from "./tasks";
import { logServerEvent } from "./logger";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const isoTime = /^([01]\d|2[0-3]):[0-5]\d$/;
const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/;

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
      estimatedMinutes: z.number().int().min(1).max(480).nullable().optional(),
      priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
      areaTag: z.string().trim().max(40).nullable().optional(),
      focusOrder: z.number().int().min(1).max(1000).nullable().optional(),
      habitName: z.string().trim().min(1).max(60).optional(),
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
      frontId: z.string().trim().min(1).max(120).optional(),
      status: z.string().trim().max(500).optional(),
      dueDate: z.union([z.string().regex(isoDate), z.null()]).optional(),
    })
    .strict(),
});

const replySchema = z.object({
  message: z.string().trim().min(1).max(5000),
  actions: z.array(actionSchema).max(40).default([]),
});

const applySchema = z.array(actionSchema).min(1).max(40);

type AssistantContext = Awaited<ReturnType<typeof buildAssistantContext>>;
type EstimationHistoryItem = AssistantContext["completedTaskHistory"][number];

const payloadAliases: Record<string, string[]> = {
  taskId: ["task_id", "id"],
  scheduledDate: ["scheduled_date"],
  scheduledTime: ["scheduled_time", "planned_time", "plannedTime", "time"],
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
  habitName: ["habit_name"],
  areaLabel: ["area_label"],
  areaColor: ["area_color"],
  targetMinutes: ["target_minutes"],
  goalMinutes: ["goal_minutes"],
  actualMinutes: ["actual_minutes"],
  frontId: ["front_id"],
  dueDate: ["due_date"],
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

function normalizeAssistantReply(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const reply = value as Record<string, unknown>;
  if (!Array.isArray(reply.actions)) return value;

  return {
    ...reply,
    actions: reply.actions.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const action = item as Record<string, unknown>;
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

      ["estimatedMinutes", "focusOrder", "targetMinutes", "goalMinutes", "actualMinutes"].forEach(
        (field) => {
          if (payload[field] !== undefined && payload[field] !== null) {
            payload[field] = normalizeMinutes(payload[field]);
          }
        }
      );

      if (typeof payload.scheduledTime === "string") {
        const match = payload.scheduledTime.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)/);
        if (match) payload.scheduledTime = `${match[1].padStart(2, "0")}:${match[2]}`;
      }

      return { ...action, payload };
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

function assistantModel() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

type GeminiPayload = {
  error?: { code?: number; status?: string; message?: string };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
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

function needs(scope: AssistantScope, ...scopes: AssistantScope[]) {
  return scope === "all" || scopes.includes(scope);
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

async function buildAssistantContext(userEmail: string, scope: AssistantScope) {
  const todayIso = await getTodayIsoForUser(userEmail);
  const startIso = dayOffset(todayIso, -14);
  const endIso = dayOffset(todayIso, 14);
  const currentMonth = todayIso.slice(0, 7);
  const taskContext = needs(scope, "today", "calendar", "dissertation", "ministry");
  const habitContext = needs(scope, "today", "calendar", "habits");
  const metricContext = needs(scope, "today", "mood", "stats");

  const [tasks, habits, estimation, metrics, areas, ministry, dissertation] =
    await Promise.all([
      taskContext ? listTasks(userEmail, todayIso, endIso, true) : Promise.resolve([]),
      habitContext ? getCustomHabits(userEmail) : Promise.resolve([]),
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
      needs(scope, "ministry")
        ? getMinistryMonthData(userEmail, currentMonth)
        : Promise.resolve(null),
      needs(scope, "dissertation")
        ? loadDissertationProject(userEmail)
        : Promise.resolve(null),
    ]);

  const pendingTasks = tasks
    .filter((task) => !task.isDone && !task.missedAt)
    .slice(0, 80)
    .map((task) => ({
      id: task.id,
      title: task.title,
      date: task.scheduledDate || null,
      time: task.scheduledTime || null,
      estimate: task.estimatedMinutes || null,
      priority: task.priorityTag || "Medium",
      area: task.areaTag || null,
      order: task.focusOrder || null,
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
    pendingTasks,
    taskAreas: areas,
    completedTaskHistory: historyPoints.map((point) => ({
      title: point.title,
      estimatedMinutes: point.estimatedMinutes,
      actualMinutes: point.actualMinutes,
      area: point.areaTag,
      date: point.scheduledDate,
    })),
    habits: habits.map((habit) => habit.name),
    recentMetrics: metrics,
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
    "Return actions whenever the user asks to create, change, organize, prioritize, tag, estimate, or plan something.",
    "Every action is a preview and requires one user review. Never claim it was already applied.",
    "TASK ESTIMATION: first compare the title and meaning with completedTaskHistory. For repeated or similar work, use real actualMinutes. For new work, infer its steps and complexity, then calibrate with the user's averageRatio and area history. Explain the basis briefly.",
    "TASK ORGANIZATION: update existing tasks by ID. Use scheduledTime for real clock scheduling. Use focusOrder for execution order without requiring a time. Avoid overlaps and add realistic breathing room.",
    "TASK TAGS: use an existing taskAreas key. If the requested tag does not exist, propose create_area before assigning it.",
    "PRIORITY: use Low, Medium, High, or Critical based on consequence and deadline, not anxiety.",
    "MINISTRY: daily goals are always manual. You may set a monthly goal and specific daily plans, but never auto-distribute the monthly target unless the user explicitly asks you to create a proposed schedule. Preserve logged actual time unless the user explicitly changes it.",
    "DISSERTATION: use front IDs from context when adding a next step or changing a front status.",
    "Allowed actions: create_task, update_task, create_habit, create_area, set_ministry_month_goal, update_ministry_day, add_dissertation_step, update_dissertation_front.",
    'Return only one JSON object shaped as {"message":"short answer","actions":[{"type":"allowed action","title":"short preview title","reason":"brief reason","payload":{}}]}. Use an empty actions array when no change is needed. Never add keys outside this structure.',
    "For task duration, the payload key is estimatedMinutes (integer minutes). For a fixed task time, use scheduledTime in HH:mm. Never use estimate, duration, or time as payload keys.",
    "Never delete, complete, or mark records missed. Do not alter sensitive metrics. If the requested operation has no supported safe action, explain what is missing instead of pretending.",
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

  const context = await buildAssistantContext(userEmail, scope);
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
        maxOutputTokens: 4000,
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
      parsed = replySchema.parse(normalizeAssistantReply(JSON.parse(text)));
    } catch (error) {
      logServerEvent("error", {
        endpoint: "Gemini response validation",
        message: "Orbit received an invalid action payload",
        error,
      });
      throw new Error("AI_INVALID_RESPONSE");
    }
    return {
      message: parsed.message,
      actions: parsed.actions.map((action) => ({
        ...calibrateRepeatedTask(action, context.completedTaskHistory),
        id: action.id || randomUUID(),
      })) as AssistantAction[],
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function applyAssistantActions(userEmail: string, rawActions: unknown) {
  const actions = applySchema.parse(rawActions);
  const todayIso = await getTodayIsoForUser(userEmail);
  const taskIds = actions
    .filter((action) => action.type === "update_task")
    .map((action) => action.payload.taskId)
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
        plannedTime: action.payload.scheduledTime ?? null,
        estimatedMinutes: action.payload.estimatedMinutes ?? null,
        priorityTag: action.payload.priority || "Medium",
        areaTag: action.payload.areaTag ?? null,
        focusOrder: action.payload.focusOrder ?? null,
      });
      results.push({ id: task.id, type: action.type, title: task.title });
      continue;
    }

    if (action.type === "update_task") {
      const taskId = action.payload.taskId;
      if (!taskId) throw new Error("INVALID_ASSISTANT_ACTION");
      const task = await updateTask(userEmail, taskId, {
        scheduledDate: action.payload.scheduledDate,
        scheduledTime: action.payload.scheduledTime,
        plannedTime: action.payload.scheduledTime,
        estimatedMinutes: action.payload.estimatedMinutes,
        priorityTag: action.payload.priority,
        areaTag: action.payload.areaTag,
        focusOrder: action.payload.focusOrder,
      });
      results.push({ id: task.id, type: action.type, title: task.title });
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
    }
  }

  if (nextHabits.length !== allHabits.length) {
    await saveCustomHabits(userEmail, nextHabits);
  }
  return results;
}
