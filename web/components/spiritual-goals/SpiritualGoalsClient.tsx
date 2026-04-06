"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { fetchJson } from "@/lib/client/api";
import { getSpiritualGoalMeta, SPIRITUAL_GOAL_CATEGORIES } from "@/lib/spiritualGoals";
import type {
  SpiritualGoalCategory,
  SpiritualGoalComputedStaircase,
  SpiritualGoalsPageData,
  SpiritualGoalStaircase,
} from "@/lib/types";
import SpiritualGoalConfigDrawer from "./SpiritualGoalConfigDrawer";
import SpiritualGoalOverviewCard from "./SpiritualGoalOverviewCard";
import SpiritualGoalStepPanel from "./SpiritualGoalStepPanel";
import SpiritualStaircase from "./SpiritualStaircase";

function toConfigPayload(staircase: SpiritualGoalStaircase) {
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
      tasks: step.tasks
        .filter((task) => task.title.trim())
        .map((task) => ({
          id: task.id,
          title: task.title.trim(),
          completed: task.completed,
          created_at: task.createdAt ?? null,
          updated_at: task.updatedAt ?? null,
        })),
    })),
  };
}

function patchItem(
  data: SpiritualGoalsPageData | undefined,
  nextItem: SpiritualGoalComputedStaircase
): SpiritualGoalsPageData | undefined {
  if (!data) return data;
  return {
    items: data.items.map((item) =>
      item.category === nextItem.category ? nextItem : item
    ),
  };
}

