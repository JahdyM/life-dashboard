import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { buildHeaderSnapshot } from "./header";
import { getSharedStreaks } from "./couple";
import { getQuickNotesText, getTodayIsoForUser, getUserTimeZone } from "./settings";
import { listTasks } from "./tasks";
import type { StreakData, TodoTask } from "@/lib/types";

export type DashboardShellData = {
  userEmail: string;
  displayName: string;
  todayIso: string;
  timezone: string | null;
  header: {
    date: string;
    habits_completed: number;
    habits_total: number;
    habits_percent: number;
  };
  streaks: StreakData;
  todayTasks: TodoTask[];
  pendingTasks: TodoTask[];
  completedTasks: TodoTask[];
  nextTask: TodoTask | null;
  moodCategory: string | null;
  moodNote: string | null;
  quickNotesText: string;
};

function getDisplayName(userEmail: string) {
  return userEmail.split("@")[0];
}

function selectNextTask(tasks: TodoTask[]) {
  const pending = tasks.filter((task) => !task.isDone);
  const scheduled = pending.find((task) => task.scheduledTime);
  return scheduled || pending[0] || null;
}

export const getDashboardShellData = cache(
  async (userEmail: string): Promise<DashboardShellData> => {
    const todayIso = await getTodayIsoForUser(userEmail);
    const [header, streaks, todayTasks, timezone, quickNotesText, todayEntry] =
      await Promise.all([
        buildHeaderSnapshot(userEmail, todayIso),
        getSharedStreaks(userEmail, todayIso),
        listTasks(userEmail, todayIso, todayIso),
        getUserTimeZone(userEmail),
        getQuickNotesText(userEmail, todayIso),
        prisma.dailyEntryUser.findUnique({
          where: { userEmail_date: { userEmail, date: todayIso } },
          select: {
            moodCategory: true,
            moodNote: true,
          },
        }),
      ]);

    const pendingTasks = todayTasks.filter((task) => !task.isDone);
    const completedTasks = todayTasks.filter((task) => Boolean(task.isDone));

    return {
      userEmail,
      displayName: getDisplayName(userEmail),
      todayIso,
      timezone,
      header,
      streaks,
      todayTasks,
      pendingTasks,
      completedTasks,
      nextTask: selectNextTask(todayTasks),
      moodCategory: todayEntry?.moodCategory || null,
      moodNote: todayEntry?.moodNote || null,
      quickNotesText,
    };
  }
);
