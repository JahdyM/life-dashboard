import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { canonicalMoodKey } from "@/lib/moods";
import type { MoodDaySummary, MoodHistoryResponse, MoodMomentEntry } from "@/lib/types";

type RawMoodMoment = {
  id: string;
  userEmail: string;
  dayIso: string;
  loggedAt: string;
  moodCategory: string;
  moodNote: string | null;
  createdAt: string;
  updatedAt: string;
};

type LegacyMoodDay = {
  date: string;
  moodCategory: string | null;
  moodNote: string | null;
  updatedAt: string | null;
};

type SummaryCandidate = {
  key: string;
  count: number;
  latestLoggedAt: string;
};

const compareChronological = (left: string, right: string) => left.localeCompare(right);

function normalizeMoment(row: RawMoodMoment): MoodMomentEntry {
  return {
    id: row.id,
    dayIso: row.dayIso,
    loggedAt: row.loggedAt,
    moodCategory: canonicalMoodKey(row.moodCategory),
    moodNote: row.moodNote || null,
    source: "moment",
  };
}

function buildLegacyMoment(row: LegacyMoodDay): MoodMomentEntry | null {
  const moodCategory = canonicalMoodKey(row.moodCategory);
  if (!moodCategory) return null;
  return {
    id: `legacy-${row.date}`,
    dayIso: row.date,
    loggedAt: `${row.date}T12:00:00`,
    moodCategory,
    moodNote: row.moodNote || null,
    source: "legacy_summary",
  };
}

function summarizeMoodDay(dayIso: string, entries: MoodMomentEntry[], legacy?: LegacyMoodDay | null) {
  const actualEntries = entries.filter((entry) => Boolean(entry.moodCategory));

  if (!actualEntries.length) {
    const legacyMoment = legacy ? buildLegacyMoment(legacy) : null;
    if (!legacyMoment) return null;
    return {
      summary: {
        date: dayIso,
        moodCategory: legacyMoment.moodCategory,
        moodNote: legacyMoment.moodNote,
        totalEntries: 1,
        latestLoggedAt: legacyMoment.loggedAt,
        source: "legacy",
      } satisfies MoodDaySummary,
      fallbackEntry: legacyMoment,
    };
  }

  const candidates = new Map<string, SummaryCandidate>();
  let latestEntry = actualEntries[0];
  let latestNotedEntry: MoodMomentEntry | null = actualEntries[0].moodNote ? actualEntries[0] : null;

  actualEntries.forEach((entry) => {
    const key = canonicalMoodKey(entry.moodCategory);
    if (!key) return;
    const current = candidates.get(key);
    if (!current) {
      candidates.set(key, { key, count: 1, latestLoggedAt: entry.loggedAt });
    } else {
      current.count += 1;
      if (compareChronological(current.latestLoggedAt, entry.loggedAt) < 0) {
        current.latestLoggedAt = entry.loggedAt;
      }
    }

    if (compareChronological(latestEntry.loggedAt, entry.loggedAt) < 0) {
      latestEntry = entry;
    }
    if (
      entry.moodNote &&
      (!latestNotedEntry || compareChronological(latestNotedEntry.loggedAt, entry.loggedAt) < 0)
    ) {
      latestNotedEntry = entry;
    }
  });

  const winner = Array.from(candidates.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return compareChronological(right.latestLoggedAt, left.latestLoggedAt);
  })[0];

  if (!winner) return null;

  return {
    summary: {
      date: dayIso,
      moodCategory: winner.key,
      moodNote: latestNotedEntry?.moodNote || null,
      totalEntries: actualEntries.length,
      latestLoggedAt: latestEntry.loggedAt,
      source: "moments",
    } satisfies MoodDaySummary,
    fallbackEntry: null,
  };
}

