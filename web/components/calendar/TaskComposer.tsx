"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { CalendarRange, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";

type TaskComposerProps = {
  title: string;
  date: string;
  time: string;
  estimate: number;
  shareWithPartner: boolean;
  advancedOpen: boolean;
  selectionLabel: string | null;
  pending: boolean;
  onSubmit: () => void;
  onTitleChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onEstimateChange: (value: number) => void;
  onShareChange: (checked: boolean) => void;
  onToggleAdvanced: () => void;
  onClearSelection: () => void;
  onCancel?: () => void;
};

export default function TaskComposer({
  title,
  date,
  time,
  estimate,
  shareWithPartner,
  advancedOpen,
  selectionLabel,
  pending,
  onSubmit,
  onTitleChange,
  onDateChange,
  onTimeChange,
  onEstimateChange,
  onShareChange,
  onToggleAdvanced,
  onClearSelection,
  onCancel,
}: TaskComposerProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!title.trim()) return;
      onSubmit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
      event.currentTarget.blur();
    }
  };

  return (
    <form className="task-composer" onSubmit={handleSubmit}>
      <div className="task-composer-head">
        <div>
          <p className="panel-kicker">Add</p>
          <h3>Task</h3>
        </div>
        <button type="button" className="secondary subtle" onClick={onToggleAdvanced}>
          {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {advancedOpen ? "Hide" : "Details"}
        </button>
      </div>

      <div className="task-composer-primary">
        <label className="task-composer-title-field">
          <span className="sr-only">Task title</span>
          <input
            id="calendar-task-title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add task"
            aria-label="Add task"
          />
        </label>
      </div>
      <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1}>
        Add task
      </button>

      {selectionLabel ? (
        <div className="task-composer-selection">
          <span>
            <CalendarRange size={15} />
            {selectionLabel}
          </span>
          <button type="button" className="page-link inline muted" onClick={onClearSelection}>
            <X size={14} />
            Clear
          </button>
        </div>
      ) : (
        <p className="task-composer-hint">{pending ? "Saving…" : "Enter adds."}</p>
      )}

      {advancedOpen ? (
        <div className="task-composer-advanced">
          <div className="form-row">
            <label htmlFor="calendar-task-date">Date</label>
            <input
              id="calendar-task-date"
              type="date"
              value={date}
              onChange={(event) => onDateChange(event.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="form-row">
            <label htmlFor="calendar-task-time">Time</label>
            <input
              id="calendar-task-time"
              type="time"
              value={time}
              onChange={(event) => onTimeChange(event.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="form-row">
            <label htmlFor="calendar-task-estimate">Estimate</label>
            <input
              id="calendar-task-estimate"
              type="number"
              min={5}
              step={5}
              value={estimate}
              onChange={(event) => onEstimateChange(Math.max(5, Number(event.target.value || 30)))}
              onKeyDown={handleKeyDown}
            />
          </div>
          <label className="habit-row task-composer-share-row">
            <input
              type="checkbox"
              checked={shareWithPartner}
              onChange={(event) => onShareChange(event.target.checked)}
            />
            <span>
              <Sparkles size={15} />
              Share
            </span>
          </label>
        </div>
      ) : null}
    </form>
  );
}
