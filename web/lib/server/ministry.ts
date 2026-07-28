import { randomUUID } from "crypto";
import type { MinistryDailyEntry, MinistryMonthPayload, MinistryMonthlyGoal } from "@/lib/types";
import { buildMinistryMonthPayload, monthKeyToRange } from "@/lib/ministry";
import { prisma } from "@/lib/db/prisma";
import { getSetting, getTodayIsoForUser, setSetting } from "./settings";
import { ensureMinistryTables } from "./dbCompat";

export type MinistryRecurringPlan = {
  id: string;
  label: string;
  weekday: number;
  goalMinutes: number;
  startDate: string;
  endDate: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const MINISTRY_RECURRING_PLANS_KEY = "ministry_recurring_plans_v1";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function monthStartForIsoDate(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function normalizeGoalMinutes(value: number | null) {
  if (value == null || value <= 0) return null;
  return value;
}

function normalizeActualMinutes(value: number | null, goalMinutes: number | null) {
  if (value == null) return goalMinutes != null ? 0 : null;
  if (value < 0) return 0;
  return value;
}

function normalizeNotes(value: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
}

function mapGoal(goal: {
  id: string;
  userEmail: string;
  year: number;
  month: number;
  targetMinutes: number;
  createdAt: string;
  updatedAt: string;
}): MinistryMonthlyGoal {
  return {
    id: goal.id,
    userEmail: goal.userEmail,
    year: goal.year,
    month: goal.month,
    targetMinutes: goal.targetMinutes,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

function mapEntry(entry: {
  id: string;
  userEmail: string;
  date: string;
  goalMinutes: number | null;
  actualMinutes: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}): MinistryDailyEntry {
  return {
    id: entry.id,
    userEmail: entry.userEmail,
    date: entry.date,
    goalMinutes: entry.goalMinutes,
    actualMinutes: entry.actualMinutes,
    notes: entry.notes,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function normalizeRecurringPlan(raw: Partial<MinistryRecurringPlan>) {
  const weekday = Number(raw.weekday);
  const goalMinutes = Math.trunc(Number(raw.goalMinutes));
  const label = String(raw.label || "").trim().slice(0, 120);
  const rawStartDate = String(raw.startDate || "");
  const endDate = raw.endDate ? String(raw.endDate) : null;
  if (
    !raw.id ||
    !label ||
    !Number.isInteger(weekday) ||
    weekday < 0 ||
    weekday > 6 ||
    !Number.isInteger(goalMinutes) ||
    goalMinutes < 1 ||
    goalMinutes > 1440 ||
    !ISO_DATE_PATTERN.test(rawStartDate) ||
    (endDate !== null && !ISO_DATE_PATTERN.test(endDate)) ||
    (endDate !== null && endDate < rawStartDate)
  ) {
    return null;
  }

  // Weekly ministry routines are monthly planning rules. Applying them from the
  // first day of their start month keeps that month's planned total complete.
  const startDate = monthStartForIsoDate(rawStartDate);
  const nowIso = new Date().toISOString();
  return {
    id: String(raw.id),
    label,
    weekday,
    goalMinutes,
    startDate,
    endDate,
    active: raw.active !== false,
    createdAt: String(raw.createdAt || nowIso),
    updatedAt: String(raw.updatedAt || nowIso),
  } satisfies MinistryRecurringPlan;
}

export async function getMinistryRecurringPlans(userEmail: string) {
  const raw = await getSetting(userEmail, MINISTRY_RECURRING_PLANS_KEY);
  if (!raw) return [] as MinistryRecurringPlan[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeRecurringPlan(item as Partial<MinistryRecurringPlan>))
      .filter((item): item is MinistryRecurringPlan => Boolean(item))
      .slice(0, 50);
  } catch {
    return [];
  }
}

async function saveMinistryRecurringPlans(
  userEmail: string,
  plans: MinistryRecurringPlan[]
) {
  await setSetting(
    userEmail,
    MINISTRY_RECURRING_PLANS_KEY,
    JSON.stringify(plans.slice(0, 50))
  );
}

export async function upsertMinistryRecurringPlan(
  userEmail: string,
  payload: {
    id?: string;
    label: string;
    weekday: number;
    goalMinutes: number;
    startDate: string;
    endDate: string | null;
  }
) {
  const plans = await getMinistryRecurringPlans(userEmail);
  const nowIso = new Date().toISOString();
  const normalizedLabel = payload.label.trim().slice(0, 120);
  const existingIndex = payload.id
    ? plans.findIndex((plan) => plan.id === payload.id)
    : plans.findIndex(
        (plan) =>
          plan.active &&
          plan.weekday === payload.weekday &&
          plan.label.toLocaleLowerCase("pt-BR") ===
            normalizedLabel.toLocaleLowerCase("pt-BR")
      );
  const existing = existingIndex >= 0 ? plans[existingIndex] : null;
  const next = normalizeRecurringPlan({
    id: existing?.id || payload.id || randomUUID(),
    label: normalizedLabel,
    weekday: payload.weekday,
    goalMinutes: payload.goalMinutes,
    startDate: payload.startDate,
    endDate: payload.endDate,
    active: true,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  });
  if (!next) throw new Error("INVALID_MINISTRY_RECURRENCE");

  if (existingIndex >= 0) plans[existingIndex] = next;
  else plans.push(next);
  await saveMinistryRecurringPlans(userEmail, plans);
  return next;
}

export async function removeMinistryRecurringPlan(userEmail: string, id: string) {
  const plans = await getMinistryRecurringPlans(userEmail);
  const existing = plans.find((plan) => plan.id === id);
  if (!existing) throw new Error("RESOURCE_NOT_FOUND");
  await saveMinistryRecurringPlans(
    userEmail,
    plans.filter((plan) => plan.id !== id)
  );
  return existing;
}

function weekdayForIsoDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function recurringGoalForDate(plans: MinistryRecurringPlan[], date: string) {
  return plans
    .filter(
      (plan) =>
        plan.active &&
        plan.weekday === weekdayForIsoDate(date) &&
        plan.startDate <= date &&
        (plan.endDate === null || plan.endDate >= date)
    )
    .reduce((sum, plan) => sum + plan.goalMinutes, 0);
}

function mergeRecurringPlansIntoEntries(
  entries: MinistryDailyEntry[],
  plans: MinistryRecurringPlan[],
  startIso: string,
  endIso: string
) {
  if (!plans.length) return entries;
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const cursor = new Date(`${startIso}T12:00:00.000Z`);
  const end = new Date(`${endIso}T12:00:00.000Z`);

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const recurringGoal = recurringGoalForDate(plans, date);
    if (recurringGoal > 0) {
      const existing = byDate.get(date);
      if (existing) {
        if (existing.goalMinutes == null) {
          byDate.set(date, { ...existing, goalMinutes: recurringGoal });
        }
      } else {
        byDate.set(date, {
          id: `recurring:${date}`,
          userEmail: undefined,
          date,
          goalMinutes: recurringGoal,
          actualMinutes: null,
          notes: null,
        });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return Array.from(byDate.values()).sort((left, right) =>
    left.date.localeCompare(right.date)
  );
}

export async function getMinistryMonthData(
  userEmail: string,
  monthKey: string
): Promise<MinistryMonthPayload> {
  await ensureMinistryTables();
  const { startIso, endIso, year, month } = monthKeyToRange(monthKey);
  const todayIso = await getTodayIsoForUser(userEmail);

  const [goalRow, entryRows, recurringPlans] = await Promise.all([
    prisma.ministryMonthlyGoal.findFirst({
      where: { userEmail, year, month },
    }),
    prisma.ministryDailyEntry.findMany({
      where: {
        userEmail,
        date: {
          gte: startIso,
          lte: endIso,
        },
      },
      orderBy: { date: "asc" },
    }),
    getMinistryRecurringPlans(userEmail),
  ]);
  const entries = mergeRecurringPlansIntoEntries(
    entryRows.map(mapEntry),
    recurringPlans,
    startIso,
    endIso
  );

  return buildMinistryMonthPayload({
    monthKey,
    todayIso,
    targetMinutes: goalRow?.targetMinutes ?? null,
    entries,
  });
}

export async function setMinistryMonthlyGoal(
  userEmail: string,
  monthKey: string,
  targetMinutes: number | null
) {
  await ensureMinistryTables();
  const { year, month } = monthKeyToRange(monthKey);
  const nowIso = new Date().toISOString();
  const existing = await prisma.ministryMonthlyGoal.findFirst({
    where: { userEmail, year, month },
  });

  if (targetMinutes == null || targetMinutes <= 0) {
    if (existing) {
      await prisma.ministryMonthlyGoal.delete({ where: { id: existing.id } });
    }
    return null;
  }

  if (existing) {
    const updated = await prisma.ministryMonthlyGoal.update({
      where: { id: existing.id },
      data: {
        targetMinutes,
        updatedAt: nowIso,
      },
    });
    return mapGoal(updated);
  }

  const created = await prisma.ministryMonthlyGoal.create({
    data: {
      id: randomUUID(),
      userEmail,
      year,
      month,
      targetMinutes,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  });
  return mapGoal(created);
}

export async function setMinistryDayEntry(
  userEmail: string,
  date: string,
  payload: {
    goalMinutes: number | null;
    actualMinutes: number | null;
    notes: string | null;
  }
) {
  await ensureMinistryTables();
  const nowIso = new Date().toISOString();
  const goalMinutes = normalizeGoalMinutes(payload.goalMinutes);
  const notes = normalizeNotes(payload.notes);
  const actualMinutes = normalizeActualMinutes(payload.actualMinutes, goalMinutes);
  const existing = await prisma.ministryDailyEntry.findFirst({
    where: { userEmail, date },
  });

  if (goalMinutes == null && actualMinutes == null && notes == null) {
    if (existing) {
      await prisma.ministryDailyEntry.delete({ where: { id: existing.id } });
    }
    return null;
  }

  if (existing) {
    const updated = await prisma.ministryDailyEntry.update({
      where: { id: existing.id },
      data: {
        goalMinutes,
        actualMinutes,
        notes,
        updatedAt: nowIso,
      },
    });
    return mapEntry(updated);
  }

  const created = await prisma.ministryDailyEntry.create({
    data: {
      id: randomUUID(),
      userEmail,
      date,
      goalMinutes,
      actualMinutes,
      notes,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  });
  return mapEntry(created);
}
