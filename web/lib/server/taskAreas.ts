import { getSetting, setSetting } from "./settings";
import {
  DEFAULT_TASK_AREAS,
  normalizeTaskAreaColor,
  normalizeTaskAreaKey,
  normalizeTaskAreaLabel,
  normalizeTaskAreas,
  type TaskAreaTag,
} from "@/lib/taskAreas";

const TASK_AREA_DEFINITIONS_KEY = "task_area_definitions_v1";
const TASK_AREA_ASSIGNMENTS_KEY = "task_area_assignments_v1";

function parseAreaDefinitions(raw: string | null) {
  if (!raw) return [] as TaskAreaTag[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === "object") as TaskAreaTag[];
  } catch (_error) {
    return [];
  }
}

function parseAssignments(raw: string | null) {
  if (!raw) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean: Record<string, string> = {};
    Object.entries(parsed).forEach(([taskId, areaKey]) => {
      const task = String(taskId || "").trim();
      const area = normalizeTaskAreaKey(String(areaKey || ""));
      if (task && area) clean[task] = area;
    });
    return clean;
  } catch (_error) {
    return {};
  }
}

export async function getTaskAreas(userEmail: string) {
  const raw = await getSetting(userEmail, TASK_AREA_DEFINITIONS_KEY);
  return normalizeTaskAreas(parseAreaDefinitions(raw));
}

export async function createTaskArea(userEmail: string, input: { label: string; color?: string | null }) {
  const current = await getTaskAreas(userEmail);
  const label = normalizeTaskAreaLabel(input.label);
  const key = normalizeTaskAreaKey(label);
  if (!label || !key) throw new Error("INVALID_AREA_LABEL");

  const existing = current.find((area) => area.key === key);
  if (existing) return existing;

  const area = {
    key,
    label,
    color: normalizeTaskAreaColor(input.color, current.length),
  };
  const next = normalizeTaskAreas([...current, area]);
  await setSetting(userEmail, TASK_AREA_DEFINITIONS_KEY, JSON.stringify(next));
  return area;
}

export async function getTaskAreaAssignments(userEmail: string) {
  const raw = await getSetting(userEmail, TASK_AREA_ASSIGNMENTS_KEY);
  return parseAssignments(raw);
}

export async function getTaskAreaMap(userEmail: string, taskIds: string[]) {
  const assignments = await getTaskAreaAssignments(userEmail);
  return new Map(taskIds.map((taskId) => [taskId, assignments[taskId] || null]));
}

export async function setTaskAreaAssignment(
  userEmail: string,
  taskId: string,
  areaKey: string | null | undefined
) {
  const assignments = await getTaskAreaAssignments(userEmail);
  const cleanTaskId = String(taskId || "").trim();
  if (!cleanTaskId) return;

  const normalizedArea = normalizeTaskAreaKey(String(areaKey || ""));
  if (normalizedArea) {
    const areas = await getTaskAreas(userEmail);
    const exists = areas.some((area) => area.key === normalizedArea);
    if (!exists && !DEFAULT_TASK_AREAS.some((area) => area.key === normalizedArea)) {
      throw new Error("INVALID_AREA_KEY");
    }
    assignments[cleanTaskId] = normalizedArea;
  } else {
    delete assignments[cleanTaskId];
  }

  await setSetting(userEmail, TASK_AREA_ASSIGNMENTS_KEY, JSON.stringify(assignments));
}

export async function deleteTaskAreaAssignment(userEmail: string, taskId: string) {
  await setTaskAreaAssignment(userEmail, taskId, null);
}
