import type {
  SpiritualStreakBoard,
  SpiritualStreakBoardKey,
  SpiritualStreakEntry,
  SpiritualStreaksPageData,
} from "./types";

type SpiritualStreakBoardMeta = {
  key: SpiritualStreakBoardKey;
  title: string;
  accentColor: string;
  successRule: "completed_today" | "clean_day";
  quickPrompt: string;
  yesLabel: string;
  noLabel: string;
  emptyLabel: string;
};

export const SPIRITUAL_STREAK_BOARDS: SpiritualStreakBoardMeta[] = [
  {
    key: "daily_text",
    title: "Daily Text Reading",
    accentColor: "#CDA36E",
    successRule: "completed_today",
    quickPrompt: "Completed today?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
  {
    key: "bible_reading",
    title: "Bible Reading",
    accentColor: "#88AFC5",
    successRule: "completed_today",
    quickPrompt: "Completed today?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
  {
    key: "prayer_on_waking",
    title: "Prayer on waking",
    accentColor: "#D6B67A",
    successRule: "completed_today",
    quickPrompt: "Completed today?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
  {
    key: "prayer_before_lunch",
    title: "Prayer before lunch",
    accentColor: "#91A97E",
    successRule: "completed_today",
    quickPrompt: "Completed today?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
  {
    key: "prayer_before_sleep",
    title: "Prayer before sleep",
    accentColor: "#8E93BC",
    successRule: "completed_today",
    quickPrompt: "Completed today?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
  {
    key: "pornography",
    title: "Pornography",
    accentColor: "#93B79B",
    successRule: "clean_day",
    quickPrompt: "Clean day?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
  {
    key: "masturbation",
    title: "Masturbation",
    accentColor: "#B59EB3",
    successRule: "clean_day",
    quickPrompt: "Clean day?",
    yesLabel: "Yes",
    noLabel: "No",
    emptyLabel: "Not marked",
  },
];

export function getSpiritualStreakMeta(key: SpiritualStreakBoardKey) {
  return (
    SPIRITUAL_STREAK_BOARDS.find((item) => item.key === key) ||
    SPIRITUAL_STREAK_BOARDS[0]
  );
}

function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split("-").map((value) => Number(value));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcIso(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysIso(iso: string, days: number) {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcIso(date);
}

export function shiftMonthKey(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getMonthInfo(monthKey: string) {
  const [year, month] = monthKey.split("-").map((value) => Number(value));
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(firstDay);

  return {
    year,
    month,
    daysInMonth,
    firstWeekday: firstDay.getUTCDay(),
    monthLabel,
  };
}

export function formatDisplayDate(iso: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseIsoDate(iso));
}

function compareIsoDates(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function normalizeSpiritualStreakEntries(entries: SpiritualStreakEntry[]) {
  const byDate = new Map<string, SpiritualStreakEntry>();

  entries.forEach((entry) => {
    if (!entry?.date) return;
    byDate.set(entry.date, {
      date: entry.date,
      success: Boolean(entry.success),
      note: entry.note ?? null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  });

  return Array.from(byDate.values()).sort((a, b) => compareIsoDates(a.date, b.date));
}

export function computeCurrentSpiritualStreak(
  entries: SpiritualStreakEntry[],
  todayIso: string
) {
  const byDate = new Map(entries.map((entry) => [entry.date, entry.success]));
  let streak = 0;
  let cursor = todayIso;

  while (byDate.get(cursor) === true) {
    streak += 1;
    cursor = addDaysIso(cursor, -1);
  }

  return streak;
}

export function computeBestSpiritualStreak(entries: SpiritualStreakEntry[]) {
  if (!entries.length) return 0;

  let best = 0;
  let current = 0;
  let previousDate: string | null = null;
  let previousSuccess = false;

  entries.forEach((entry) => {
    const consecutive = previousDate
      ? addDaysIso(previousDate, 1) === entry.date
      : false;

    if (entry.success) {
      current = consecutive && previousSuccess ? current + 1 : 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }

    previousDate = entry.date;
    previousSuccess = entry.success;
  });

  return best;
}

export function buildSpiritualStreakBoard(
  key: SpiritualStreakBoardKey,
  entries: SpiritualStreakEntry[],
  monthKey: string,
  todayIso: string
): SpiritualStreakBoard {
  const meta = getSpiritualStreakMeta(key);
  const normalizedEntries = normalizeSpiritualStreakEntries(entries);
  const entryMap = new Map(normalizedEntries.map((entry) => [entry.date, entry]));
  const { daysInMonth, firstWeekday } = getMonthInfo(monthKey);

  const cells = Array.from({ length: daysInMonth }, (_, index) => {
    const dayNumber = index + 1;
    const date = `${monthKey}-${String(dayNumber).padStart(2, "0")}`;
    const entry = entryMap.get(date) || null;
    const success = entry ? entry.success : null;
    return {
      date,
      dayNumber,
      success,
      note: entry?.note ?? null,
      isToday: date === todayIso,
      isFuture: date > todayIso,
      state: success === true ? "success" : success === false ? "failure" : "unmarked",
    };
  });

  const monthSuccessDays = cells.filter((cell) => cell.success === true).length;
  const monthMarkedDays = cells.filter((cell) => cell.success !== null).length;
  const todayStatus = entryMap.get(todayIso)?.success ?? null;

  return {
    key,
    title: meta.title,
    accentColor: meta.accentColor,
    successRule: meta.successRule,
    quickPrompt: meta.quickPrompt,
    yesLabel: meta.yesLabel,
    noLabel: meta.noLabel,
    emptyLabel: meta.emptyLabel,
    currentStreak: computeCurrentSpiritualStreak(normalizedEntries, todayIso),
    bestStreak: computeBestSpiritualStreak(normalizedEntries),
    monthSuccessDays,
    monthMarkedDays,
    monthTotalDays: daysInMonth,
    firstWeekday,
    summaryText: `${monthSuccessDays}/${daysInMonth} success days`,
    todayStatus,
    cells,
  };
}

export function buildSpiritualStreaksPageData(args: {
  monthKey: string;
  todayIso: string;
  entriesByBoard: Record<SpiritualStreakBoardKey, SpiritualStreakEntry[]>;
}): SpiritualStreaksPageData {
  const { monthKey, todayIso, entriesByBoard } = args;
  const { monthLabel } = getMonthInfo(monthKey);

  return {
    monthKey,
    monthLabel,
    todayIso,
    boards: SPIRITUAL_STREAK_BOARDS.map((board) =>
      buildSpiritualStreakBoard(board.key, entriesByBoard[board.key] || [], monthKey, todayIso)
    ),
  };
}
