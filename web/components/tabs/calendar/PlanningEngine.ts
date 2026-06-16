import type { TodoTask } from "@/lib/types";

export type AutoPlanMode = "full" | "order" | "time";

export type PlanningDraftSnapshot = {
  priorityTag: string;
  areaTag: string;
  scheduleLocked: boolean;
  scheduledDate: string;
  scheduledTime: string;
  plannedTime: string;
  estimatedMinutes: number;
};

export type PlanningTaskCandidate = {
  task: TodoTask;
  draft: PlanningDraftSnapshot;
  rank: number;
  tagKey: string;
  isLocked: boolean;
  baseIndex: number;
};

export type PlanningUpdate = {
  id: string;
  focusOrder: number | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  plannedTime?: string | null;
};

export type AutoPlanStats = {
  reorderedCount: number;
  scheduledCount: number;
  unscheduledOverflowCount: number;
  lockedPreservedCount: number;
};

export function normalizePriorityTag(priorityTag: string | null | undefined) {
  const normalized = String(priorityTag || "").trim().toLowerCase();
  if (!normalized || normalized === "medium" || normalized === "med" || normalized === "média" || normalized === "media") {
    return "medium" as const;
  }
  if (normalized === "low" || normalized === "baixa") return "low" as const;
  if (normalized === "high" || normalized === "alta") return "high" as const;
  if (normalized === "critical" || normalized === "crítica" || normalized === "critica") {
    return "critical" as const;
  }
  return "medium" as const;
}

export function taskPriorityWeight(priorityTag: string | null | undefined) {
  const normalized = normalizePriorityTag(priorityTag);
  if (normalized === "low") return 1;
  if (normalized === "medium") return 2;
  return 3;
}

export function priorityRank(priorityTag: string | null | undefined) {
  const normalized = normalizePriorityTag(priorityTag);
  if (normalized === "critical") return 4;
  if (normalized === "high") return 3;
  if (normalized === "medium") return 2;
  return 1;
}

export function normalizeAreaTagForPlanning(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || "__none__";
}

function getTaskFocusOrder(task: Pick<TodoTask, "focusOrder">) {
  const value = Number(task.focusOrder);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function comparePlanningCandidates(left: PlanningTaskCandidate, right: PlanningTaskCandidate) {
  const rankDiff = right.rank - left.rank;
  if (rankDiff !== 0) return rankDiff;

  const leftFocus = getTaskFocusOrder(left.task) ?? Number.MAX_SAFE_INTEGER;
  const rightFocus = getTaskFocusOrder(right.task) ?? Number.MAX_SAFE_INTEGER;
  if (leftFocus !== rightFocus) return leftFocus - rightFocus;

  return String(left.task.createdAt).localeCompare(String(right.task.createdAt));
}

function estimateMinutesForPlanning(candidate: PlanningTaskCandidate) {
  return Math.max(5, Number(candidate.draft.estimatedMinutes || 30));
}

function compareShortFirst(left: PlanningTaskCandidate, right: PlanningTaskCandidate) {
  const durationDiff = estimateMinutesForPlanning(left) - estimateMinutesForPlanning(right);
  if (durationDiff !== 0) return durationDiff;
  return comparePlanningCandidates(left, right);
}

function compareLongFirst(left: PlanningTaskCandidate, right: PlanningTaskCandidate) {
  const durationDiff = estimateMinutesForPlanning(right) - estimateMinutesForPlanning(left);
  if (durationDiff !== 0) return durationDiff;
  return comparePlanningCandidates(left, right);
}

function removePlanningCandidate(
  pool: PlanningTaskCandidate[],
  candidate: PlanningTaskCandidate
) {
  const removeIndex = pool.findIndex((item) => item.task.id === candidate.task.id);
  if (removeIndex >= 0) pool.splice(removeIndex, 1);
}

function pickRhythmCandidate(
  pool: PlanningTaskCandidate[],
  previousTag: string | null,
  preferLong: boolean
) {
  if (!pool.length) return undefined;

  const sorted = [...pool].sort(preferLong ? compareLongFirst : compareShortFirst);
  if (!previousTag) return sorted[0];

  const differentArea = sorted.find((candidate) => candidate.tagKey !== previousTag);
  if (differentArea) return differentArea;

  const shortRepeat = sorted.find((candidate) => estimateMinutesForPlanning(candidate) <= 30);
  return shortRepeat || sorted[0];
}

function pickOpeningCandidate(pool: PlanningTaskCandidate[], previousTag: string | null) {
  if (!pool.length) return undefined;

  const sorted = [...pool].sort(compareShortFirst);
  if (!previousTag) return sorted[0];

  const differentArea = sorted.find((candidate) => candidate.tagKey !== previousTag);
  if (differentArea) return differentArea;

  return sorted[0];
}

function pickDayRhythmCandidate(
  pool: PlanningTaskCandidate[],
  previousTag: string | null,
  unlockedPlacedCount: number
) {
  if (unlockedPlacedCount < 3) {
    return pickOpeningCandidate(pool, previousTag);
  }

  const preferLong = (unlockedPlacedCount - 3) % 2 === 0;
  return pickRhythmCandidate(pool, previousTag, preferLong);
}

export function buildBalancedOrderWithLockedAnchors(candidates: PlanningTaskCandidate[]) {
  if (candidates.length <= 1) return candidates;

  const lockedByIndex = new Map<number, PlanningTaskCandidate>();
  const unlocked = candidates.filter((item) => !item.isLocked);
  candidates.forEach((item) => {
    if (item.isLocked) lockedByIndex.set(item.baseIndex, item);
  });

  const placed: PlanningTaskCandidate[] = [];
  let previousTag: string | null = null;
  let unlockedPlacedCount = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const lockedCandidate = lockedByIndex.get(index);
    let next: PlanningTaskCandidate | undefined;
    if (lockedCandidate) {
      next = lockedCandidate;
    } else {
      next = pickDayRhythmCandidate(unlocked, previousTag, unlockedPlacedCount);
      if (!next) break;
      removePlanningCandidate(unlocked, next);
      unlockedPlacedCount += 1;
    }

    placed.push(next);
    previousTag = next.tagKey;
  }

  return placed;
}

