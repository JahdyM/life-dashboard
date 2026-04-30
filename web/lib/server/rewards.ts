import "server-only";
import { prisma } from "@/lib/db/prisma";
import { addDaysIso } from "@/lib/spiritualStreaks";
import { getMorningCheckin, getCheckinStreak } from "./checkin";

export const STREAK_FREEZE_COST = 30;

export type RewardsState = {
  points: number;
  streakFreezes: number;
  freezeCost: number;
  canUseMorningGrace: boolean;
  morningGraceDate: string | null;
};

const prefixFor = (userEmail: string) => `rewards::${userEmail.toLowerCase()}::`;
const pointsKey = (userEmail: string) => `${prefixFor(userEmail)}points`;
const freezesKey = (userEmail: string) => `${prefixFor(userEmail)}streak_freezes`;
const ledgerKey = (userEmail: string, actionKey: string) => `${prefixFor(userEmail)}ledger::${actionKey}`;
const morningGraceKey = (userEmail: string, date: string) => `${prefixFor(userEmail)}morning_grace::${date}`;

async function readNumber(key: string) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return Math.max(0, Number(row?.value || 0) || 0);
}

async function writeNumber(key: string, value: number) {
  await prisma.setting.upsert({
    where: { key },
    update: { value: String(Math.max(0, Math.floor(value))) },
    create: { key, value: String(Math.max(0, Math.floor(value))) },
  });
}

export async function getPointsBalance(userEmail: string) {
  return readNumber(pointsKey(userEmail));
}

export async function getStreakFreezes(userEmail: string) {
  return readNumber(freezesKey(userEmail));
}

export async function hasMorningGrace(userEmail: string, date: string) {
  const row = await prisma.setting.findUnique({ where: { key: morningGraceKey(userEmail, date) } });
  return Boolean(row);
}

export async function addPointsOnce(userEmail: string, actionKey: string, points: number) {
  const ledger = ledgerKey(userEmail, actionKey);
  const existing = await prisma.setting.findUnique({ where: { key: ledger } });
  if (existing) return { awarded: 0, balance: await getPointsBalance(userEmail) };
  const current = await getPointsBalance(userEmail);
  const next = current + points;
  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: pointsKey(userEmail) },
      update: { value: String(next) },
      create: { key: pointsKey(userEmail), value: String(next) },
    }),
    prisma.setting.create({ data: { key: ledger, value: String(points) } }),
  ]);
  return { awarded: points, balance: next };
}

export async function purchaseStreakFreeze(userEmail: string) {
  const points = await getPointsBalance(userEmail);
  if (points < STREAK_FREEZE_COST) throw new Error("NOT_ENOUGH_POINTS");
  const freezes = await getStreakFreezes(userEmail);
  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: pointsKey(userEmail) },
      update: { value: String(points - STREAK_FREEZE_COST) },
      create: { key: pointsKey(userEmail), value: String(points - STREAK_FREEZE_COST) },
    }),
    prisma.setting.upsert({
      where: { key: freezesKey(userEmail) },
      update: { value: String(freezes + 1) },
      create: { key: freezesKey(userEmail), value: String(freezes + 1) },
    }),
  ]);
}

async function spendFreeze(userEmail: string) {
  const freezes = await getStreakFreezes(userEmail);
  if (freezes <= 0) throw new Error("NO_FREEZES");
  await writeNumber(freezesKey(userEmail), freezes - 1);
}

export async function applyMorningGraceDay(userEmail: string, todayIso: string) {
  const graceDate = addDaysIso(todayIso, -1);
  const existing = await getMorningCheckin(userEmail, graceDate);
  if (existing || (await hasMorningGrace(userEmail, graceDate))) {
    return graceDate;
  }
  const streakBeforeMiss = await getCheckinStreak(userEmail, addDaysIso(graceDate, -1));
  if (streakBeforeMiss < 3) throw new Error("GRACE_NOT_AVAILABLE");
  await spendFreeze(userEmail);
  await prisma.setting.create({
    data: {
      key: morningGraceKey(userEmail, graceDate),
      value: JSON.stringify({ date: graceDate, usedAt: new Date().toISOString() }),
    },
  });
  return graceDate;
}

export async function spendGenericGraceDay(userEmail: string) {
  await spendFreeze(userEmail);
}

export async function getRewardsState(userEmail: string, todayIso: string): Promise<RewardsState> {
  const [points, streakFreezes] = await Promise.all([
    getPointsBalance(userEmail),
    getStreakFreezes(userEmail),
  ]);
  const graceDate = addDaysIso(todayIso, -1);
  const hasCheckin = await getMorningCheckin(userEmail, graceDate);
  const alreadyGrace = await hasMorningGrace(userEmail, graceDate);
  const previousStreak = await getCheckinStreak(userEmail, addDaysIso(graceDate, -1));
  const canUseMorningGrace = streakFreezes > 0 && !hasCheckin && !alreadyGrace && previousStreak >= 3;
  return {
    points,
    streakFreezes,
    freezeCost: STREAK_FREEZE_COST,
    canUseMorningGrace,
    morningGraceDate: canUseMorningGrace ? graceDate : null,
  };
}
