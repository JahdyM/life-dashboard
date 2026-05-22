import { prisma } from "@/lib/db/prisma";
import {
  MERGED_BIBLE_HABIT_KEY,
  MERGED_BIBLE_HABIT_LABEL,
  getHabitConfig,
  getHabitDisplayLabel,
  isMergedBibleHabitName,
} from "@/lib/config/habits";
import { ensureTaskCompletionColumns } from "./dbCompat";

const BIBLE_TASK_TITLE_ALIASES = [
  MERGED_BIBLE_HABIT_LABEL,
  "Bible reading",
  "Bible study",
  "Bible reading & study",
  "Bible study & reading",
];

function canonicalHabitTaskTitle(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s*\(books\)/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTitles(titles: string[]) {
  const seen = new Set<string>();
  return titles.filter((title) => {
    const canonical = canonicalHabitTaskTitle(title);
    if (!canonical || seen.has(canonical)) return false;
    seen.add(canonical);
    return true;
  });
}

export function getFixedHabitTaskTitles(habitKey: string) {
  const normalizedKey = habitKey === "bible_study" ? MERGED_BIBLE_HABIT_KEY : habitKey;
  const config = getHabitConfig(normalizedKey);
  if (!config) return [];

  const displayLabel = getHabitDisplayLabel(config.key, config.label);
  if (normalizedKey === MERGED_BIBLE_HABIT_KEY || isMergedBibleHabitName(displayLabel)) {
    return uniqueTitles(BIBLE_TASK_TITLE_ALIASES);
  }

  return uniqueTitles([displayLabel, config.label]);
}

export async function syncHabitAgendaTasks(args: {
  userEmail: string;
  dateIso: string;
  titles: string[];
  done: boolean;
}) {
  const titles = uniqueTitles(args.titles);
  if (!titles.length) return 0;

  await ensureTaskCompletionColumns();
  const canonicalTitles = new Set(titles.map(canonicalHabitTaskTitle));
  const tasks = await prisma.todoTask.findMany({
    where: {
      userEmail: args.userEmail,
      source: "habit",
      scheduledDate: args.dateIso,
    },
    select: {
      id: true,
      title: true,
    },
  });
  const taskIds = tasks
    .filter((task) => canonicalTitles.has(canonicalHabitTaskTitle(task.title)))
    .map((task) => task.id);

  if (!taskIds.length) return 0;

  const nowIso = new Date().toISOString();
  const result = await prisma.todoTask.updateMany({
    where: {
      userEmail: args.userEmail,
      id: { in: taskIds },
    },
    data: {
      isDone: args.done ? 1 : 0,
      completedAt: args.done ? nowIso : null,
      missedAt: null,
      updatedAt: nowIso,
    },
  });

  return result.count;
}
