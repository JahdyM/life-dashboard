import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  getDaysInMonth,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type {
  MinistryDailyEntry,
  MinistryDayComputed,
  MinistryDayStatus,
  MinistryMonthPayload,
  MinistryMonthSummary,
  MinistryPaceStatus,
} from "./types";

export function monthKeyFromDate(date: Date) {
  return format(date, "yyyy-MM");
}

export function parseMonthKey(monthKey: string) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error("Invalid month key");
  }
  return { year, month };
}

export function monthKeyToDate(monthKey: string) {
  return parseISO(`${monthKey}-01`);
}

export function monthKeyToRange(monthKey: string) {
  const monthDate = monthKeyToDate(monthKey);
  return {
    monthDate,
    startIso: format(startOfMonth(monthDate), "yyyy-MM-dd"),
    endIso: format(endOfMonth(monthDate), "yyyy-MM-dd"),
    ...parseMonthKey(monthKey),
  };
}

export function formatMinutes(totalMinutes: number | null | undefined) {
  if (totalMinutes == null) return "—";
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function minutesToParts(totalMinutes: number | null | undefined) {
  const safe = Math.max(0, Math.round(totalMinutes || 0));
  return {
    hours: Math.floor(safe / 60),
    minutes: safe % 60,
  };
}

export function hoursMinutesToTotalMinutes(hours: number, minutes: number) {
  const safeHours = Math.max(0, Math.trunc(hours || 0));
  const safeMinutes = Math.max(0, Math.trunc(minutes || 0));
  return safeHours * 60 + safeMinutes;
}

export function deriveMinistryDayStatus(
  goalMinutes: number | null,
  actualMinutes: number | null,
  options?: {
    isFuture?: boolean;
    isToday?: boolean;
  }
): MinistryDayStatus {
  if (goalMinutes == null || goalMinutes <= 0) {
    return "no_goal";
  }
  const actual = Math.max(0, actualMinutes || 0);
  if (options?.isFuture && actual === 0) {
    return "planned";
  }
  if (options?.isToday && actual === 0) {
    return "planned";
  }
  if (actual === 0) {
    return "missed";
  }
  if (actual < goalMinutes) {
    return "partial";
  }
  if (actual === goalMinutes) {
    return "met";
  }
  return "exceeded";
}

export function paceLabelFromStatus(status: MinistryPaceStatus) {
  if (status === "ahead") return "Ahead";
  if (status === "behind") return "Behind";
  if (status === "on_track") return "On track";
  return "No goal";
}

export function buildMinistryMonthPayload({
  monthKey,
  todayIso,
  targetMinutes,
  entries,
}: {
  monthKey: string;
  todayIso: string;
  targetMinutes: number | null;
  entries: MinistryDailyEntry[];
}): MinistryMonthPayload {
  const { startIso, endIso, year, month } = monthKeyToRange(monthKey);
  const entryByDate = new Map(entries.map((entry) => [entry.date, entry]));
  const totalCompletedMinutes = entries.reduce(
    (sum, entry) => sum + Math.max(0, entry.actualMinutes || 0),
    0
  );

  const monthStart = parseISO(startIso);
  const monthEnd = parseISO(endIso);
  const todayDate = parseISO(todayIso);
  const cutoff =
    isBefore(todayDate, monthStart) ? null : isAfter(todayDate, monthEnd) ? monthEnd : todayDate;
  const daysInMonth = getDaysInMonth(monthStart);

  const days: MinistryDayComputed[] = [];
  let cursor = monthStart;
  let completedSoFarMinutes = 0;

  while (!isAfter(cursor, monthEnd)) {
    const date = format(cursor, "yyyy-MM-dd");
    const entry = entryByDate.get(date);
    const goalMinutes = entry?.goalMinutes ?? null;
    const actualMinutes = entry?.actualMinutes ?? null;
    const differenceMinutes =
      goalMinutes == null ? null : Math.max(0, actualMinutes || 0) - goalMinutes;
    const isToday = isSameDay(cursor, todayDate);
    const isPast = isBefore(cursor, todayDate) && !isToday;
    const isFuture = isAfter(cursor, todayDate);
    const status = deriveMinistryDayStatus(goalMinutes, actualMinutes, {
      isFuture,
      isToday,
    });

    if (cutoff && !isAfter(cursor, cutoff)) {
      completedSoFarMinutes += Math.max(0, actualMinutes || 0);
    }

    days.push({
      date,
      goalMinutes,
      actualMinutes,
      notes: entry?.notes ?? null,
      differenceMinutes,
      status,
      isToday,
      isPast,
      isFuture,
    });

    cursor = addDays(cursor, 1);
  }

  const elapsedDaysInMonth =
    cutoff == null
      ? 0
      : Math.round((cutoff.getTime() - monthStart.getTime()) / 86_400_000) + 1;
  const dailyTargetMinutes =
    targetMinutes && targetMinutes > 0 ? targetMinutes / daysInMonth : null;
  const expectedByTodayMinutes =
    dailyTargetMinutes == null ? null : dailyTargetMinutes * elapsedDaysInMonth;
  const paceDifferenceMinutes =
    expectedByTodayMinutes == null ? null : completedSoFarMinutes - expectedByTodayMinutes;
  const totalRemainingMinutes =
    targetMinutes == null ? null : Math.max(targetMinutes - completedSoFarMinutes, 0);
  const completionPercent =
    targetMinutes && targetMinutes > 0
      ? Number(((completedSoFarMinutes / targetMinutes) * 100).toFixed(1))
      : null;
  const PACE_TOLERANCE_MINUTES = 15;
  let paceStatus: MinistryPaceStatus = "no_plan";
  if (paceDifferenceMinutes != null) {
    if (paceDifferenceMinutes > PACE_TOLERANCE_MINUTES) {
      paceStatus = "ahead";
    } else if (paceDifferenceMinutes < -PACE_TOLERANCE_MINUTES) {
      paceStatus = "behind";
    } else {
      paceStatus = "on_track";
    }
  }

  const summary: MinistryMonthSummary = {
    monthKey,
    targetMinutes,
    totalCompletedMinutes,
    completedSoFarMinutes,
    totalRemainingMinutes,
    completionPercent,
    daysInMonth,
    elapsedDaysInMonth,
    dailyTargetMinutes,
    expectedByTodayMinutes,
    paceDifferenceMinutes,
    paceStatus,
    paceLabel: paceLabelFromStatus(paceStatus),
  };

  return {
    monthKey,
    todayIso,
    goal:
      targetMinutes == null
        ? null
        : {
            id: `${year}-${month}`,
            year,
            month,
            targetMinutes,
          },
    entries,
    days,
    summary,
  };
}

export function buildMinistryCalendarWeeks(days: MinistryDayComputed[], monthKey: string) {
  const monthStart = startOfMonth(monthKeyToDate(monthKey));
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const byDate = new Map(days.map((day) => [day.date, day]));
  const weeks: Array<Array<MinistryDayComputed | null>> = [];
  let cursor = gridStart;

  while (!isAfter(cursor, gridEnd)) {
    const week: Array<MinistryDayComputed | null> = [];
    for (let index = 0; index < 7; index += 1) {
      const iso = format(cursor, "yyyy-MM-dd");
      week.push(format(cursor, "yyyy-MM") === monthKey ? byDate.get(iso) || null : null);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }

  return weeks;
}
