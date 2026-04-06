"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical, Plus, Save, Trash2 } from "lucide-react";
import {
  buildEmptyStep,
  buildEmptyTask,
  cloneSpiritualStaircase,
  reorderList,
} from "@/lib/spiritualGoals";
import type { SpiritualGoalStaircase } from "@/lib/types";

const AVATAR_OPTIONS = [
  { value: "sprout", label: "Sprout" },
  { value: "spark", label: "Spark" },
  { value: "compass", label: "Compass" },
  { value: "bookmark", label: "Bookmark" },
] as const;

export default function SpiritualGoalConfigDrawer({
  open,
  staircase,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  staircase: SpiritualGoalStaircase;
  saving: boolean;
  onClose: () => void;
  onSave: (staircase: SpiritualGoalStaircase) => void;
}) {
  const [draft, setDraft] = useState<SpiritualGoalStaircase>(() =>
    cloneSpiritualStaircase(staircase)
  );
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(cloneSpiritualStaircase(staircase));
  }, [open, staircase]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  const stepCountHint = useMemo(() => {
    if (draft.steps.length === 0) {
      return "Add only the steps you truly want. The staircase starts empty on purpose.";
    }
    if (draft.steps.length <= 7) {
      return "This staircase size will stay roomy and easy to scan.";
    }
    return "This staircase is getting tall. Keep titles especially short so the visual stays calm.";
  }, [draft.steps.length]);

  if (!open) return null;

  const hasBlankStepTitle = draft.steps.some((step) => !step.title.trim());
  const canSave = Boolean(draft.title.trim() && draft.ultimateGoal.trim()) && !hasBlankStepTitle;

  const updateStep = (
    stepIndex: number,
    updater: (step: SpiritualGoalStaircase["steps"][number]) => SpiritualGoalStaircase["steps"][number]
  ) => {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, index) =>
        index === stepIndex ? updater(step) : step
      ),
    }));
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= draft.steps.length || fromIndex === toIndex) return;
    setDraft((current) => ({
      ...current,
      steps: reorderList(current.steps, fromIndex, toIndex),
    }));
  };

  return (
    <div
      className="spiritual-config-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spiritual-config-title"
    >
      <button
        type="button"
        className="spiritual-config-backdrop"
        aria-label="Close configuration"
        onClick={onClose}
      />
      <aside className="spiritual-config-drawer">
        <div className="spiritual-config-head">
          <div>
            <p className="panel-kicker">Configure</p>
            <h3 id="spiritual-config-title">Shape this staircase quietly, one step at a time.</h3>
            <p>{stepCountHint}</p>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="spiritual-config-scroll">
          <section className="spiritual-config-card">
            <div className="spiritual-config-card-head">
              <div>
                <p className="panel-kicker">General settings</p>
                <h4>Identity and tone</h4>
              </div>
            </div>

            <div className="spiritual-config-grid">
              <label>
                Staircase title
                <input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  maxLength={80}
                />
              </label>

              <label>
                Ultimate goal
                <textarea
                  rows={3}
                  value={draft.ultimateGoal}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ultimateGoal: event.target.value,
                    }))
                  }
                  maxLength={220}
                />
              </label>

              <label>
                Subtitle
                <textarea
                  rows={3}
                  value={draft.subtitle || ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      subtitle: event.target.value,
                    }))
                  }
                  maxLength={220}
                />
              </label>

              <label>
                Accent color
                <div className="spiritual-color-row">
                  <input
                    type="color"
                    value={draft.themeColor || "#d0a56f"}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        themeColor: event.target.value,
                      }))
                    }
                  />
                  <input
                    value={draft.themeColor || "#d0a56f"}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        themeColor: event.target.value,
                      }))
                    }
                    maxLength={7}
                  />
                </div>
              </label>

              <label>
                Avatar style
                <select
                  value={draft.avatarStyle || "sprout"}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      avatarStyle: event.target.value as SpiritualGoalStaircase["avatarStyle"],
                    }))
                  }
                >
                  {AVATAR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="spiritual-config-card">
            <div className="spiritual-config-card-head split">
              <div>
                <p className="panel-kicker">Steps editor</p>
                <h4>Only the titles appear inside the staircase.</h4>
                <p>Descriptions, tasks, and notes stay here and in the detail panel - not inside the stair blocks.</p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    steps: [...current.steps, buildEmptyStep("")],
                  }))
                }
                disabled={draft.steps.length >= 12}
              >
                <Plus size={16} />
                Add step
              </button>
            </div>

            {hasBlankStepTitle ? (
              <p className="spiritual-config-warning">Every visible stair needs a short title before you save.</p>
            ) : null}

            <div className="spiritual-step-editor-list">
              {draft.steps.length ? (
                draft.steps.map((step, index) => (
                  <article
                    key={step.id}
                    className={`spiritual-step-editor ${draggingIndex === index ? "dragging" : ""}`}
                    draggable
                    onDragStart={() => setDraggingIndex(index)}
                    onDragEnd={() => setDraggingIndex(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggingIndex == null) return;
                      moveStep(draggingIndex, index);
                      setDraggingIndex(null);
                    }}
                  >
                    <div className="spiritual-step-editor-head">
                      <div className="spiritual-step-editor-title">
                        <span className="spiritual-drag-handle" aria-hidden="true">
                          <GripVertical size={17} />
                        </span>
                        <strong>Step {index + 1}</strong>
                      </div>
                      <div className="spiritual-step-editor-head-actions">
                        <button
                          type="button"
                          className="secondary subtle"
                          onClick={() => moveStep(index, index - 1)}
                          disabled={index === 0}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="secondary subtle"
                          onClick={() => moveStep(index, index + 1)}
                          disabled={index === draft.steps.length - 1}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className="secondary subtle danger"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              steps: current.steps.filter((_, currentIndex) => currentIndex !== index),
                            }))
                          }
                        >
                          <Trash2 size={15} />
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="spiritual-step-editor-grid">
                      <label>
                        Short title
                        <input
                          value={step.title}
                          onChange={(event) =>
                            updateStep(index, (current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          maxLength={60}
                        />
                      </label>

                      <label>
                        Description
                        <textarea
                          rows={3}
                          value={step.description || ""}
                          onChange={(event) =>
                            updateStep(index, (current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          maxLength={1600}
                        />
                      </label>

                      <label>
                        Step notes
                        <textarea
                          rows={4}
                          value={step.notes || ""}
                          onChange={(event) =>
                            updateStep(index, (current) => ({
                              ...current,
                              notes: event.target.value,
                            }))
                          }
                          maxLength={2500}
                        />
                      </label>
                    </div>

                    <div className="spiritual-config-task-group">
                      <div className="spiritual-config-task-head">
                        <strong>Checklist tasks</strong>
                        <button
                          type="button"
                          className="secondary subtle"
                          onClick={() =>
                            updateStep(index, (current) => ({
                              ...current,
                              tasks: [...current.tasks, buildEmptyTask("")],
                            }))
                          }
                        >
                          <Plus size={15} />
                          Add task
                        </button>
                      </div>

                      <div className="spiritual-config-task-list">
                        {step.tasks.length ? (
                          step.tasks.map((task, taskIndex) => (
                            <div key={task.id} className="spiritual-config-task-row">
                              <input
                                type="checkbox"
                                checked={task.completed}
                                onChange={(event) =>
                                  updateStep(index, (current) => ({
                                    ...current,
                                    tasks: current.tasks.map((currentTask, currentTaskIndex) =>
                                      currentTaskIndex === taskIndex
                                        ? { ...currentTask, completed: event.target.checked }
                                        : currentTask
                                    ),
                                  }))
                                }
                              />
                              <input
                                value={task.title}
                                onChange={(event) =>
                                  updateStep(index, (current) => ({
                                    ...current,
                                    tasks: current.tasks.map((currentTask, currentTaskIndex) =>
                                      currentTaskIndex === taskIndex
                                        ? { ...currentTask, title: event.target.value }
                                        : currentTask
                                    ),
                                  }))
                                }
                                placeholder="Task title"
                                maxLength={100}
                              />
                              <button
                                type="button"
                                className="secondary subtle danger"
                                onClick={() =>
                                  updateStep(index, (current) => ({
                                    ...current,
                                    tasks: current.tasks.filter((_, currentTaskIndex) => currentTaskIndex !== taskIndex),
                                  }))
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="spiritual-support-empty small">
                            Leave this empty if the step only needs a note or simple intention.
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="spiritual-config-empty">
                  <p>No steps yet.</p>
                  <span>Start with the first quiet move that would make this journey real.</span>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="spiritual-config-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => onSave(draft)} disabled={saving || !canSave}>
            <Save size={16} />
            {saving ? "Saving..." : "Save staircase"}
          </button>
        </div>
      </aside>
    </div>
  );
}
