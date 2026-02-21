"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import { MOOD_PALETTE } from "@/lib/constants";
import { format } from "date-fns";

export default function MoodTab({ userEmail }: { userEmail: string }) {
  const [monthKey, setMonthKey] = useState(() => format(new Date(), "yyyy-MM"));
  const [yearKey] = useState(() => format(new Date(), "yyyy"));
  const start = `${monthKey}-01`;
  const endDate = new Date(monthKey + "-01");
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(0);
  const end = format(endDate, "yyyy-MM-dd");

  const entriesQuery = useQuery({
    queryKey: ["mood", monthKey],
    queryFn: () => fetchJson<{ items: any[] }>(`/api/entries?start=${start}&end=${end}`),
  });

  const yearStart = `${yearKey}-01-01`;
  const yearEnd = `${yearKey}-12-31`;
  const yearQuery = useQuery({
    queryKey: ["mood-year", yearKey],
    queryFn: () => fetchJson<{ items: any[] }>(`/api/entries?start=${yearStart}&end=${yearEnd}`),
  });

  const moodByDay = useMemo(() => {
    const map = new Map<string, string>();
    (entriesQuery.data?.items || []).forEach((entry) => {
      if (entry.moodCategory) {
        map.set(entry.date, entry.moodCategory);
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

  const daysInMonth = endDate.getDate();
  const moodColor = (key?: string | null) => {
    if (!key) return "#2E2A26";
    return MOOD_PALETTE.find((mood) => mood.key === key)?.color || "#2E2A26";
  };

  return (
    <div className="card">
      <div className="form-row">
        <label>Month</label>
        <input
          type="month"
          value={monthKey}
          onChange={(event) => setMonthKey(event.target.value)}
        />
      </div>
      <div className="mood-grid">
        {Array.from({ length: daysInMonth }, (_, idx) => {
          const day = idx + 1;
          const dayKey = `${monthKey}-${String(day).padStart(2, "0")}`;
          return (
            <div
              key={dayKey}
              className="mood-cell"
              style={{ background: moodColor(moodByDay.get(dayKey)) }}
              title={dayKey}
            />
          );
        })}
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
            return (
              <div
                key={key}
                className="mood-cell"
                style={{ background: moodColor(moodByDayYear.get(key)) }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