function toClockTime(minutes: number) {
  const clean = ((Math.round(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(clean / 60);
  const minute = clean % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addIsoDays(dateIso: string, days: number) {
  if (days <= 0) return dateIso;
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function toMinutes(time: string) {
  const [hourText, minuteText] = String(time || "00:00").split(":");
  const hour = Number(hourText || 0);
  const minute = Number(minuteText || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

function toPlanningMinutes(time: string, scheduledDate: string, selectedDayIso: string) {
  const baseMinutes = toMinutes(time);
  if (scheduledDate > selectedDayIso && baseMinutes <= 12 * 60) {
    return baseMinutes + 24 * 60;
  }
  return baseMinutes;
}

type TimeRange = { start: number; end: number };

function mergeTimeRanges(ranges: TimeRange[]) {
  if (ranges.length <= 1) return [...ranges];
  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const merged: TimeRange[] = [sorted[0]];
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];
    if (current.start > last.end) {
      merged.push(current);
      continue;
    }
    last.end = Math.max(last.end, current.end);
  }
  return merged;
}

function buildLockedTimeRanges(
  candidates: PlanningTaskCandidate[],
  selectedDayIso: string,
  areaBufferByKey: Map<string, number>,
  areaBufferFallback: number
) {
  const ranges: TimeRange[] = [];
  candidates.forEach((candidate) => {
    if (!candidate.isLocked) return;
    const draft = candidate.draft;
    const fixedTime = draft.scheduledTime || draft.plannedTime;
    if (!fixedTime) return;
    const start = toPlanningMinutes(fixedTime, draft.scheduledDate, selectedDayIso);
    if (!Number.isFinite(start)) return;
    const estimate = Math.max(5, Number(draft.estimatedMinutes || 30));
    const areaKey = normalizeAreaTagForPlanning(draft.areaTag);
    const factor = areaBufferByKey.get(areaKey) || areaBufferFallback;
    const bufferMinutes = Math.min(
      60,
      Math.max(0, Math.round(estimate * Math.max(0, factor - 1)))
    );
    ranges.push({
      start,
      end: start + estimate + bufferMinutes,
    });
  });
  return mergeTimeRanges(ranges);
}

function findNextLockedTimeRange(cursor: number, lockedRanges: TimeRange[]) {
  for (const range of lockedRanges) {
    if (range.end > cursor) return range;
  }
  return null;
}

type BuildAutoPlanUpdatesOptions = {
  mode: AutoPlanMode;
  candidates: PlanningTaskCandidate[];
  selectedDayIso: string;
  startMinutes: number;
  endMinutes: number;
  areaBufferByKey: Map<string, number>;
  areaBufferFallback: number;
};

export function buildAutoPlanUpdates({
  mode,
  candidates,
  selectedDayIso,
  startMinutes,
  endMinutes,
  areaBufferByKey,
  areaBufferFallback,
}: BuildAutoPlanUpdatesOptions) {
  const shouldReorder = mode !== "time";
  const shouldReschedule = mode !== "order";
  const orderedCandidates = shouldReorder
    ? buildBalancedOrderWithLockedAnchors(candidates)
    : candidates;
  const lockedTimeRanges = shouldReschedule
    ? buildLockedTimeRanges(orderedCandidates, selectedDayIso, areaBufferByKey, areaBufferFallback)
    : [];

  let cursor = Math.max(0, Math.min(endMinutes, startMinutes));
  let reachedDayEnd = false;
  const stats: AutoPlanStats = {
    reorderedCount: 0,
    scheduledCount: 0,
    unscheduledOverflowCount: 0,
    lockedPreservedCount: 0,
  };

  const updateById = new Map<string, PlanningUpdate>();
  const stageUpdate = (next: PlanningUpdate) => {
    const current = updateById.get(next.id);
    if (!current) {
      updateById.set(next.id, next);
      return;
    }
    updateById.set(next.id, { ...current, ...next });
  };

  orderedCandidates.forEach((candidate, index) => {
    const task = candidate.task;
    const draft = candidate.draft;
    const currentFocus = getTaskFocusOrder(task);
    const nextFocus = index + 1;
    const estimate = Math.max(5, Number(draft.estimatedMinutes || 30));
    const areaKey = normalizeAreaTagForPlanning(draft.areaTag);
    const factor = areaBufferByKey.get(areaKey) || areaBufferFallback;
    const bufferMinutes = Math.min(60, Math.max(0, Math.round(estimate * Math.max(0, factor - 1))));

    if (candidate.isLocked) {
      stats.lockedPreservedCount += 1;
      return;
    }

    if (shouldReorder && currentFocus !== nextFocus) {
      stageUpdate({ id: task.id, focusOrder: nextFocus });
      stats.reorderedCount += 1;
    }

    if (!shouldReschedule) return;

    const currentDate = draft.scheduledDate || "";
    const currentTime = draft.scheduledTime || "";
    const currentPlanned = draft.plannedTime || draft.scheduledTime || "";

    const requiredMinutes = estimate + bufferMinutes;
    const normalizedStart = Math.max(0, Math.min(endMinutes, cursor));
    let nextStart = normalizedStart;
    while (true) {
      const nextLockedRange = findNextLockedTimeRange(nextStart, lockedTimeRanges);
      if (!nextLockedRange) break;
      if (nextStart >= nextLockedRange.start && nextStart < nextLockedRange.end) {
        nextStart = nextLockedRange.end;
        continue;
      }
      if (
        nextStart < nextLockedRange.start &&
        nextStart + requiredMinutes > nextLockedRange.start
      ) {
        nextStart = nextLockedRange.end;
        continue;
      }
      break;
    }

    if (reachedDayEnd) {
      if (currentDate !== selectedDayIso || currentTime || currentPlanned) {
        stageUpdate({
          id: task.id,
          focusOrder: shouldReorder ? nextFocus : currentFocus,
          scheduledDate: selectedDayIso,
          scheduledTime: null,
          plannedTime: null,
        });
        stats.unscheduledOverflowCount += 1;
      }
      return;
    }

    const nextEnd = nextStart + requiredMinutes;
    if (nextStart >= endMinutes) {
      reachedDayEnd = true;
      if (currentDate !== selectedDayIso || currentTime || currentPlanned) {
        stageUpdate({
          id: task.id,
          focusOrder: shouldReorder ? nextFocus : currentFocus,
          scheduledDate: selectedDayIso,
          scheduledTime: null,
          plannedTime: null,
        });
        stats.unscheduledOverflowCount += 1;
      }
      return;
    }

    const dayOffset = Math.floor(nextStart / (24 * 60));
    const nextDate = addIsoDays(selectedDayIso, dayOffset);
    const nextTime = toClockTime(nextStart);
    if (currentDate !== nextDate || currentTime !== nextTime || currentPlanned !== nextTime) {
      stageUpdate({
        id: task.id,
        focusOrder: shouldReorder ? nextFocus : currentFocus,
        scheduledDate: nextDate,
        scheduledTime: nextTime,
        plannedTime: nextTime,
      });
      stats.scheduledCount += 1;
    }

    cursor = nextEnd;
    if (cursor >= endMinutes) reachedDayEnd = true;
  });

  return {
    updates: Array.from(updateById.values()),
    stats,
  };
}
