"use client";

import { Clock3, X } from "lucide-react";

type CompletionPopoverProps = {
  open: boolean;
  title: string;
  estimatedMinutes: number;
  actualMinutes: number;
  onActualMinutesChange: (value: number) => void;
  onConfirm: () => void;
  onSkip: () => void;
  onClose: () => void;
};

export default function CompletionPopover({
  open,
  title,
  estimatedMinutes,
  actualMinutes,
  onActualMinutesChange,
  onConfirm,
  onSkip,
  onClose,
}: CompletionPopoverProps) {
  if (!open) return null;

  return (
    <div className="completion-popover" role="dialog" aria-modal="false" aria-label={`Complete ${title}`}>
      <div className="completion-popover-copy">
        <span className="completion-popover-kicker">
          <Clock3 size={15} />
          Time
        </span>
        <strong>{title}</strong>
        <p>Est. {estimatedMinutes} min.</p>
      </div>
      <div className="completion-popover-controls">
        <label htmlFor="completion-popover-minutes">Actual</label>
        <input
          id="completion-popover-minutes"
          type="number"
          min={0}
          value={actualMinutes}
          onChange={(event) => onActualMinutesChange(Math.max(0, Number(event.target.value || 0)))}
        />
      </div>
      <div className="completion-popover-actions">
        <button type="button" className="secondary" onClick={onConfirm}>
          Save
        </button>
        <button type="button" className="secondary subtle" onClick={onSkip}>
          Skip
        </button>
        <button type="button" className="page-link inline muted" onClick={onClose}>
          <X size={14} />
          Close
        </button>
      </div>
    </div>
  );
}
