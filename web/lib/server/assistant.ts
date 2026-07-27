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
} from "@/lib/assistant";
import { getEstimationStats } from "@/lib/server/stats/estimation";
import {
  canonicalHabitKey,
  getAllCustomHabits,
  getCustomHabits,
  getTodayIsoForUser,
  saveCustomHabits,
} from "@/lib/server/settings";
import { createTask, listTasks, updateTask } from "@/lib/server/tasks";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const isoTime = /^([01]\d|2[0-3]):[0-5]\d$/;

const actionSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  type: z.enum(ASSISTANT_ACTION_TYPES),
  title: z.string().trim().min(1).max(160),
  reason: z.string().trim().max(240).default(""),
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
    })
    .strict(),
});

const replySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  actions: z.array(actionSchema).max(12).default([]),
});

const applySchema = z.array(actionSchema).min(1).max(12);

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

function buildResponseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["message", "actions"],
    properties: {
      message: { type: "string" },
      actions: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "title", "reason", "payload"],
          properties: {
            type: { type: "string", enum: [...ASSISTANT_ACTION_TYPES] },
            title: { type: "string" },
            reason: { type: "string" },
            payload: {
              type: "object",
              properties: {
                taskId: { type: "string" },
                title: { type: "string" },
                scheduledDate: { type: ["string", "null"], format: "date" },
                scheduledTime: { type: ["string", "null"] },
                estimatedMinutes: { type: ["integer", "null"], minimum: 1, maximum: 480 },
                priority: {
                  type: "string",
                  enum: ["Low", "Medium", "High", "Critical"],
                },
                areaTag: { type: ["string", "null"] },
                focusOrder: { type: ["integer", "null"], minimum: 1, maximum: 1000 },
                habitName: { type: "string" },
              },
            },
          },
        },
      },
    },
  };
}

async function buildAssistantContext(userEmail: string) {
  const todayIso = await getTodayIsoForUser(userEmail);
  const startIso = dayOffset(todayIso, -14);
  const endIso = dayOffset(todayIso, 7);
  const [tasks, habits, estimation, metrics] = await Promise.all([
    listTasks(userEmail, todayIso, endIso, true),
    getCustomHabits(userEmail),
    getEstimationStats(userEmail, "all"),
    prisma.dailyEntryUser.findMany({
      where: { userEmail, date: { gte: startIso, lte: todayIso } },
      select: {
        date: true,
        sleepHours: true,
        anxietyLevel: true,
        workHours: true,
        moodCategory: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const pendingTasks = tasks
    .filter((task) => !task.isDone && !task.missedAt)
    .slice(0, 50)
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

  const ratiosByArea = new Map<string, number[]>();
  estimation.points.forEach((point) => {
    const key = point.areaTag || "untagged";
    const values = ratiosByArea.get(key) || [];
    values.push(point.ratio);
    ratiosByArea.set(key, values);
  });

  return {
    today: todayIso,
    pendingTasks,
    habits: habits.map((habit) => habit.name),
    recentMetrics: metrics,
    estimation: {
      samples: estimation.summary.totalSamples,
      averageRatio: estimation.summary.averageRatio,
      tendency: estimation.summary.tendency,
      recommendation: estimation.summary.recommendation,
      byArea: Array.from(ratiosByArea.entries()).map(([area, ratios]) => ({
        area,
        samples: ratios.length,
        averageRatio:
          Math.round((ratios.reduce((sum, value) => sum + value, 0) / ratios.length) * 100) /
          100,
      })),
    },
  };
}

function systemInstruction(context: Awaited<ReturnType<typeof buildAssistantContext>>) {
  return [
    "You are Orbit, a calm planning assistant inside a private Life Dashboard.",
    "Reply in the same language as the user. Be concise and practical.",
    `Today is ${context.today}. Never invent a different current date.`,
    "Use the supplied dashboard context. Estimate durations from the user's historical ratio and area history when available.",
    "When organizing a day, avoid overlaps, leave breathing room, and use focusOrder for unscheduled execution order.",
    "You may only propose create_task, update_task, and create_habit actions.",
    "Never delete, complete, or mark a task missed. Never alter sensitive metrics.",
    "Actions are previews and require user confirmation. Do not claim they were already applied.",
    "For update_task, use only task IDs present in context.",
    "For create_task include a title, date (normally today), realistic estimate, priority, and optional area.",
    "For create_habit use habitName. Do not duplicate an existing habit.",
    "If the user only asks a question or for analysis, return no actions.",
    `Dashboard context: ${JSON.stringify(context)}`,
  ].join("\n");
}

export async function askAssistant(
  userEmail: string,
  messages: AssistantChatMessage[]
): Promise<AssistantReply> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AI_NOT_CONFIGURED");
  }

  const context = await buildAssistantContext(userEmail);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        assistantModel()
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction(context) }],
          },
          contents: messages.slice(-12).map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 1800,
            responseMimeType: "application/json",
            responseSchema: buildResponseSchema(),
          },
        }),
        signal: controller.signal,
      }
    );

    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string; status?: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } | null;

    if (!response.ok) {
      if (response.status === 429) throw new Error("AI_QUOTA_REACHED");
      throw new Error(payload?.error?.message || "AI_REQUEST_FAILED");
    }

    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();
    if (!text) throw new Error("AI_EMPTY_RESPONSE");

    const parsed = replySchema.parse(JSON.parse(text));
    return {
      message: parsed.message,
      actions: parsed.actions.map((action) => ({
        ...action,
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
    const owned = await prisma.todoTask.count({
      where: { userEmail, id: { in: taskIds } },
    });
    if (owned !== new Set(taskIds).size) throw new Error("RESOURCE_NOT_FOUND");
  }

  const allHabits = await getAllCustomHabits(userEmail);
  const habitKeys = new Set(allHabits.map((habit) => canonicalHabitKey(habit.name)));
  const createdHabits = [...allHabits];
  const results: Array<{ id: string; type: string; title: string }> = [];

  for (const action of actions) {
    if (action.type === "create_task") {
      const title = (action.payload.title || action.title).trim();
      if (!title) throw new Error("INVALID_ASSISTANT_ACTION");
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

    const habitName = (action.payload.habitName || action.title).trim();
    if (!habitName) throw new Error("INVALID_ASSISTANT_ACTION");
    const key = canonicalHabitKey(habitName);
    if (!habitKeys.has(key)) {
      createdHabits.push({ id: randomUUID(), name: habitName, active: true });
      habitKeys.add(key);
      results.push({ id: key, type: action.type, title: habitName });
    }
  }

  if (createdHabits.length !== allHabits.length) {
    await saveCustomHabits(userEmail, createdHabits);
  }

  return results;
}
