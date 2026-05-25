import { getSetting, setSetting } from "./settings";

const TASK_SCHEDULE_LOCKS_KEY = "task_schedule_locks_v1";

function parseScheduleLocks(raw: string | null) {
  if (!raw) return {} as Record<string, boolean>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const clean: Record<string, boolean> = {};
    Object.entries(parsed).forEach(([taskId, value]) => {
      const key = String(taskId || "").trim();
      if (!key) return;
      clean[key] = Boolean(value);
    });
    return clean;
  } catch (_error) {
    return {};
  }
}

export async function getTaskScheduleLocks(userEmail: string) {
  const raw = await getSetting(userEmail, TASK_SCHEDULE_LOCKS_KEY);
  return parseScheduleLocks(raw);
}

export async function getTaskScheduleLockMap(userEmail: string, taskIds: string[]) {
  const locks = await getTaskScheduleLocks(userEmail);
  return new Map(taskIds.map((taskId) => [taskId, Boolean(locks[taskId])]));
}

export async function setTaskScheduleLock(
  userEmail: string,
  taskId: string,
  locked: boolean | null | undefined
) {
  const cleanTaskId = String(taskId || "").trim();
  if (!cleanTaskId) return;
  const locks = await getTaskScheduleLocks(userEmail);
  if (locked) {
    locks[cleanTaskId] = true;
  } else {
    delete locks[cleanTaskId];
  }
  await setSetting(userEmail, TASK_SCHEDULE_LOCKS_KEY, JSON.stringify(locks));
}

export async function deleteTaskScheduleLock(userEmail: string, taskId: string) {
  await setTaskScheduleLock(userEmail, taskId, false);
}
