"use client";

import type { ReactNode } from "react";

type InlineActionNoticeProps = {
  tone?: "default" | "warning" | "error" | "success";
  title?: string | null;
  body: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  className?: string;
};

export default function InlineActionNotice({
  tone = "default",
  title = null,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  className = "",
}: InlineActionNoticeProps) {
  return (
    <div className={["inline-action-notice", tone, className].filter(Boolean).join(" ")}>
      <div className="inline-action-notice-copy">
        {title ? <strong>{title}</strong> : null}
        <div>{body}</div>
      </div>
      {(actionLabel || secondaryLabel) ? (
        <div className="inline-action-notice-actions">
          {secondaryLabel && onSecondary ? (
            <button type="button" className="secondary subtle" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          ) : null}
          {actionLabel && onAction ? (
            <button type="button" className="secondary" onClick={onAction}>
              {actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
