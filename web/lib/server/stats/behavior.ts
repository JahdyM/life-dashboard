import { prisma } from "@/lib/db/prisma";
import { format, parseISO, startOfWeek, endOfWeek, subDays, addDays } from "date-fns";
import type {
  AnxietyTrendResponse,
  CoupleComparisonResponse,
  LifeBalanceResponse,
  MoodCorrelationResponse,
  ProductivityHeatmapResponse,
  SleepScoreResponse,
  WeeklyReportResponse,
} from "@/lib/types";
import { allowedEmails } from "@/lib/env";

const POSITIVE_MOODS = new Set(["peace", "joy", "paz", "felicidade"]);
const NEGATIVE_MOODS = new Set(["anxiety", "fear", "anger", "ansiedade", "medo", "raiva"]);

const HABIT_FIELDS = [
  { key: "bible_reading", label: "Bible reading", field: "bibleReading" },
  { key: "bible_study", label: "Bible study", field: "bibleStudy" },
  { key: "dissertation_work", label: "Dissertation work", field: "dissertationWork" },
  { key: "workout", label: "Workout", field: "workout" },
  { key: "general_reading", label: "General reading", field: "generalReading" },
  { key: "shower", label: "Shower", field: "shower" },
  { key: "daily_text", label: "Daily text", field: "dailyText" },
  { key: "meeting_attended", label: "Meeting attended", field: "meetingAttended" },
  { key: "prepare_meeting", label: "Prepare meeting", field: "prepareMeeting" },
  { key: "family_worship", label: "Family worship", field: "familyWorship" },
  { key: "writing", label: "Writing", field: "writing" },
  { key: "scientific_writing", label: "Scientific writing", field: "scientificWriting" },
] as const;

type HabitFieldName = (typeof HABIT_FIELDS)[number]["field"];

type PeriodKey = "30d" | "90d" | "all";

type EntrySlice = {
  date: string;
  moodCategory: string | null;
  sleepHours: number | null;
  anxietyLevel: number | null;
  workHours: number | null;
  boredomMinutes: number | null;
} & Record<HabitFieldName, number | null>;

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const round2 = (value: number | null) =>
  value === null || Number.isNaN(value) ? null : Math.round(value * 100) / 100;

const round1 = (value: number | null) =>
  value === null || Number.isNaN(value) ? null : Math.round(value * 10) / 10;

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

