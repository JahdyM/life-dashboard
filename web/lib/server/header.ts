import { prisma } from "../db/prisma";
import { FIXED_SHARED_HABITS, PERSONAL_HABIT_KEYS } from "../constants";
import { computeSharedHabitStreaks } from "./habits";

export async function buildHeaderSnapshot(userEmail: string, dateIso: string) {
  const entry = await prisma.dailyEntryUser.findUnique({
    where: { userEmail_date: { userEmail, date: dateIso } },
  });
  const habitKeys = [...FIXED_SHARED_HABITS, ...PERSONAL_HABIT_KEYS].map((h) => h.key);
  const counts = habitKeys.reduce(
    (acc, key) => {
      const fieldKey = key
        .split("_")
        .map((chunk, index) => (index === 0 ? chunk : chunk[0].toUpperCase() + chunk.slice(1)))
        .join("");
      const value = entry ? (entry as any)[fieldKey] : 0;
      if (value) acc.completed += 1;
      acc.total += 1;
      return acc;
    },
    { completed: 0, total: 0 }
  );
  const percent = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  const streaks = await computeSharedHabitStreaks(userEmail, dateIso);
  return {
    date: dateIso,
    habits_completed: counts.completed,
    habits_total: counts.total,
    habits_percent: percent,
    shared_streaks: streaks,
  };
}
