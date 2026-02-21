import { prisma } from "../db/prisma";
import { FIXED_SHARED_HABITS } from "../constants";

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
      return;
    }
    data[key] = value;
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
  const entries = await prisma.dailyEntryUser.findMany({
    where: {
      userEmail,
      date: { lte: todayIso },
    },
    orderBy: { date: "desc" },
    take: 370,
  });
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const results: Record<string, { streak: number; todayDone: boolean }> = {};

  FIXED_SHARED_HABITS.forEach((habit) => {
    const field = habitKeyToField(habit.key);
    if (!field) {
      results[habit.key] = { streak: 0, todayDone: false };
      return;
    }
    let streak = 0;
    const todayEntry = byDate.get(todayIso);
    const todayDone = Boolean(todayEntry && (todayEntry as any)[field]);
    if (todayDone) {
      streak = 1;
      for (let i = 1; i < entries.length; i += 1) {
        const entry = entries[i];
        if (!entry) break;
        if (entry.date >= todayIso) continue;
        const done = Boolean((entry as any)[field]);
        if (!done) break;
        streak += 1;
      }
    } else {
      for (const entry of entries) {
        if (entry.date >= todayIso) continue;
        const done = Boolean((entry as any)[field]);
        if (!done) break;
        streak += 1;
      }
    }
    results[habit.key] = { streak, todayDone };
  });

  return results;
}
