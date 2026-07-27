import { prisma } from "../db/prisma";
import {
  HABIT_DEFAULT_VALUES,
  HABIT_FIELD_NAMES,
  getHabitField,
  isHabitEntryDone,
  isHabitScheduledForWeekday,
  type HabitFieldName,
} from "../config/habits";
import type { SpiritualStreakBoardKey } from "../types";
import { getFixedHabitTaskTitles, syncHabitAgendaTasks } from "./habitTaskSync";
import { logServerEvent } from "./logger";
import { getEnabledSharedHabitsForUser } from "./onboarding";
import { addPointsOnce, POINTS } from "./rewards";
import {
  getCustomHabitDone,
  getCustomHabits,
  getFamilyWorshipDay,
  getMeetingDays,
  setCustomHabitDone,
} from "./settings";
import { updateSpiritualStreakEntry } from "./spiritualStreaks";

export const SHARED_HABIT_PATCH_KEYS = new Set([
  "bible_reading",
  "bible_study",
  "dissertation_work",
  "workout",
  "general_reading",
  "shower",
  "daily_text",
  "meeting_attended",
  "prepare_meeting",
  "family_worship",
  "writing",
  "scientific_writing",
  "prayer_on_waking",
]);

const HABIT_TO_STREAK_BOARD: Record<string, SpiritualStreakBoardKey> = {
  bible_reading: "bible_reading",
  bible_study: "bible_reading",
  daily_text: "daily_text",
  prayer_on_waking: "prayer_on_waking",
};

export function habitKeyToField(key: string) {
  return getHabitField(key);
}

