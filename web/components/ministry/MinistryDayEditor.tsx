"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deriveMinistryDayStatus,
  formatMinutes,
  hoursMinutesToTotalMinutes,
  minutesToParts,
} from "@/lib/ministry";
import type { MinistryDayComputed } from "@/lib/types";

function toNullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

export default function MinistryDayEditor({
  day,
  saving,
  onClose,
  onSave,
}: {
  day: MinistryDayComputed | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: {
    goalMinutes: number | null;
    actualMinutes: number | null;
    notes: string | null;
  }) => void;
}) {
  const [goalHours, setGoalHours] = useState("");
  const [goalMinutes, setGoalMinutes] = useState("");
  const [actualHours, setActualHours] = useState("");
  const [actualMinutes, setActualMinutes] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!day) return;
    const goal = minutesToParts(day.goalMinutes);
    const actual = minutesToParts(day.actualMinutes);
    setGoalHours(day.goalMinutes == null ? "" : String(goal.hours));
    setGoalMinutes(day.goalMinutes == null ? "" : String(goal.minutes));
    setActualHours(day.actualMinutes == null ? "" : String(actual.hours));
    setActualMinutes(day.actualMinutes == null ? "" : String(actual.minutes));
    setNotes(day.notes || "");
  }, [day]);

  useEffect(() => {
    if (!day) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [day, onClose]);

  const preview = useMemo(() => {
    const goalHoursValue = toNullableNumber(goalHours);
    const goalMinutesValue = toNullableNumber(goalMinutes);
    const actualHoursValue = toNullableNumber(actualHours);
    const actualMinutesValue = toNullableNumber(actualMinutes);
    const nextGoal =
      goalHoursValue == null && goalMinutesValue == null
        ? null
        : hoursMinutesToTotalMinutes(goalHoursValue || 0, goalMinutesValue || 0);
    const nextActual =
      actualHoursValue == null && actualMinutesValue == null
        ? null
        : hoursMinutesToTotalMinutes(actualHoursValue || 0, actualMinutesValue || 0);
    const status = deriveMinistryDayStatus(nextGoal, nextActual, { isFuture: day.isFuture });
    return {
      goal: nextGoal,
      actual: nextActual,
      status,
    };
  }, [actualHours, actualMinutes, goalHours, goalMinutes]);

  if (!day) return null;

  return (
    <div
      className="ministry-editor-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ministry-day-editor-title"
      onClick={onClose}
    >
      <div className="ministry-editor-card" onClick={(event) => event.stopPropagation()}>
        <div className="ministry-editor-head">
          <div>
            <p className="panel-kicker">Day editor</p>
            <h3 id="ministry-day-editor-title">{day.date}</h3>
            <p className="ministry-editor-preview">
              Planned {formatMinutes(preview.goal)} · Actual {formatMinutes(preview.actual)}
            </p>
          </div>
          <button className="secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="ministry-editor-grid">
          <label>
            Goal hours
            <input
              type="number"
              min={0}
              value={goalHours}
              onChange={(event) => setGoalHours(event.target.value)}
            />
          </label>
          <label>
            Goal minutes
            <input
              type="number"
              min={0}
              max={59}
              value={goalMinutes}
              onChange={(event) => setGoalMinutes(event.target.value)}
            />
          </label>
          <label>
            Actual hours
            <input
              type="number"
              min={0}
              value={actualHours}
              onChange={(event) => setActualHours(event.target.value)}
            />
          </label>
          <label>
            Actual minutes
            <input
              type="number"
              min={0}
              max={59}
              value={actualMinutes}
              onChange={(event) => setActualMinutes(event.target.value)}
            />
          </label>
        </div>

        <label className="ministry-editor-notes">
          Note
          <textarea
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional note about the day, calls, return visits, or context."
          />
        </label>

        <div className="ministry-editor-status">
          <span className={`ministry-status-badge ${preview.status}`}>
            {preview.status === "no_goal"
              ? "No goal set"
              : preview.status === "planned"
                ? "Planned"
              : preview.status === "missed"
                ? "Below goal"
                : preview.status === "partial"
                  ? "Partially completed"
                  : preview.status === "met"
                    ? "Goal met"
                    : "Exceeded"}
          </span>
        </div>

        <div className="ministry-editor-actions">
          <button
            className="secondary"
            type="button"
            disabled={saving}
            onClick={() => onSave({ goalMinutes: null, actualMinutes: null, notes: null })}
          >
            Clear day
          </button>
          <button
            className="primary"
            type="button"
            disabled={saving}
            onClick={() =>
              onSave({
                goalMinutes: preview.goal,
                actualMinutes: preview.actual,
                notes: notes.trim() ? notes.trim() : null,
              })
            }
          >
            {saving ? "Saving..." : "Save day"}
          </button>
        </div>
      </div>
    </div>
  );
}
