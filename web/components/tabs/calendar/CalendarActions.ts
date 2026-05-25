import { addDays, format } from "date-fns";
import { buildMoveToBacklogPatch, buildMoveToDayPatch } from "./TaskBoardDnD";

export function buildScheduleTodayPayload(selectedDayIso: string) {
  return buildMoveToDayPatch(selectedDayIso, null);
}

export function buildUnschedulePayload() {
  return buildMoveToBacklogPatch();
}

export function buildScheduleTomorrowPayload(selectedDayIso: string) {
  const tomorrowIso = format(addDays(new Date(`${selectedDayIso}T12:00:00`), 1), "yyyy-MM-dd");
  return buildMoveToDayPatch(tomorrowIso, null);
}
