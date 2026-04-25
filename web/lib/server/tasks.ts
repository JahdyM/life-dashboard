import { prisma } from "../db/prisma";
import { randomUUID } from "crypto";
import { format, parseISO, subDays } from "date-fns";
import { ensureTaskCompletionColumns } from "./dbCompat";
import { getTodayIsoForUser } from "./settings";
import type {
  TodoSubtask as PrismaTodoSubtask,
  TodoTask as PrismaTodoTask,
  TodoTaskDetail as PrismaTodoTaskDetail,
} from "@prisma/client";

export type TaskPayload = {
  title: string;
  source?: string;
  externalEventKey?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  plannedTime?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
  focusOrder?: number | null;
  priorityTag?: string | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  isDone?: number | null;
  completedAt?: string | null;
  googleCalendarId?: string | null;
  googleEventId?: string | null;
};

type TaskWithSubtasks = PrismaTodoTask & { subtasks?: PrismaTodoSubtask[] };

function normalizeTaskNotes(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const next = value.trim();
  return next ? next : null;
}

function normalizeTaskDetailRow(
  task: PrismaTodoTask,
  detail: PrismaTodoTaskDetail | null | undefined
) {
  const plannedTime =
    detail?.plannedTime ?? task.scheduledTime ?? null;
  return {
    plannedTime,
    startTime: detail?.startTime ?? null,
    endTime: detail?.endTime ?? null,
    notes: detail?.notes ?? null,
    focusOrder: detail?.focusOrder ?? null,
  };
}

function normalizeSubtasks(subtasks: PrismaTodoSubtask[] | undefined) {
  if (!subtasks?.length) return [];
  return [...subtasks]
    .sort((left, right) => {
      const leftOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return String(left.createdAt).localeCompare(String(right.createdAt));
    })
    .map((subtask, index) => ({
      ...subtask,
      order: subtask.sortOrder ?? index + 1,
    }));
}

function mergeTaskWithDetail(
  task: TaskWithSubtasks,
  detail: PrismaTodoTaskDetail | null | undefined
) {
  return {
    ...task,
    ...normalizeTaskDetailRow(task, detail),
    subtasks: normalizeSubtasks(task.subtasks),
  };
}

async function loadTaskDetailMap(userEmail: string, taskIds: string[]) {
  if (!taskIds.length) return new Map<string, PrismaTodoTaskDetail>();
  const rows = await prisma.todoTaskDetail.findMany({
    where: {
      userEmail,
      taskId: { in: taskIds },
    },
  });
  return new Map(rows.map((row) => [row.taskId, row]));
}

function shouldPersistTaskDetail(
  task: PrismaTodoTask,
  detail: {
    plannedTime: string | null;
    startTime: string | null;
    endTime: string | null;
    notes: string | null;
    focusOrder: number | null;
  }
) {
  const hasDifferentPlannedTime =
    detail.plannedTime !== null &&
    detail.plannedTime !== (task.scheduledTime || null);
  return Boolean(
    hasDifferentPlannedTime ||
      detail.startTime ||
      detail.endTime ||
      detail.notes ||
      detail.focusOrder !== null
  );
}

function compareTasksForFocus(left: ReturnType<typeof mergeTaskWithDetail>, right: ReturnType<typeof mergeTaskWithDetail>) {
  const leftDate = left.scheduledDate || "9999-12-31";
  const rightDate = right.scheduledDate || "9999-12-31";
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

  const leftFocus = left.focusOrder ?? Number.MAX_SAFE_INTEGER;
  const rightFocus = right.focusOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftFocus !== rightFocus) return leftFocus - rightFocus;

  const leftTime = left.scheduledTime || "99:99";
  const rightTime = right.scheduledTime || "99:99";
  if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);

  return String(left.createdAt).localeCompare(String(right.createdAt));
}