function parseIsoDateUtc(iso: string): Date | null {
  const [year, month, day] = String(iso || "")
    .split("-")
    .map((value) => Number(value));
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getWeekdayUtc(iso: string): number {
  const date = parseIsoDateUtc(iso);
  if (!date) return -1;
  return date.getUTCDay();
}

function isHabitScheduledOnDate(
  habitKey: string,
  dateIso: string,
  meetingDays: number[],
  familyWorshipDay: number
): boolean {
  const weekday = getWeekdayUtc(dateIso);
  // Workout remains trackable on weekends, but for *streak* purposes it is
  // only required on weekdays (Mon-Fri). This avoids breaking streaks on Sat/Sun.
  if (habitKey === "workout" && (weekday === 0 || weekday === 6)) {
    return false;
  }
  return isHabitScheduledForWeekday(habitKey, weekday, meetingDays, familyWorshipDay);
}

export async function getDailyEntry(userEmail: string, dateIso: string) {
  const entry = await prisma.dailyEntryUser.findUnique({
    where: { userEmail_date: { userEmail, date: dateIso } },
  });
  if (entry) return entry;
  return prisma.dailyEntryUser.create({
    data: {
      userEmail,
      date: dateIso,
      ...HABIT_DEFAULT_VALUES,
      priorityDone: 0,
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function updateDailyEntry(
  userEmail: string,
  dateIso: string,
  payload: Record<string, unknown>
) {
  const nowIso = new Date().toISOString();
  const data: Record<string, unknown> = { updatedAt: nowIso };
  const metricMap: Record<string, string> = {
    sleep_hours: "sleepHours",
    anxiety_level: "anxietyLevel",
    work_hours: "workHours",
    boredom_minutes: "boredomMinutes",
    mood_category: "moodCategory",
    priority_label: "priorityLabel",
    priority_done: "priorityDone",
    mood_note: "moodNote",
    mood_media_url: "moodMediaUrl",
    mood_tags_json: "moodTagsJson",
  };
  Object.entries(payload).forEach(([key, value]) => {
    const field = getHabitField(key);
    if (field) {
      data[field] = value ? 1 : 0;
      return;
    }
    if (metricMap[key]) {
      data[metricMap[key]] = value;
    }
  });
  return prisma.dailyEntryUser.upsert({
    where: { userEmail_date: { userEmail, date: dateIso } },
    update: data,
    create: {
      userEmail,
      date: dateIso,
      ...HABIT_DEFAULT_VALUES,
      ...data,
    },
  });
}

export async function updateDailyEntryWithIntegrations(
  userEmail: string,
  dateIso: string,
  payload: Record<string, unknown>
) {
  const habitKeysBeingSetOn = Object.entries(payload)
    .filter(([key, value]) => SHARED_HABIT_PATCH_KEYS.has(key) && (value === 1 || value === true))
    .map(([key]) => key);
  const oldEntry = habitKeysBeingSetOn.length
    ? await getDailyEntry(userEmail, dateIso)
    : null;
  const entry = await updateDailyEntry(userEmail, dateIso, payload);

  if (oldEntry && habitKeysBeingSetOn.length) {
    await Promise.all(
      habitKeysBeingSetOn
        .filter((key) => {
          const field = getHabitField(key);
          return field && !oldEntry[field as keyof typeof oldEntry];
        })
        .map((key) =>
          addPointsOnce(
            userEmail,
            `habit::shared::${dateIso}::${key}`,
            POINTS.sharedHabit
          )
        )
    );
  }

  await Promise.all(
    Object.entries(payload)
      .filter(([key]) => key in HABIT_TO_STREAK_BOARD)
      .map(async ([key, value]) => {
        const truthy = value === 1 || value === true;
        const falsy = value === 0 || value === false;
        if (!truthy && !falsy) return;
        try {
          await updateSpiritualStreakEntry({
            userEmail,
            boardKey: HABIT_TO_STREAK_BOARD[key],
            monthKey: dateIso.slice(0, 7),
            date: dateIso,
            success: truthy ? true : null,
          });
        } catch (error) {
          logServerEvent("warn", {
            endpoint: "updateDailyEntryWithIntegrations",
            message: "Failed to mirror habit into spiritual streak board",
            error,
            meta: { habitKey: key, dateIso },
          });
        }
      })
  );

  await Promise.all(
    Object.entries(payload)
      .filter(([key]) => SHARED_HABIT_PATCH_KEYS.has(key))
      .map(async ([key, value]) => {
        const truthy = value === 1 || value === true;
        const falsy = value === 0 || value === false;
        if (!truthy && !falsy) return;
        const titles = getFixedHabitTaskTitles(key);
        if (!titles.length) return;
        try {
          await syncHabitAgendaTasks({
            userEmail,
            dateIso,
            titles,
            done: truthy,
          });
        } catch (error) {
          logServerEvent("warn", {
            endpoint: "updateDailyEntryWithIntegrations",
            message: "Failed to sync fixed habit agenda tasks",
            error,
            meta: { habitKey: key, dateIso },
          });
        }
      })
  );

  return entry;
}

export async function setCustomHabitStatusWithIntegrations(
  userEmail: string,
  dateIso: string,
  habitId: string,
  completed: boolean
) {
  const [habits, previous] = await Promise.all([
    getCustomHabits(userEmail),
    getCustomHabitDone(userEmail, dateIso),
  ]);
  const habit = habits.find((item) => item.id === habitId);
  if (!habit) throw new Error("RESOURCE_NOT_FOUND");

  const next = {
    ...previous,
    [habitId]: completed ? 1 : 0,
  };
  await setCustomHabitDone(userEmail, dateIso, next);

  if (completed && !previous[habitId]) {
    await addPointsOnce(
      userEmail,
      `habit::custom::${dateIso}::${habitId}`,
      POINTS.customHabit
    );
  }

  try {
    await syncHabitAgendaTasks({
      userEmail,
      dateIso,
      titles: [habit.name],
      done: completed,
    });
  } catch (error) {
    logServerEvent("warn", {
      endpoint: "setCustomHabitStatusWithIntegrations",
      message: "Failed to sync custom habit agenda tasks",
      error,
      meta: { habitId, dateIso },
    });
  }
}

export async function listEntries(userEmail: string, startIso: string, endIso: string) {
  return prisma.dailyEntryUser.findMany({
    where: {
      userEmail,
      date: {
        gte: startIso,
        lte: endIso,
      },
    },
    orderBy: { date: "asc" },
  });
}

export async function computeSharedHabitStreaks(
  userEmail: string,
  todayIso: string
) {
  const [meetingDaysRaw, familyWorshipDayRaw, sharedHabits] = await Promise.all([
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
    Number.isInteger(familyWorshipDayRaw) && familyWorshipDayRaw >= 0 && familyWorshipDayRaw <= 6
      ? familyWorshipDayRaw
      : 6;

  const todayDateUtc = parseIsoDateUtc(todayIso);
  if (!todayDateUtc) {
    return sharedHabits.reduce((acc, habit) => {
      acc[habit.key] = {
        streak: 0,
        todayDone: false,
        todayApplicable: false,
        maxStreak: 0,
      };
      return acc;
    }, {} as Record<string, { streak: number; todayDone: boolean; todayApplicable: boolean; maxStreak: number }>);
  }

  const firstEntry = await prisma.dailyEntryUser.findFirst({
    where: {
      userEmail,
      date: { lte: todayIso },
    },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  const earliestDateUtc = parseIsoDateUtc(firstEntry?.date || todayIso) || todayDateUtc;

  const allDaysAsc: string[] = [];
  const cursor = new Date(earliestDateUtc);
  while (cursor <= todayDateUtc) {
    allDaysAsc.push(formatIsoDateUtc(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const allDaysDesc = [...allDaysAsc].reverse();
  const earliestIso = allDaysAsc[0] || todayIso;

  const entries = await prisma.dailyEntryUser.findMany({
    where: {
      userEmail,
      date: { gte: earliestIso, lte: todayIso },
    },
    orderBy: { date: "asc" },
    select: {
      date: true,
      ...HABIT_FIELD_NAMES.reduce(
        (acc, field) => {
          acc[field] = true;
          return acc;
        },
        {} as Record<HabitFieldName, true>
      ),
      bibleStudy: true,
    },
  });
  const byDate = new Map<string, (typeof entries)[number]>(
    entries.map((entry) => [entry.date, entry])
  );
  const results: Record<
    string,
    { streak: number; todayDone: boolean; todayApplicable: boolean; maxStreak: number }
  > = {};

  sharedHabits.forEach((habit) => {
    const field = habitKeyToField(habit.key);
    if (!field) {
      results[habit.key] = {
        streak: 0,
        todayDone: false,
        todayApplicable: false,
        maxStreak: 0,
      };
      return;
    }

    const todayApplicable = isHabitScheduledOnDate(
      habit.key,
      todayIso,
      meetingDays,
      familyWorshipDay
    );
    const todayDone = todayApplicable
      ? isHabitEntryDone(byDate.get(todayIso) as Record<string, unknown> | undefined, habit.key)
      : false;

    let streak = 0;
    for (const dayIso of allDaysDesc) {
      const applicable = isHabitScheduledOnDate(
        habit.key,
        dayIso,
        meetingDays,
        familyWorshipDay
      );
      if (!applicable) continue;
      const done = isHabitEntryDone(byDate.get(dayIso) as Record<string, unknown> | undefined, habit.key);
      if (!done) break;
      streak += 1;
    }

    let maxStreak = 0;
    let running = 0;
    for (const dayIso of allDaysAsc) {
      const applicable = isHabitScheduledOnDate(
        habit.key,
        dayIso,
        meetingDays,
        familyWorshipDay
      );
      if (!applicable) continue;
      const done = isHabitEntryDone(byDate.get(dayIso) as Record<string, unknown> | undefined, habit.key);
      if (done) {
        running += 1;
        if (running > maxStreak) maxStreak = running;
      } else {
        running = 0;
      }
    }

    results[habit.key] = { streak, todayDone, todayApplicable, maxStreak };
  });

  return results;
}
