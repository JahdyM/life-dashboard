import "server-only";
import { prisma } from "@/lib/db/prisma";

import { isEffortLevel, type EffortLevel, type EnergySettings } from "@/lib/energy";
const prefixFor = (userEmail: string) => `energy::${userEmail.toLowerCase()}::`;
const lowEnergyKey = (userEmail: string) => `${prefixFor(userEmail)}low_mode`;
const taskEffortKey = (userEmail: string, taskId: string) => `${prefixFor(userEmail)}task::${taskId}`;
const habitEffortKey = (userEmail: string, habitId: string) => `${prefixFor(userEmail)}habit::${habitId}`;


export async function getEnergySettings(userEmail: string): Promise<EnergySettings> {
  const prefix = prefixFor(userEmail);
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: prefix } },
  });
  const taskEffort: Record<string, EffortLevel> = {};
  const habitEffort: Record<string, EffortLevel> = {};
  let lowEnergyMode = false;

  for (const row of rows) {
    if (row.key === lowEnergyKey(userEmail)) {
      lowEnergyMode = row.value === "1" || row.value === "true";
      continue;
    }
    const relativeKey = row.key.slice(prefix.length);
    const value = row.value;
    if (!isEffortLevel(value)) continue;
    if (relativeKey.startsWith("task::")) {
      taskEffort[relativeKey.slice("task::".length)] = value;
    }
    if (relativeKey.startsWith("habit::")) {
      habitEffort[relativeKey.slice("habit::".length)] = value;
    }
  }

  return { lowEnergyMode, taskEffort, habitEffort };
}

export async function setLowEnergyMode(userEmail: string, enabled: boolean) {
  await prisma.setting.upsert({
    where: { key: lowEnergyKey(userEmail) },
    update: { value: enabled ? "1" : "0" },
    create: { key: lowEnergyKey(userEmail), value: enabled ? "1" : "0" },
  });
}

export async function setTaskEffort(userEmail: string, taskId: string, effort: EffortLevel | null) {
  const key = taskEffortKey(userEmail, taskId);
  if (!effort) {
    await prisma.setting.deleteMany({ where: { key } });
    return;
  }
  await prisma.setting.upsert({
    where: { key },
    update: { value: effort },
    create: { key, value: effort },
  });
}

export async function setHabitEffort(userEmail: string, habitId: string, effort: EffortLevel | null) {
  const key = habitEffortKey(userEmail, habitId);
  if (!effort) {
    await prisma.setting.deleteMany({ where: { key } });
    return;
  }
  await prisma.setting.upsert({
    where: { key },
    update: { value: effort },
    create: { key, value: effort },
  });
}
