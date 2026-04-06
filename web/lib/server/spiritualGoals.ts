import { prisma } from "@/lib/db/prisma";
import {
  buildDefaultSpiritualStaircase,
  buildEmptyTask,
  buildSpiritualGoalsPageData,
  cloneSpiritualStaircase,
  completeCurrentSpiritualStep,
  computeSpiritualStaircase,
  getSpiritualGoalMeta,
  moveBackSpiritualProgress,
  syncSpiritualProgressToStep,
} from "@/lib/spiritualGoals";
import type {
  SpiritualGoalCategory,
  SpiritualGoalComputedStaircase,
  SpiritualGoalsPageData,
  SpiritualGoalStaircase,
} from "@/lib/types";
import {
  spiritualGoalActionSchema,
  spiritualGoalCategorySchema,
  spiritualGoalStaircaseSchema,
} from "./schemas";

const ALL_SPIRITUAL_GOAL_CATEGORIES = spiritualGoalCategorySchema.options;

function settingKey(userEmail: string, category: SpiritualGoalCategory) {
  return `${userEmail.toLowerCase()}::spiritual_goal::${category}`;
}

function toStoredStaircase(staircase: SpiritualGoalStaircase) {
  return {
    category: staircase.category,
    title: staircase.title,
    ultimate_goal: staircase.ultimateGoal,
    subtitle: staircase.subtitle,
    theme_color: staircase.themeColor,
    avatar_style: staircase.avatarStyle,
    general_notes: staircase.generalNotes,
    steps: staircase.steps.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      notes: step.notes,
      completed_at: step.completedAt,
      tasks: step.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        completed: task.completed,
        created_at: task.createdAt || null,
        updated_at: task.updatedAt || null,
      })),
    })),
  };
}

function fromStoredStaircase(
  category: SpiritualGoalCategory,
  rawValue: string | null | undefined
): SpiritualGoalStaircase {
  const fallback = buildDefaultSpiritualStaircase(category);
  if (!rawValue) {
    return fallback;
  }

  try {
    const parsedJson = JSON.parse(rawValue);
    const parsed = spiritualGoalStaircaseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return fallback;
    }

    return {
      category,
      title: parsed.data.title,
      ultimateGoal: parsed.data.ultimate_goal,
      subtitle: parsed.data.subtitle ?? null,
      themeColor: parsed.data.theme_color ?? getSpiritualGoalMeta(category).defaultThemeColor,
      avatarStyle: parsed.data.avatar_style ?? getSpiritualGoalMeta(category).defaultAvatarStyle,
      generalNotes: parsed.data.general_notes ?? null,
      steps: parsed.data.steps.map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description ?? null,
        notes: step.notes ?? null,
        completedAt: step.completed_at ?? null,
        tasks: step.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          completed: task.completed,
          createdAt: task.created_at ?? undefined,
          updatedAt: task.updated_at ?? undefined,
        })),
      })),
    };
  } catch (_error) {
    return fallback;
  }
}

async function loadRawSpiritualStaircase(
  userEmail: string,
  category: SpiritualGoalCategory
) {
  const row = await prisma.setting.findUnique({
    where: { key: settingKey(userEmail, category) },
  });
  return fromStoredStaircase(category, row?.value);
}

async function saveRawSpiritualStaircase(
  userEmail: string,
  staircase: SpiritualGoalStaircase
) {
  await prisma.setting.upsert({
    where: { key: settingKey(userEmail, staircase.category) },
    create: {
      key: settingKey(userEmail, staircase.category),
      value: JSON.stringify(toStoredStaircase(staircase)),
    },
    update: {
      value: JSON.stringify(toStoredStaircase(staircase)),
    },
  });
}