const average = (values: number[]) => {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const normalizeMood = (mood?: string | null) =>
  String(mood || "")
    .trim()
    .toLowerCase();

const isPositiveMood = (mood?: string | null) => POSITIVE_MOODS.has(normalizeMood(mood));
const isNegativeMood = (mood?: string | null) => NEGATIVE_MOODS.has(normalizeMood(mood));

const habitCountForEntry = (entry: EntrySlice) =>
  HABIT_FIELDS.reduce((count, habit) => count + (entry[habit.field] ? 1 : 0), 0);

const moodToScore = (mood?: string | null) => {
  const key = normalizeMood(mood);
  if (!key) return 55;
  if (key === "peace" || key === "joy" || key === "paz" || key === "felicidade") return 100;
  if (key === "neutral" || key === "neutro") return 60;
  if (key === "anxiety" || key === "ansiedade") return 35;
  if (key === "fear" || key === "medo") return 30;
  if (key === "anger" || key === "raiva") return 20;
  return 55;
};

const durationSleepScore = (sleepHours: number | null) => {
  if (sleepHours === null || Number.isNaN(Number(sleepHours))) return 50;
  const diff = Math.abs(Number(sleepHours) - 7.5);
  return clamp((1 - diff / 2.5) * 100);
};

const getWeekKey = (dateIso: string) => {
  const date = parseISO(dateIso);
  return format(date, "yyyy-'W'II");
};

const parsePeriodDays = (period: PeriodKey): number | null => {
  if (period === "30d") return 30;
  if (period === "90d") return 90;
  return null;
};

const buildEntrySelect = () => ({
  date: true,
  moodCategory: true,
  sleepHours: true,
  anxietyLevel: true,
  workHours: true,
  boredomMinutes: true,
  bibleReading: true,
  bibleStudy: true,
  dissertationWork: true,
  workout: true,
  generalReading: true,
  shower: true,
  dailyText: true,
  meetingAttended: true,
  prepareMeeting: true,
  familyWorship: true,
  writing: true,
  scientificWriting: true,
});

async function resolveWindow(userEmail: string, period: PeriodKey) {
  const today = new Date();
  const todayIso = format(today, "yyyy-MM-dd");
  const periodDays = parsePeriodDays(period);
  if (periodDays) {
    const startIso = format(subDays(today, periodDays - 1), "yyyy-MM-dd");
    return { startIso, endIso: todayIso };
  }
  const first = await prisma.dailyEntryUser.findFirst({
    where: { userEmail },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  return {
    startIso: first?.date || todayIso,
    endIso: todayIso,
  };
}

async function loadEntriesForWindow(
  userEmail: string,
  startIso: string,
  endIso: string
): Promise<EntrySlice[]> {
  const rows = await prisma.dailyEntryUser.findMany({
    where: {
      userEmail,
      date: {
        gte: startIso,
        lte: endIso,
      },
    },
    select: buildEntrySelect(),
    orderBy: { date: "asc" },
  });
  return rows as unknown as EntrySlice[];
}

function startOfIsoWeekFromKey(week?: string | null) {
  if (!week) return startOfWeek(new Date(), { weekStartsOn: 1 });
  const match = /^(\d{4})-W(\d{2})$/.exec(String(week));
  if (!match) return startOfWeek(new Date(), { weekStartsOn: 1 });
  const year = Number(match[1]);
  const weekNumber = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 53) {
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  }
  const jan4 = new Date(year, 0, 4);
  const jan4Weekday = (jan4.getDay() + 6) % 7;
  const week1Start = new Date(jan4);
  week1Start.setDate(jan4.getDate() - jan4Weekday);
  const target = addDays(week1Start, (weekNumber - 1) * 7);
  return startOfWeek(target, { weekStartsOn: 1 });
}

export async function getMoodHabitCorrelations(
  userEmail: string,
  period: PeriodKey
): Promise<MoodCorrelationResponse> {
  const window = await resolveWindow(userEmail, period);
  const entries = await loadEntriesForWindow(userEmail, window.startIso, window.endIso);
  const moodEntries = entries.filter((entry) => Boolean(normalizeMood(entry.moodCategory)));

  const rows = HABIT_FIELDS.map((habit) => {
    const withHabit = moodEntries.filter((entry) => Boolean(entry[habit.field]));
    const withoutHabit = moodEntries.filter((entry) => !entry[habit.field]);
    const withRate = withHabit.length
      ? (withHabit.filter((entry) => isPositiveMood(entry.moodCategory)).length / withHabit.length) *
        100
      : null;
    const withoutRate = withoutHabit.length
      ? (withoutHabit.filter((entry) => isPositiveMood(entry.moodCategory)).length / withoutHabit.length) *
        100
      : null;
    const impact =
      withRate === null || withoutRate === null ? null : withRate - withoutRate;
    return {
      key: habit.key,
      label: habit.label,
      withHabitRate: round1(withRate),
      withoutHabitRate: round1(withoutRate),
      impact: round1(impact),
      withHabitDays: withHabit.length,
      withoutHabitDays: withoutHabit.length,
    };
  }).sort((a, b) => (b.impact ?? -999) - (a.impact ?? -999));

  const top = rows.find((item) => item.impact !== null);
  const insight = top
    ? `${top.label}: ${top.impact! >= 0 ? "+" : ""}${top.impact}% positive mood impact`
    : "Not enough mood + habit data yet.";

  return {
    period,
    positiveMoods: ["peace", "joy"],
    rows,
    insight,
  };
}

export async function getAnxietyTrend(
  userEmail: string,
  periodDays: 30 | 90
): Promise<AnxietyTrendResponse> {
  const today = new Date();
  const startIso = format(subDays(today, periodDays - 1), "yyyy-MM-dd");
  const endIso = format(today, "yyyy-MM-dd");
  const entries = await loadEntriesForWindow(userEmail, startIso, endIso);
  const scoped = entries
    .filter((entry) => typeof entry.anxietyLevel === "number")
    .map((entry) => ({
      date: entry.date,
      anxiety: Number(entry.anxietyLevel || 0),
      sleepHours: entry.sleepHours,
    }));

  const points = scoped.map((entry, index) => {
    const start = Math.max(0, index - 6);
    const window = scoped.slice(start, index + 1);
    const movingAverage7 =
      window.reduce((sum, item) => sum + item.anxiety, 0) / window.length;
    return {
      date: entry.date,
      anxiety: entry.anxiety,
      movingAverage7: round2(movingAverage7) || 0,
    };
  });

  let currentStreak = 0;
  let maxStreak = 0;
  let rolling = 0;
  let previousDate: Date | null = null;
  scoped.forEach((entry) => {
    const parsed = parseISO(entry.date);
    const isConsecutive =
      previousDate &&
      Math.round((parsed.getTime() - previousDate.getTime()) / 86400000) === 1;
    if (entry.anxiety >= 7) {
      rolling = isConsecutive ? rolling + 1 : 1;
      if (rolling > maxStreak) maxStreak = rolling;
    } else {
      rolling = 0;
    }
    previousDate = parsed;
  });
  currentStreak = rolling;

  const lowSleepValues = scoped
    .filter((item) => typeof item.sleepHours === "number" && Number(item.sleepHours) < 6)
    .map((item) => item.anxiety);
  const regularSleepValues = scoped
    .filter((item) => typeof item.sleepHours === "number" && Number(item.sleepHours) >= 6)
    .map((item) => item.anxiety);

  return {
    periodDays,
    points,
    highAnxietyCurrentStreak: currentStreak,
    highAnxietyMaxStreak: maxStreak,
    alert:
      currentStreak >= 3
        ? `Anxiety >= 7 for ${currentStreak} consecutive days. Consider reducing load and adding recovery blocks.`
        : null,
    sleepCorrelation: {
      lowSleepAverage: round2(average(lowSleepValues)),
      regularSleepAverage: round2(average(regularSleepValues)),
      sampleLowSleep: lowSleepValues.length,
      sampleRegularSleep: regularSleepValues.length,
    },
  };
}

export async function getSleepScore(userEmail: string): Promise<SleepScoreResponse> {
  const today = new Date();
  const startIso = format(subDays(today, 89), "yyyy-MM-dd");
  const endIso = format(today, "yyyy-MM-dd");
  const entries = await loadEntriesForWindow(userEmail, startIso, endIso);
  const sleepEntries = entries.filter((entry) => typeof entry.sleepHours === "number");

  const durationValues = sleepEntries.map((entry) => durationSleepScore(entry.sleepHours));
  const duration = clamp(average(durationValues) ?? 0);

  const lastSeven = sleepEntries.slice(-7).map((entry) => Number(entry.sleepHours || 0));
  const avgLastSeven = average(lastSeven) ?? 0;
  const variance =
    lastSeven.length > 1
      ? lastSeven.reduce((sum, value) => sum + (value - avgLastSeven) ** 2, 0) /
        lastSeven.length
      : 0;
  const stdDev = Math.sqrt(variance);
  const consistency = clamp((1 - stdDev / 3) * 100);

  const completionRatio = (entry: EntrySlice) => habitCountForEntry(entry) / HABIT_FIELDS.length;
  const goodDays = sleepEntries.filter((entry) => {
    const value = Number(entry.sleepHours || 0);
    return value >= 7 && value <= 8.5;
  });
  const badDays = sleepEntries.filter((entry) => {
    const value = Number(entry.sleepHours || 0);
    return value < 6 || value > 9;
  });
  const goodAvg = average(goodDays.map(completionRatio));
  const badAvg = average(badDays.map(completionRatio));
  let impact = 50;
  if (goodAvg !== null && badAvg !== null) {
    impact = clamp(50 + (goodAvg - badAvg) * 200);
  } else if (goodAvg !== null) {
    impact = clamp(45 + goodAvg * 55);
  }

  const score = clamp(duration * 0.4 + consistency * 0.3 + impact * 0.3);

  const trend14 = sleepEntries.slice(-14).map((entry) => ({
    date: entry.date,
    score: Math.round(durationSleepScore(entry.sleepHours)),
  }));

  let insight = "Build consistency with fixed sleep/wake windows to improve recovery.";
  if (score >= 75) {
    insight = "Sleep quality is strong. Keep protecting your bedtime consistency.";
  } else if (score < 50) {
    insight = "Sleep quality is fragile. Prioritize 7-8h windows and reduce late-night load.";
  }

  return {
    score: Math.round(score),
    components: {
      duration: Math.round(duration),
      consistency: Math.round(consistency),
      impact: Math.round(impact),
    },
    trend14,
    insight,
  };
}

function computeWeekMetrics(entries: EntrySlice[], startIso: string, endIso: string) {
  const dateToEntry = new Map(entries.map((entry) => [entry.date, entry]));
  const start = parseISO(startIso);
  const dates = Array.from({ length: 7 }, (_, index) => format(addDays(start, index), "yyyy-MM-dd"));
  const weekEntries = dates.map((date) => dateToEntry.get(date)).filter(Boolean) as EntrySlice[];
  const habitsCompleted = dates.reduce((sum, date) => {
    const entry = dateToEntry.get(date);
    if (!entry) return sum;
    return sum + habitCountForEntry(entry);
  }, 0);
  const habitsTotal = dates.length * HABIT_FIELDS.length;
  const habitsCompletionPercent = habitsTotal ? (habitsCompleted / habitsTotal) * 100 : 0;
  const moodCounts = new Map<string, number>();
  weekEntries.forEach((entry) => {
    const mood = normalizeMood(entry.moodCategory);
    if (!mood) return;
    moodCounts.set(mood, (moodCounts.get(mood) || 0) + 1);
  });
  const moodPredominant =
    moodCounts.size > 0
      ? Array.from(moodCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : null;
  const negativeMoodDays = weekEntries.filter((entry) => isNegativeMood(entry.moodCategory)).length;
  const workHoursTotal = weekEntries.reduce((sum, entry) => sum + Number(entry.workHours || 0), 0);
  const topHabits = HABIT_FIELDS.map((habit) => {
    const value = weekEntries.reduce((sum, entry) => sum + (entry[habit.field] ? 1 : 0), 0);
    return { key: habit.key, label: habit.label, value };
  })
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  return {
    habitsCompletionPercent,
    moodPredominant,
    negativeMoodDays,
    workHoursTotal,
    topHabits,
  };
}

export async function getWeeklyReport(
  userEmail: string,
  week?: string | null
): Promise<WeeklyReportResponse> {
  const currentStart = startOfIsoWeekFromKey(week);
  const currentEnd = endOfWeek(currentStart, { weekStartsOn: 1 });
  const previousStart = subDays(currentStart, 7);
  const previousEnd = subDays(currentEnd, 7);

  const startIso = format(previousStart, "yyyy-MM-dd");
  const endIso = format(currentEnd, "yyyy-MM-dd");
  const entries = await loadEntriesForWindow(userEmail, startIso, endIso);

  const current = computeWeekMetrics(
    entries.filter((entry) => entry.date >= format(currentStart, "yyyy-MM-dd") && entry.date <= format(currentEnd, "yyyy-MM-dd")),
    format(currentStart, "yyyy-MM-dd"),
    format(currentEnd, "yyyy-MM-dd")
  );
  const previous = computeWeekMetrics(
    entries.filter((entry) => entry.date >= format(previousStart, "yyyy-MM-dd") && entry.date <= format(previousEnd, "yyyy-MM-dd")),
    format(previousStart, "yyyy-MM-dd"),
    format(previousEnd, "yyyy-MM-dd")
  );

  const habitsDelta = current.habitsCompletionPercent - previous.habitsCompletionPercent;
  const workHoursDelta = current.workHoursTotal - previous.workHoursTotal;
  const negativeMoodDelta = current.negativeMoodDays - previous.negativeMoodDays;

  let message = "Stable week. Keep the current rhythm.";
  if (habitsDelta > 5) {
    message = "Great weekly consistency gain. Protect this routine next week.";
  } else if (habitsDelta < -5) {
    message = "Consistency dropped versus last week. Reduce scope and focus on core habits.";
  }

  return {
    week: `${format(currentStart, "yyyy")}-W${format(currentStart, "II")}`,
    habitsCompletionPercent: round1(current.habitsCompletionPercent) || 0,
    moodPredominant: current.moodPredominant,
    negativeMoodDays: current.negativeMoodDays,
    workHoursTotal: round1(current.workHoursTotal) || 0,
    topHabits: current.topHabits,
    comparison: {
      habitsDelta: round1(habitsDelta) || 0,
      workHoursDelta: round1(workHoursDelta) || 0,
      negativeMoodDelta: round1(negativeMoodDelta) || 0,
    },
    message,
  };
}

export async function getProductivityHeatmap(
  userEmail: string,
  period: PeriodKey
): Promise<ProductivityHeatmapResponse> {
  const window = await resolveWindow(userEmail, period);
  const entries = await loadEntriesForWindow(userEmail, window.startIso, window.endIso);

  const perWeek = new Map<string, number[]>();
  const weekdayScores = Array.from({ length: 7 }, () => [] as number[]);

  entries.forEach((entry) => {
    const date = parseISO(entry.date);
    const weekdayIndex = (date.getDay() + 6) % 7;
    const habitScore = (habitCountForEntry(entry) / HABIT_FIELDS.length) * 100;
    const workScore = clamp((Number(entry.workHours || 0) / 8) * 100);
    const moodScore = moodToScore(entry.moodCategory);
    const score = clamp(habitScore * 0.45 + workScore * 0.35 + moodScore * 0.2);
    const weekLabel = getWeekKey(entry.date);
    if (!perWeek.has(weekLabel)) {
      perWeek.set(weekLabel, Array.from({ length: 7 }, () => -1));
    }
    const row = perWeek.get(weekLabel)!;
    row[weekdayIndex] = score;
    weekdayScores[weekdayIndex].push(score);
  });

  const weeks = Array.from(perWeek.keys()).sort();
  const matrix = weeks.map((week) =>
    perWeek
      .get(week)!
      .map((score) => (score < 0 ? 0 : Math.round(score)))
  );
  const weekdays = WEEKDAY_LABELS.map((label, index) => ({
    index,
    label,
    averageScore: Math.round(average(weekdayScores[index]) || 0),
  }));

  const best = [...weekdays].sort((a, b) => b.averageScore - a.averageScore)[0];
  const worst = [...weekdays].sort((a, b) => a.averageScore - b.averageScore)[0];

  return {
    period,
    weeks,
    weekdays,
    matrix,
    insight: `Best weekday: ${best.label} (${best.averageScore}). Weakest: ${worst.label} (${worst.averageScore}).`,
  };
}

export async function getLifeBalanceScore(userEmail: string): Promise<LifeBalanceResponse> {
  const today = new Date();
  const startIso = format(subDays(today, 29), "yyyy-MM-dd");
  const endIso = format(today, "yyyy-MM-dd");
  const entries = await loadEntriesForWindow(userEmail, startIso, endIso);
  const taskRows = await prisma.todoTask.findMany({
    where: {
      userEmail,
      scheduledDate: {
        gte: startIso,
        lte: endIso,
      },
    },
    select: {
      scheduledDate: true,
      isDone: true,
    },
  });

  const taskByDate = new Map<string, { total: number; done: number }>();
  taskRows.forEach((task) => {
    const key = task.scheduledDate || "";
    if (!key) return;
    const aggregate = taskByDate.get(key) || { total: 0, done: 0 };
    aggregate.total += 1;
    if (task.isDone) aggregate.done += 1;
    taskByDate.set(key, aggregate);
  });

  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const trend: Array<{ date: string; score: number }> = [];
  const trendDates = Array.from(
    new Set([
      ...entries.map((entry) => entry.date),
      ...Array.from(taskByDate.entries())
        .filter(([, aggregate]) => aggregate.total > 0)
        .map(([date]) => date),
    ])
  ).sort();

  for (const dayIso of trendDates) {
    const entry = byDate.get(dayIso);
    const taskAggregate = taskByDate.get(dayIso) || { total: 0, done: 0 };

    const physical = clamp(
      (entry?.workout ? 100 : 30) * 0.4 +
        durationSleepScore(entry?.sleepHours ?? null) * 0.35 +
        clamp(100 - (Number(entry?.boredomMinutes || 0) / 240) * 100) * 0.25
    );
    const mental = clamp(
      moodToScore(entry?.moodCategory) * 0.55 +
        (entry?.anxietyLevel ? 100 - ((entry.anxietyLevel - 1) / 9) * 100 : 55) * 0.45
    );
    const spiritualFields: HabitFieldName[] = [
      "bibleReading",
      "dailyText",
      "meetingAttended",
      "prepareMeeting",
      "familyWorship",
    ];
    const spiritualDone = spiritualFields.reduce(
      (sum, field) => sum + ((entry?.[field] as number | null) ? 1 : 0),
      0
    );
    const spiritual = clamp((spiritualDone / spiritualFields.length) * 100);
    const productivity = clamp(
      clamp((Number(entry?.workHours || 0) / 8) * 100) * 0.6 +
        (taskAggregate.total > 0 ? (taskAggregate.done / taskAggregate.total) * 100 : 60) * 0.4
    );
    const score = clamp(
      physical * 0.3 + mental * 0.25 + spiritual * 0.25 + productivity * 0.2
    );
    trend.push({
      date: dayIso,
      score: Math.round(score),
    });
  }

  if (!trend.length) {
    return {
      score: 0,
      breakdown: {
        physical: 0,
        mental: 0,
        spiritual: 0,
        productivity: 0,
      },
      trend: [],
      insight: "No life-balance data in the last 30 days yet.",
    };
  }

  const latest = trend[trend.length - 1] || { date: endIso, score: 0 };
  const latestEntry = byDate.get(latest.date);
  const latestHabitsDone = latestEntry ? habitCountForEntry(latestEntry) : 0;
  const nowIso = new Date().toISOString();
  await prisma.daySnapshotCache.upsert({
    where: {
      userEmail_date: {
        userEmail,
        date: latest.date,
      },
    },
    update: {
      habitsCompleted: latestHabitsDone,
      habitsTotal: HABIT_FIELDS.length,
      habitsPercent: round2((latestHabitsDone / HABIT_FIELDS.length) * 100),
      lifeBalanceScore: latest.score,
      updatedAt: nowIso,
    },
    create: {
      userEmail,
      date: latest.date,
      habitsCompleted: latestHabitsDone,
      habitsTotal: HABIT_FIELDS.length,
      habitsPercent: round2((latestHabitsDone / HABIT_FIELDS.length) * 100),
      lifeBalanceScore: latest.score,
      updatedAt: nowIso,
    },
  });

  const physical = Math.round(average(trend.map((item) => item.score)) || 0);
  // Keep category balance explicit from latest day to help actionability.
  const latestDay = byDate.get(latest.date);
  const latestTask = taskByDate.get(latest.date) || { total: 0, done: 0 };
  const breakdown = {
    physical: Math.round(
      clamp(
        (latestDay?.workout ? 100 : 30) * 0.4 +
          durationSleepScore(latestDay?.sleepHours ?? null) * 0.35 +
          clamp(100 - (Number(latestDay?.boredomMinutes || 0) / 240) * 100) * 0.25
      )
    ),
    mental: Math.round(
      clamp(
        moodToScore(latestDay?.moodCategory) * 0.55 +
          (latestDay?.anxietyLevel
            ? 100 - ((latestDay.anxietyLevel - 1) / 9) * 100
            : 55) *
            0.45
      )
    ),
    spiritual: Math.round(
      clamp(
        ([
          latestDay?.bibleReading,
          latestDay?.dailyText,
          latestDay?.meetingAttended,
          latestDay?.prepareMeeting,
          latestDay?.familyWorship,
        ].filter(Boolean).length /
          5) *
          100
      )
    ),
    productivity: Math.round(
      clamp(
        clamp((Number(latestDay?.workHours || 0) / 8) * 100) * 0.6 +
          (latestTask.total > 0 ? (latestTask.done / latestTask.total) * 100 : 60) * 0.4
      )
    ),
  };
  const weakest = Object.entries(breakdown).sort((a, b) => a[1] - b[1])[0];

  return {
    score: latest.score,
    breakdown,
    trend,
    insight:
      weakest && weakest[0]
        ? `Lowest pillar today: ${weakest[0]} (${weakest[1]}). Improve this first for fastest balance gain.`
        : `Current life balance baseline: ${physical}.`,
  };
}

export async function getExportPayload(
  userEmail: string,
  startIso: string,
  endIso: string
) {
  const [entries, tasks] = await Promise.all([
    prisma.dailyEntryUser.findMany({
      where: {
        userEmail,
        date: {
          gte: startIso,
          lte: endIso,
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.todoTask.findMany({
      where: {
        userEmail,
        OR: [
          {
            scheduledDate: {
              gte: startIso,
              lte: endIso,
            },
          },
          { completedAt: { gte: `${startIso}T00:00:00`, lte: `${endIso}T23:59:59` } },
        ],
      },
      include: {
        subtasks: true,
      },
      orderBy: [{ scheduledDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    range: { start: startIso, end: endIso },
    entries,
    tasks,
  };
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toExportCsv(payload: Awaited<ReturnType<typeof getExportPayload>>) {
  const header = [
    "type",
    "date",
    "id",
    "title",
    "mood",
    "sleep_hours",
    "anxiety_level",
    "work_hours",
    "boredom_minutes",
    "priority_tag",
    "is_done",
    "estimated_minutes",
    "actual_minutes",
    "completed_at",
  ];
  const lines = [header.join(",")];

  payload.entries.forEach((entry) => {
    lines.push(
      [
        "entry",
        entry.date,
        "",
        "",
        entry.moodCategory || "",
        entry.sleepHours ?? "",
        entry.anxietyLevel ?? "",
        entry.workHours ?? "",
        entry.boredomMinutes ?? "",
        "",
        "",
        "",
        "",
        "",
      ]
        .map(csvEscape)
        .join(",")
    );
  });

  payload.tasks.forEach((task) => {
    lines.push(
      [
        "task",
        task.scheduledDate || "",
        task.id,
        task.title,
        "",
        "",
        "",
        "",
        "",
        task.priorityTag || "",
        task.isDone || 0,
        task.estimatedMinutes ?? "",
        task.actualMinutes ?? "",
        task.completedAt ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );
    task.subtasks.forEach((subtask) => {
      lines.push(
        [
          "subtask",
          task.scheduledDate || "",
          subtask.id,
          subtask.title,
          "",
          "",
          "",
          "",
          "",
          subtask.priorityTag || "",
          subtask.isDone || 0,
          subtask.estimatedMinutes ?? "",
          subtask.actualMinutes ?? "",
          subtask.completedAt ?? "",
        ]
          .map(csvEscape)
          .join(",")
      );
    });
  });

  return lines.join("\n");
}

export async function getCoupleComparison(
  userEmail: string,
  periodDays = 30
): Promise<CoupleComparisonResponse> {
  const partnerEmail = allowedEmails.find((email) => email !== userEmail) || null;
  if (!partnerEmail) {
    return {
      periodDays,
      users: [
        {
          email: userEmail,
          name: userEmail.split("@")[0],
          sleepAvg: null,
          anxietyAvg: null,
          habitCompletionRate: null,
        },
      ],
      notes: ["Partner not configured yet."],
    };
  }

  const today = new Date();
  const startIso = format(subDays(today, periodDays - 1), "yyyy-MM-dd");
  const endIso = format(today, "yyyy-MM-dd");
  const entries = await prisma.dailyEntryUser.findMany({
    where: {
      userEmail: { in: [userEmail, partnerEmail] },
      date: { gte: startIso, lte: endIso },
    },
    select: {
      userEmail: true,
      sleepHours: true,
      anxietyLevel: true,
      bibleReading: true,
      bibleStudy: true,
      dissertationWork: true,
      workout: true,
      generalReading: true,
      shower: true,
      dailyText: true,
      meetingAttended: true,
      prepareMeeting: true,
      familyWorship: true,
      writing: true,
      scientificWriting: true,
    },
  });

  const buildForUser = (email: string) => {
    const scoped = entries.filter((entry) => entry.userEmail === email);
    const sleepAvg = average(
      scoped
        .map((entry) => Number(entry.sleepHours))
        .filter((value) => Number.isFinite(value))
    );
    const anxietyAvg = average(
      scoped
        .map((entry) => Number(entry.anxietyLevel))
        .filter((value) => Number.isFinite(value))
    );
    const habitCompletionRate = average(
      scoped.map((entry) => {
        const normalized = entry as unknown as EntrySlice;
        return (habitCountForEntry(normalized) / HABIT_FIELDS.length) * 100;
      })
    );
    return {
      email,
      name: email.split("@")[0],
      sleepAvg: round2(sleepAvg),
      anxietyAvg: round2(anxietyAvg),
      habitCompletionRate: round1(habitCompletionRate),
    };
  };

  const first = buildForUser(userEmail);
  const second = buildForUser(partnerEmail);
  const notes: string[] = [];
  if ((first.sleepAvg ?? 0) + 0.3 < (second.sleepAvg ?? 0)) {
    notes.push(`${first.name} may need more sleep support this week.`);
  } else if ((second.sleepAvg ?? 0) + 0.3 < (first.sleepAvg ?? 0)) {
    notes.push(`${second.name} may need more sleep support this week.`);
  }
  if ((first.anxietyAvg ?? 0) > (second.anxietyAvg ?? 0) + 0.5) {
    notes.push(`${first.name} shows higher anxiety trend. Prioritize lighter days and check-ins.`);
  } else if ((second.anxietyAvg ?? 0) > (first.anxietyAvg ?? 0) + 0.5) {
    notes.push(`${second.name} shows higher anxiety trend. Prioritize lighter days and check-ins.`);
  }
  if (!notes.length) {
    notes.push("Both trends are close. Keep mutual support and weekly check-ins.");
  }

  return {
    periodDays,
    users: [first, second],
    notes,
  };
}
