"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  startOfMonth,
} from "date-fns";
import { fetchJson } from "@/lib/client/api";
import { MOOD_DEFINITIONS, getMoodMeta } from "@/lib/moods";
import type { MoodHistoryResponse, MoodMomentEntry } from "@/lib/types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMPTY_MOOD_ENTRIES: MoodMomentEntry[] = [];

type MoodCellProps = {
  dayKey: string;
  label: string;
  moodColor: string;
  moodEmoji?: string;
  selected?: boolean;
  muted?: boolean;
  empty?: boolean;
  showDayNumber?: boolean;
  onPick?: (dayIso: string) => void;
};

const MoodCell = memo(function MoodCell({
  dayKey,
  label,
  moodColor,
  moodEmoji,
  selected = false,
  muted = false,
  empty = false,
  showDayNumber = false,
  onPick,
}: MoodCellProps) {
  const isInteractive = Boolean(onPick) && !empty;

  return (
    <button
      type="button"
      className={`mood-cell ${selected ? "selected" : ""} ${muted ? "muted" : ""} ${
        empty ? "empty" : ""
      }`}
      style={{ background: moodColor }}
      title={label}
      onClick={isInteractive ? () => onPick(dayKey) : undefined}
      disabled={!isInteractive}
    >
      {showDayNumber ? <span className="mood-cell-day">{Number(dayKey.slice(-2))}</span> : null}
      {moodEmoji ? <span className="mood-cell-emoji">{moodEmoji}</span> : null}
    </button>
  );
});

function timeFromLoggedAt(loggedAt: string) {
  return loggedAt.slice(11, 16);
}

function buildMonthDays(monthKey: string) {
  const monthStart = startOfMonth(new Date(`${monthKey}-01T12:00:00`));
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const blanks = Array.from({ length: getDay(monthStart) }, (_, index) => `blank-${index}`);
  return {
    days,
    blanks,
  };
}

function buildHistoryRows(history: MoodHistoryResponse["dailySummaries"]) {
  const months = new Map<string, MoodHistoryResponse["dailySummaries"]>();
  history.forEach((summary) => {
    const monthKey = summary.date.slice(0, 7);
    const current = months.get(monthKey) || [];
    current.push(summary);
    months.set(monthKey, current);
  });
  return Array.from(months.entries()).map(([monthKey, items]) => {
    const itemMap = new Map(items.map((item) => [item.date.slice(-2), item]));
    return {
      monthKey,
      items: Array.from({ length: 31 }, (_, index) => {
        const day = String(index + 1).padStart(2, "0");
        return itemMap.get(day) || null;
      }),
    };
  });
}

function buildDayLabel(dayIso: string) {
  return format(new Date(`${dayIso}T12:00:00`), "MMM d");
}

