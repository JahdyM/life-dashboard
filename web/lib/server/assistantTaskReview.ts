import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ensureTaskCompletionColumns } from "./dbCompat";
import { getSetting, getTodayIsoForUser, setSetting } from "./settings";
import { getTaskAreaMap, getTaskAreas } from "./taskAreas";

const TASK_REVIEW_KEY = "orbit_task_review_v1";
const TASK_CALIBRATION_KEY = "orbit_task_calibration_v1";
const MAX_REVIEW_TASKS = 500;
const MAX_CALIBRATIONS = 120;

export type TaskReviewScope = "today" | "date" | "backlog" | "all";

type TaskReviewSession = {
  scope: TaskReviewScope;
  date: string | null;
  taskIds: string[];
  index: number;
  startedAt: string;
};

export type AssistantTaskReview = {
  scope: TaskReviewScope;
  date: string | null;
  current: {
    id: string;
    title: string;
    estimatedMinutes: number | null;
    areaTag: string | null;
    scheduledDate: string | null;
    scheduledTime: string | null;
  };
  position: number;
  total: number;
  availableAreas: Array<{ key: string; label: string }>;
};

export type AssistantTaskCalibration = {
  title: string;
  estimatedMinutes: number;
  areaTag: string;
  context: string | null;
  updatedAt: string;
};

function parseCalibrations(raw: string | null): AssistantTaskCalibration[] {
  if (!raw) return [];
  try {
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values
      .filter(
        (value) =>
          value &&
          typeof value.title === "string" &&
          Number.isInteger(value.estimatedMinutes) &&
          value.estimatedMinutes > 0 &&
          typeof value.areaTag === "string"
      )
      .slice(0, MAX_CALIBRATIONS)
      .map((value) => ({
        title: String(value.title).slice(0, 200),
        estimatedMinutes: Number(value.estimatedMinutes),
        areaTag: String(value.areaTag).slice(0, 40),
        context: value.context ? String(value.context).slice(0, 500) : null,
        updatedAt: String(value.updatedAt || ""),
      }));
  } catch (_error) {
    return [];
  }
}

export async function getAssistantTaskCalibrations(userEmail: string) {
  return parseCalibrations(await getSetting(userEmail, TASK_CALIBRATION_KEY));
}

async function rememberTaskCalibration(
  userEmail: string,
  taskId: string,
  context: string | null
) {
  const task = await prisma.todoTask.findFirst({
    where: { id: taskId, userEmail },
    select: { id: true, title: true, estimatedMinutes: true },
  });
  if (!task?.estimatedMinutes) return;
  const areaMap = await getTaskAreaMap(userEmail, [task.id]);
  const areaTag = areaMap.get(task.id);
  if (!areaTag) return;
  const current = await getAssistantTaskCalibrations(userEmail);
  const titleKey = task.title.trim().toLocaleLowerCase();
  const next = [
    {
      title: task.title,
      estimatedMinutes: task.estimatedMinutes,
      areaTag,
      context,
      updatedAt: new Date().toISOString(),
    },
    ...current.filter((item) => item.title.trim().toLocaleLowerCase() !== titleKey),
  ].slice(0, MAX_CALIBRATIONS);
  await setSetting(userEmail, TASK_CALIBRATION_KEY, JSON.stringify(next));
}

function parseSession(raw: string | null): TaskReviewSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TaskReviewSession>;
    if (!Array.isArray(value.taskIds) || typeof value.index !== "number") return null;
    const taskIds = value.taskIds
      .map((taskId) => String(taskId || "").trim())
      .filter(Boolean)
      .slice(0, MAX_REVIEW_TASKS);
    if (!taskIds.length) return null;
    return {
      scope: ["today", "date", "backlog", "all"].includes(String(value.scope))
        ? value.scope as TaskReviewScope : "today",
      date: typeof value.date === "string" ? value.date : null,
      taskIds,
      index: Math.max(0, Math.floor(value.index)),
      startedAt: String(value.startedAt || new Date().toISOString()),
    };
  } catch (_error) {
    return null;
  }
}

