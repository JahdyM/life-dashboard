"use client";

import type { FormEvent } from "react";
import { CalendarRange, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";

type TaskComposerProps = {
  title: string;
  date: string;
  time: string;
  estimate: number;
  shareWithPartner: boolean;
  advancedOpen: boolean;
  selectionLabel: string | null;
  disabled: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onTitleChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onEstimateChange: (value: number) => void;
  onShareChange: (checked: boolean) => void;
  onToggleAdvanced: () => void;
  onClearSelection: () => void;
};

export default function TaskComposer({
  title,
  date,
  time,
  estimate,
  shareWithPartner,
  advancedOpen,
  selectionLabel,
  disabled,
  submitLabel,
  onSubmit,
  onTitleChange,
  onDateChange,
  onTimeChange,
  onEstimateChange,
  onShareChange,
  onToggleAdvanced,
  onClearSelection,
}: TaskComposerProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || disabled) return;
    onSubmit();
  };

  return (
    <form className="task-composer" onSubmit={handleSubmit}>
      <div className="task-composer-head">
        <div>
          <p className="panel-kicker">Add activity</p>
          <h3>Capture the next step without leaving the flow.</h3>
        </div>
        <button type="button" className="secondary subtle" onClick={onToggleAdvanced}>
          {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {advancedOpen ? "Hide details" : "Show details"}
        </button>
      </div>

      <div className="task-composer-primary">
        <label className="task-composer-title-field">
          <span className="sr-only">Task title</span>
          <input
            id="calendar-task-title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="What needs attention next?"
          />
        </label>
        <button type="submit" className="primary" disabled={disabled || !title.trim()}>
          {submitLabel}
        </button>
      </div>

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
        <p className="task-composer-hint">
          Click or drag a slot on the calendar to prefill the date and time here.
        </p>
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
            />
          </div>
          <div className="form-row">
            <label htmlFor="calendar-task-time">Start time</label>
            <input
              id="calendar-task-time"
              type="time"
              value={time}
              onChange={(event) => onTimeChange(event.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="calendar-task-estimate">Est. minutes</label>
            <input
              id="calendar-task-estimate"
              type="number"
              min={5}
              step={5}
              value={estimate}
              onChange={(event) => onEstimateChange(Math.max(5, Number(event.target.value || 30)))}
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
              Share this task with your partner
            </span>
          </label>
        </div>
      ) : null}
    </form>
  );
}
