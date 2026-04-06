"use client";

import type { CSSProperties } from "react";
import type { SpiritualGoalComputedStaircase } from "@/lib/types";

type SpiritualStaircaseProps = {
  staircase: SpiritualGoalComputedStaircase;
  compact?: boolean;
  selectedStepId?: string | null;
  onSelectStep?: (stepId: string) => void;
};

function SpiritualAvatarFigure({
  avatarStyle,
  compact,
}: {
  avatarStyle: SpiritualGoalComputedStaircase["avatarStyle"];
  compact: boolean;
}) {
  return (
    <svg
      className={`spiritual-avatar-figure ${compact ? "compact" : ""}`}
      viewBox="0 0 44 58"
      role="presentation"
      aria-hidden="true"
    >
      <ellipse className="spiritual-avatar-shadow" cx="22" cy="54" rx="10" ry="3.5" />
      <path
        className="spiritual-avatar-legs"
        d="M19.5 36.5L17 50.5M24.5 36.5L27 50.5"
      />
      <path
        className="spiritual-avatar-arms"
        d="M17.5 24.5L12.5 32M26.5 24.5L31.5 32"
      />
      <path
        className="spiritual-avatar-body"
        d="M18.2 18.6C19.3 17.4 20.6 16.8 22 16.8C23.4 16.8 24.7 17.4 25.8 18.6L31.4 33.1C31.9 34.6 30.8 36.2 29.2 36.2H14.8C13.2 36.2 12.1 34.6 12.6 33.1L18.2 18.6Z"
      />
      <circle className="spiritual-avatar-head" cx="22" cy="10.5" r="6.3" />
      <path
        className="spiritual-avatar-hair"
        d="M15.8 10.7C15.8 6.9 18.4 4 22 4C25.6 4 28.2 6.9 28.2 10.7C26.5 9.1 24.4 8.3 22.1 8.3C19.7 8.3 17.5 9.1 15.8 10.7Z"
      />

      {avatarStyle === "sprout" ? (
        <g className="spiritual-avatar-accent">
          <path d="M25.3 21.8C27.1 20.2 29.1 19.7 30.8 20.1C30.7 22.3 29.5 24.4 27.5 25.6C26.5 24.6 25.8 23.3 25.3 21.8Z" />
          <path d="M24 22.6C22.5 20.7 21.9 18.8 22 17C24.2 17.2 26.1 18.5 27 20.5C26 21.3 24.9 22 24 22.6Z" />
        </g>
      ) : null}

      {avatarStyle === "spark" ? (
        <path
          className="spiritual-avatar-accent"
          d="M30.8 17.2L31.8 19.5L34.2 20L32.3 21.6L32.6 24L30.6 22.8L28.5 24L29 21.6L27.2 20L29.5 19.5L30.8 17.2Z"
        />
      ) : null}

      {avatarStyle === "compass" ? (
        <g className="spiritual-avatar-accent">
          <circle cx="22" cy="26.7" r="3.7" />
          <path d="M22 23.8L23.3 27.1L20.8 28.8L22 23.8Z" className="spiritual-avatar-accent-detail" />
        </g>
      ) : null}

      {avatarStyle === "bookmark" ? (
        <g className="spiritual-avatar-accent">
          <path d="M27.7 18.4H31.4V28.6L29.5 27.1L27.7 28.6V18.4Z" />
        </g>
      ) : null}
    </svg>
  );
}

export default function SpiritualStaircase({
  staircase,
  compact = false,
  selectedStepId = null,
  onSelectStep,
}: SpiritualStaircaseProps) {
  const totalSteps = staircase.steps.length;
  const isInteractive = !compact && typeof onSelectStep === "function";

  const stepWidth = compact ? (totalSteps > 7 ? 46 : 56) : totalSteps > 8 ? 112 : 124;
  const stepHeight = compact ? 24 : totalSteps > 8 ? 62 : 72;
  const horizontalGap = compact ? (totalSteps > 7 ? 18 : 22) : totalSteps > 8 ? 34 : 42;
  const verticalGap = compact ? (totalSteps > 7 ? 14 : 17) : totalSteps > 8 ? 34 : 42;
  const avatarWidth = compact ? 28 : 40;
  const avatarHeight = compact ? 38 : 54;
  const containerWidth = totalSteps
    ? stepWidth + (totalSteps - 1) * horizontalGap + (compact ? 26 : 52)
    : compact
      ? 120
      : 240;
  const containerHeight = totalSteps
    ? stepHeight + (totalSteps - 1) * verticalGap + (compact ? 64 : 92)
    : compact
      ? 92
      : 196;

  const currentIndex = staircase.currentStepIndex ?? (totalSteps ? totalSteps - 1 : null);
  const avatarLeft =
    currentIndex == null
      ? 0
      : 16 + currentIndex * horizontalGap + stepWidth / 2 - avatarWidth / 2;
  const avatarBottom =
    currentIndex == null
      ? 0
      : 18 + currentIndex * verticalGap + stepHeight - (compact ? 6 : 8);

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
              style={{
                left: `${avatarLeft}px`,
                bottom: `${avatarBottom}px`,
                width: `${avatarWidth}px`,
                height: `${avatarHeight}px`,
              }}
              aria-hidden="true"
            >
              <SpiritualAvatarFigure
                avatarStyle={staircase.avatarStyle}
                compact={compact}
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className="spiritual-staircase-empty">
          <p>No steps yet</p>
          <span>Configure to add steps.</span>
        </div>
      )}
    </div>
  );
}