async function saveSession(userEmail: string, session: TaskReviewSession | null) {
  await setSetting(userEmail, TASK_REVIEW_KEY, session ? JSON.stringify(session) : "");
}

async function loadSession(userEmail: string) {
  return parseSession(await getSetting(userEmail, TASK_REVIEW_KEY));
}

function compareReviewTasks(
  todayIso: string,
  left: { scheduledDate: string | null; scheduledTime: string | null; createdAt: string },
  right: { scheduledDate: string | null; scheduledTime: string | null; createdAt: string }
) {
  const dateRank = (date: string | null) => {
    if (date === todayIso) return 0;
    if (date === null) return 1;
    if (date < todayIso) return 2;
    return 3;
  };
  const rankDifference = dateRank(left.scheduledDate) - dateRank(right.scheduledDate);
  if (rankDifference) return rankDifference;
  const dateDifference = String(left.scheduledDate || "").localeCompare(
    String(right.scheduledDate || "")
  );
  if (dateDifference) return dateDifference;
  const timeDifference = String(left.scheduledTime || "99:99").localeCompare(
    String(right.scheduledTime || "99:99")
  );
  if (timeDifference) return timeDifference;
  return left.createdAt.localeCompare(right.createdAt);
}

export async function startAssistantTaskReview(
  userEmail: string,
  options: { reviewScope?: TaskReviewScope; date?: string } = {}
) {
  await ensureTaskCompletionColumns();
  const todayIso = await getTodayIsoForUser(userEmail);
  const scope = options.reviewScope || (options.date ? "date" : "today");
  const date = scope === "today" ? todayIso : scope === "date" ? options.date : null;
  if (scope === "date" && !date) throw new Error("INVALID_ASSISTANT_ACTION");
  const tasks = await prisma.todoTask.findMany({
    where: {
      userEmail,
      ...(scope === "all" ? {} : { scheduledDate: scope === "backlog" ? null : date }),
      source: { not: "habit" },
      missedAt: null,
      OR: [{ isDone: 0 }, { isDone: null }],
    },
    select: {
      id: true,
      scheduledDate: true,
      scheduledTime: true,
      createdAt: true,
    },
  });
  const taskIds = tasks
    .sort((left, right) => compareReviewTasks(todayIso, left, right))
    .slice(0, MAX_REVIEW_TASKS)
    .map((task) => task.id);
  if (!taskIds.length) {
    await saveSession(userEmail, null);
    return null;
  }
  await saveSession(userEmail, {
    scope,
    date: date || null,
    taskIds,
    index: 0,
    startedAt: new Date().toISOString(),
  });
  return getAssistantTaskReview(userEmail);
}

export async function stopAssistantTaskReview(userEmail: string) {
  await saveSession(userEmail, null);
}

export async function getAssistantTaskReview(
  userEmail: string
): Promise<AssistantTaskReview | null> {
  const session = await loadSession(userEmail);
  if (!session) return null;
  await ensureTaskCompletionColumns();
  // Older sessions had no date filter. Rebuild them, and refresh "today" at midnight.
  if (session.scope === "today" && session.date !== await getTodayIsoForUser(userEmail)) {
    return startAssistantTaskReview(userEmail, { reviewScope: "today" });
  }

  let index = session.index;
  while (index < session.taskIds.length) {
    const taskId = session.taskIds[index];
    const task = await prisma.todoTask.findFirst({
      where: {
        id: taskId,
        userEmail,
        ...(session.scope === "all" ? {} : {
          scheduledDate: session.scope === "backlog" ? null : session.date,
        }),
        source: { not: "habit" },
        missedAt: null,
        OR: [{ isDone: 0 }, { isDone: null }],
      },
      select: {
        id: true,
        title: true,
        estimatedMinutes: true,
        scheduledDate: true,
        scheduledTime: true,
      },
    });
    if (!task) {
      index += 1;
      continue;
    }
    if (index !== session.index) {
      await saveSession(userEmail, { ...session, index });
    }
    const [areaMap, areas] = await Promise.all([
      getTaskAreaMap(userEmail, [task.id]),
      getTaskAreas(userEmail),
    ]);
    return {
      scope: session.scope,
      date: session.date,
      current: {
        ...task,
        areaTag: areaMap.get(task.id) || null,
      },
      position: index + 1,
      total: session.taskIds.length,
      availableAreas: areas.map(({ key, label }) => ({ key, label })),
    };
  }

  await saveSession(userEmail, null);
  return null;
}

