"use client";

import { formatMinutes } from "@/lib/ministry";
import type { MinistryMonthSummary } from "@/lib/types";

function formatPaceMeta(summary: MinistryMonthSummary) {
  if (summary.expectedByTodayMinutes == null || summary.paceDifferenceMinutes == null) {
    return "Set a monthly goal";
  }

  const difference = Math.round(summary.paceDifferenceMinutes);
  const direction =
    difference > 0 ? `${formatMinutes(difference)} ahead` : difference < 0 ? `${formatMinutes(Math.abs(difference))} behind` : "On pace";

  return `Expected by today: ${formatMinutes(summary.expectedByTodayMinutes)} · ${direction}`;
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
      meta: summary.targetMinutes == null ? "Set the month target" : `${summary.daysInMonth} days`,
    },
    {
      label: "Completed so far",
      value: formatMinutes(summary.completedSoFarMinutes),
      meta: summary.completionPercent == null ? "So far" : `${summary.completionPercent.toFixed(1)}%`,
    },
    {
      label: "Daily average",
      value: summary.dailyTargetMinutes == null ? "—" : formatMinutes(summary.dailyTargetMinutes),
      meta: summary.dailyTargetMinutes == null ? "Set the month target" : `${summary.daysInMonth} day month`,
    },
    {
      label: "Pace",
      value: summary.paceLabel,
      meta: formatPaceMeta(summary),
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
