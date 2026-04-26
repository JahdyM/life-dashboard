import { prisma } from "../db/prisma";
import { isHabitScheduledForWeekday } from "../config/habits";
import { habitKeyToField } from "./habits";
import { getEnabledSharedHabitsForUser } from "./onboarding";
import {
  getCustomHabitDone,
  getCustomHabits,
  getFamilyWorshipDay,
  getMeetingDays,
} from "./settings";

export type CompletedHabitItem = {
  id: string;
  title: string;
  meta: string | null;
  kind: "habit";
};

type HeaderSnapshot = {
  date: string;
  habits_completed: number;
  habits_total: number;
  habits_percent: number;
};

function parseIsoDateUtc(iso: string): Date | null {
  const [year, month, day] = String(iso || "")
    .split("-")
    .map((value) => Number(value));
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getWeekdayUtc(iso: string): number {
  const date = parseIsoDateUtc(iso);
  if (!date) return -1;
  return date.getUTCDay();
}

function isFixedHabitActiveOnDay(
  habitKey: string,
  dateIso: string,
  meetingDays: number[],
  familyWorshipDay: number
) {
  const weekday = getWeekdayUtc(dateIso);
  return isHabitScheduledForWeekday(habitKey, weekday, meetingDays, familyWorshipDay);
}

export async function buildTodayHabitSnapshot(userEmail: string, dateIso: string): Promise<{
  header: HeaderSnapshot;
  completedHabits: CompletedHabitItem[];
}> {
  const [
    entry,
    customHabits,
    customDone,
    meetingDaysRaw,
    familyWorshipDayRaw,
    sharedHabits,
  ] = await Promise.all([
    prisma.dailyEntryUser.findUnique({
      where: { userEmail_date: { userEmail, date: dateIso } },
    }),
    getCustomHabits(userEmail),
    getCustomHabitDone(userEmail, dateIso),
    getMeetingDays(userEmail),
    getFamilyWorshipDay(userEmail),
    getEnabledSharedHabitsForUser(userEmail),
  ]);

  const meetingDays = Array.from(
    new Set(
      meetingDaysRaw
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  );
  const familyWorshipDay =
    Number.isInteger(familyWorshipDayRaw) &&
    familyWorshipDayRaw >= 0 &&
    familyWorshipDayRaw <= 6
      ? familyWorshipDayRaw
      : 6;

  const activeFixedHabits = sharedHabits.filter((habit) =>
    isFixedHabitActiveOnDay(habit.key, dateIso, meetingDays, familyWorshipDay)
  );
  const activeCustomHabits = customHabits.filter((habit) => habit.active !== false);

  const entryRecord = (entry || null) as Record<string, unknown> | null;
  const completedHabits: CompletedHabitItem[] = [];
  const fixedCompleted = activeFixedHabits.reduce((sum, habit) => {
    const field = habitKeyToField(habit.key);
    if (!field) return sum;
    if (!entryRecord?.[field]) return sum;
    completedHabits.push({
      id: `fixed-${habit.key}`,
      title: habit.label,
      meta: "Habit",
      kind: "habit",
    });
    return sum + 1;
  }, 0);
  const customCompleted = activeCustomHabits.reduce(
    (sum, habit) => {
      if (!customDone[habit.id]) return sum;
      completedHabits.push({
        id: `custom-${habit.id}`,
        title: habit.name,
        meta: "Habit",
        kind: "habit",
      });
      return sum + 1;
    },
    0
  );
  const counts = {
    completed: fixedCompleted + customCompleted,
    total: activeFixedHabits.length + activeCustomHabits.length,
  };
  const percent = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  return {
    header: {
      date: dateIso,
      habits_completed: counts.completed,
      habits_total: counts.total,
      habits_percent: percent,
    },
    completedHabits,
  };
}

export async function buildHeaderSnapshot(userEmail: string, dateIso: string) {
  const snapshot = await buildTodayHabitSnapshot(userEmail, dateIso);
  return snapshot.header;
}
