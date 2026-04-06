import { randomUUID } from "crypto";
import type { MinistryDailyEntry, MinistryMonthPayload, MinistryMonthlyGoal } from "@/lib/types";
import { buildMinistryMonthPayload, monthKeyToRange } from "@/lib/ministry";
import { prisma } from "@/lib/db/prisma";
import { getTodayIsoForUser } from "./settings";
import { ensureMinistryTables } from "./dbCompat";

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

export async function getMinistryMonthData(
  userEmail: string,
  monthKey: string
): Promise<MinistryMonthPayload> {
  await ensureMinistryTables();
  const { startIso, endIso, year, month } = monthKeyToRange(monthKey);
  const todayIso = await getTodayIsoForUser(userEmail);

  const [goalRow, entryRows] = await Promise.all([
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
  ]);

  return buildMinistryMonthPayload({
    monthKey,
    todayIso,
    targetMinutes: goalRow?.targetMinutes ?? null,
    entries: entryRows.map(mapEntry),
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
