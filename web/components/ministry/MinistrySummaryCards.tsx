"use client";

import { formatMinutes } from "@/lib/ministry";
import type { MinistryMonthSummary } from "@/lib/types";

function formatDifference(minutes: number) {
  if (minutes === 0) return "On plan";
  const prefix = minutes > 0 ? "+" : "−";
  return `${prefix}${formatMinutes(Math.abs(minutes))}`;
}

export default function MinistrySummaryCards({
  summary,
}: {
  summary: MinistryMonthSummary;
}) {
  const cards = [
    {
      label: "Monthly goal",
      value: summary.targetMinutes == null ? "Not set" : formatMinutes(summary.targetMinutes),
      meta: "Manual monthly target",
    },
    {
      label: "Completed",
      value: formatMinutes(summary.totalCompletedMinutes),
      meta: "Total actual time logged",
    },
    {
      label: "Remaining",
      value:
        summary.totalRemainingMinutes == null
          ? "No target"
          : formatMinutes(summary.totalRemainingMinutes),
      meta: "Target minus total completed",
    },
    {
      label: "Completion",
      value:
        summary.completionPercent == null ? "—" : `${summary.completionPercent.toFixed(1)}%`,
      meta: "Progress toward the month",
    },
    {
      label: "Planned through today",
      value: formatMinutes(summary.accumulatedPlannedMinutes),
      meta: "Only manual daily goals count",
    },
    {
      label: "Actual through today",
      value: formatMinutes(summary.accumulatedActualMinutes),
      meta: "Logged time up to today",
    },
    {
      label: "Difference through today",
      value: formatDifference(summary.accumulatedDifferenceMinutes),
      meta: "Actual minus planned",
    },
    {
      label: "Pace",
      value: summary.paceLabel,
      meta:
        summary.activeGoalDays > 0
          ? `${summary.completedGoalDays}/${summary.activeGoalDays} goal days met`
          : "No manual goal days yet",
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
