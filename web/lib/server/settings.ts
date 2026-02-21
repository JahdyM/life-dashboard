import { prisma } from "../db/prisma";

export async function getSetting(userEmail: string, key: string, scoped = true) {
  const settingKey = scoped ? `${userEmail}::${key}` : key;
  const row = await prisma.setting.findUnique({ where: { key: settingKey } });
  return row?.value ?? null;
}

export async function setSetting(
  userEmail: string,
  key: string,
  value: string,
  scoped = true
) {
  const settingKey = scoped ? `${userEmail}::${key}` : key;
  await prisma.setting.upsert({
    where: { key: settingKey },
    update: { value },
    create: { key: settingKey, value },
  });
}

export async function getMeetingDays(userEmail: string): Promise<number[]> {
  const raw = await getSetting(userEmail, "meeting_days");
  if (!raw) return [1, 3];
  return raw
    .split(",")
    .map((value) => parseInt(value.trim(), 10))
    .filter((value) => !Number.isNaN(value));
}

export async function setMeetingDays(userEmail: string, days: number[]) {
  const clean = days
    .map((value) => parseInt(String(value), 10))
    .filter((value) => !Number.isNaN(value));
  await setSetting(userEmail, "meeting_days", clean.join(","));
}

export async function getFamilyWorshipDay(userEmail: string): Promise<number> {
  const raw = await getSetting(userEmail, "family_worship_day");
  if (!raw) return 6;
  const parsed = parseInt(raw.trim(), 10);
  return Number.isNaN(parsed) ? 6 : parsed;
}

export async function setFamilyWorshipDay(userEmail: string, day: number) {
  await setSetting(userEmail, "family_worship_day", String(day));
}

export async function getUserTimeZone(userEmail: string): Promise<string | null> {
  const raw = await getSetting(userEmail, "timezone");
  return raw || null;
}

export async function setUserTimeZone(userEmail: string, timezone: string) {
  await setSetting(userEmail, "timezone", timezone);
}

export async function getCustomHabits(userEmail: string) {
  const raw = await getSetting(userEmail, "custom_habits");
  if (!raw) return [] as Array<{ id: string; name: string; active?: boolean }>;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "object" && item?.active !== false);
    }
  } catch (_err) {
    return [];
  }
  return [];
}

export async function saveCustomHabits(
  userEmail: string,
  habits: Array<{ id: string; name: string; active?: boolean }>
) {
  await setSetting(userEmail, "custom_habits", JSON.stringify(habits));
}

export async function getCustomHabitDone(userEmail: string, dayIso: string) {
  const raw = await getSetting(userEmail, `custom_habit_done::${dayIso}`);
  if (!raw) return {} as Record<string, number>;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const clean: Record<string, number> = {};
      Object.entries(parsed).forEach(([key, value]) => {
        clean[String(key)] = value ? 1 : 0;
      });
      return clean;
    }
  } catch (_err) {
    return {};
  }
  return {} as Record<string, number>;
}

export async function setCustomHabitDone(
  userEmail: string,
  dayIso: string,
  done: Record<string, number>
) {
  const clean: Record<string, number> = {};
  Object.entries(done || {}).forEach(([key, value]) => {
    clean[String(key)] = value ? 1 : 0;
  });
  await setSetting(
    userEmail,
    `custom_habit_done::${dayIso}`,
    JSON.stringify(clean)
  );
}

export async function listCustomHabitDoneRange(
  userEmail: string,
  startIso: string,
  endIso: string
) {
  const prefix = `${userEmail}::custom_habit_done::`;
  const rows = await prisma.setting.findMany({
    where: {
      key: {
        startsWith: prefix,
      },
    },
  });
  const payload: Record<string, Record<string, number>> = {};
  rows.forEach((row) => {
    const datePart = row.key.replace(prefix, "");
    if (!datePart) return;
    if (datePart < startIso || datePart > endIso) return;
    try {
      const parsed = JSON.parse(row.value || "{}");
      if (parsed && typeof parsed === "object") {
        const clean: Record<string, number> = {};
        Object.entries(parsed).forEach(([key, value]) => {
          clean[String(key)] = value ? 1 : 0;
        });
        payload[datePart] = clean;
      }
    } catch (_err) {
      return;
    }
  });
  return payload;
}