export async function listTasks(
  userEmail: string,
  startIso: string,
  endIso: string,
  includeUnscheduled = false
) {
  await ensureTaskCompletionColumns();
  const todayIso = await getTodayIsoForUser(userEmail);
  if (startIso <= todayIso && endIso >= todayIso) {
    await rollPendingTasksFromYesterday(userEmail, todayIso);
  }
  const whereClause = includeUnscheduled
    ? {
        userEmail,
        OR: [
          {
            scheduledDate: {
              gte: startIso,
              lte: endIso,
            },
          },
          { scheduledDate: null },
        ],
      }
    : {
        userEmail,
        scheduledDate: {
          gte: startIso,
          lte: endIso,
        },
      };
  const tasks = await prisma.todoTask.findMany({
    where: whereClause,
    orderBy: [
      { scheduledDate: "asc" },
      { scheduledTime: "asc" },
      { createdAt: "asc" },
    ],
    include: {
      subtasks: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  const detailMap = await loadTaskDetailMap(
    userEmail,
    tasks.map((task) => task.id)
  );
  return tasks
    .map((task) => mergeTaskWithDetail(task, detailMap.get(task.id)))
    .sort(compareTasksForFocus);
}

async function rollPendingTasksFromYesterday(userEmail: string, targetDateIso: string) {
  const previousDateIso = format(subDays(parseISO(`${targetDateIso}T12:00:00`), 1), "yyyy-MM-dd");
  const nowIso = new Date().toISOString();

  await prisma.todoTask.updateMany({
    where: {
      userEmail,
      source: { not: "habit" },
      scheduledDate: previousDateIso,
      OR: [{ isDone: 0 }, { isDone: null }],
    },
    data: {
      scheduledDate: targetDateIso,
      scheduledTime: null,
      updatedAt: nowIso,
    },
  });
}

export async function createTask(userEmail: string, payload: TaskPayload) {
  await ensureTaskCompletionColumns();
  const nowIso = new Date().toISOString();
  const normalizedNotes = normalizeTaskNotes(payload.notes) ?? null;
  const task = await prisma.todoTask.create({
    data: {
      id: randomUUID(),
      userEmail,
      title: payload.title.trim(),
      source: payload.source || "manual",
      externalEventKey: payload.externalEventKey || null,
      scheduledDate: payload.scheduledDate || null,
      scheduledTime: payload.scheduledTime || null,
      priorityTag: payload.priorityTag || "Medium",
      estimatedMinutes: payload.estimatedMinutes ?? null,
      actualMinutes: payload.actualMinutes ?? null,
      isDone: payload.isDone ?? 0,
      completedAt:
        payload.isDone && payload.isDone > 0
          ? payload.completedAt || nowIso
          : null,
      googleCalendarId: payload.googleCalendarId || null,
      googleEventId: payload.googleEventId || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  });
  const detail = {
    plannedTime: payload.plannedTime ?? payload.scheduledTime ?? null,
    startTime: payload.startTime ?? null,
    endTime: payload.endTime ?? null,
    notes: normalizedNotes,
    focusOrder: payload.focusOrder ?? null,
  };
  if (shouldPersistTaskDetail(task, detail)) {
    await prisma.todoTaskDetail.upsert({
      where: { taskId: task.id },
      create: {
        taskId: task.id,
        userEmail,
        plannedTime: detail.plannedTime,
        startTime: detail.startTime,
        endTime: detail.endTime,
        notes: detail.notes,
        focusOrder: detail.focusOrder,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      update: {
        plannedTime: detail.plannedTime,
        startTime: detail.startTime,
        endTime: detail.endTime,
        notes: detail.notes,
        focusOrder: detail.focusOrder,
        updatedAt: nowIso,
      },
    });
    return mergeTaskWithDetail(task, {
      taskId: task.id,
      userEmail,
      plannedTime: detail.plannedTime,
      startTime: detail.startTime,
      endTime: detail.endTime,
      notes: detail.notes,
      focusOrder: detail.focusOrder,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
  return mergeTaskWithDetail(task, null);
}

export async function updateTask(
  userEmail: string,
  taskId: string,
  payload: Partial<TaskPayload>
) {
  await ensureTaskCompletionColumns();
  const nowIso = new Date().toISOString();
  const existing = await prisma.todoTask.findFirst({
    where: { id: taskId, userEmail },
    select: { id: true, isDone: true },
  });
  if (!existing) {
    throw new Error("RESOURCE_NOT_FOUND");
  }

  let completedAtPatch: string | null | undefined = undefined;
  if (typeof payload.isDone === "number") {
    if (payload.isDone > 0 && !existing.isDone) {
      completedAtPatch = payload.completedAt || nowIso;
    } else if (payload.isDone === 0) {
      completedAtPatch = null;
    }
  } else if ("completedAt" in payload) {
    completedAtPatch = payload.completedAt ?? null;
  }

  const updateResult = await prisma.todoTask.updateMany({
    where: { id: taskId, userEmail },
    data: {
      title: payload.title?.trim(),
      source: payload.source,
      externalEventKey: payload.externalEventKey,
      scheduledDate: payload.scheduledDate,
      scheduledTime: payload.scheduledTime,
      priorityTag: payload.priorityTag,
      estimatedMinutes: payload.estimatedMinutes,
      actualMinutes: payload.actualMinutes,
      isDone: payload.isDone,
      completedAt: completedAtPatch,
      googleCalendarId: payload.googleCalendarId,
      googleEventId: payload.googleEventId,
      updatedAt: nowIso,
    },
  });
  if (!updateResult.count) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
  const detailPatchProvided =
    payload.plannedTime !== undefined ||
    payload.startTime !== undefined ||
    payload.endTime !== undefined ||
    payload.notes !== undefined ||
    payload.focusOrder !== undefined;

  const task = await prisma.todoTask.findFirst({
    where: { id: taskId, userEmail },
    include: { subtasks: true },
  });
  if (!task) {
    throw new Error("RESOURCE_NOT_FOUND");
  }

  let detail = await prisma.todoTaskDetail.findUnique({ where: { taskId } });

  if (detailPatchProvided) {
    const nextDetail = {
      plannedTime:
        payload.plannedTime !== undefined
          ? payload.plannedTime
          : detail?.plannedTime ?? task.scheduledTime ?? null,
      startTime:
        payload.startTime !== undefined
          ? payload.startTime
          : detail?.startTime ?? null,
      endTime:
        payload.endTime !== undefined ? payload.endTime : detail?.endTime ?? null,
      notes:
        payload.notes !== undefined
          ? normalizeTaskNotes(payload.notes) ?? null
          : detail?.notes ?? null,
      focusOrder:
        payload.focusOrder !== undefined
          ? payload.focusOrder
          : detail?.focusOrder ?? null,
    };

    if (shouldPersistTaskDetail(task, nextDetail)) {
      detail = await prisma.todoTaskDetail.upsert({
        where: { taskId },
        create: {
          taskId,
          userEmail,
          plannedTime: nextDetail.plannedTime,
          startTime: nextDetail.startTime,
          endTime: nextDetail.endTime,
          notes: nextDetail.notes,
          focusOrder: nextDetail.focusOrder,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        update: {
          plannedTime: nextDetail.plannedTime,
          startTime: nextDetail.startTime,
          endTime: nextDetail.endTime,
          notes: nextDetail.notes,
          focusOrder: nextDetail.focusOrder,
          updatedAt: nowIso,
        },
      });
    } else {
      await prisma.todoTaskDetail.deleteMany({
        where: { taskId, userEmail },
      });
      detail = null;
    }
  }

  return mergeTaskWithDetail(task, detail);
}

export async function deleteTask(userEmail: string, taskId: string) {
  await ensureTaskCompletionColumns();
  const ownedTask = await prisma.todoTask.findFirst({
    where: { id: taskId, userEmail },
    select: { id: true },
  });
  if (!ownedTask) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
  const nowIso = new Date().toISOString();
  // Some legacy databases enforce delete policies on unfinished tasks.
  // Mark as completed first so hard-delete remains reliable for all task states.
  await prisma.todoTask.update({
    where: { id: taskId },
    data: {
      isDone: 1,
      completedAt: nowIso,
      updatedAt: nowIso,
    },
  });
  await prisma.$transaction([
    prisma.todoTaskDetail.deleteMany({
      where: { taskId },
    }),
    prisma.todoSubtask.deleteMany({
      where: { taskId },
    }),
    prisma.todoTask.delete({
      where: { id: taskId },
    }),
  ]);
}

export async function createSubtask(
  userEmail: string,
  taskId: string,
  title: string,
  order?: number | null
) {
  await ensureTaskCompletionColumns();
  const [ownedTask, existingSubtasks] = await Promise.all([
    prisma.todoTask.findFirst({
      where: { id: taskId, userEmail },
      select: { id: true },
    }),
    prisma.todoSubtask.findMany({
      where: { taskId, userEmail },
      select: { sortOrder: true },
    }),
  ]);
  if (!ownedTask) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
  const maxSortOrder = existingSubtasks.reduce((max, row) => {
    const value = Number(row.sortOrder || 0);
    return value > max ? value : max;
  }, 0);
  const nextSortOrder = Math.max(1, Number(order || maxSortOrder + 1));
  const nowIso = new Date().toISOString();
  const subtask = await prisma.todoSubtask.create({
    data: {
      id: randomUUID(),
      taskId,
      userEmail,
      title: title.trim(),
      sortOrder: nextSortOrder,
      priorityTag: "Medium",
      isDone: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  });
  return {
    ...subtask,
    order: subtask.sortOrder ?? nextSortOrder,
  };
}

export async function updateSubtask(
  userEmail: string,
  subtaskId: string,
  data: Partial<{
    title: string;
    order: number | null;
    priorityTag: string;
    estimatedMinutes: number | null;
    actualMinutes: number | null;
    isDone: number | null;
    completedAt: string | null;
  }>
) {
  await ensureTaskCompletionColumns();
  const nowIso = new Date().toISOString();
  const existing = await prisma.todoSubtask.findFirst({
    where: { id: subtaskId, userEmail },
    select: { id: true, isDone: true, sortOrder: true },
  });
  if (!existing) {
    throw new Error("RESOURCE_NOT_FOUND");
  }

  let completedAtPatch: string | null | undefined = undefined;
  if (typeof data.isDone === "number") {
    if (data.isDone > 0 && !existing.isDone) {
      completedAtPatch = data.completedAt || nowIso;
    } else if (data.isDone === 0) {
      completedAtPatch = null;
    }
  } else if ("completedAt" in data) {
    completedAtPatch = data.completedAt ?? null;
  }

  const nextSortOrder =
    data.order !== undefined ? Math.max(1, Number(data.order || 1)) : undefined;

  const updateResult = await prisma.todoSubtask.updateMany({
    where: { id: subtaskId, userEmail },
    data: {
      title: data.title?.trim(),
      sortOrder: nextSortOrder,
      priorityTag: data.priorityTag,
      estimatedMinutes: data.estimatedMinutes,
      actualMinutes: data.actualMinutes,
      isDone: data.isDone,
      completedAt: completedAtPatch,
      updatedAt: nowIso,
    },
  });
  if (!updateResult.count) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
  const subtask = await prisma.todoSubtask.findFirst({
    where: { id: subtaskId, userEmail },
  });
  if (!subtask) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
  return {
    ...subtask,
    order: subtask.sortOrder ?? 1,
  };
}

export async function deleteSubtask(userEmail: string, subtaskId: string) {
  await ensureTaskCompletionColumns();
  const deleted = await prisma.todoSubtask.deleteMany({
    where: { id: subtaskId, userEmail },
  });
  if (!deleted.count) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
}
