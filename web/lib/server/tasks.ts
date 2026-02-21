import { prisma } from "../db/prisma";
import { randomUUID } from "crypto";

export type TaskPayload = {
  title: string;
  source?: string;
  externalEventKey?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  priorityTag?: string | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  isDone?: number | null;
  googleCalendarId?: string | null;
  googleEventId?: string | null;
};

export async function listTasks(
  userEmail: string,
  startIso: string,
  endIso: string,
  includeUnscheduled = false
) {
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
  });
  if (tasks.length === 0) {
    return [] as Array<any>;
  }
  const ids = tasks.map((task) => task.id);
  const subtasks = await prisma.todoSubtask.findMany({
    where: {
      userEmail,
      taskId: { in: ids },
    },
    orderBy: { createdAt: "asc" },
  });
  const grouped: Record<string, typeof subtasks> = {};
  subtasks.forEach((subtask) => {
    grouped[subtask.taskId] = grouped[subtask.taskId] || [];
    grouped[subtask.taskId].push(subtask);
  });
  return tasks.map((task) => ({
    ...task,
    subtasks: grouped[task.id] || [],
  }));
}

export async function createTask(userEmail: string, payload: TaskPayload) {
  const nowIso = new Date().toISOString();
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
      googleCalendarId: payload.googleCalendarId || null,
      googleEventId: payload.googleEventId || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  });
  return task;
}

export async function updateTask(
  userEmail: string,
  taskId: string,
  payload: Partial<TaskPayload>
) {
  const nowIso = new Date().toISOString();
  const task = await prisma.todoTask.update({
    where: { id: taskId },
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
      googleCalendarId: payload.googleCalendarId,
      googleEventId: payload.googleEventId,
      updatedAt: nowIso,
    },
  });
  return task;
}

export async function deleteTask(userEmail: string, taskId: string) {
  await prisma.todoSubtask.deleteMany({
    where: { userEmail, taskId },
  });
  await prisma.todoTask.delete({
    where: { id: taskId },
  });
}

export async function createSubtask(
  userEmail: string,
  taskId: string,
  title: string
) {
  const nowIso = new Date().toISOString();
  return prisma.todoSubtask.create({
    data: {
      id: randomUUID(),
      taskId,
      userEmail,
      title: title.trim(),
      priorityTag: "Medium",
      isDone: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  });
}

export async function updateSubtask(
  userEmail: string,
  subtaskId: string,
  data: Partial<{ title: string; priorityTag: string; estimatedMinutes: number | null; actualMinutes: number | null; isDone: number | null }>
) {
  const nowIso = new Date().toISOString();
  return prisma.todoSubtask.update({
    where: { id: subtaskId },
    data: {
      title: data.title?.trim(),
      priorityTag: data.priorityTag,
      estimatedMinutes: data.estimatedMinutes,
      actualMinutes: data.actualMinutes,
      isDone: data.isDone,
      updatedAt: nowIso,
    },
  });
}

export async function deleteSubtask(userEmail: string, subtaskId: string) {
  await prisma.todoSubtask.delete({
    where: { id: subtaskId },
  });
}
