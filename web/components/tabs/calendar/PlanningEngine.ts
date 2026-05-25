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

function pickBalancedCandidate(
  pool: PlanningTaskCandidate[],
  previousTag: string | null,
  previousRank: number,
  heavyStreak: number
) {
  if (!pool.length) return undefined;

  const ranked = [...pool].sort(comparePlanningCandidates);
  const topRank = ranked[0].rank;
  const nearTopByPriority = ranked.filter((candidate) => candidate.rank >= topRank - 1);
  const alternativesByTag = previousTag
    ? nearTopByPriority.filter((candidate) => candidate.tagKey !== previousTag)
    : nearTopByPriority;

  let selectedPool = nearTopByPriority;
  if (previousTag && alternativesByTag.length) {
    selectedPool = alternativesByTag;
  }

  if (previousRank >= 3 && heavyStreak >= 2) {
    const lighter = selectedPool.filter((candidate) => candidate.rank < 3);
    if (lighter.length) return lighter[0];
  }

  return selectedPool[0];
}

export function buildBalancedOrderWithLockedAnchors(candidates: PlanningTaskCandidate[]) {
  if (candidates.length <= 1) return candidates;

  const lockedByIndex = new Map<number, PlanningTaskCandidate>();
  const unlocked = candidates.filter((item) => !item.isLocked);
  candidates.forEach((item) => {
    if (item.isLocked) lockedByIndex.set(item.baseIndex, item);
  });

  const placed: PlanningTaskCandidate[] = [];
  let previousRank = 0;
  let heavyStreak = 0;
  let previousTag: string | null = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const lockedCandidate = lockedByIndex.get(index);
    let next: PlanningTaskCandidate | undefined;
    if (lockedCandidate) {
      next = lockedCandidate;
    } else {
      next = pickBalancedCandidate(unlocked, previousTag, previousRank, heavyStreak);
      if (!next) break;
      const removeIndex = unlocked.findIndex((item) => item.task.id === next?.task.id);
      if (removeIndex >= 0) unlocked.splice(removeIndex, 1);
    }

    placed.push(next);
    if (next.rank >= 3) {
      heavyStreak = previousRank >= 3 ? heavyStreak + 1 : 1;
    } else {
      heavyStreak = 0;
    }
    previousRank = next.rank;
    previousTag = next.tagKey;
  }

  return placed;
}

function toTime(minutes: number) {
  const clean = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const hour = Math.floor(clean / 60);
  const minute = clean % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toMinutes(time: string) {
  const [hourText, minuteText] = String(time || "00:00").split(":");
  const hour = Number(hourText || 0);
  const minute = Number(minuteText || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
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
      if (shouldReschedule && !reachedDayEnd) {
        if (draft.scheduledTime) {
          cursor = Math.max(cursor, toMinutes(draft.scheduledTime));
        }
        cursor += estimate + bufferMinutes;
        if (cursor >= endMinutes) reachedDayEnd = true;
      }
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

    const nextStart = cursor;
    const nextEnd = nextStart + estimate + bufferMinutes;
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

    const nextTime = toTime(nextStart);
    if (currentDate !== selectedDayIso || currentTime !== nextTime || currentPlanned !== nextTime) {
      stageUpdate({
        id: task.id,
        focusOrder: shouldReorder ? nextFocus : currentFocus,
        scheduledDate: selectedDayIso,
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
