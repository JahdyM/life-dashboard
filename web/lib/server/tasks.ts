import { prisma } from "../db/prisma";
import { randomUUID } from "crypto";
import { format, parseISO, subDays } from "date-fns";
import { ensureTaskCompletionColumns } from "./dbCompat";
import { getTodayIsoForUser } from "./settings";
import { deleteTaskAreaAssignment, getTaskAreaMap, setTaskAreaAssignment } from "./taskAreas";
import {
  deleteTaskScheduleLock,
  getTaskScheduleLockMap,
  setTaskScheduleLock,
} from "./taskScheduleLocks";
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
  areaTag?: string | null;
  scheduleLocked?: boolean | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  isDone?: number | null;
  completedAt?: string | null;
  missedAt?: string | null;
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
  detail: PrismaTodoTaskDetail | null | undefined,
  areaTag: string | null = null,
  scheduleLocked = false
) {
  return {
    ...task,
    ...normalizeTaskDetailRow(task, detail),
    areaTag,
    scheduleLocked,
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

async function cleanupTaskShareSettingsAfterDelete(userEmail: string, taskId: string) {
  const normalizedUser = userEmail.toLowerCase();
  const rows = await prisma.setting.findMany({
    where: {
      key: { contains: "::task_share_invite::" },
    },
  });

  const updates = rows.flatMap((row) => {
    if (!row.value) return [];
    try {
      const invite = JSON.parse(row.value) as {
        sourceTaskId?: string;
        recipientTaskId?: string | null;
        fromEmail?: string;
        toEmail?: string;
        status?: string;
        respondedAt?: string | null;
      };
      const ownsSource =
        invite.sourceTaskId === taskId &&
        String(invite.fromEmail || "").toLowerCase() === normalizedUser;
      const ownsRecipient =
        invite.recipientTaskId === taskId &&
        String(invite.toEmail || "").toLowerCase() === normalizedUser;
      if (!ownsSource && !ownsRecipient) return [];
      if (invite.status === "revoked" || invite.status === "declined") return [];

      return [
        prisma.setting.update({
          where: { key: row.key },
          data: {
            value: JSON.stringify({
              ...invite,
              status: "revoked",
              respondedAt: new Date().toISOString(),
            }),
          },
        }),
      ];
    } catch (_error) {
      return [];
    }
  });

  if (updates.length) {
    await prisma.$transaction(updates);
  }
}

export async function listTasks(
  userEmail: string,
  startIso: string,
  endIso: string,
  includeUnscheduled = false,
  includeMissed = false
) {
  await ensureTaskCompletionColumns();
  const todayIso = await getTodayIsoForUser(userEmail);
  if (startIso <= todayIso && endIso >= todayIso) {
    await rollPendingTasksFromYesterday(userEmail, todayIso);
  }
  const dateClause = includeUnscheduled
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
  // Tasks the user explicitly marked as "não feita" leave the main calendar
  // listings — they're closed-out, no longer pending, and not done either.
  // Pass includeMissed=true (e.g. from a future "missed" tab) to recover them.
  const whereClause = includeMissed
    ? dateClause
    : { ...dateClause, missedAt: null };
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
  const taskIds = tasks.map((task) => task.id);
  const [detailMap, areaMap, lockMap] = await Promise.all([
    loadTaskDetailMap(userEmail, taskIds),
    getTaskAreaMap(userEmail, taskIds),
    getTaskScheduleLockMap(userEmail, taskIds),
  ]);
  return tasks
    .map((task) =>
      mergeTaskWithDetail(
        task,
        detailMap.get(task.id),
        areaMap.get(task.id) ?? null,
        Boolean(lockMap.get(task.id))
      )
    )
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
  if (payload.areaTag !== undefined) {
    await setTaskAreaAssignment(userEmail, task.id, payload.areaTag);
  }
  if (payload.scheduleLocked !== undefined) {
    await setTaskScheduleLock(userEmail, task.id, Boolean(payload.scheduleLocked));
  }

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
    return mergeTaskWithDetail(
      task,
      {
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
      payload.areaTag ?? null,
      Boolean(payload.scheduleLocked)
    );
  }
  return mergeTaskWithDetail(
    task,
    null,
    payload.areaTag ?? null,
    Boolean(payload.scheduleLocked)
  );
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
    select: { id: true, isDone: true, missedAt: true },
  });
  if (!existing) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
  if (payload.areaTag !== undefined) {
    await setTaskAreaAssignment(userEmail, taskId, payload.areaTag);
  }
  if (payload.scheduleLocked !== undefined) {
    await setTaskScheduleLock(userEmail, taskId, Boolean(payload.scheduleLocked));
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

  // Done <-> missed mutual exclusion. Marking a task done clears any prior
  // "missed" flag, and explicitly missing a task clears any prior completion
  // — mirroring how the user thinks about these states.
  let missedAtPatch: string | null | undefined = undefined;
  let isDoneOverride: number | null | undefined = payload.isDone;
  if ("missedAt" in payload) {
    missedAtPatch = payload.missedAt ?? null;
    if (missedAtPatch) {
      // Tagged as missed: clear done state.
      isDoneOverride = 0;
      completedAtPatch = null;
    }
  }
  if (typeof payload.isDone === "number" && payload.isDone > 0) {
    // Marking done: clear any missed flag.
    missedAtPatch = null;
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
      isDone: isDoneOverride,
      completedAt: completedAtPatch,
      missedAt: missedAtPatch,
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

  const [areaMap, lockMap] = await Promise.all([
    getTaskAreaMap(userEmail, [taskId]),
    getTaskScheduleLockMap(userEmail, [taskId]),
  ]);
  return mergeTaskWithDetail(
    task,
    detail,
    areaMap.get(taskId) ?? null,
    Boolean(lockMap.get(taskId))
  );
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
  await cleanupTaskShareSettingsAfterDelete(userEmail, taskId);
  await deleteTaskAreaAssignment(userEmail, taskId).catch(() => undefined);
  await deleteTaskScheduleLock(userEmail, taskId).catch(() => undefined);
  await prisma.syncOutbox
    .deleteMany({
      where: { userEmail, entityId: taskId },
    })
    .catch(() => undefined);
  // Some legacy databases enforce delete policies on unfinished tasks.
  // Mark as completed first so hard-delete remains reliable for all task states.
  await prisma.todoTask.updateMany({
    where: { id: taskId, userEmail },
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
    prisma.todoTask.deleteMany({
      where: { id: taskId, userEmail },
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
