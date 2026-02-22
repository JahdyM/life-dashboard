"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import { MOOD_PALETTE } from "@/lib/constants";
import { format } from "date-fns";
import type { MoodEntry } from "@/lib/types";

export default function MoodTab({ userEmail: _userEmail }: { userEmail: string }) {
  const [monthKey, setMonthKey] = useState(() => format(new Date(), "yyyy-MM"));
  const [yearKey] = useState(() => format(new Date(), "yyyy"));
  const queryClient = useQueryClient();
  const start = `${monthKey}-01`;
  const endDate = new Date(monthKey + "-01");
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(0);
  const end = format(endDate, "yyyy-MM-dd");
  const daysInMonth = endDate.getDate();
  const initialSelectedDay = (() => {
    const todayKey = format(new Date(), "yyyy-MM-dd");
    return todayKey.startsWith(`${monthKey}-`) ? todayKey : `${monthKey}-01`;
  })();
  const [selectedDay, setSelectedDay] = useState(initialSelectedDay);
  const [editorMood, setEditorMood] = useState("neutral");
  const [editorFeeling, setEditorFeeling] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const entriesQuery = useQuery({
    queryKey: ["mood", monthKey],
    queryFn: () => fetchJson<{ items: MoodEntry[] }>(`/api/entries?start=${start}&end=${end}`),
  });

  const yearStart = `${yearKey}-01-01`;
  const yearEnd = `${yearKey}-12-31`;
  const yearQuery = useQuery({
    queryKey: ["mood-year", yearKey],
    queryFn: () =>
      fetchJson<{ items: MoodEntry[] }>(`/api/entries?start=${yearStart}&end=${yearEnd}`),
  });

  const queryLoading = entriesQuery.isPending || yearQuery.isPending;
  const queryError = entriesQuery.isError || yearQuery.isError;

  const moodByDay = useMemo(() => {
    const map = new Map<string, { moodCategory: string; moodNote: string }>();
    (entriesQuery.data?.items || []).forEach((entry) => {
      if (entry.moodCategory) {
        map.set(entry.date, {
          moodCategory: entry.moodCategory,
          moodNote: entry.moodNote || "",
        });
      }
    });
    return map;
  }, [entriesQuery.data]);

  const moodByDayYear = useMemo(() => {
    const map = new Map<string, string>();
    (yearQuery.data?.items || []).forEach((entry) => {
      if (entry.moodCategory) {
        map.set(entry.date, entry.moodCategory);
      }
    });
    return map;
  }, [yearQuery.data]);

  const moodMeta = (key?: string | null) => {
    if (!key) return null;
    return MOOD_PALETTE.find((mood) => mood.key === key) || null;
  };

  const selectedEntry = moodByDay.get(selectedDay);

  useEffect(() => {
    setEditorMood(selectedEntry?.moodCategory || "neutral");
    setEditorFeeling(selectedEntry?.moodNote || "");
  }, [selectedDay, selectedEntry?.moodCategory, selectedEntry?.moodNote]);

  const saveMoodDay = useMutation({
    mutationFn: async (payload: { dayIso: string; moodCategory: string; moodNote: string }) => {
      return fetchJson(`/api/day/${payload.dayIso}`, {
        method: "PATCH",
        body: JSON.stringify({
          moodCategory: payload.moodCategory,
          moodNote: payload.moodNote,
        }),
      });
    },
    onSuccess: (_result, variables) => {
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ["mood", monthKey] });
      queryClient.invalidateQueries({ queryKey: ["mood-year", yearKey] });
      queryClient.invalidateQueries({ queryKey: ["day", variables.dayIso] });
    },
    onError: (error) => {
      if (error instanceof Error && error.message) {
        setSaveError(`Could not save mood. ${error.message}`);
        return;
      }
      setSaveError("Could not save mood.");
    },
  });

  const onPickDay = (dayIso: string) => {
    setSelectedDay(dayIso);
    const existing = moodByDay.get(dayIso);
    setEditorMood(existing?.moodCategory || "neutral");
    setEditorFeeling(existing?.moodNote || "");
  };

  const onMonthChange = (nextMonth: string) => {
    setMonthKey(nextMonth);
    const todayKey = format(new Date(), "yyyy-MM-dd");
    const safeDay = todayKey.startsWith(`${nextMonth}-`) ? todayKey : `${nextMonth}-01`;
    setSelectedDay(safeDay);
    const existing = moodByDay.get(safeDay);
    setEditorMood(existing?.moodCategory || "neutral");
    setEditorFeeling(existing?.moodNote || "");
  };

  return (
    <div className="card">
      <div className="form-row">
        <label>Month</label>
        <input
          type="month"
          value={monthKey}
          onChange={(event) => onMonthChange(event.target.value)}
        />
      </div>
      {queryLoading && <div className="query-status">Loading mood data...</div>}
      {queryError && (
        <div className="query-status error">
          <span>Could not load mood data.</span>
          <button
            className="secondary"
            onClick={() => {
              entriesQuery.refetch();
              yearQuery.refetch();
            }}
          >
            Retry
          </button>
        </div>
      )}
      {saveError ? <div className="warning">{saveError}</div> : null}
      <div className="mood-grid">
        {Array.from({ length: daysInMonth }, (_, idx) => {
          const day = idx + 1;
          const dayKey = `${monthKey}-${String(day).padStart(2, "0")}`;
          const mood = moodMeta(moodByDay.get(dayKey)?.moodCategory);
          const isSelected = selectedDay === dayKey;
          return (
            <div
              key={dayKey}
              className={`mood-cell ${isSelected ? "selected" : ""}`}
              style={{ background: mood?.color || "#2E2A26" }}
              title={mood ? `${dayKey} • ${mood.label}` : `${dayKey} • sem registro`}
              onClick={() => onPickDay(dayKey)}
            >
              {mood?.emoji ? <span className="mood-cell-emoji">{mood.emoji}</span> : null}
            </div>
          );
        })}
      </div>
      <div className="mood-legend">
        {MOOD_PALETTE.map((mood) => (
          <div key={mood.key} className="mood-legend-item">
            <span className="mood-legend-color" style={{ background: mood.color }}>
              {mood.emoji}
            </span>
            <span>{mood.label}</span>
          </div>
        ))}
      </div>
      <div className="section">
        <h3>Edit daily mood</h3>
        <div className="mood-editor">
          <div className="mood-editor-row">
            <div className="form-row">
              <label>Date</label>
              <input
                type="date"
                value={selectedDay}
                min={start}
                max={end}
                onChange={(event) => onPickDay(event.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Mood</label>
              <select value={editorMood} onChange={(event) => setEditorMood(event.target.value)}>
                {MOOD_PALETTE.map((mood) => (
                  <option key={mood.key} value={mood.key}>
                    {mood.emoji} {mood.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <label>Specific feeling for this day</label>
            <input
              type="text"
              placeholder="Ex: confiante, sensível, sobrecarregada..."
              value={editorFeeling}
              onChange={(event) => setEditorFeeling(event.target.value)}
            />
          </div>
          <div className="mood-editor-actions">
            <button
              className="primary"
              onClick={() =>
                saveMoodDay.mutate({
                  dayIso: selectedDay,
                  moodCategory: editorMood,
                  moodNote: editorFeeling.trim(),
                })
              }
              disabled={saveMoodDay.isPending}
            >
              {saveMoodDay.isPending ? "Saving..." : "Save mood"}
            </button>
            <span className="mood-editor-hint">
              {selectedEntry?.moodNote ? `Current note: ${selectedEntry.moodNote}` : "No custom feeling saved yet."}
            </span>
          </div>
        </div>
      </div>
      <div className="section">
        <h3>Year mood</h3>
        <div className="mood-grid yearly">
          {Array.from({ length: (() => {
            const startDate = new Date(`${yearKey}-01-01`);
            const endDate = new Date(`${yearKey}-12-31`);
            return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
          })() }, (_, idx) => {
            const date = new Date(`${yearKey}-01-01`);
            date.setDate(date.getDate() + idx);
            const key = format(date, "yyyy-MM-dd");
            const mood = moodMeta(moodByDayYear.get(key));
            return (
              <div
                key={key}
                className="mood-cell"
                style={{ background: mood?.color || "#2E2A26" }}
                title={mood ? `${key} • ${mood.label}` : `${key} • sem registro`}
              >
                {mood?.emoji ? <span className="mood-cell-emoji">{mood.emoji}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