export async function getSpiritualGoalsPageData(
  userEmail: string
): Promise<SpiritualGoalsPageData> {
  const keys = ALL_SPIRITUAL_GOAL_CATEGORIES.map((category) => settingKey(userEmail, category));
  const rows = await prisma.setting.findMany({
    where: {
      key: { in: keys },
    },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const staircases = ALL_SPIRITUAL_GOAL_CATEGORIES.map((category) =>
    fromStoredStaircase(category, byKey.get(settingKey(userEmail, category)))
  );
  return buildSpiritualGoalsPageData(staircases);
}

export async function saveSpiritualGoalConfig(
  userEmail: string,
  staircase: SpiritualGoalStaircase
) {
  const next = cloneSpiritualStaircase(staircase);
  next.steps = next.steps.map((step) => ({
    ...step,
    title: step.title.trim(),
    description: step.description?.trim() || null,
    notes: step.notes?.trim() || null,
    tasks: step.tasks
      .map((task) => ({
        ...task,
        title: task.title.trim(),
      }))
      .filter((task) => task.title),
  }));
  next.title = next.title.trim();
  next.ultimateGoal = next.ultimateGoal.trim();
  next.subtitle = next.subtitle?.trim() || null;
  next.generalNotes = next.generalNotes?.trim() || null;
  await saveRawSpiritualStaircase(userEmail, next);
  return computeSpiritualStaircase(next);
}

export async function applySpiritualGoalAction(
  userEmail: string,
  category: SpiritualGoalCategory,
  rawAction: unknown
): Promise<SpiritualGoalComputedStaircase> {
  const parsed = spiritualGoalActionSchema.safeParse(rawAction);
  if (!parsed.success) {
    throw new Error("INVALID_ACTION");
  }

  let staircase = await loadRawSpiritualStaircase(userEmail, category);
  const action = parsed.data;

  switch (action.type) {
    case "complete_current":
      staircase = completeCurrentSpiritualStep(staircase);
      break;
    case "move_to_step":
      if (!action.confirmed) {
        throw new Error("CONFIRMATION_REQUIRED");
      }
      staircase = syncSpiritualProgressToStep(staircase, action.step_id);
      break;
    case "move_back":
      staircase = moveBackSpiritualProgress(staircase);
      break;
    case "toggle_task": {
      const updatedAt = new Date().toISOString();
      staircase = cloneSpiritualStaircase(staircase);
      staircase.steps = staircase.steps.map((step) =>
        step.id !== action.step_id
          ? step
          : {
              ...step,
              tasks: step.tasks.map((task) =>
                task.id === action.task_id
                  ? { ...task, completed: action.completed, updatedAt }
                  : task
              ),
            }
      );
      break;
    }
    case "add_task":
      staircase = cloneSpiritualStaircase(staircase);
      staircase.steps = staircase.steps.map((step) =>
        step.id !== action.step_id
          ? step
          : {
              ...step,
              tasks: [...step.tasks, buildEmptyTask(action.title)],
            }
      );
      break;
    case "update_task": {
      const updatedAt = new Date().toISOString();
      staircase = cloneSpiritualStaircase(staircase);
      staircase.steps = staircase.steps.map((step) =>
        step.id !== action.step_id
          ? step
          : {
              ...step,
              tasks: step.tasks.map((task) =>
                task.id === action.task_id
                  ? { ...task, title: action.title, updatedAt }
                  : task
              ),
            }
      );
      break;
    }
    case "remove_task":
      staircase = cloneSpiritualStaircase(staircase);
      staircase.steps = staircase.steps.map((step) =>
        step.id !== action.step_id
          ? step
          : {
              ...step,
              tasks: step.tasks.filter((task) => task.id !== action.task_id),
            }
      );
      break;
    case "save_step_notes":
      staircase = cloneSpiritualStaircase(staircase);
      staircase.steps = staircase.steps.map((step) =>
        step.id !== action.step_id
          ? step
          : {
              ...step,
              notes: action.notes ?? null,
            }
      );
      break;
    case "save_general_notes":
      staircase = cloneSpiritualStaircase(staircase);
      staircase.generalNotes = action.notes ?? null;
      break;
  }

  await saveRawSpiritualStaircase(userEmail, staircase);
  return computeSpiritualStaircase(staircase);
}

export async function loadSpiritualGoalConfig(
  userEmail: string,
  category: SpiritualGoalCategory
) {
  return loadRawSpiritualStaircase(userEmail, category);
}
