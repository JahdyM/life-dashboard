"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ArrowDown, ArrowUp, Share2, Trash2, X } from "lucide-react";
import type { TodoTask } from "@/lib/types";

type TaskDetailDraft = {
  title: string;
  isDone: boolean;
  priorityTag: string;
  scheduledTime: string;
  plannedTime: string;
  startTime: string;
  endTime: string;
  estimatedMinutes: number;
  actualMinutes: number;
  notes: string;
};

type TaskDetailSheetProps = {
  open: boolean;
  task: TodoTask | null;
  draft: TaskDetailDraft | null;
  saving: boolean;
  subtaskSavingId?: string | null;
  shareLabel?: string | null;
  shareActionLabel?: string;
  sharing?: boolean;
  canShare?: boolean;
  onClose: () => void;
  onSetDraft: (taskId: string, patch: Partial<TaskDetailDraft>) => void;
  onSave: (task: TodoTask) => void;
  onReset: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onToggleDone: (task: TodoTask, checked: boolean) => void;
  onShare?: (taskId: string) => void;
  onCreateSubtask: (taskId: string, title: string) => void;
  onRenameSubtask: (subtaskId: string, title: string) => void;
  onToggleSubtask: (task: TodoTask, subtaskId: string, checked: boolean) => void;
  onDeleteSubtask: (subtaskId: string) => void;
  onMoveSubtask: (task: TodoTask, subtaskId: string, direction: "up" | "down") => void;
};

