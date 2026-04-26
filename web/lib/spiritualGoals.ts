import type {
  SpiritualGoalAvatarStyle,
  SpiritualGoalCategory,
  SpiritualGoalComputedStaircase,
  SpiritualGoalComputedStep,
  SpiritualGoalsPageData,
  SpiritualGoalStaircase,
  SpiritualGoalStep,
  SpiritualGoalStepTask,
} from "./types";
import { SPIRITUAL_GOAL_CATEGORY_CONFIGS } from "./config/spiritual";

function createId() {
  const randomApi = globalThis.crypto as Crypto | undefined;
  if (randomApi && typeof randomApi.randomUUID === "function") {
    return randomApi.randomUUID();
  }
  return `sg-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export const SPIRITUAL_GOAL_CATEGORIES = SPIRITUAL_GOAL_CATEGORY_CONFIGS;

export function getSpiritualGoalMeta(category: SpiritualGoalCategory) {
  return (
    SPIRITUAL_GOAL_CATEGORIES.find((item) => item.category === category) ||
    SPIRITUAL_GOAL_CATEGORIES[0]
  );
}

export function buildEmptyTask(title = ""): SpiritualGoalStepTask {
  const nowIso = new Date().toISOString();
  return {
    id: createId(),
    title,
    completed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function buildEmptyStep(title = ""): SpiritualGoalStep {
  return {
    id: createId(),
    title,
    description: null,
    notes: null,
    completedAt: null,
    tasks: [],
  };
}

export function buildDefaultSpiritualStaircase(
  category: SpiritualGoalCategory
): SpiritualGoalStaircase {
  const meta = getSpiritualGoalMeta(category);
  const nowIso = new Date().toISOString();
  return {
    category,
    title: meta.defaultTitle,
    ultimateGoal: meta.defaultUltimateGoal,
    subtitle: meta.defaultSubtitle,
    themeColor: meta.defaultThemeColor,
    avatarStyle: meta.defaultAvatarStyle,
    generalNotes: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    steps: [],
  };
}

export function cloneSpiritualStaircase(
  staircase: SpiritualGoalStaircase
): SpiritualGoalStaircase {
  return {
    ...staircase,
    steps: staircase.steps.map((step) => ({
      ...step,
      tasks: step.tasks.map((task) => ({ ...task })),
    })),
  };
}

function computeCurrentStepIndex(steps: SpiritualGoalStep[]) {
  const firstIncompleteIndex = steps.findIndex((step) => !step.completedAt);
  if (firstIncompleteIndex !== -1) {
    return firstIncompleteIndex;
  }
  return steps.length ? steps.length - 1 : null;
}

export function computeSpiritualStaircase(
  staircase: SpiritualGoalStaircase
): SpiritualGoalComputedStaircase {
  const totalSteps = staircase.steps.length;
  const completedSteps = staircase.steps.filter((step) => Boolean(step.completedAt)).length;
  const currentStepIndex = computeCurrentStepIndex(staircase.steps);
  const allCompleted = totalSteps > 0 && completedSteps === totalSteps;

  const steps: SpiritualGoalComputedStep[] = staircase.steps.map((step, index) => {
    const isCompleted = Boolean(step.completedAt);
    const isCurrent = !allCompleted && currentStepIndex === index;
    const isAvailable =
      !allCompleted && currentStepIndex !== null && index === currentStepIndex + 1;
    const isLocked = !isCompleted && !isCurrent && !isAvailable;

    return {
      ...step,
      stepOrder: index,
      state: isCompleted
        ? "completed"
        : isCurrent
          ? "current"
          : isAvailable
            ? "available"
            : "locked",
      isCompleted,
      isCurrent,
      isAvailable,
      isLocked,
    };
  });

  const currentStep = currentStepIndex === null ? null : steps[currentStepIndex] || null;
  const progressPercent = totalSteps
    ? Math.round((completedSteps / totalSteps) * 100)
    : 0;
  const summaryText =
    totalSteps === 0
      ? "No steps configured yet."
      : allCompleted
        ? `All ${totalSteps} steps completed.`
        : `${completedSteps} of ${totalSteps} steps completed.`;

  return {
    ...staircase,
    accentColor: staircase.themeColor || getSpiritualGoalMeta(staircase.category).defaultThemeColor,
    steps,
    totalSteps,
    completedSteps,
    progressPercent,
    currentStepIndex,
    currentStepId: currentStep?.id || null,
    currentStepTitle: currentStep?.title || null,
    summaryText,
  };
}

export function buildSpiritualGoalsPageData(
  staircases: SpiritualGoalStaircase[]
): SpiritualGoalsPageData {
  return {
    items: SPIRITUAL_GOAL_CATEGORIES.map((meta) => {
      const staircase =
        staircases.find((item) => item.category === meta.category) ||
        buildDefaultSpiritualStaircase(meta.category);
      return computeSpiritualStaircase(staircase);
    }),
  };
}

export function reorderList<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return [...items];
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function completeCurrentSpiritualStep(staircase: SpiritualGoalStaircase) {
  const next = cloneSpiritualStaircase(staircase);
  const nowIso = new Date().toISOString();
  const currentIndex = next.steps.findIndex((step) => !step.completedAt);
  if (currentIndex === -1) {
    return next;
  }
  next.steps[currentIndex] = {
    ...next.steps[currentIndex],
    completedAt: nowIso,
  };
  next.updatedAt = nowIso;
  return next;
}

export function syncSpiritualProgressToStep(
  staircase: SpiritualGoalStaircase,
  stepId: string
) {
  const next = cloneSpiritualStaircase(staircase);
  const targetIndex = next.steps.findIndex((step) => step.id === stepId);
  if (targetIndex === -1) {
    return next;
  }
  const nowIso = new Date().toISOString();
  next.steps = next.steps.map((step, index) => ({
    ...step,
    completedAt: index < targetIndex ? step.completedAt || nowIso : null,
  }));
  next.updatedAt = nowIso;
  return next;
}

export function moveBackSpiritualProgress(staircase: SpiritualGoalStaircase) {
  const currentIndex = computeCurrentStepIndex(staircase.steps);
  if (currentIndex === null || currentIndex <= 0) {
    return staircase;
  }
  return syncSpiritualProgressToStep(staircase, staircase.steps[currentIndex - 1].id);
}
