export type TaskBoardMutationPatch = {
  scheduled_date: string | null;
  scheduled_time: string | null;
  planned_time: string | null;
  focus_order: number | null;
  schedule_locked: number;
};

export function buildMoveToDayPatch(selectedDayIso: string, focusOrder: number | null = null) {
  return {
    scheduled_date: selectedDayIso,
    scheduled_time: null,
    planned_time: null,
    focus_order: focusOrder,
    schedule_locked: 0,
  } as const;
}

export function buildMoveToBacklogPatch() {
  return {
    scheduled_date: null,
    scheduled_time: null,
    planned_time: null,
    focus_order: null,
    schedule_locked: 0,
  } as const;
}

export function reorderByMove<T>(items: T[], sourceIndex: number, targetIndex: number) {
  if (sourceIndex < 0 || sourceIndex >= items.length) return [...items];
  const ordered = [...items];
  const [moved] = ordered.splice(sourceIndex, 1);
  const clampedTarget = Math.max(0, Math.min(ordered.length, targetIndex));
  ordered.splice(clampedTarget, 0, moved);
  return ordered;
}
