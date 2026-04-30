import "server-only";
import { prisma } from "@/lib/db/prisma";

export type MorningCheckinData = {
  date: string;
  mood: string;
  moodLabel: string;
  intention: string;
  priority: string;
  completedAt: string;
};

function checkinKey(userEmail: string, date: string) {
  return `morning_checkin::${userEmail.toLowerCase()}::${date}`;
}

export async function getMorningCheckin(userEmail: string, date: string): Promise<MorningCheckinData | null> {
  const row = await prisma.setting.findUnique({ where: { key: checkinKey(userEmail, date) } });
  if (!row?.value) return null;
  try { return JSON.parse(row.value) as MorningCheckinData; } catch { return null; }
}

export async function saveMorningCheckin(userEmail: string, data: MorningCheckinData): Promise<void> {
  const key = checkinKey(userEmail, data.date);
  await prisma.setting.upsert({
    where: { key },
    update: { value: JSON.stringify(data) },
    create: { key, value: JSON.stringify(data) },
  });
}

export async function getCheckinStreak(userEmail: string, date: string): Promise<number> {
  let streak = 0;
  const d = new Date(date + "T12:00:00Z");
  for (let i = 0; i < 365; i++) {
    const dateStr = d.toISOString().slice(0, 10);
    const row = await prisma.setting.findUnique({ where: { key: checkinKey(userEmail, dateStr) } });
    const grace = await prisma.setting.findUnique({ where: { key: `rewards::${userEmail.toLowerCase()}::morning_grace::${dateStr}` } });
    if (!row && !grace) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export type EveningCheckinData = {
  date: string;
  energy: string;
  wentWell: string;
  tomorrow: string;
  completedAt: string;
};

function eveningCheckinKey(userEmail: string, date: string) {
  return `evening_checkin::${userEmail.toLowerCase()}::${date}`;
}

export async function getEveningCheckin(userEmail: string, date: string): Promise<EveningCheckinData | null> {
  const row = await prisma.setting.findUnique({ where: { key: eveningCheckinKey(userEmail, date) } });
  if (!row?.value) return null;
  try { return JSON.parse(row.value) as EveningCheckinData; } catch { return null; }
}

export async function saveEveningCheckin(userEmail: string, data: EveningCheckinData): Promise<void> {
  const key = eveningCheckinKey(userEmail, data.date);
  await prisma.setting.upsert({
    where: { key },
    update: { value: JSON.stringify(data) },
    create: { key, value: JSON.stringify(data) },
  });
}
