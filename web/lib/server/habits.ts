import { prisma } from "../db/prisma";
import { FIXED_SHARED_HABITS } from "../constants";
import { getFamilyWorshipDay, getMeetingDays } from "./settings";

const habitFieldMap: Record<string, keyof typeof habitFieldAccess> = {
  bible_reading: "bibleReading",
  bible_study: "bibleStudy",
  dissertation_work: "dissertationWork",
  workout: "workout",
  general_reading: "generalReading",
  shower: "shower",
  daily_text: "dailyText",
  meeting_attended: "meetingAttended",
  prepare_meeting: "prepareMeeting",
  family_worship: "familyWorship",
  writing: "writing",
  scientific_writing: "scientificWriting",
};

const habitFieldAccess = {
  bibleReading: 0,
  bibleStudy: 0,
  dissertationWork: 0,
  workout: 0,
  generalReading: 0,
  shower: 0,
  dailyText: 0,
  meetingAttended: 0,
  prepareMeeting: 0,
  familyWorship: 0,
  writing: 0,
  scientificWriting: 0,
};

export function habitKeyToField(key: string) {
  return habitFieldMap[key];
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
  if (weekday < 0) return false;
  if (habitKey === "meeting_attended" || habitKey === "prepare_meeting") {
    return meetingDays.includes(weekday);
  }
  if (habitKey === "family_worship") {
    return weekday === familyWorshipDay;
  }
  return true;
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
      bibleReading: 0,
      bibleStudy: 0,
      dissertationWork: 0,
      workout: 0,
      generalReading: 0,
      shower: 0,
      dailyText: 0,
      meetingAttended: 0,
      prepareMeeting: 0,
      familyWorship: 0,
      writing: 0,
      scientificWriting: 0,
      priorityDone: 0,
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function updateDailyEntry(
  userEmail: string,
  dateIso: string,
  payload: Record<string, any>
) {
  const nowIso = new Date().toISOString();
  const data: Record<string, any> = { updatedAt: nowIso };
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
    if (key in habitFieldMap) {
      const field = habitFieldMap[key];
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
      ...data,
    },
  });
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
  const [meetingDaysRaw, familyWorshipDayRaw] = await Promise.all([
    getMeetingDays(userEmail),
    getFamilyWorshipDay(userEmail),
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
    return FIXED_SHARED_HABITS.reduce((acc, habit) => {
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
      bibleReading: true,
      workout: true,
      shower: true,
      dailyText: true,
      meetingAttended: true,
      prepareMeeting: true,
      familyWorship: true,
    },
  });
  const byDate = new Map(entries.map((entry) => [entry.date, entry as any]));
  const results: Record<
    string,
    { streak: number; todayDone: boolean; todayApplicable: boolean; maxStreak: number }
  > = {};

  FIXED_SHARED_HABITS.forEach((habit) => {
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
      ? Boolean(byDate.get(todayIso)?.[field])
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
      const done = Boolean(byDate.get(dayIso)?.[field]);
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
      const done = Boolean(byDate.get(dayIso)?.[field]);
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
