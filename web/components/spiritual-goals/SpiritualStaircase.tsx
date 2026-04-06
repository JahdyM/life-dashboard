"use client";

import type { CSSProperties } from "react";
import { Bookmark, Compass, Sparkles, Sprout } from "lucide-react";
import type { SpiritualGoalComputedStaircase } from "@/lib/types";

type SpiritualStaircaseProps = {
  staircase: SpiritualGoalComputedStaircase;
  compact?: boolean;
  selectedStepId?: string | null;
  onSelectStep?: (stepId: string) => void;
};

function getAvatarIcon(avatarStyle: SpiritualGoalComputedStaircase["avatarStyle"]) {
  switch (avatarStyle) {
    case "spark":
      return Sparkles;
    case "bookmark":
      return Bookmark;
    case "compass":
      return Compass;
    case "sprout":
    default:
      return Sprout;
  }
}

export default function SpiritualStaircase({
  staircase,
  compact = false,
  selectedStepId = null,
  onSelectStep,
}: SpiritualStaircaseProps) {
  const totalSteps = staircase.steps.length;
  const AvatarIcon = getAvatarIcon(staircase.avatarStyle);
  const isInteractive = !compact && typeof onSelectStep === "function";

  const stepWidth = compact ? (totalSteps > 7 ? 46 : 56) : totalSteps > 8 ? 112 : 124;
  const stepHeight = compact ? 24 : totalSteps > 8 ? 62 : 72;
  const horizontalGap = compact ? (totalSteps > 7 ? 18 : 22) : totalSteps > 8 ? 34 : 42;
  const verticalGap = compact ? (totalSteps > 7 ? 14 : 17) : totalSteps > 8 ? 34 : 42;
  const containerWidth = totalSteps
    ? stepWidth + (totalSteps - 1) * horizontalGap + (compact ? 26 : 52)
    : compact
      ? 120
      : 240;
  const containerHeight = totalSteps
    ? stepHeight + (totalSteps - 1) * verticalGap + (compact ? 42 : 84)
    : compact
      ? 80
      : 180;

  const currentIndex = staircase.currentStepIndex ?? (totalSteps ? totalSteps - 1 : null);
  const avatarLeft =
    currentIndex == null ? 0 : 16 + currentIndex * horizontalGap + stepWidth - (compact ? 18 : 28);
  const avatarBottom =
    currentIndex == null ? 0 : 18 + currentIndex * verticalGap + stepHeight - (compact ? 4 : 2);

  const style = {
    "--spiritual-accent": staircase.accentColor,
    "--spiritual-width": `${containerWidth}px`,
    "--spiritual-height": `${containerHeight}px`,
    "--spiritual-step-width": `${stepWidth}px`,
    "--spiritual-step-height": `${stepHeight}px`,
    "--spiritual-step-gap-x": `${horizontalGap}px`,
    "--spiritual-step-gap-y": `${verticalGap}px`,
  } as CSSProperties;

  return (
    <div
      className={`spiritual-staircase ${compact ? "compact" : "full"}`}
      style={style}
      aria-label={compact ? "Staircase preview" : `${staircase.title} staircase`}
    >
      <div className="spiritual-staircase-rail" aria-hidden="true" />

      {totalSteps ? (
        <>
          {staircase.steps.map((step, index) => {
            const stepStyle = {
              left: `${16 + index * horizontalGap}px`,
              bottom: `${18 + index * verticalGap}px`,
            } as CSSProperties;
            const selected = step.id === selectedStepId;
            const className = [
              "spiritual-step",
              step.state,
              selected ? "selected" : "",
              isInteractive ? "interactive" : "",
            ]
              .filter(Boolean)
              .join(" ");

            if (compact || !isInteractive) {
              return (
                <div
                  key={step.id}
                  className={className}
                  style={stepStyle}
                  title={step.title}
                  aria-hidden={compact ? "true" : undefined}
                >
                  {!compact ? <span className="spiritual-step-label">{step.title}</span> : null}
                </div>
              );
            }

            return (
              <button
                key={step.id}
                type="button"
                className={className}
                style={stepStyle}
                onClick={() => onSelectStep?.(step.id)}
                aria-pressed={selected}
                aria-label={`${step.stepOrder + 1}. ${step.title}. ${step.state}`}
                title={step.title}
              >
                <span className="spiritual-step-label">{step.title}</span>
              </button>
            );
          })}

          {currentIndex != null ? (
            <div
              className={`spiritual-avatar ${compact ? "compact" : ""}`}
              style={{ left: `${avatarLeft}px`, bottom: `${avatarBottom}px` }}
              aria-hidden="true"
            >
              <AvatarIcon size={compact ? 14 : 18} strokeWidth={2} />
            </div>
          ) : null}
        </>
      ) : (
        <div className="spiritual-staircase-empty">
          <p>No steps yet</p>
          <span>Open Configure to shape this staircase.</span>
        </div>
      )}
    </div>
  );
}
