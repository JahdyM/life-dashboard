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
    set_ministry_month_goal: "Ministry goal",
    update_ministry_day: "Ministry day",
    add_dissertation_step: "Next step",
    update_dissertation_front: "Research front",
  };
  return labels[action.type];
}

function actionMeta(action: AssistantAction) {
  const parts = [
    action.payload.scheduledDate || action.payload.date || action.payload.month,
    action.payload.scheduledTime,
    action.payload.estimatedMinutes ? `${action.payload.estimatedMinutes} min` : null,
    action.payload.targetMinutes != null
      ? `${action.payload.targetMinutes} min target`
      : null,
    action.payload.goalMinutes != null ? `${action.payload.goalMinutes} min planned` : null,
    action.payload.priority,
    action.payload.areaTag || action.payload.areaLabel,
    action.payload.dueDate,
    action.payload.taskUpdates?.length
      ? `${action.payload.taskUpdates.length} tasks`
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
    update.estimatedMinutes != null ? `${update.estimatedMinutes} min` : null,
    update.priority,
    update.areaTag,
    update.focusOrder != null ? `#${update.focusOrder}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
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
