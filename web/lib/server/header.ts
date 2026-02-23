import { prisma } from "../db/prisma";
import { FIXED_SHARED_HABITS } from "../constants";
import { computeSharedHabitStreaks, habitKeyToField } from "./habits";
import {
  getCustomHabitDone,
  getCustomHabits,
  getFamilyWorshipDay,
  getMeetingDays,
} from "./settings";

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
  if (weekday < 0) return false;
  if (habitKey === "meeting_attended" || habitKey === "prepare_meeting") {
    return meetingDays.includes(weekday);
  }
  if (habitKey === "family_worship") {
    return weekday === familyWorshipDay;
  }
  return true;
}

export async function buildHeaderSnapshot(userEmail: string, dateIso: string) {
  const [
    entry,
    customHabits,
    customDone,
    meetingDaysRaw,
    familyWorshipDayRaw,
    streaks,
  ] = await Promise.all([
    prisma.dailyEntryUser.findUnique({
      where: { userEmail_date: { userEmail, date: dateIso } },
    }),
    getCustomHabits(userEmail),
    getCustomHabitDone(userEmail, dateIso),
    getMeetingDays(userEmail),
    getFamilyWorshipDay(userEmail),
    computeSharedHabitStreaks(userEmail, dateIso),
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

  const activeFixedHabits = FIXED_SHARED_HABITS.filter((habit) =>
    isFixedHabitActiveOnDay(habit.key, dateIso, meetingDays, familyWorshipDay)
  );
  const activeCustomHabits = customHabits.filter((habit) => habit.active !== false);

  const entryRecord = (entry || null) as Record<string, unknown> | null;
  const fixedCompleted = activeFixedHabits.reduce((sum, habit) => {
    const field = habitKeyToField(habit.key);
    if (!field) return sum;
    return sum + (entryRecord?.[field] ? 1 : 0);
  }, 0);
  const customCompleted = activeCustomHabits.reduce(
    (sum, habit) => sum + (customDone[habit.id] ? 1 : 0),
    0
  );
  const counts = {
    completed: fixedCompleted + customCompleted,
    total: activeFixedHabits.length + activeCustomHabits.length,
  };
  const percent = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  return {
    date: dateIso,
    habits_completed: counts.completed,
    habits_total: counts.total,
    habits_percent: percent,
    shared_streaks: streaks,
  };
}
