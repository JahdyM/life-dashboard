"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

type OverflowMenuProps = {
  label?: string;
  buttonLabel?: string;
  buttonContent?: ReactNode;
  align?: "left" | "right";
  active?: boolean;
  className?: string;
  menuClassName?: string;
  children: ReactNode;
};

export default function OverflowMenu({
  label = "More actions",
  buttonLabel,
  buttonContent,
  align = "right",
  active = false,
  className = "",
  menuClassName = "",
  children,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={["overflow-menu", className, open ? "open" : "", active ? "active" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="overflow-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={buttonLabel || label}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        {buttonContent || <MoreHorizontal size={16} />}
      </button>
      {open ? (
        <div
          id={menuId}
          className={["overflow-menu-panel", `align-${align}`, menuClassName]
            .filter(Boolean)
            .join(" ")}
          onClickCapture={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest("button, a")) {
              window.setTimeout(() => setOpen(false), 0);
            }
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
