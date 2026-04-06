"use client";

import { formatMinutes } from "@/lib/ministry";
import type { MinistryMonthSummary } from "@/lib/types";

function formatDifference(minutes: number) {
  if (minutes === 0) return "On plan";
  const prefix = minutes > 0 ? "+" : "−";
  return `${prefix}${formatMinutes(Math.abs(minutes))}`;
}

function formatPlanningMeta(
  difference: number | null,
  targetMinutes: number | null
) {
  if (targetMinutes == null || difference == null) {
    return "Manual plan";
  }

  if (difference === 0) {
    return "Target covered";
  }

  if (difference > 0) {
    return `${formatMinutes(difference)} over`;
  }

  return `${formatMinutes(Math.abs(difference))} short`;
}

export default function MinistrySummaryCards({
  summary,
}: {
  summary: MinistryMonthSummary;
}) {
  const cards = [
    {
      label: "Goal",
      value: summary.targetMinutes == null ? "Not set" : formatMinutes(summary.targetMinutes),
      meta: "Target",
    },
    {
      label: "Planned",
      value: formatMinutes(summary.totalPlannedMinutes),
      meta: formatPlanningMeta(
        summary.plannedDifferenceFromTargetMinutes,
        summary.targetMinutes
      ),
      accent:
        summary.plannedDifferenceFromTargetMinutes == null
          ? "neutral"
          : summary.plannedDifferenceFromTargetMinutes >= 0
            ? "success"
            : "warning",
    },
    {
      label: "Done",
      value: formatMinutes(summary.totalCompletedMinutes),
      meta: "Logged",
    },
    {
      label: "Remaining",
      value:
        summary.totalRemainingMinutes == null
          ? "No target"
          : formatMinutes(summary.totalRemainingMinutes),
      meta: "To target",
    },
    {
      label: "%",
      value:
        summary.completionPercent == null ? "—" : `${summary.completionPercent.toFixed(1)}%`,
      meta: "Of target",
    },
    {
      label: "Plan to date",
      value: formatMinutes(summary.accumulatedPlannedMinutes),
      meta: "Manual plan",
    },
    {
      label: "Done to date",
      value: formatMinutes(summary.accumulatedActualMinutes),
      meta: "Logged",
    },
    {
      label: "Difference",
      value: formatDifference(summary.accumulatedDifferenceMinutes),
      meta: "Actual vs plan",
    },
    {
      label: "Pace",
      value: summary.paceLabel,
      meta:
        summary.activeGoalDays > 0
          ? `${summary.completedGoalDays}/${summary.activeGoalDays} due days`
          : "No due days",
      accent:
        summary.paceStatus === "ahead"
          ? "success"
          : summary.paceStatus === "behind"
            ? "danger"
            : summary.paceStatus === "on_track"
              ? "warning"
              : "neutral",
    },
  ];

  return (
    <section className="ministry-summary-grid" aria-label="Ministry summary">
      {cards.map((card) => (
        <article
          key={card.label}
          className={`ministry-summary-card ${card.accent || ""}`.trim()}
        >
          <p className="ministry-summary-label">{card.label}</p>
          <p className="ministry-summary-value">{card.value}</p>
          <p className="ministry-summary-meta">{card.meta}</p>
        </article>
      ))}
    </section>
  );
}
