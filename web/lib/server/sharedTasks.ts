import { randomUUID } from "crypto";
import { prisma } from "../db/prisma";
import { allowedEmails } from "../env";
import {
  addGoogleEventAttendee,
  createGoogleEvent,
  deleteGoogleEvent,
  removeGoogleEventAttendee,
} from "./googleCalendar";
import { DEFAULT_TIME_ZONE } from "../constants";
import { getUserTimeZone } from "./settings";
import { createTask } from "./tasks";
import { logServerEvent } from "./logger";

export type TaskShareInviteStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked";

export type TaskShareInvite = {
  id: string;
  sourceTaskId: string;
  title: string;
  fromEmail: string;
  toEmail: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  estimatedMinutes: number | null;
  priorityTag: string | null;
  status: TaskShareInviteStatus;
  createdAt: string;
  respondedAt: string | null;
  recipientTaskId: string | null;
};

function settingKeyForInvite(recipientEmail: string, inviteId: string) {
  return `${recipientEmail}::task_share_invite::${inviteId}`;
}

function parseInvitePayload(value: string | null): TaskShareInvite | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<TaskShareInvite>;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.id || !parsed.fromEmail || !parsed.toEmail || !parsed.title) return null;
    if (
      parsed.status !== "pending" &&
      parsed.status !== "accepted" &&
      parsed.status !== "declined" &&
      parsed.status !== "revoked"
    ) {
      return null;
    }
    return {
      id: String(parsed.id),
      sourceTaskId: String(parsed.sourceTaskId || ""),
      title: String(parsed.title),
      fromEmail: String(parsed.fromEmail).toLowerCase(),
      toEmail: String(parsed.toEmail).toLowerCase(),
      scheduledDate: parsed.scheduledDate || null,
      scheduledTime: parsed.scheduledTime || null,
      estimatedMinutes:
        typeof parsed.estimatedMinutes === "number" ? parsed.estimatedMinutes : null,
      priorityTag: parsed.priorityTag || null,
      status: parsed.status,
      createdAt: String(parsed.createdAt || new Date().toISOString()),
      respondedAt: parsed.respondedAt || null,
      recipientTaskId: parsed.recipientTaskId || null,
    };
  } catch (_error) {
    return null;
  }
}

function resolveRecipient(senderEmail: string, requestedRecipient?: string | null) {
  const sender = senderEmail.toLowerCase();
  const normalizedRequested = requestedRecipient?.trim().toLowerCase() || null;
  if (normalizedRequested) {
    if (normalizedRequested === sender) {
      throw new Error("Cannot share a task with yourself");
    }
    if (!allowedEmails.includes(normalizedRequested)) {
      throw new Error("Recipient is not allowed");
    }
    return normalizedRequested;
  }
  const partner = allowedEmails.find((email) => email !== sender) || null;
  if (!partner) {
    throw new Error("Partner not configured");
  }
  return partner;
}

async function loadInvite(recipientEmail: string, inviteId: string) {
  const key = settingKeyForInvite(recipientEmail, inviteId);
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return null;
  return parseInvitePayload(row.value);
}

async function loadInviteById(inviteId: string) {
  const rows = await prisma.setting.findMany({
    where: {
      key: { endsWith: `::task_share_invite::${inviteId}` },
    },
    take: 5,
  });
  for (const row of rows) {
    const invite = parseInvitePayload(row.value);
    if (!invite || invite.id !== inviteId) continue;
    const [recipientEmail] = row.key.split("::task_share_invite::");
    if (!recipientEmail) continue;
    return { invite, recipientEmail: recipientEmail.toLowerCase() };
  }
  return null;
}

async function saveInvite(recipientEmail: string, invite: TaskShareInvite) {
  const key = settingKeyForInvite(recipientEmail, invite.id);
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(invite) },
    update: { value: JSON.stringify(invite) },
  });
}

