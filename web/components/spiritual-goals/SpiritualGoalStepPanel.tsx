"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ArrowLeft, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
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
  const skipBlurRef = useRef(false);

  useEffect(() => {
    setDraft(task.title);
  }, [task.title]);

  const handleSubmit = () => {
    const next = draft.trim();
    if (!next) {
      setDraft(task.title);
      setEditing(false);
      return;
    }
    if (next !== task.title) {
      onSave(next);
    }
    setEditing(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      skipBlurRef.current = true;
      setDraft(task.title);
      setEditing(false);
    }
  };

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
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (skipBlurRef.current) {
                  skipBlurRef.current = false;
                  return;
                }
                handleSubmit();
              }}
              aria-label={`Edit task for ${stepId}`}
            />
          </>
        ) : (
          <>
            <button
              type="button"
              className="secondary subtle"
              aria-label={`Edit task ${task.title}`}
              onClick={() => {
                setDraft(task.title);
                setEditing(true);
              }}
              disabled={pending}
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
  const [pendingMoveTargetId, setPendingMoveTargetId] = useState<string | null>(null);
  const [stepNotesState, setStepNotesState] = useState<"idle" | "saving" | "saved">("idle");
  const [generalNotesState, setGeneralNotesState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    setStepNotes(selectedStep?.notes || "");
    setNewTaskTitle("");
    setPendingMoveTargetId(null);
    setStepNotesState("idle");
  }, [selectedStep?.id, selectedStep?.notes]);

  useEffect(() => {
    setGeneralNotes(staircase.generalNotes || "");
    setGeneralNotesState("idle");
  }, [staircase.generalNotes, staircase.category]);

  useEffect(() => {
    if (!selectedStep) return;
    const normalizedDraft = stepNotes.trim();
    const normalizedSaved = selectedStep.notes?.trim() || "";
    if (normalizedDraft === normalizedSaved) {
      setStepNotesState("idle");
      return;
    }
    setStepNotesState("saving");
    const timeoutId = window.setTimeout(() => {
      onSaveStepNotes(selectedStep.id, normalizedDraft || null);
      setStepNotesState("saved");
    }, 650);
    return () => window.clearTimeout(timeoutId);
  }, [onSaveStepNotes, selectedStep, stepNotes]);

  useEffect(() => {
    const normalizedDraft = generalNotes.trim();
    const normalizedSaved = staircase.generalNotes?.trim() || "";
    if (normalizedDraft === normalizedSaved) {
      setGeneralNotesState("idle");
      return;
    }
    setGeneralNotesState("saving");
    const timeoutId = window.setTimeout(() => {
      onSaveGeneralNotes(normalizedDraft || null);
      setGeneralNotesState("saved");
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [generalNotes, onSaveGeneralNotes, staircase.generalNotes]);

  const completedLabel = useMemo(
    () => formatCompletedLabel(selectedStep?.completedAt || null),
    [selectedStep?.completedAt]
  );

  if (!selectedStep) {
    return (
      <section className="spiritual-detail-panel empty">
        <div className="spiritual-detail-empty">
          <p className="panel-kicker">Step</p>
          <h3>No steps yet.</h3>
          <button type="button" className="page-link primary" onClick={onOpenConfig}>
            Configure
          </button>
        </div>
      </section>
    );
  }

  const canCompleteCurrent = selectedStep.isCurrent && !selectedStep.isCompleted;
  const canMoveToSelected = staircase.currentStepId !== selectedStep.id;
  const moveConfirmOpen = pendingMoveTargetId === selectedStep.id;

  const handleNewTaskSubmit = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    onAddTask(selectedStep.id, title);
    setNewTaskTitle("");
  };

  return (
    <section className="spiritual-detail-panel">
      <div className="spiritual-detail-head">
        <div>
          <h3>{selectedStep.title}</h3>
          <p>{selectedStep.description?.trim() || "No details."}</p>
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
          Done
        </button>
        <button
          type="button"
          className="page-link"
          disabled={!staircase.completedSteps || pending}
          onClick={onMoveBack}
        >
          <ArrowLeft size={17} />
          Back
        </button>
        <button
          type="button"
          className="page-link"
          disabled={!canMoveToSelected || pending}
          onClick={() => setPendingMoveTargetId(selectedStep.id)}
        >
          Move here
        </button>
      </div>

      {moveConfirmOpen ? (
        <div className="spiritual-inline-confirm">
          <p>Move here?</p>
          <div className="spiritual-inline-confirm-actions">
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => {
                onMoveToStep(selectedStep.id);
                setPendingMoveTargetId(null);
              }}
            >
              Move
            </button>
            <button
              type="button"
              className="page-link inline muted"
              onClick={() => setPendingMoveTargetId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {completedLabel ? (
        <p className="spiritual-detail-meta">Done on {completedLabel}.</p>
      ) : null}

      <div className="spiritual-detail-grid">
        <article className="spiritual-support-card">
          <div className="spiritual-support-head">
            <div>
              <p className="panel-kicker">Tasks</p>
              <h4>Checklist</h4>
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
              No tasks yet.
            </p>
          )}

          <div className="spiritual-task-create">
            <input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleNewTaskSubmit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setNewTaskTitle("");
                }
              }}
              placeholder="Add task"
            />
            <button
              type="button"
              className="secondary"
              disabled={pending || !newTaskTitle.trim()}
              onClick={handleNewTaskSubmit}
            >
              <Plus size={16} />
              Add
            </button>
          </div>
        </article>

        <article className="spiritual-support-card">
          <div className="spiritual-support-head">
            <div>
              <p className="panel-kicker">Notes</p>
              <h4>Notes</h4>
            </div>
          </div>

          <label className="spiritual-notes-field">
            <span>Step</span>
            <textarea
              rows={6}
              value={stepNotes}
              onChange={(event) => setStepNotes(event.target.value)}
              placeholder="Notes"
            />
          </label>
          <p className="spiritual-notes-status">
            {stepNotesState === "saving"
              ? "Saving…"
              : stepNotesState === "saved"
                ? "Saved"
                : "Autosave"}
          </p>

          <label className="spiritual-notes-field subtle">
            <span>General</span>
            <textarea
              rows={5}
              value={generalNotes}
              onChange={(event) => setGeneralNotes(event.target.value)}
              placeholder="General notes"
            />
          </label>
          <p className="spiritual-notes-status">
            {generalNotesState === "saving"
              ? "Saving…"
              : generalNotesState === "saved"
                ? "Saved"
                : "Autosave"}
          </p>
        </article>
      </div>
    </section>
  );
}
