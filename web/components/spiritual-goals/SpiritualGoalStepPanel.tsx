"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import type {
  SpiritualGoalComputedStaircase,
  SpiritualGoalComputedStep,
  SpiritualGoalStepTask,
} from "@/lib/types";

type SpiritualGoalStepPanelProps = {
  staircase: SpiritualGoalComputedStaircase;
  selectedStep: SpiritualGoalComputedStep | null;
  pending: boolean;
  onOpenConfig: () => void;
  onCompleteCurrent: () => void;
  onMoveBack: () => void;
  onMoveToStep: (stepId: string) => void;
  onToggleTask: (stepId: string, taskId: string, completed: boolean) => void;
  onAddTask: (stepId: string, title: string) => void;
  onUpdateTask: (stepId: string, taskId: string, title: string) => void;
  onRemoveTask: (stepId: string, taskId: string) => void;
  onSaveStepNotes: (stepId: string, notes: string | null) => void;
  onSaveGeneralNotes: (notes: string | null) => void;
};

function formatCompletedLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

function TaskRow({
  task,
  stepId,
  pending,
  onToggle,
  onSave,
  onRemove,
}: {
  task: SpiritualGoalStepTask;
  stepId: string;
  pending: boolean;
  onToggle: (completed: boolean) => void;
  onSave: (title: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  useEffect(() => {
    setDraft(task.title);
  }, [task.title]);

  return (
    <li className="spiritual-task-row">
      <label className="spiritual-task-toggle">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={(event) => onToggle(event.target.checked)}
          disabled={pending}
        />
        <span className={task.completed ? "checked" : ""}>{task.title}</span>
      </label>

      <div className="spiritual-task-actions">
        {editing ? (
          <>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={`Edit task for ${stepId}`}
            />
            <button
              type="button"
              className="secondary subtle"
              onClick={() => {
                const next = draft.trim();
                if (!next) return;
                onSave(next);
                setEditing(false);
              }}
              disabled={pending}
            >
              <Save size={15} />
            </button>
            <button
              type="button"
              className="secondary subtle"
              onClick={() => {
                setEditing(false);
                setDraft(task.title);
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="secondary subtle"
              aria-label={`Edit task ${task.title}`}
              onClick={() => setEditing(true)}
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              className="secondary subtle danger"
              aria-label={`Remove task ${task.title}`}
              onClick={onRemove}
              disabled={pending}
            >
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export default function SpiritualGoalStepPanel({
  staircase,
  selectedStep,
  pending,
  onOpenConfig,
  onCompleteCurrent,
  onMoveBack,
  onMoveToStep,
  onToggleTask,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
  onSaveStepNotes,
  onSaveGeneralNotes,
}: SpiritualGoalStepPanelProps) {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [stepNotes, setStepNotes] = useState("");
  const [generalNotes, setGeneralNotes] = useState(staircase.generalNotes || "");

  useEffect(() => {
    setStepNotes(selectedStep?.notes || "");
    setNewTaskTitle("");
  }, [selectedStep?.id, selectedStep?.notes]);

  useEffect(() => {
    setGeneralNotes(staircase.generalNotes || "");
  }, [staircase.generalNotes, staircase.category]);

  const completedLabel = useMemo(
    () => formatCompletedLabel(selectedStep?.completedAt || null),
    [selectedStep?.completedAt]
  );

  if (!selectedStep) {
    return (
      <section className="spiritual-detail-panel empty">
        <div className="spiritual-detail-empty">
          <p className="panel-kicker">Selected step</p>
          <h3>The staircase is ready when the first small step is ready.</h3>
          <p>
            Add the short steps that matter here. The visual staircase will match that list exactly,
            without inventing extra levels.
          </p>
          <button type="button" className="page-link primary" onClick={onOpenConfig}>
            Configure staircase
          </button>
        </div>
      </section>
    );
  }

  const canCompleteCurrent = selectedStep.isCurrent && !selectedStep.isCompleted;
  const canMoveToSelected = staircase.currentStepId !== selectedStep.id;

  return (
    <section className="spiritual-detail-panel">
      <div className="spiritual-detail-head">
        <div>
          <p className="panel-kicker">Selected step</p>
          <h3>{selectedStep.title}</h3>
          <p>
            {selectedStep.description?.trim() ||
              "Keep the stair itself short. Put the fuller explanation here, where it can breathe."}
          </p>
        </div>
        <span className={`spiritual-step-chip ${selectedStep.state}`}>{selectedStep.state}</span>
      </div>

      <div className="spiritual-step-actions">
        <button
          type="button"
          className="page-link primary"
          disabled={!canCompleteCurrent || pending}
          onClick={onCompleteCurrent}
        >
          <CheckCircle2 size={17} />
          {selectedStep.isCompleted ? "Completed" : "Complete step"}
        </button>
        <button
          type="button"
          className="page-link"
          disabled={!staircase.completedSteps || pending}
          onClick={onMoveBack}
        >
          <ArrowLeft size={17} />
          Move back one step
        </button>
        <button
          type="button"
          className="page-link"
          disabled={!canMoveToSelected || pending}
          onClick={() => onMoveToStep(selectedStep.id)}
        >
          Move character here
        </button>
      </div>

      {completedLabel ? (
        <p className="spiritual-detail-meta">Completed on {completedLabel}.</p>
      ) : null}

      <div className="spiritual-detail-grid">
        <article className="spiritual-support-card">
          <div className="spiritual-support-head">
            <div>
              <p className="panel-kicker">Tasks</p>
              <h4>Checklist for this step</h4>
            </div>
          </div>

          {selectedStep.tasks.length ? (
            <ul className="spiritual-task-list">
              {selectedStep.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  stepId={selectedStep.id}
                  pending={pending}
                  onToggle={(completed) =>
                    onToggleTask(selectedStep.id, task.id, completed)
                  }
                  onSave={(title) => onUpdateTask(selectedStep.id, task.id, title)}
                  onRemove={() => onRemoveTask(selectedStep.id, task.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="spiritual-support-empty">
              No checklist items yet. Add only the few tasks that help this step move forward.
            </p>
          )}

          <div className="spiritual-task-create">
            <input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="Add a small supporting task"
            />
            <button
              type="button"
              className="secondary"
              disabled={pending || !newTaskTitle.trim()}
              onClick={() => {
                const title = newTaskTitle.trim();
                if (!title) return;
                onAddTask(selectedStep.id, title);
                setNewTaskTitle("");
              }}
            >
              <Plus size={16} />
              Add task
            </button>
          </div>
        </article>

        <article className="spiritual-support-card">
          <div className="spiritual-support-head">
            <div>
              <p className="panel-kicker">Notes</p>
              <h4>Step reflections</h4>
            </div>
          </div>

          <label className="spiritual-notes-field">
            <span>Notes for this step</span>
            <textarea
              rows={6}
              value={stepNotes}
              onChange={(event) => setStepNotes(event.target.value)}
              placeholder="Reminders, difficulties, thoughts, or what you want to remember next time."
            />
          </label>
          <div className="spiritual-notes-actions">
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => onSaveStepNotes(selectedStep.id, stepNotes.trim() || null)}
            >
              Save step notes
            </button>
          </div>

          <label className="spiritual-notes-field subtle">
            <span>General staircase notes</span>
            <textarea
              rows={5}
              value={generalNotes}
              onChange={(event) => setGeneralNotes(event.target.value)}
              placeholder="A quiet space for the broader context of this staircase."
            />
          </label>
          <div className="spiritual-notes-actions">
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => onSaveGeneralNotes(generalNotes.trim() || null)}
            >
              Save staircase notes
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