export async function createTaskShareInvite(
  senderEmail: string,
  taskId: string,
  requestedRecipient?: string | null
) {
  const fromEmail = senderEmail.toLowerCase();
  const toEmail = resolveRecipient(fromEmail, requestedRecipient);
  const task = await prisma.todoTask.findFirst({
    where: { id: taskId, userEmail: fromEmail },
    select: {
      id: true,
      title: true,
      scheduledDate: true,
      scheduledTime: true,
      estimatedMinutes: true,
      priorityTag: true,
    },
  });
  if (!task) {
    throw new Error("RESOURCE_NOT_FOUND");
  }

  const existingRows = await prisma.setting.findMany({
    where: { key: { startsWith: `${toEmail}::task_share_invite::` } },
  });
  const existingPending = existingRows
    .map((row) => parseInvitePayload(row.value))
    .find(
      (invite) =>
        invite &&
        (invite.status === "pending" || invite.status === "accepted") &&
        invite.sourceTaskId === task.id &&
        invite.fromEmail === fromEmail
    );
  if (existingPending) {
    return existingPending;
  }

  const invite: TaskShareInvite = {
    id: randomUUID(),
    sourceTaskId: task.id,
    title: task.title,
    fromEmail,
    toEmail,
    scheduledDate: task.scheduledDate || null,
    scheduledTime: task.scheduledTime || null,
    estimatedMinutes: task.estimatedMinutes ?? null,
    priorityTag: task.priorityTag || null,
    status: "pending",
    createdAt: new Date().toISOString(),
    respondedAt: null,
    recipientTaskId: null,
  };
  await saveInvite(toEmail, invite);
  return invite;
}

export async function listPendingTaskShareInvites(userEmail: string) {
  const normalized = userEmail.toLowerCase();
  const prefix = `${normalized}::task_share_invite::`;
  const rows = await prisma.setting.findMany({
    where: {
      key: { startsWith: prefix },
    },
  });
  const items = rows
    .map((row) => parseInvitePayload(row.value))
    .filter((item): item is TaskShareInvite => Boolean(item))
    .filter((item) => item.status === "pending")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items;
}

export async function listSentTaskShareInvites(userEmail: string) {
  const normalized = userEmail.toLowerCase();
  const rows = await prisma.setting.findMany({
    where: {
      key: { contains: "::task_share_invite::" },
    },
  });
  const items = rows
    .map((row) => parseInvitePayload(row.value))
    .filter((item): item is TaskShareInvite => Boolean(item))
    .filter((item) => item.fromEmail === normalized)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items;
}

export async function acceptTaskShareInvite(userEmail: string, inviteId: string) {
  const recipientEmail = userEmail.toLowerCase();
  const invite = await loadInvite(recipientEmail, inviteId);
  if (!invite) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
  if (invite.status !== "pending") {
    const existingTask = invite.recipientTaskId
      ? await prisma.todoTask.findFirst({
          where: { id: invite.recipientTaskId, userEmail: recipientEmail },
        })
      : null;
    return { invite, task: existingTask };
  }

  let googleEventId: string | null = null;
  if (invite.scheduledDate) {
    const timeZone = (await getUserTimeZone(recipientEmail)) || DEFAULT_TIME_ZONE;
    try {
      const created = await createGoogleEvent(recipientEmail, "primary", {
        title: invite.title,
        scheduledDate: invite.scheduledDate,
        scheduledTime: invite.scheduledTime,
        estimatedMinutes: invite.estimatedMinutes,
        timeZone,
      });
      googleEventId = created?.id || null;
    } catch (error) {
      logServerEvent("warn", {
        endpoint: "task-share.accept",
        message: "Could not mirror accepted shared task into Google Calendar",
        error,
        meta: { inviteId, recipientEmail },
      });
    }
  }

  const task = await createTask(recipientEmail, {
    title: invite.title,
    source: "shared",
    externalEventKey: `task-share:${invite.id}`,
    scheduledDate: invite.scheduledDate,
    scheduledTime: invite.scheduledTime,
    estimatedMinutes: invite.estimatedMinutes,
    priorityTag: invite.priorityTag || "Medium",
    isDone: 0,
    googleCalendarId: googleEventId ? "primary" : null,
    googleEventId,
  });

  const sourceTask = await prisma.todoTask.findFirst({
    where: { id: invite.sourceTaskId, userEmail: invite.fromEmail },
    select: {
      id: true,
      googleCalendarId: true,
      googleEventId: true,
    },
  });
  if (sourceTask?.googleEventId) {
    try {
      await addGoogleEventAttendee(
        invite.fromEmail,
        sourceTask.googleCalendarId || "primary",
        sourceTask.googleEventId,
        recipientEmail
      );
    } catch (error) {
      logServerEvent("warn", {
        endpoint: "task-share.accept",
        message: "Could not add recipient as attendee in source Google event",
        error,
        meta: {
          inviteId,
          sender: invite.fromEmail,
          recipient: recipientEmail,
          sourceTaskId: sourceTask.id,
          sourceGoogleEventId: sourceTask.googleEventId,
        },
      });
    }
  }

  const nextInvite: TaskShareInvite = {
    ...invite,
    status: "accepted",
    respondedAt: new Date().toISOString(),
    recipientTaskId: task.id,
  };
  await saveInvite(recipientEmail, nextInvite);
  return { invite: nextInvite, task };
}

