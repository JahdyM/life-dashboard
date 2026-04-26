import { prisma } from "@/lib/db/prisma";
import {
  buildSpiritualStreakBoard,
  buildSpiritualStreaksPageData,
  normalizeSpiritualStreakEntries,
  SPIRITUAL_STREAK_BOARDS,
} from "@/lib/spiritualStreaks";
import type {
  SpiritualStreakBoard,
  SpiritualStreakBoardKey,
  SpiritualStreakEntry,
  SpiritualStreaksPageData,
} from "@/lib/types";
import {
  spiritualStreakBoardKeySchema,
  spiritualStreakBoardStateSchema,
} from "./schemas";
import { getEnabledSpiritualStreakConfigsForUser } from "./onboarding";
import { getTodayIsoForUser } from "./settings";

function settingKey(userEmail: string, boardKey: SpiritualStreakBoardKey) {
  return `${userEmail.toLowerCase()}::spiritual_streak::${boardKey}`;
}

function emptyEntries(): SpiritualStreakEntry[] {
  return [];
}

function fromStoredBoard(rawValue: string | null | undefined): SpiritualStreakEntry[] {
  if (!rawValue) {
    return emptyEntries();
  }

  try {
    const parsedJson = JSON.parse(rawValue);
    const parsed = spiritualStreakBoardStateSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return emptyEntries();
    }

    return normalizeSpiritualStreakEntries(
      parsed.data.entries.map((entry) => ({
        date: entry.date,
        success: entry.success,
        note: entry.note ?? null,
        createdAt: entry.created_at ?? undefined,
        updatedAt: entry.updated_at ?? undefined,
      }))
    );
  } catch (_error) {
    return emptyEntries();
  }
}

function toStoredBoard(entries: SpiritualStreakEntry[]) {
  return {
    entries: normalizeSpiritualStreakEntries(entries).map((entry) => ({
      date: entry.date,
      success: entry.success,
      note: entry.note ?? null,
      created_at: entry.createdAt ?? null,
      updated_at: entry.updatedAt ?? null,
    })),
  };
}

async function loadEntriesByBoard(userEmail: string) {
  const keys = SPIRITUAL_STREAK_BOARDS.map((board) => settingKey(userEmail, board.key));
  const rows = await prisma.setting.findMany({
    where: {
      key: { in: keys },
    },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return Object.fromEntries(
    SPIRITUAL_STREAK_BOARDS.map((board) => [
      board.key,
      fromStoredBoard(byKey.get(settingKey(userEmail, board.key))),
    ])
  ) as Record<SpiritualStreakBoardKey, SpiritualStreakEntry[]>;
}

async function saveBoardEntries(
  userEmail: string,
  boardKey: SpiritualStreakBoardKey,
  entries: SpiritualStreakEntry[]
) {
  await prisma.setting.upsert({
    where: { key: settingKey(userEmail, boardKey) },
    create: {
      key: settingKey(userEmail, boardKey),
      value: JSON.stringify(toStoredBoard(entries)),
    },
    update: {
      value: JSON.stringify(toStoredBoard(entries)),
    },
  });
}

export async function getSpiritualStreaksPageData(
  userEmail: string,
  monthKey: string
): Promise<SpiritualStreaksPageData> {
  const [todayIso, entriesByBoard, boards] = await Promise.all([
    getTodayIsoForUser(userEmail),
    loadEntriesByBoard(userEmail),
    getEnabledSpiritualStreakConfigsForUser(userEmail),
  ]);

  return buildSpiritualStreaksPageData({
    monthKey,
    todayIso,
    entriesByBoard,
    boards,
  });
}

export async function updateSpiritualStreakEntry(args: {
  userEmail: string;
  boardKey: SpiritualStreakBoardKey;
  monthKey: string;
  date: string;
  success: boolean | null;
  note?: string | null;
}): Promise<SpiritualStreakBoard> {
  const { userEmail, boardKey, monthKey, date, success } = args;
  const note = args.note?.trim() || null;
  const todayIso = await getTodayIsoForUser(userEmail);

  if (date > todayIso) {
    throw new Error("FUTURE_DATE_NOT_ALLOWED");
  }

  const boardKeyParsed = spiritualStreakBoardKeySchema.safeParse(boardKey);
  if (!boardKeyParsed.success) {
    throw new Error("INVALID_BOARD_KEY");
  }

  const entriesByBoard = await loadEntriesByBoard(userEmail);
  const currentEntries = [...(entriesByBoard[boardKey] || [])];
  const existingIndex = currentEntries.findIndex((entry) => entry.date === date);
  const nowIso = new Date().toISOString();

  if (success === null) {
    if (existingIndex !== -1) {
      currentEntries.splice(existingIndex, 1);
    }
  } else {
    const previous = existingIndex === -1 ? null : currentEntries[existingIndex];
    const nextEntry: SpiritualStreakEntry = {
      date,
      success,
      note,
      createdAt: previous?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (existingIndex === -1) {
      currentEntries.push(nextEntry);
    } else {
      currentEntries[existingIndex] = nextEntry;
    }
  }

  const normalized = normalizeSpiritualStreakEntries(currentEntries);
  await saveBoardEntries(userEmail, boardKey, normalized);

  const boards = await getEnabledSpiritualStreakConfigsForUser(userEmail);
  const boardConfig = boards.find((board) => board.key === boardKey);
  return buildSpiritualStreakBoard(boardKey, normalized, monthKey, todayIso, boardConfig);
}
