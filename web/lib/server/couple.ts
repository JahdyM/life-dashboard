import { prisma } from "../db/prisma";
import { FIXED_SHARED_HABITS, MOOD_PALETTE } from "../constants";
import { computeSharedHabitStreaks } from "./habits";

function getPartnerEmail(userEmail: string) {
  const allowed = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length < 2) return null;
  return allowed.find((email) => email !== userEmail) || null;
}

function buildEmptyMoodboard(days: number, labelA: string, labelB: string, warning?: string) {
  const xLabels = Array.from({ length: days }, (_, idx) => String(idx + 1));
  const emptyRow = Array.from({ length: days }, () => null);
  const hover = Array.from({ length: days }, () => "");
  return {
    x_labels: xLabels,
    y_labels: [labelA, labelB],
    z: [emptyRow, emptyRow],
    hover_text: [hover, hover],
    warning,
  };
}

export async function getCoupleMoodboard(
  userEmail: string,
  range: "month" | "year",
  monthKey?: string
) {
  const partnerEmail = getPartnerEmail(userEmail);
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "month" && monthKey) {
    const [yearStr, monthStr] = monthKey.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (!Number.isNaN(year) && !Number.isNaN(month) && month >= 1 && month <= 12) {
      start = new Date(year, month - 1, 1);
    }
  }
  const end = range === "month"
    ? new Date(start.getFullYear(), start.getMonth() + 1, 0)
    : new Date(start.getFullYear(), 11, 31);
  const daysInRange = Math.floor(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  if (!partnerEmail) {
    return buildEmptyMoodboard(daysInRange, "You", "Partner", "Partner not configured");
  }

  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);

  const entries = await prisma.dailyEntryUser.findMany({
    where: {
      userEmail: { in: [userEmail, partnerEmail] },
      date: { gte: startIso, lte: endIso },
    },
    orderBy: { date: "asc" },
  });

  const moodMap = new Map<string, string | null>();
  entries.forEach((entry) => {
    const key = `${entry.userEmail}::${entry.date}`;
    moodMap.set(key, entry.moodCategory || null);
  });

  const xLabels = Array.from({ length: daysInRange }, (_, idx) => String(idx + 1));
  const z: Array<Array<string | null>> = [
    Array.from({ length: daysInRange }, () => null),
    Array.from({ length: daysInRange }, () => null),
  ];
  const hover: Array<Array<string>> = [
    Array.from({ length: daysInRange }, () => ""),
    Array.from({ length: daysInRange }, () => ""),
  ];

  for (let i = 0; i < daysInRange; i += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    const iso = current.toISOString().slice(0, 10);
    const moodA = moodMap.get(`${userEmail}::${iso}`) || null;
    const moodB = moodMap.get(`${partnerEmail}::${iso}`) || null;
    z[0][i] = moodA;
    z[1][i] = moodB;
    hover[0][i] = moodA || "";
    hover[1][i] = moodB || "";
  }

  return {
    x_labels: xLabels,
    y_labels: [userEmail.split("@")[0], partnerEmail.split("@")[0]],
    z,
    hover_text: hover,
  };
}

export async function getSharedStreaks(userEmail: string, todayIso: string) {
  const partnerEmail = getPartnerEmail(userEmail);
  if (!partnerEmail) {
    return {
      warning: "Partner not configured",
      items: [],
    };
  }
  const [userStreaks, partnerStreaks] = await Promise.all([
    computeSharedHabitStreaks(userEmail, todayIso),
    computeSharedHabitStreaks(partnerEmail, todayIso),
  ]);
  const items = FIXED_SHARED_HABITS.map((habit) => ({
    habit_key: habit.key,
    label: habit.label,
    user: {
      email: userEmail,
      streak: userStreaks[habit.key]?.streak || 0,
      today_done:
        userStreaks[habit.key]?.todayApplicable === false
          ? true
          : userStreaks[habit.key]?.todayDone || false,
      today_applicable: userStreaks[habit.key]?.todayApplicable ?? true,
    },
    partner: {
      email: partnerEmail,
      streak: partnerStreaks[habit.key]?.streak || 0,
      today_done:
        partnerStreaks[habit.key]?.todayApplicable === false
          ? true
          : partnerStreaks[habit.key]?.todayDone || false,
      today_applicable: partnerStreaks[habit.key]?.todayApplicable ?? true,
    },
  }));
  return { items };
}

export function getMoodColor(moodKey: string | null) {
  if (!moodKey) return "#9AA0A6";
  const found = MOOD_PALETTE.find((item) => item.key === moodKey);
  return found?.color || "#9AA0A6";
}
