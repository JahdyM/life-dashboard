"use client";

import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { getSpiritualGoalMeta } from "@/lib/spiritualGoals";
import type { SpiritualGoalComputedStaircase } from "@/lib/types";
import SpiritualStaircase from "./SpiritualStaircase";

export default function SpiritualGoalOverviewCard({
  staircase,
  active,
  onOpen,
}: {
  staircase: SpiritualGoalComputedStaircase;
  active: boolean;
  onOpen: () => void;
}) {
  const meta = getSpiritualGoalMeta(staircase.category);

  return (
    <article
      className={`spiritual-overview-card ${active ? "active" : ""}`}
      style={{ "--spiritual-accent": staircase.accentColor } as CSSProperties}
    >
      <button
        type="button"
        className="spiritual-overview-button"
        onClick={onOpen}
        aria-pressed={active}
        aria-label={`Open ${meta.label} staircase`}
      >
        <div className="spiritual-overview-head">
          <p className="panel-kicker">{meta.label}</p>
          <span className="spiritual-progress-pill">{staircase.progressPercent}%</span>
        </div>

        <div className="spiritual-overview-copy">
          <h3>{staircase.title}</h3>
          <p>{staircase.ultimateGoal}</p>
        </div>

        <SpiritualStaircase staircase={staircase} compact />

        <div className="spiritual-overview-footer">
          <div>
            <span className="spiritual-overview-label">Current step</span>
            <strong>{staircase.currentStepTitle || "Set the first short step"}</strong>
          </div>
          <span className="spiritual-open-link">
            Open
            <ArrowUpRight size={16} />
          </span>
        </div>
      </button>
    </article>
  );
}
