import "server-only";

import { prisma } from "@/lib/db/prisma";
import { deleteGoogleEvent } from "./googleCalendar";
import { logServerEvent } from "./logger";
import { rememberDeletedGoogleTask } from "./taskTombstones";
import { deleteTask } from "./tasks";

export async function deleteTaskWithIntegrations(userEmail: string, taskId: string) {
  const task = await prisma.todoTask.findFirst({
    where: { id: taskId, userEmail },
  });
  if (!task) throw new Error("RESOURCE_NOT_FOUND");

  if (task.googleEventId && task.source !== "google_shared") {
    try {
      await deleteGoogleEvent(
        userEmail,
        task.googleCalendarId || "primary",
        task.googleEventId
      );
    } catch (error) {
      logServerEvent("warn", {
        endpoint: "deleteTaskWithIntegrations",
        userEmail,
        message: "Google event delete failed; task will still be removed locally",
        error,
        meta: { taskId, googleEventId: task.googleEventId },
      });
    }
  }

  await rememberDeletedGoogleTask(userEmail, task);
  await deleteTask(userEmail, taskId);
  return task;
}
