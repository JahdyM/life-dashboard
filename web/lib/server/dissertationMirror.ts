import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { DissertationFront, DissertationProject, DissertationStep } from "@/lib/dissertation";

const MIRROR_SOURCE = "dissertation";

function newTaskId() {
  return randomUUID().replace(/-/g, "");
}

function mirrorTitle(front: DissertationFront, step: DissertationStep) {
  return `${step.title} — ${front.title}`;
}

/**
 * Reconcile dissertation steps WHOSE dueDate is today with a mirrored
 * TodoTask (source = "dissertation", externalEventKey = step.id). Other
 * steps — undated, future-dated, past-dated — do NOT mirror; they live
 * exclusively on the dissertation page and stay out of the calendar list
 * to keep the calendar focused on what's actually planned for today.
 *
 * Idempotent: creates today's mirrors, updates changed ones, removes any
 * orphans (steps that lost today's date, were deleted, or were finished
 * on a different day).
 *
 * Failures are caught at the call site — mirror sync is a best-effort
 * enrichment, never a blocker for the main save.
 */
export async function reconcileDissertationMirrors(
  userEmail: string,
  project: DissertationProject
): Promise<void> {
  const existing = await prisma.todoTask.findMany({
    where: { userEmail, source: MIRROR_SOURCE },
    select: {
      id: true,
      externalEventKey: true,
      title: true,
      scheduledDate: true,
      isDone: true,
      completedAt: true,
    },
  });
  const existingByStepId = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    if (row.externalEventKey) existingByStepId.set(row.externalEventKey, row);
  }

  const seenStepIds = new Set<string>();
  const nowIso = new Date().toISOString();
  const todayIso = nowIso.slice(0, 10);

  for (const front of project.fronts) {
    for (const step of front.steps) {
      // Only mirror steps whose dueDate is today. Undated steps and steps
      // dated for any other day are intentionally left off the calendar.
      if (step.dueDate !== todayIso) continue;
      seenStepIds.add(step.id);

      const desiredTitle = mirrorTitle(front, step);
      const desiredIsDone = step.done ? 1 : 0;
      const desiredCompletedAt = step.done ? step.completedAt || nowIso : null;
      const desiredScheduledDate = step.dueDate;
      const current = existingByStepId.get(step.id);

      if (!current) {
        await prisma.todoTask.create({
          data: {
            id: newTaskId(),
            userEmail,
            title: desiredTitle,
            source: MIRROR_SOURCE,
            externalEventKey: step.id,
            scheduledDate: desiredScheduledDate,
            isDone: desiredIsDone,
            completedAt: desiredCompletedAt,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        });
        continue;
      }

      const needsUpdate =
        current.title !== desiredTitle ||
        current.scheduledDate !== desiredScheduledDate ||
        current.isDone !== desiredIsDone ||
        (desiredIsDone === 1 && !current.completedAt) ||
        (desiredIsDone === 0 && current.completedAt);

      if (needsUpdate) {
        await prisma.todoTask.update({
          where: { id: current.id },
          data: {
            title: desiredTitle,
            scheduledDate: desiredScheduledDate,
            isDone: desiredIsDone,
            completedAt: desiredCompletedAt,
            updatedAt: nowIso,
          },
        });
      }
    }
  }

  const orphanIds = existing
    .filter((row) => !row.externalEventKey || !seenStepIds.has(row.externalEventKey))
    .map((row) => row.id);
  if (orphanIds.length > 0) {
    await prisma.todoTask.deleteMany({ where: { id: { in: orphanIds } } });
  }
}

/**
 * Reverse sync — given a TodoTask id that may be a dissertation mirror,
 * reflect its done state back onto the underlying dissertation step.
 * No-op when the task isn't a mirror or the step can't be found.
 */
export async function syncDissertationStepFromMirrorTask(
  userEmail: string,
  taskId: string
): Promise<void> {
  const task = await prisma.todoTask.findUnique({
    where: { id: taskId },
    select: { source: true, externalEventKey: true, isDone: true, userEmail: true },
  });
  if (!task) return;
  if (task.userEmail !== userEmail) return;
  if (task.source !== MIRROR_SOURCE) return;
  const stepId = task.externalEventKey;
  if (!stepId) return;

  // Lazy import to avoid circular dependency between dissertation.ts and this module.
  const { loadDissertationProject, saveDissertationProject } = await import("./dissertation");
  const project = await loadDissertationProject(userEmail);

  let touched = false;
  const nowIso = new Date().toISOString();
  const next: DissertationProject = {
    ...project,
    fronts: project.fronts.map((front) => ({
      ...front,
      steps: front.steps.map((step) => {
        if (step.id !== stepId) return step;
        const desiredDone = (task.isDone ?? 0) > 0;
        if (step.done === desiredDone) return step;
        touched = true;
        return {
          ...step,
          done: desiredDone,
          completedAt: desiredDone ? step.completedAt || nowIso : null,
          updatedAt: nowIso,
        };
      }),
    })),
  };

  if (touched) {
    // Save WITHOUT triggering reconcile-loop — saveDissertationProject doesn't
    // call reconcile itself; reconcile only runs from applyDissertationAction
    // and load. The mirror has already been updated client-side via the API
    // route that called us, so no calendar update is needed here.
    await saveDissertationProject(userEmail, next);
  }
}
