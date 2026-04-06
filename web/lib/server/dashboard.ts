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
  pendingTasksCount: number;
  completedTasksCount: number;
  nextTask: TodoTask | null;
  moodCategory: string | null;
};

export type TodayOverviewData = DashboardShellData & {
  todayTasks: TodoTask[];
  pendingTasks: TodoTask[];
  completedTasks: TodoTask[];
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

const getTodayBaseData = cache(async (userEmail: string) => {
  const todayIso = await getTodayIsoForUser(userEmail);
  const [todayTasks, timezone, quickNotesText, todayEntry] = await Promise.all([
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
    todayIso,
    timezone,
    todayTasks,
    pendingTasks,
    completedTasks,
    nextTask: selectNextTask(todayTasks),
    moodCategory: todayEntry?.moodCategory || null,
    moodNote: todayEntry?.moodNote || null,
    quickNotesText,
  };
});

export const getDashboardShellData = cache(
  async (userEmail: string): Promise<DashboardShellData> => {
    const todayBase = await getTodayBaseData(userEmail);
    const [header, streaks] = await Promise.all([
      buildHeaderSnapshot(userEmail, todayBase.todayIso),
      getSharedStreaks(userEmail, todayBase.todayIso),
    ]);

    return {
      userEmail,
      displayName: getDisplayName(userEmail),
      todayIso: todayBase.todayIso,
      timezone: todayBase.timezone,
      header,
      streaks,
      pendingTasksCount: todayBase.pendingTasks.length,
      completedTasksCount: todayBase.completedTasks.length,
      nextTask: todayBase.nextTask,
      moodCategory: todayBase.moodCategory,
    };
  }
);

export const getTodayOverviewData = cache(
  async (userEmail: string): Promise<TodayOverviewData> => {
    const [shell, todayBase] = await Promise.all([
      getDashboardShellData(userEmail),
      getTodayBaseData(userEmail),
    ]);

    return {
      ...shell,
      todayTasks: todayBase.todayTasks,
      pendingTasks: todayBase.pendingTasks,
      completedTasks: todayBase.completedTasks,
      moodNote: todayBase.moodNote,
      quickNotesText: todayBase.quickNotesText,
    };
  }
);