export default function MoodTab({ userEmail: _userEmail }: { userEmail: string }) {
  const queryClient = useQueryClient();
  const todayIso = format(new Date(), "yyyy-MM-dd");
  const nowTime = format(new Date(), "HH:mm");

  const [monthKey, setMonthKey] = useState(() => todayIso.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(todayIso);
  const [editorTime, setEditorTime] = useState(nowTime);
  const [editorMood, setEditorMood] = useState("neutral");
  const [editorNote, setEditorNote] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const moodQuery = useQuery({
    queryKey: ["mood-history"],
    queryFn: () => fetchJson<MoodHistoryResponse>("/api/mood"),
  });

  const dailySummaryMap = useMemo(() => {
    const map = new Map<string, MoodHistoryResponse["dailySummaries"][number]>();
    (moodQuery.data?.dailySummaries || []).forEach((summary) => {
      map.set(summary.date, summary);
    });
    return map;
  }, [moodQuery.data?.dailySummaries]);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, MoodMomentEntry[]>();
    (moodQuery.data?.entries || []).forEach((entry) => {
      const current = map.get(entry.dayIso) || [];
      current.push(entry);
      map.set(entry.dayIso, current);
    });
    map.forEach((entries) => {
      entries.sort((left, right) => left.loggedAt.localeCompare(right.loggedAt));
    });
    return map;
  }, [moodQuery.data?.entries]);

  const selectedSummary = dailySummaryMap.get(selectedDay) || null;
  const selectedEntries = useMemo(
    () => entriesByDay.get(selectedDay) || EMPTY_MOOD_ENTRIES,
    [entriesByDay, selectedDay]
  );
  const selectedMoodMeta = getMoodMeta(selectedSummary?.moodCategory);

  useEffect(() => {
    const latestEntry = selectedEntries[selectedEntries.length - 1];
    setEditorMood(latestEntry?.moodCategory || selectedSummary?.moodCategory || "neutral");
    setEditorNote("");
    if (selectedDay === todayIso) {
      setEditorTime(format(new Date(), "HH:mm"));
      return;
    }
    setEditorTime(latestEntry ? timeFromLoggedAt(latestEntry.loggedAt) : "12:00");
  }, [selectedDay, selectedEntries, selectedSummary?.moodCategory, todayIso]);

  const monthDays = useMemo(() => buildMonthDays(monthKey), [monthKey]);
  const historyRows = useMemo(
    () => buildHistoryRows(moodQuery.data?.dailySummaries || []),
    [moodQuery.data?.dailySummaries]
  );

  const logMoodMoment = useMutation({
    mutationFn: (payload: {
      dayIso: string;
      loggedTime: string;
      moodCategory: string;
      moodNote: string;
    }) =>
      fetchJson("/api/mood", {
        method: "POST",
        body: JSON.stringify({
          day_iso: payload.dayIso,
          logged_time: payload.loggedTime,
          mood_category: payload.moodCategory,
          mood_note: payload.moodNote || null,
        }),
      }),
    onSuccess: () => {
      setSaveError(null);
      setSavedAt(Date.now());
      setEditorNote("");
      void queryClient.invalidateQueries({ queryKey: ["mood-history"] });
      void queryClient.invalidateQueries({ queryKey: ["day", selectedDay] });
      void queryClient.invalidateQueries({ queryKey: ["couple-mood"] });
    },
    onError: (error) => {
      if (error instanceof Error && error.message) {
        setSaveError(`Could not save mood. ${error.message}`);
        return;
      }
      setSaveError("Could not save mood.");
    },
  });

  const handlePickDay = useCallback((dayIso: string) => {
    setSelectedDay(dayIso);
    setMonthKey(dayIso.slice(0, 7));
    setSaveError(null);
  }, []);

  const handleMonthChange = useCallback((nextMonth: string) => {
    if (!nextMonth) return;
    setMonthKey(nextMonth);
    const nextSelectedDay = selectedDay.startsWith(nextMonth) ? selectedDay : `${nextMonth}-01`;
    setSelectedDay(nextSelectedDay);
  }, [selectedDay]);

  const handleLogMood = useCallback(() => {
    logMoodMoment.mutate({
      dayIso: selectedDay,
      loggedTime: editorTime,
      moodCategory: editorMood,
      moodNote: editorNote.trim(),
    });
  }, [editorMood, editorNote, editorTime, logMoodMoment, selectedDay]);

  return (
    <div className="card mood-page">
      <div className="mood-toolbar">
        <div className="form-row">
          <label htmlFor="mood-month">Month</label>
          <input
            id="mood-month"
            type="month"
            value={monthKey}
            onChange={(event) => handleMonthChange(event.target.value)}
          />
        </div>
      </div>

      {moodQuery.isPending ? <div className="query-status">Loading…</div> : null}
      {moodQuery.isError ? (
        <div className="query-status error">
          <span>Could not load mood.</span>
          <button className="secondary" onClick={() => moodQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {saveError ? <div className="warning">{saveError}</div> : null}

      <div className="mood-layout">
        <section className="section mood-month-section">
          <div className="mood-section-head">
            <h3>{format(new Date(`${monthKey}-01T12:00:00`), "MMMM yyyy")}</h3>
          </div>
          <div className="mood-calendar-head">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="mood-calendar-grid">
            {monthDays.blanks.map((key) => (
              <span key={key} className="mood-calendar-blank" aria-hidden="true" />
            ))}
            {monthDays.days.map((day) => {
              const dayIso = format(day, "yyyy-MM-dd");
              const summary = dailySummaryMap.get(dayIso) || null;
              const mood = getMoodMeta(summary?.moodCategory);
              return (
                <MoodCell
                  key={dayIso}
                  dayKey={dayIso}
                  label={
                    mood
                      ? `${dayIso} • ${mood.label}`
                      : `${dayIso} • No entries`
                  }
                  moodColor={mood?.color || "#2E2A26"}
                  moodEmoji={mood?.emoji}
                  selected={selectedDay === dayIso}
                  muted={dayIso > todayIso}
                  showDayNumber
                  onPick={dayIso > todayIso ? undefined : handlePickDay}
                />
              );
            })}
          </div>
        </section>

        <section className="section mood-day-section">
          <div className="mood-section-head">
            <div>
              <h3>{buildDayLabel(selectedDay)}</h3>
              <p className="mood-day-summary-line">
                {selectedMoodMeta
                  ? `${selectedMoodMeta.emoji} ${selectedMoodMeta.label}`
                  : "No entries"}
              </p>
            </div>
            {selectedSummary ? (
              <span className="mood-day-count">
                {selectedSummary.totalEntries} {selectedSummary.totalEntries === 1 ? "entry" : "entries"}
              </span>
            ) : null}
          </div>

          <div className="mood-log-card">
            <div className="mood-log-row">
              <div className="form-row">
                <label htmlFor="mood-date">Date</label>
                <input
                  id="mood-date"
                  type="date"
                  value={selectedDay}
                  max={todayIso}
                  onChange={(event) => handlePickDay(event.target.value)}
                />
              </div>
              <div className="form-row">
                <label htmlFor="mood-time">Time</label>
                <input
                  id="mood-time"
                  type="time"
                  value={editorTime}
                  onChange={(event) => setEditorTime(event.target.value)}
                />
              </div>
              <div className="form-row">
                <label htmlFor="mood-select">Mood</label>
                <select
                  id="mood-select"
                  value={editorMood}
                  onChange={(event) => setEditorMood(event.target.value)}
                >
                  {MOOD_DEFINITIONS.map((mood) => (
                    <option key={mood.key} value={mood.key}>
                      {mood.emoji} {mood.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="mood-note">Note</label>
              <input
                id="mood-note"
                type="text"
                value={editorNote}
                placeholder="Optional"
                onChange={(event) => setEditorNote(event.target.value)}
              />
            </div>

            <div className="mood-log-actions">
              <button
                className="primary"
                type="button"
                onClick={handleLogMood}
                disabled={logMoodMoment.isPending || selectedDay > todayIso}
              >
                {logMoodMoment.isPending ? "Saving…" : "Log"}
              </button>
              <span className="mood-save-state">
                {logMoodMoment.isPending
                  ? "Saving…"
                  : savedAt
                    ? "Saved"
                    : null}
              </span>
            </div>
          </div>

          <div className="mood-timeline">
            {selectedEntries.length ? (
              <ol className="mood-timeline-list">
                {selectedEntries.map((entry) => {
                  const mood = getMoodMeta(entry.moodCategory);
                  return (
                    <li key={entry.id} className="mood-timeline-item">
                      <div className="mood-timeline-time">
                        {entry.source === "legacy_summary" ? "Summary" : timeFromLoggedAt(entry.loggedAt)}
                      </div>
                      <div className="mood-timeline-body">
                        <strong>
                          {mood?.emoji} {mood?.label || entry.moodCategory}
                        </strong>
                        {entry.moodNote ? <p>{entry.moodNote}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mood-empty-line">No entries.</p>
            )}
          </div>
        </section>
      </div>

      <section className="section">
        <div className="mood-section-head">
          <h3>History</h3>
        </div>
        <div className="mood-history-board">
          <div className="mood-history-head">
            <span />
            {Array.from({ length: 31 }, (_, index) => (
              <span key={index}>{index + 1}</span>
            ))}
          </div>
          {historyRows.map((row) => (
            <div key={row.monthKey} className="mood-history-row">
              <div className="mood-history-label">
                {format(new Date(`${row.monthKey}-01T12:00:00`), "MMM yyyy")}
              </div>
              <div className="mood-history-cells">
                {row.items.map((summary, index) => {
                  const dayIso = `${row.monthKey}-${String(index + 1).padStart(2, "0")}`;
                  const mood = getMoodMeta(summary?.moodCategory);
                  const empty = !summary;
                  return (
                    <MoodCell
                      key={dayIso}
                      dayKey={dayIso}
                      label={
                        summary && mood
                          ? `${dayIso} • ${mood.label}`
                          : `${dayIso} • No entries`
                      }
                      moodColor={mood?.color || "#1d1b19"}
                      moodEmoji={mood?.emoji}
                      muted={dayIso > todayIso}
                      empty={empty}
                      onPick={empty ? undefined : handlePickDay}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mood-legend">
        {MOOD_DEFINITIONS.map((mood) => (
          <div key={mood.key} className="mood-legend-item">
            <span className="mood-legend-color" style={{ background: mood.color }}>
              {mood.emoji}
            </span>
            <span>{mood.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