export async function advanceAssistantTaskReview(userEmail: string) {
  const session = await loadSession(userEmail);
  if (!session) return null;
  await saveSession(userEmail, { ...session, index: session.index + 1 });
  return getAssistantTaskReview(userEmail);
}

export function taskReviewPrompt(review: AssistantTaskReview | null) {
  if (!review) return "Revisão concluída. As tarefas desta seleção foram percorridas.";
  const minutes = review.current.estimatedMinutes
    ? `${review.current.estimatedMinutes} min`
    : "sem tempo";
  const area = review.current.areaTag || "sem tag";
  const selection = review.scope === "all" ? "Todas as pendentes"
    : review.scope === "backlog" ? "Sem data" : review.date;
  return `${selection} · Tarefa ${review.position}/${review.total}: “${review.current.title}” — ${minutes}, ${area}. O que ela envolve? Você também pode responder diretamente com o tempo e a tag. Diga “pular” para seguir sem alterar.`;
}

function appliedReviewTaskIds(rawActions: unknown) {
  if (!Array.isArray(rawActions)) return new Set<string>();
  const ids = new Set<string>();
  rawActions.forEach((rawAction) => {
    if (!rawAction || typeof rawAction !== "object") return;
    const action = rawAction as {
      type?: unknown;
      payload?: {
        taskId?: unknown;
        estimatedMinutes?: unknown;
        areaTag?: unknown;
        taskUpdates?: Array<{
          taskId?: unknown;
          estimatedMinutes?: unknown;
          areaTag?: unknown;
        }>;
      };
    };
    if (action.type === "update_task" && action.payload) {
      const changesReviewField =
        action.payload.estimatedMinutes !== undefined || action.payload.areaTag !== undefined;
      if (changesReviewField && typeof action.payload.taskId === "string") {
        ids.add(action.payload.taskId);
      }
    }
    if (action.type === "bulk_update_tasks" && Array.isArray(action.payload?.taskUpdates)) {
      action.payload.taskUpdates.forEach((update) => {
        const changesReviewField =
          update.estimatedMinutes !== undefined || update.areaTag !== undefined;
        if (changesReviewField && typeof update.taskId === "string") ids.add(update.taskId);
      });
    }
  });
  return ids;
}

function calibrationContextForTask(rawActions: unknown, taskId: string) {
  if (!Array.isArray(rawActions)) return null;
  for (const rawAction of rawActions) {
    if (!rawAction || typeof rawAction !== "object") continue;
    const action = rawAction as {
      type?: unknown;
      payload?: { taskId?: unknown; calibrationContext?: unknown };
    };
    if (
      action.type === "update_task" &&
      action.payload?.taskId === taskId &&
      typeof action.payload.calibrationContext === "string"
    ) {
      return action.payload.calibrationContext.trim().slice(0, 500) || null;
    }
  }
  return null;
}

export async function advanceTaskReviewForAppliedActions(
  userEmail: string,
  rawActions: unknown
) {
  const actionTypes = Array.isArray(rawActions)
    ? rawActions
        .map((action) =>
          action && typeof action === "object" && "type" in action
            ? String(action.type)
            : ""
        )
        .filter(Boolean)
    : [];
  if (actionTypes.includes("stop_task_review")) {
    return "Revisão de tarefas encerrada.";
  }
  if (actionTypes.includes("start_task_review") || actionTypes.includes("skip_task_review")) {
    return taskReviewPrompt(await getAssistantTaskReview(userEmail));
  }
  const review = await getAssistantTaskReview(userEmail);
  if (!review || !appliedReviewTaskIds(rawActions).has(review.current.id)) return null;
  await rememberTaskCalibration(
    userEmail,
    review.current.id,
    calibrationContextForTask(rawActions, review.current.id)
  );
  return taskReviewPrompt(await advanceAssistantTaskReview(userEmail));
}
