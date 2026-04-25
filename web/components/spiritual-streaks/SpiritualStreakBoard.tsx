"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDisplayDate } from "@/lib/spiritualStreaks";
import type { SpiritualStreakBoard as SpiritualStreakBoardType } from "@/lib/types";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function getDefaultSelectedDate(board: SpiritualStreakBoardType, todayIso: string) {
  const todayCell = board.cells.find((cell) => cell.date === todayIso && !cell.isFuture);
  if (todayCell) return todayCell.date;

  const lastEditable = [...board.cells].reverse().find((cell) => !cell.isFuture);
  return lastEditable?.date || board.cells[0]?.date || todayIso;
}

function getStatusCopy(board: SpiritualStreakBoardType, success: boolean | null, isFuture: boolean) {
  if (isFuture) return "Future";
  if (success === true) return "Done";
  if (success === false) {
    return board.successRule === "clean_day" ? "Not clean" : "Missed";
  }
  return board.emptyLabel;
}

export default function SpiritualStreakBoard({
  board,
  todayIso,
  pending = false,
  onMark,
}: {
  board: SpiritualStreakBoardType;
  todayIso: string;
  pending?: boolean;
  onMark: (args: {
    boardKey: SpiritualStreakBoardType["key"];
    date: string;
    success: boolean | null;
  }) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(() =>
    getDefaultSelectedDate(board, todayIso)
  );

  useEffect(() => {
    const next = getDefaultSelectedDate(board, todayIso);
    setSelectedDate((current) => {
      if (board.cells.some((cell) => cell.date === current)) {
        return current;
      }
      return next;
    });
  }, [board, todayIso]);

  const selectedCell = useMemo(
    () => board.cells.find((cell) => cell.date === selectedDate) || board.cells[0] || null,
    [board.cells, selectedDate]
  );

  const cardStyle = {
    "--streak-accent": board.accentColor,
  } as CSSProperties;

  return (
    <article className="spiritual-streak-board" style={cardStyle}>
      <div className="spiritual-streak-board-head">
        <div>
          <h3>{board.title}</h3>
          <p className="spiritual-streak-board-summary">{board.summaryText}</p>
        </div>

        <div className="spiritual-streak-metrics" aria-label={`${board.title} metrics`}>
          <div className="spiritual-streak-metric-pill">
            <span className="spiritual-streak-metric-value">{board.currentStreak}</span>
            <span className="spiritual-streak-metric-label">Now</span>
          </div>
          <div className="spiritual-streak-metric-pill">
            <span className="spiritual-streak-metric-value">{board.bestStreak}</span>
            <span className="spiritual-streak-metric-label">Best</span>
          </div>
          <div className="spiritual-streak-metric-pill subtle">
            <span className="spiritual-streak-metric-value">{board.monthSuccessDays}</span>
            <span className="spiritual-streak-metric-label">Month</span>
          </div>
        </div>
      </div>

      <div className="spiritual-streak-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={`${board.key}-${label}-${index}`}>{label}</span>
        ))}
      </div>

      <div className="spiritual-streak-grid" role="grid" aria-label={`${board.title} month grid`}>
        {Array.from({ length: board.firstWeekday }, (_, index) => (
          <span key={`${board.key}-empty-${index}`} className="spiritual-streak-grid-spacer" />
        ))}
        {board.cells.map((cell) => (
          <button
            key={cell.date}
            type="button"
            className={[
              "spiritual-streak-cell",
              cell.state,
              cell.isToday ? "today" : "",
              cell.isFuture ? "future" : "",
              selectedCell?.date === cell.date ? "selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => {
              if (cell.isFuture) return;
              setSelectedDate(cell.date);
            }}
            disabled={cell.isFuture}
            aria-pressed={selectedCell?.date === cell.date}
            title={`${formatDisplayDate(cell.date)} • ${getStatusCopy(board, cell.success, cell.isFuture)}`}
          >
            <span>{cell.dayNumber}</span>
          </button>
        ))}
      </div>

      {selectedCell ? (
        <div className="spiritual-streak-editor">
          <div className="spiritual-streak-editor-copy">
            <span className="spiritual-streak-label">Selected</span>
            <strong>{formatDisplayDate(selectedCell.date)}</strong>
            <p>
              {board.quickPrompt} · {getStatusCopy(board, selectedCell.success, selectedCell.isFuture)}
            </p>
          </div>
          <div className="spiritual-streak-editor-actions" role="group" aria-label={`${board.title} selected day actions`}>
            <button
              type="button"
              className={`secondary subtle ${selectedCell.success === true ? "active" : ""}`}
              onClick={() => onMark({ boardKey: board.key, date: selectedCell.date, success: true })}
              disabled={pending || selectedCell.isFuture}
            >
              {board.yesLabel}
            </button>
            <button
              type="button"
              className={`secondary subtle ${selectedCell.success === false ? "active negative" : ""}`}
              onClick={() => onMark({ boardKey: board.key, date: selectedCell.date, success: false })}
              disabled={pending || selectedCell.isFuture}
            >
              {board.noLabel}
            </button>
            <button
              type="button"
              className="secondary subtle"
              onClick={() => onMark({ boardKey: board.key, date: selectedCell.date, success: null })}
              disabled={pending || selectedCell.isFuture || selectedCell.success === null}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