async function loadMoodMoments(
  userEmail: string,
  startIso?: string,
  endIso?: string
): Promise<RawMoodMoment[]> {
  return prisma.moodMomentEntry.findMany({
    where: {
      userEmail,
      ...(startIso || endIso
        ? {
            dayIso: {
              ...(startIso ? { gte: startIso } : {}),
              ...(endIso ? { lte: endIso } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ dayIso: "asc" }, { loggedAt: "asc" }, { createdAt: "asc" }],
  });
}

async function loadLegacyMoodDays(
  userEmail: string,
  startIso?: string,
  endIso?: string
): Promise<LegacyMoodDay[]> {
  return prisma.dailyEntryUser.findMany({
    where: {
      userEmail,
      moodCategory: { not: null },
      ...(startIso || endIso
        ? {
            date: {
              ...(startIso ? { gte: startIso } : {}),
              ...(endIso ? { lte: endIso } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "asc" },
    select: {
      date: true,
      moodCategory: true,
      moodNote: true,
      updatedAt: true,
    },
  });
}

function buildMoodPayload(
  momentRows: RawMoodMoment[],
  legacyRows: LegacyMoodDay[]
): MoodHistoryResponse {
  const groupedMoments = new Map<string, MoodMomentEntry[]>();
  const historyEntries: MoodMomentEntry[] = momentRows.map(normalizeMoment);
  historyEntries.forEach((entry) => {
    const current = groupedMoments.get(entry.dayIso) || [];
    current.push(entry);
    groupedMoments.set(entry.dayIso, current);
  });

  const legacyMap = new Map(legacyRows.map((row) => [row.date, row]));
  const allDays = new Set<string>([
    ...groupedMoments.keys(),
    ...legacyRows.map((row) => row.date),
  ]);

  const dailySummaries: MoodDaySummary[] = [];
  Array.from(allDays)
    .sort(compareChronological)
    .forEach((dayIso) => {
      const result = summarizeMoodDay(dayIso, groupedMoments.get(dayIso) || [], legacyMap.get(dayIso));
      if (!result) return;
      dailySummaries.push(result.summary);
      if (result.fallbackEntry) {
        historyEntries.push(result.fallbackEntry);
      }
    });

  historyEntries.sort((left, right) => compareChronological(left.loggedAt, right.loggedAt));

  return {
    entries: historyEntries,
    dailySummaries,
    historyStart: dailySummaries[0]?.date || null,
    historyEnd: dailySummaries[dailySummaries.length - 1]?.date || null,
  };
}

export async function getMoodHistory(userEmail: string): Promise<MoodHistoryResponse> {
  const [momentRows, legacyRows] = await Promise.all([
    loadMoodMoments(userEmail),
    loadLegacyMoodDays(userEmail),
  ]);
  return buildMoodPayload(momentRows, legacyRows);
}

export async function getMoodSummaryForDay(userEmail: string, dayIso: string) {
  const [momentRows, legacyRows] = await Promise.all([
    loadMoodMoments(userEmail, dayIso, dayIso),
    loadLegacyMoodDays(userEmail, dayIso, dayIso),
  ]);
  const payload = buildMoodPayload(momentRows, legacyRows);
  return payload.dailySummaries.find((item) => item.date === dayIso) || null;
}

async function syncDaySummaryIntoDailyEntry(userEmail: string, dayIso: string) {
  const [momentRows, existingDay] = await Promise.all([
    loadMoodMoments(userEmail, dayIso, dayIso),
    prisma.dailyEntryUser.findUnique({
      where: { userEmail_date: { userEmail, date: dayIso } },
      select: {
        moodCategory: true,
        moodNote: true,
      },
    }),
  ]);

  const normalizedEntries = momentRows.map(normalizeMoment);
  const summaryResult = summarizeMoodDay(dayIso, normalizedEntries, existingDay
    ? {
        date: dayIso,
        moodCategory: existingDay.moodCategory,
        moodNote: existingDay.moodNote,
        updatedAt: null,
      }
    : null);
  const nowIso = new Date().toISOString();

  await prisma.dailyEntryUser.upsert({
    where: { userEmail_date: { userEmail, date: dayIso } },
    update: {
      moodCategory: summaryResult?.summary.moodCategory || null,
      moodNote: summaryResult?.summary.moodNote || null,
      updatedAt: nowIso,
    },
    create: {
      userEmail,
      date: dayIso,
      moodCategory: summaryResult?.summary.moodCategory || null,
      moodNote: summaryResult?.summary.moodNote || null,
      updatedAt: nowIso,
    },
  });

  return summaryResult?.summary || null;
}

export async function createMoodMoment(
  userEmail: string,
  input: {
    dayIso: string;
    loggedTime: string;
    moodCategory: string;
    moodNote?: string | null;
  }
) {
  const moodCategory = canonicalMoodKey(input.moodCategory);
  if (!moodCategory) {
    throw new Error("Mood is required");
  }

  const nowIso = new Date().toISOString();
  const loggedAt = `${input.dayIso}T${input.loggedTime}:00`;
  const entry = await prisma.moodMomentEntry.create({
    data: {
      id: randomUUID(),
      userEmail,
      dayIso: input.dayIso,
      loggedAt,
      moodCategory,
      moodNote: input.moodNote?.trim() || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  });

  const summary = await syncDaySummaryIntoDailyEntry(userEmail, input.dayIso);

  return {
    entry: normalizeMoment(entry),
    summary,
  };
}
