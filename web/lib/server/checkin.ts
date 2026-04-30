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
    if (!row) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