export default function TaskDetailSheet({
  open,
  task,
  draft,
  saving,
  subtaskSavingId = null,
  shareLabel = null,
  shareActionLabel = "Share",
  sharing = false,
  canShare = false,
  onClose,
  onSetDraft,
  onSave,
  onReset,
  onDelete,
  onToggleDone,
  onShare,
  onCreateSubtask,
  onRenameSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onMoveSubtask,
}: TaskDetailSheetProps) {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [subtaskTitleDrafts, setSubtaskTitleDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose, open]);

  useEffect(() => {
    if (!task) {
      setSubtaskTitleDrafts({});
      return;
    }
    const next = (task.subtasks || []).reduce<Record<string, string>>((acc, subtask) => {
      acc[subtask.id] = subtask.title;
      return acc;
    }, {});
    setSubtaskTitleDrafts(next);
  }, [task]);

  useEffect(() => {
    if (!open) {
      setNewSubtaskTitle("");
    }
  }, [open]);

  const orderedSubtasks = useMemo(
    () =>
      [...(task?.subtasks || [])].sort(
        (left, right) => Number(left.order || 0) - Number(right.order || 0)
      ),
    [task?.subtasks]
  );

  const saveTask = useCallback(() => {
    if (!task) return;
    onSave(task);
  }, [onSave, task]);

  const handleFieldKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (!task) return;
      if (event.key === "Enter") {
        event.preventDefault();
        saveTask();
        event.currentTarget.blur();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onReset(task.id);
        event.currentTarget.blur();
      }
    },
    [onReset, saveTask, task]
  );

  const commitSubtaskRename = useCallback(
    (subtaskId: string) => {
      const value = (subtaskTitleDrafts[subtaskId] || "").trim();
      const original = orderedSubtasks.find((item) => item.id === subtaskId)?.title || "";
      if (!value || value === original) return;
      onRenameSubtask(subtaskId, value);
    },
    [onRenameSubtask, orderedSubtasks, subtaskTitleDrafts]
  );

  if (!open || !task || !draft) return null;

  return (
    <div className="task-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
      <button type="button" className="task-detail-backdrop" onClick={onClose} aria-label="Close task details" />
      <aside className="task-detail-sheet">
        <header className="task-detail-head">
          <div>
            <p className="panel-kicker">Task</p>
            <h3 id="task-detail-title">{draft.title}</h3>
            {shareLabel ? <p className="task-detail-share">{shareLabel}</p> : null}
          </div>
          <div className="task-detail-head-actions">
            {saving ? <span className="task-row-state">Saving…</span> : null}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close task details">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="task-detail-scroll">
          <section className="task-detail-section">
            <label>
              Title
              <input
                type="text"
                value={draft.title}
                onChange={(event) => onSetDraft(task.id, { title: event.target.value })}
                onBlur={saveTask}
                onKeyDown={handleFieldKeyDown}
              />
            </label>
          </section>

          <section className="task-detail-grid">
            <label>
              Priority
              <select
                value={draft.priorityTag}
                onChange={(event) => onSetDraft(task.id, { priorityTag: event.target.value })}
                onBlur={saveTask}
                onKeyDown={handleFieldKeyDown}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </label>

            <label>
              Estimate
              <input
                type="number"
                min={0}
                step={5}
                value={draft.estimatedMinutes}
                onChange={(event) =>
                  onSetDraft(task.id, {
                    estimatedMinutes: Math.max(0, Number(event.target.value || 0)),
                  })
                }
                onBlur={saveTask}
                onKeyDown={handleFieldKeyDown}
              />
            </label>

            <label>
              Planned
              <input
                type="time"
                value={draft.plannedTime}
                onChange={(event) =>
                  onSetDraft(task.id, {
                    plannedTime: event.target.value,
                    scheduledTime: event.target.value,
                  })
                }
                onBlur={saveTask}
                onKeyDown={handleFieldKeyDown}
              />
            </label>

            <label>
              Start
              <input
                type="time"
                value={draft.startTime}
                onChange={(event) => onSetDraft(task.id, { startTime: event.target.value })}
                onBlur={saveTask}
                onKeyDown={handleFieldKeyDown}
              />
            </label>

            <label>
              End
              <input
                type="time"
                value={draft.endTime}
                onChange={(event) => onSetDraft(task.id, { endTime: event.target.value })}
                onBlur={saveTask}
                onKeyDown={handleFieldKeyDown}
              />
            </label>

            <label>
              Actual
              <input
                type="number"
                min={0}
                step={5}
                value={draft.actualMinutes}
                onChange={(event) =>
                  onSetDraft(task.id, {
                    actualMinutes: Math.max(0, Number(event.target.value || 0)),
                  })
                }
                onBlur={saveTask}
                onKeyDown={handleFieldKeyDown}
              />
            </label>
          </section>

          <section className="task-detail-section">
            <label>
              Notes
              <textarea
                rows={5}
                value={draft.notes}
                onChange={(event) => onSetDraft(task.id, { notes: event.target.value })}
                onBlur={saveTask}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    saveTask();
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onReset(task.id);
                    (event.currentTarget as HTMLTextAreaElement).blur();
                  }
                }}
              />
            </label>
          </section>

          <section className="task-detail-section">
            <div className="task-detail-subtasks-head">
              <h4>Subtasks</h4>
              <span>{orderedSubtasks.filter((subtask) => subtask.isDone).length}/{orderedSubtasks.length}</span>
            </div>
            <input
              type="text"
              value={newSubtaskTitle}
              placeholder="New subtask · Enter"
              onChange={(event) => setNewSubtaskTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const value = newSubtaskTitle.trim();
                if (!value) return;
                onCreateSubtask(task.id, value);
                setNewSubtaskTitle("");
              }}
            />

            <div className="task-detail-subtasks">
              {orderedSubtasks.length === 0 ? (
                <p className="line-empty">No subtasks yet.</p>
              ) : (
                orderedSubtasks.map((subtask, index) => (
                  <div key={subtask.id} className={`task-detail-subtask-row ${subtask.isDone ? "completed" : ""}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(subtask.isDone)}
                      disabled={subtaskSavingId === subtask.id}
                      onChange={(event) => onToggleSubtask(task, subtask.id, event.target.checked)}
                    />
                    <input
                      type="text"
                      value={subtaskTitleDrafts[subtask.id] ?? subtask.title}
                      onChange={(event) =>
                        setSubtaskTitleDrafts((current) => ({
                          ...current,
                          [subtask.id]: event.target.value,
                        }))
                      }
                      onBlur={() => commitSubtaskRename(subtask.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitSubtaskRename(subtask.id);
                          event.currentTarget.blur();
                          return;
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setSubtaskTitleDrafts((current) => ({
                            ...current,
                            [subtask.id]: subtask.title,
                          }));
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <div className="task-detail-subtask-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={index === 0 || subtaskSavingId === subtask.id}
                        onClick={() => onMoveSubtask(task, subtask.id, "up")}
                        aria-label={`Move ${subtask.title} up`}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={index === orderedSubtasks.length - 1 || subtaskSavingId === subtask.id}
                        onClick={() => onMoveSubtask(task, subtask.id, "down")}
                        aria-label={`Move ${subtask.title} down`}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        disabled={subtaskSavingId === subtask.id}
                        onClick={() => onDeleteSubtask(subtask.id)}
                        aria-label={`Delete ${subtask.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <footer className="task-detail-footer">
          <label className="habit-row">
            <input
              type="checkbox"
              checked={draft.isDone}
              onChange={(event) => onToggleDone(task, event.target.checked)}
            />
            <span>Done</span>
          </label>
          <div className="task-detail-footer-actions">
            {canShare && onShare ? (
              <button
                type="button"
                className="secondary"
                onClick={() => onShare(task.id)}
                disabled={sharing}
              >
                <Share2 size={15} />
                {sharing ? "Working..." : shareActionLabel}
              </button>
            ) : null}
            <button type="button" className="secondary subtle danger" onClick={() => onDelete(task.id)}>
              <Trash2 size={15} />
              Delete
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
