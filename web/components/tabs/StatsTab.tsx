"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  eachDayOfInterval,
} from "date-fns";

type RangeKey = "week" | "month" | "quarter";

type Entry = {
  date: string;
  sleepHours?: number | null;
  workHours?: number | null;
  anxietyLevel?: number | null;
  boredomMinutes?: number | null;
};

function getRange(range: RangeKey) {
  const now = new Date();
  if (range === "month") {
    return {
      start: startOfMonth(now),
      end: endOfMonth(now),
      label: format(now, "MMMM yyyy"),
    };
  }
  if (range === "quarter") {
    return {
      start: startOfQuarter(now),
      end: endOfQuarter(now),
      label: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
    };
  }
  return {
    start: startOfWeek(now, { weekStartsOn: 1 }),
    end: endOfWeek(now, { weekStartsOn: 1 }),
    label: "This week",
  };
}

export default function StatsTab({ userEmail }: { userEmail: string }) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("week");
  const range = useMemo(() => getRange(rangeKey), [rangeKey]);

  const startIso = format(range.start, "yyyy-MM-dd");
  const endIso = format(range.end, "yyyy-MM-dd");

  const entriesQuery = useQuery({
    queryKey: ["entries", startIso, endIso],
    queryFn: () => fetchJson<{ items: Entry[] }>(`/api/entries?start=${startIso}&end=${endIso}`),
  });

  const days = useMemo(() => {
    return eachDayOfInterval({ start: range.start, end: range.end }).map((date) => {
      const iso = format(date, "yyyy-MM-dd");
      return {
        iso,
        label: format(date, "dd"),
      };
    });
  }, [range]);

  const entryByDate = useMemo(() => {
    const map = new Map<string, Entry>();
    (entriesQuery.data?.items || []).forEach((entry) => {
      map.set(entry.date, entry);
    });
    return map;
  }, [entriesQuery.data]);

  const metrics = useMemo(() => {
    const buildSeries = (key: keyof Entry) => {
      const values = days.map((day) => {
        const entry = entryByDate.get(day.iso);
        const value = Number(entry?.[key] || 0);
        return { label: day.label, value };
      });
      const max = Math.max(1, ...values.map((item) => item.value));
      return { values, max };
    };

    return {
      sleep: buildSeries("sleepHours"),
      work: buildSeries("workHours"),
      anxiety: buildSeries("anxietyLevel"),
      boredom: buildSeries("boredomMinutes"),
    };
  }, [days, entryByDate]);

  return (
    <div className="card">
      <div className="stats-header">
        <h2>Charts</h2>
        <div className="stats-controls">
          <button className={rangeKey === "week" ? "chip active" : "chip"} onClick={() => setRangeKey("week")}>
            Week
          </button>
          <button className={rangeKey === "month" ? "chip active" : "chip"} onClick={() => setRangeKey("month")}>
            Month
          </button>
          <button className={rangeKey === "quarter" ? "chip active" : "chip"} onClick={() => setRangeKey("quarter")}>
            Quarter
          </button>
        </div>
        <div className="stats-range">{range.label}</div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>Sleep hours</h3>
          <div className="bar-chart">
            {metrics.sleep.values.map((item, idx) => (
              <div key={`sleep-${idx}`} className="bar" style={{ height: `${(item.value / metrics.sleep.max) * 100}%` }}>
                <span className="bar-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-card">
          <h3>Anxiety level</h3>
          <div className="bar-chart">
            {metrics.anxiety.values.map((item, idx) => (
              <div key={`anx-${idx}`} className="bar" style={{ height: `${(item.value / metrics.anxiety.max) * 100}%` }}>
                <span className="bar-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-card">
          <h3>Work/study hours</h3>
          <div className="bar-chart">
            {metrics.work.values.map((item, idx) => (
              <div key={`work-${idx}`} className="bar" style={{ height: `${(item.value / metrics.work.max) * 100}%` }}>
                <span className="bar-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-card">
          <h3>Boredom minutes</h3>
          <div className="bar-chart">
            {metrics.boredom.values.map((item, idx) => (
              <div key={`bored-${idx}`} className="bar" style={{ height: `${(item.value / metrics.boredom.max) * 100}%` }}>
                <span className="bar-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
