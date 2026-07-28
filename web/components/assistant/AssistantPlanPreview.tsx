"use client";

import { Check, LoaderCircle } from "lucide-react";
import type { AssistantAction } from "@/lib/assistant";

function actionLabel(action: AssistantAction) {
  const labels: Record<AssistantAction["type"], string> = {
    create_task: "New task",
    update_task: "Task",
    bulk_update_tasks: "Bulk review",
    create_habit: "New habit",
    create_area: "New tag",
    set_habit_status: "Habit",
    log_mood: "Mood",
    update_day_metrics: "Day metrics",
    set_low_energy_mode: "Energy mode",
    set_ministry_month_goal: "Ministry goal",
    update_ministry_day: "Ministry day",
    set_ministry_recurrence: "Ministry routine",
    remove_ministry_recurrence: "Stop routine",
    update_reading_progress: "Reading progress",
    set_books_goal: "Books goal",
    create_book: "New book",
    update_book: "Book",
    update_spiritual_streak: "Spiritual streak",
    update_spiritual_goal: "Spiritual goal",
    add_dissertation_step: "Next step",
    update_dissertation_front: "Research front",
    add_couple_goal: "Couple goal",
    update_couple_goal: "Couple goal",
    add_savings_goal: "Savings goal",
    update_savings_goal: "Savings goal",
    add_bucket_item: "Bucket list",
    toggle_bucket_item: "Bucket list",
    add_finance_expense: "Expense",
    update_finance_expense: "Expense",
    upsert_finance_debt: "Debt",
    update_finance_income: "Income",
    update_finance_fixed_cost: "Fixed cost",
    add_finance_fixed_cost: "New fixed cost",
    remove_finance_item: "Remove finance item",
    refresh_word_of_day: "New research word",
    set_assistant_preferences: "Orbit preference",
  };
  return labels[action.type];
}

function actionMeta(action: AssistantAction) {
  const parts = [
    action.payload.scheduledDate || action.payload.date || action.payload.month,
    action.payload.scheduledTime,
    action.payload.plannedTime &&
    action.payload.plannedTime !== action.payload.scheduledTime
      ? `planned ${action.payload.plannedTime}`
      : null,
    action.payload.startTime ? `started ${action.payload.startTime}` : null,
    action.payload.endTime ? `ended ${action.payload.endTime}` : null,
    action.payload.estimatedMinutes ? `${action.payload.estimatedMinutes} min` : null,
    action.payload.targetMinutes != null
      ? `${action.payload.targetMinutes} min target`
      : null,
    action.payload.goalMinutes != null ? `${action.payload.goalMinutes} min planned` : null,
    action.payload.weekday != null
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][action.payload.weekday]
      : null,
    action.payload.startDate,
    action.type === "set_ministry_recurrence" && action.payload.endDate == null
      ? "ongoing"
      : action.payload.endDate,
    action.payload.priority,
    action.payload.effort,
    action.payload.areaTag || action.payload.areaLabel,
    action.payload.habitKey,
    action.payload.completed === true
      ? "done"
      : action.payload.completed === false
        ? "not done"
        : null,
    action.payload.moodCategory,
    action.payload.bookStatus,
    action.payload.pagesRead != null ? `${action.payload.pagesRead} pages` : null,
    action.payload.boardKey,
    action.payload.progress != null ? `${action.payload.progress}%` : null,
    action.payload.amount != null ? `${action.payload.amount}` : null,
    action.payload.financeItemType,
    action.payload.scheduleLocked ? "fixed" : null,
    action.payload.dueDate,
    action.payload.taskUpdates?.length
      ? `${action.payload.taskUpdates.length} tasks`
      : null,
    action.payload.readingUpdates?.length
      ? `${action.payload.readingUpdates.length} changes`
      : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function taskUpdateMeta(
  update: NonNullable<AssistantAction["payload"]["taskUpdates"]>[number]
) {
  return [
    update.scheduledDate,
    update.scheduledTime,
    update.plannedTime && update.plannedTime !== update.scheduledTime
      ? `planned ${update.plannedTime}`
      : null,
    update.startTime ? `started ${update.startTime}` : null,
    update.endTime ? `ended ${update.endTime}` : null,
    update.estimatedMinutes != null ? `${update.estimatedMinutes} min` : null,
    update.priority,
    update.effort,
    update.areaTag,
    update.focusOrder != null ? `#${update.focusOrder}` : null,
    update.scheduleLocked ? "fixed" : null,
    update.completed === true
      ? "done"
      : update.completed === false
        ? "not done"
        : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function readingUpdateLabel(
  update: NonNullable<AssistantAction["payload"]["readingUpdates"]>[number]
) {
  const state = update.read ? "Read" : "Unread";
  if (update.kind === "bible_chapters") {
    return `${update.label || update.bookKey} ${update.chapters.join(", ")} · ${state}`;
  }
  return `${update.label || "Publication"} · ${state}`;
}

export default function AssistantPlanPreview({
  actions,
  applied,
  applying,
  compact = false,
  onApply,
}: {
  actions: AssistantAction[];
  applied: boolean;
  applying: boolean;
  compact?: boolean;
  onApply: () => void;
}) {
  return (
    <div className={`assistant-plan ${compact ? "compact" : ""}`}>
      {actions.map((action) => (
        <div key={action.id} className="assistant-plan-item">
          <span>{actionLabel(action)}</span>
          <strong>{action.title}</strong>
          {actionMeta(action) ? <small>{actionMeta(action)}</small> : null}
          {action.reason ? <small>{action.reason}</small> : null}
          {action.type === "bulk_update_tasks" && action.payload.taskUpdates?.length ? (
            <details className="assistant-bulk-review">
              <summary>Review changes</summary>
              <div>
                {action.payload.taskUpdates.map((update) => (
                  <p key={update.taskId}>
                    <strong>{update.title || "Task"}</strong>
                    <small>{taskUpdateMeta(update)}</small>
                  </p>
                ))}
              </div>
            </details>
          ) : null}
          {action.type === "update_reading_progress" &&
          action.payload.readingUpdates?.length ? (
            <details className="assistant-bulk-review">
              <summary>Review reading changes</summary>
              <div>
                {action.payload.readingUpdates.map((update, index) => (
                  <p
                    key={
                      update.kind === "bible_chapters"
                        ? `${update.bookKey}-${update.chapters.join("-")}-${index}`
                        : `${update.kind}-${update.itemId}-${index}`
                    }
                  >
                    <strong>{readingUpdateLabel(update)}</strong>
                  </p>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className="assistant-apply"
        disabled={applied || applying}
        onClick={onApply}
      >
        {applied ? (
          <>
            <Check size={15} /> Applied
          </>
        ) : applying ? (
          <>
            <LoaderCircle size={15} className="spin" /> Applying
          </>
        ) : (
          "Apply plan"
        )}
      </button>
    </div>
  );
}