export async function declineTaskShareInvite(userEmail: string, inviteId: string) {
  const recipientEmail = userEmail.toLowerCase();
  const invite = await loadInvite(recipientEmail, inviteId);
  if (!invite) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
  if (invite.status !== "pending") {
    return invite;
  }
  const nextInvite: TaskShareInvite = {
    ...invite,
    status: "declined",
    respondedAt: new Date().toISOString(),
  };
  await saveInvite(recipientEmail, nextInvite);
  return nextInvite;
}

export async function revokeTaskShareInvite(userEmail: string, inviteId: string) {
  const senderEmail = userEmail.toLowerCase();
  const loaded = await loadInviteById(inviteId);
  if (!loaded) {
    throw new Error("RESOURCE_NOT_FOUND");
  }
  const { invite, recipientEmail } = loaded;
  if (invite.fromEmail !== senderEmail) {
    throw new Error("FORBIDDEN");
  }
  if (invite.status === "revoked" || invite.status === "declined") {
    return invite;
  }

  if (invite.status === "accepted" && invite.recipientTaskId) {
    const sourceTask = await prisma.todoTask.findFirst({
      where: { id: invite.sourceTaskId, userEmail: invite.fromEmail },
      select: {
        id: true,
        googleCalendarId: true,
        googleEventId: true,
      },
    });
    if (sourceTask?.googleEventId) {
      try {
        await removeGoogleEventAttendee(
          invite.fromEmail,
          sourceTask.googleCalendarId || "primary",
          sourceTask.googleEventId,
          recipientEmail
        );
      } catch (error) {
        logServerEvent("warn", {
          endpoint: "task-share.revoke",
          message: "Could not remove recipient attendee from source Google event",
          error,
          meta: {
            inviteId,
            sender: invite.fromEmail,
            recipient: recipientEmail,
            sourceTaskId: sourceTask.id,
            sourceGoogleEventId: sourceTask.googleEventId,
          },
        });
      }
    }

    const recipientTask = await prisma.todoTask.findFirst({
      where: { id: invite.recipientTaskId, userEmail: recipientEmail },
      select: {
        id: true,
        googleCalendarId: true,
        googleEventId: true,
      },
    });
    if (recipientTask?.googleEventId) {
      try {
        await deleteGoogleEvent(
          recipientEmail,
          recipientTask.googleCalendarId || "primary",
          recipientTask.googleEventId
        );
      } catch (error) {
        logServerEvent("warn", {
          endpoint: "task-share.revoke",
          message: "Could not remove Google event for revoked shared task",
          error,
          meta: { inviteId, recipientEmail, taskId: recipientTask.id },
        });
      }
    }
    await prisma.$transaction([
      prisma.todoSubtask.deleteMany({
        where: { userEmail: recipientEmail, taskId: invite.recipientTaskId },
      }),
      prisma.todoTask.deleteMany({
        where: { id: invite.recipientTaskId, userEmail: recipientEmail },
      }),
    ]);
  }

  const nextInvite: TaskShareInvite = {
    ...invite,
    status: "revoked",
    respondedAt: new Date().toISOString(),
  };
  await saveInvite(recipientEmail, nextInvite);
  return nextInvite;
}
