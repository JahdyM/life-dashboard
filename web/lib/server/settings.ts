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

function todayIsoForTimeZone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

export async function getTodayIsoForUser(userEmail: string): Promise<string> {
  const timezone = await getUserTimeZone(userEmail);
  if (!timezone) return new Date().toISOString().slice(0, 10);
  try {
    return todayIsoForTimeZone(timezone);
  } catch (_err) {
    return new Date().toISOString().slice(0, 10);
  }
}

export async function getCustomHabits(userEmail: string) {
  const raw = await getSetting(userEmail, "custom_habits");
  if (!raw) return [] as Array<{ id: string; name: string; active?: boolean }>;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const filtered = parsed.filter(
        (item) => typeof item === "object" && item?.active !== false
      );
      const normalized = normalizeCustomHabits(filtered);
      if (normalized.length !== filtered.length) {
        await saveCustomHabits(userEmail, normalized);
      }
      return normalized;
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
  const normalized = normalizeCustomHabits(habits);
  await setSetting(userEmail, "custom_habits", JSON.stringify(normalized));
}

const DEFAULT_CUSTOM_HABITS = [
  { id: "default-bible-study", name: "Bible study", active: true },
  { id: "default-dissertation-work", name: "Dissertation work", active: true },
  { id: "default-general-reading", name: "General reading (books)", active: true },
  { id: "default-writing", name: "Writing", active: true },
  { id: "default-scientific-writing", name: "Scientific Writing", active: true },
];

export async function ensureDefaultCustomHabits(userEmail: string) {
  const current = await getCustomHabits(userEmail);
  if (current.length > 0) return current;
  await saveCustomHabits(userEmail, DEFAULT_CUSTOM_HABITS);
  return DEFAULT_CUSTOM_HABITS;
}

export function canonicalHabitKey(name: string) {
  let key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  key = key.replace(/\s*\(books\)/g, "");
  return key;
}

function normalizeCustomHabits(
  habits: Array<{ id: string; name: string; active?: boolean }>
) {
  const seen = new Map<string, { id: string; name: string; active?: boolean }>();
  habits.forEach((habit) => {
    const name = String(habit?.name || "").trim();
    if (!name) return;
    const key = canonicalHabitKey(name);
    if (!seen.has(key)) {
      seen.set(key, { ...habit, name });
      return;
    }
    const existing = seen.get(key)!;
    // Prefer active habit if duplicate exists
    if (habit.active !== false && existing.active === false) {
      seen.set(key, { ...habit, name });
      return;
    }
    // Prefer longer, more descriptive name (e.g., with parentheses)
    if (name.length > existing.name.length) {
      seen.set(key, { ...habit, name });
    }
  });
  return Array.from(seen.values());
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
