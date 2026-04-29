import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { buildTodayHabitSnapshot } from "./header";
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
  completedItems: Array<{
    id: string;
    title: string;
    meta: string | null;
    kind: "task" | "habit";
    scheduledTime?: string | null;
  }>;
  sleepHours: number | null;
  moodNote: string | null;
  quickNotesText: string;
};

function getDisplayName(userEmail: string) {
  return userEmail.split("@")[0];
}

function selectNextTask(tasks: TodoTask[]) {
  const pending = tasks
    .filter((task) => !task.isDone)
    .sort((left, right) => {
      const leftFocus = Number(left.focusOrder || Number.MAX_SAFE_INTEGER);
      const rightFocus = Number(right.focusOrder || Number.MAX_SAFE_INTEGER);
      if (leftFocus !== rightFocus) return leftFocus - rightFocus;
      const leftTime = left.scheduledTime || "99:99";
      const rightTime = right.scheduledTime || "99:99";
      if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
      return String(left.createdAt).localeCompare(String(right.createdAt));
    });
  const scheduled = pending.find((task) => task.scheduledTime);
  return pending.find((task) => task.focusOrder) || scheduled || pending[0] || null;
}

const getTodayBaseData = cache(async (userEmail: string) => {
  const todayIso = await getTodayIsoForUser(userEmail);
  const [todayTasks, timezone, quickNotesText, todayEntry, habitSnapshot] = await Promise.all([
    listTasks(userEmail, todayIso, todayIso),
    getUserTimeZone(userEmail),
    getQuickNotesText(userEmail, todayIso),
    prisma.dailyEntryUser.findUnique({
      where: { userEmail_date: { userEmail, date: todayIso } },
      select: {
        moodCategory: true,
        moodNote: true,
        sleepHours: true,
      },
    }),
    buildTodayHabitSnapshot(userEmail, todayIso),
  ]);

  const pendingTasks = todayTasks.filter((task) => !task.isDone);
  const completedTaskRows = todayTasks.filter((task) => Boolean(task.isDone));
  const completedTasks = completedTaskRows.filter((task) => task.source !== "habit");
  const completedItems = [
    ...completedTasks.map((task) => ({
      id: task.id,
      title: task.title,
      meta: task.actualMinutes ? `${task.actualMinutes} min` : task.scheduledTime || "Task",
      kind: "task" as const,
      scheduledTime: task.scheduledTime || null,
    })),
    ...habitSnapshot.completedHabits.map((habit) => ({
      ...habit,
      scheduledTime: null,
    })),
  ];

  return {
    todayIso,
    timezone,
    todayTasks,
    pendingTasks,
    completedTasks,
    completedItems,
    header: habitSnapshot.header,
    nextTask: selectNextTask(todayTasks),
    moodCategory: todayEntry?.moodCategory || null,
    moodNote: todayEntry?.moodNote || null,
    sleepHours: todayEntry?.sleepHours ?? null,
    quickNotesText,
  };
});

export const getDashboardShellData = cache(
  async (userEmail: string): Promise<DashboardShellData> => {
    const todayBase = await getTodayBaseData(userEmail);
    const streaks = await getSharedStreaks(userEmail, todayBase.todayIso);

    return {
      userEmail,
      displayName: getDisplayName(userEmail),
      todayIso: todayBase.todayIso,
      timezone: todayBase.timezone,
      header: todayBase.header,
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
      completedItems: todayBase.completedItems,
      sleepHours: todayBase.sleepHours,
      moodNote: todayBase.moodNote,
      quickNotesText: todayBase.quickNotesText,
    };
  }
);
