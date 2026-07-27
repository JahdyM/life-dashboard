"use client";

import { Check, LoaderCircle } from "lucide-react";
import type { AssistantAction } from "@/lib/assistant";

function actionLabel(action: AssistantAction) {
  const labels: Record<AssistantAction["type"], string> = {
    create_task: "New task",
    update_task: "Task",
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
  ].filter(Boolean);
  return parts.join(" · ");
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