export default function SpiritualGoalsClient({
  initialData,
}: {
  initialData: SpiritualGoalsPageData;
}) {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<SpiritualGoalCategory>(
    initialData.items[0]?.category || "big_goals"
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const spiritualQuery = useQuery({
    queryKey: ["spiritual-goals"],
    queryFn: () => fetchJson<SpiritualGoalsPageData>("/api/spiritual-goals"),
    initialData,
  });

  const items = useMemo(
    () => spiritualQuery.data?.items ?? [],
    [spiritualQuery.data?.items]
  );

  useEffect(() => {
    if (!items.some((item) => item.category === selectedCategory) && items[0]) {
      setSelectedCategory(items[0].category);
    }
  }, [items, selectedCategory]);

  useEffect(() => {
    if (!feedback) return;
    const timeoutId = window.setTimeout(() => setFeedback(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  const selectedStaircase =
    items.find((item) => item.category === selectedCategory) || items[0] || null;

  const selectedStepSignature =
    selectedStaircase?.steps.map((step) => step.id).join("|") || "";

  useEffect(() => {
    if (!selectedStaircase) {
      setSelectedStepId(null);
      return;
    }

    const nextSelectedStepId =
      selectedStepId && selectedStaircase.steps.some((step) => step.id === selectedStepId)
        ? selectedStepId
        : selectedStaircase.currentStepId || selectedStaircase.steps[0]?.id || null;

    if (nextSelectedStepId !== selectedStepId) {
      setSelectedStepId(nextSelectedStepId);
    }
  }, [selectedCategory, selectedStaircase, selectedStepId, selectedStepSignature]);

  const selectedStep = useMemo(() => {
    if (!selectedStaircase) return null;
    return (
      selectedStaircase.steps.find((step) => step.id === selectedStepId) ||
      (selectedStaircase.currentStepId
        ? selectedStaircase.steps.find((step) => step.id === selectedStaircase.currentStepId)
        : null) ||
      selectedStaircase.steps[0] ||
      null
    );
  }, [selectedStaircase, selectedStepId]);

  const updateCachedItem = (nextItem: SpiritualGoalComputedStaircase) => {
    queryClient.setQueryData<SpiritualGoalsPageData | undefined>(
      ["spiritual-goals"],
      (current) => patchItem(current, nextItem)
    );
  };

  const configMutation = useMutation({
    mutationFn: async (draft: SpiritualGoalStaircase) =>
      fetchJson<{ item: SpiritualGoalComputedStaircase }>(
        `/api/spiritual-goals/${draft.category}`,
        {
          method: "PUT",
          body: JSON.stringify(toConfigPayload(draft)),
        }
      ),
    onSuccess: ({ item }) => {
      updateCachedItem(item);
      setFeedback("Staircase updated.");
      setConfigOpen(false);
      setSelectedCategory(item.category);
      setSelectedStepId(item.currentStepId || item.steps[0]?.id || null);
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "Could not save staircase.");
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      category,
      payload,
    }: {
      category: SpiritualGoalCategory;
      payload: Record<string, unknown>;
    }) =>
      fetchJson<{ item: SpiritualGoalComputedStaircase }>(
        `/api/spiritual-goals/${category}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      ),
  });

  const pending = configMutation.isPending || actionMutation.isPending;

  const runAction = (
    payload: Record<string, unknown>,
    options?: { followCurrent?: boolean; successMessage?: string }
  ) => {
    if (!selectedStaircase) return;

    actionMutation.mutate(
      { category: selectedStaircase.category, payload },
      {
        onSuccess: ({ item }) => {
          updateCachedItem(item);
          if (options?.followCurrent) {
            setSelectedStepId(item.currentStepId || item.steps[0]?.id || null);
          }
          if (options?.successMessage) {
            setFeedback(options.successMessage);
          }
        },
        onError: (error) => {
          setFeedback(error instanceof Error ? error.message : "Could not update staircase.");
        },
      }
    );
  };

  if (!selectedStaircase) {
    return null;
  }

  const meta = getSpiritualGoalMeta(selectedStaircase.category);

  return (
    <div className="route-stack spiritual-shell">
      <section className="spiritual-overview-grid" aria-label="Spiritual goal categories">
        {SPIRITUAL_GOAL_CATEGORIES.map((categoryMeta) => {
          const item =
            items.find((candidate) => candidate.category === categoryMeta.category) ||
            null;
          if (!item) return null;
          return (
            <SpiritualGoalOverviewCard
              key={item.category}
              staircase={item}
              active={item.category === selectedStaircase.category}
              onOpen={() => {
                setSelectedCategory(item.category);
                setSelectedStepId(item.currentStepId || item.steps[0]?.id || null);
              }}
            />
          );
        })}
      </section>

      <section
        className="spiritual-detail-shell"
        style={{ "--spiritual-accent": selectedStaircase.accentColor } as CSSProperties}
      >
        <header className="spiritual-detail-header">
          <div>
            <h2>{selectedStaircase.title}</h2>
            <p className="spiritual-detail-goal">{selectedStaircase.ultimateGoal}</p>
            {selectedStaircase.subtitle ? (
              <p className="spiritual-detail-subtitle">{selectedStaircase.subtitle}</p>
            ) : null}
          </div>
          <div className="spiritual-detail-header-actions">
            <p className="spiritual-progress-copy">{selectedStaircase.summaryText}</p>
            <button type="button" className="page-link" onClick={() => setConfigOpen(true)}>
              <Settings2 size={17} />
              Configure
            </button>
          </div>
        </header>

        {feedback ? <p className="spiritual-feedback">{feedback}</p> : null}

        <div className="spiritual-focus-grid">
          <article className="spiritual-visual-card">
            <div className="spiritual-visual-head">
              <div>
                <p className="panel-kicker">{meta.label}</p>
                <h3>Staircase</h3>
              </div>
              <span className="spiritual-progress-pill large">
                {selectedStaircase.completedSteps}/{selectedStaircase.totalSteps || 0}
              </span>
            </div>

            <SpiritualStaircase
              staircase={selectedStaircase}
              selectedStepId={selectedStepId}
              onSelectStep={(stepId) => setSelectedStepId(stepId)}
            />

            <div className="spiritual-visual-footer">
              <div>
                <span className="spiritual-overview-label">Current</span>
                <strong>{selectedStaircase.currentStepTitle || "No step yet"}</strong>
              </div>
              <div>
                <span className="spiritual-overview-label">Done</span>
                <strong>{selectedStaircase.progressPercent}%</strong>
              </div>
            </div>
          </article>

          <SpiritualGoalStepPanel
            staircase={selectedStaircase}
            selectedStep={selectedStep}
            pending={pending}
            onOpenConfig={() => setConfigOpen(true)}
            onCompleteCurrent={() =>
              runAction(
                { type: "complete_current" },
                { followCurrent: true, successMessage: "Step completed." }
              )
            }
            onMoveBack={() =>
              runAction(
                { type: "move_back" },
                { followCurrent: true, successMessage: "Moved back one step." }
              )
            }
            onMoveToStep={(stepId) => {
              runAction(
                { type: "move_to_step", step_id: stepId, confirmed: true },
                { followCurrent: true, successMessage: "Character moved." }
              );
            }}
            onToggleTask={(stepId, taskId, completed) =>
              runAction(
                {
                  type: "toggle_task",
                  step_id: stepId,
                  task_id: taskId,
                  completed,
                },
                { successMessage: "Task updated." }
              )
            }
            onAddTask={(stepId, title) =>
              runAction(
                {
                  type: "add_task",
                  step_id: stepId,
                  title,
                },
                { successMessage: "Task added." }
              )
            }
            onUpdateTask={(stepId, taskId, title) =>
              runAction(
                {
                  type: "update_task",
                  step_id: stepId,
                  task_id: taskId,
                  title,
                },
                { successMessage: "Task updated." }
              )
            }
            onRemoveTask={(stepId, taskId) =>
              runAction(
                {
                  type: "remove_task",
                  step_id: stepId,
                  task_id: taskId,
                },
                { successMessage: "Task removed." }
              )
            }
            onSaveStepNotes={(stepId, notes) =>
              runAction(
                {
                  type: "save_step_notes",
                  step_id: stepId,
                  notes,
                },
                { successMessage: "Step notes saved." }
              )
            }
            onSaveGeneralNotes={(notes) =>
              runAction(
                {
                  type: "save_general_notes",
                  notes,
                },
                { successMessage: "Staircase notes saved." }
              )
            }
          />
        </div>
      </section>

      <SpiritualGoalConfigDrawer
        open={configOpen}
        staircase={selectedStaircase}
        saving={configMutation.isPending}
        onClose={() => setConfigOpen(false)}
        onSave={(draft) => {
          setFeedback(null);
          configMutation.mutate(draft);
        }}
      />
    </div>
  );
}
