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

type SeriesPoint = { label: string; value: number };

function LineChart({
  points,
  color,
}: {
  points: SeriesPoint[];
  color: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = 22;
  const height = Math.max(1, points.length - 1) * step + 2;
  const width = 220;
  const padLeft = 8;

  const coords = points.map((p, idx) => {
    const x = padLeft + (p.value / max) * (width - padLeft - 6);
    const y = idx * step + 1;
    return { x, y };
  });

  const path = coords
    .map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x},${p.y}`)
    .join(" ");

  return (
    <svg
      className="line-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMinYMin meet"
    >
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
      {coords.map((p, idx) => (
        <circle key={idx} cx={p.x} cy={p.y} r="3.5" fill={color} />
      ))}
    </svg>
  );
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
        label: format(date, "dd/MM"),
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

  const series = useMemo(() => {
    const build = (key: keyof Entry) =>
      days.map((day) => {
        const entry = entryByDate.get(day.iso);
        return { label: day.label, value: Number(entry?.[key] || 0) };
      });
    return {
      sleep: build("sleepHours"),
      anxiety: build("anxietyLevel"),
      work: build("workHours"),
      boredom: build("boredomMinutes"),
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
        {[
          { title: "Sleep hours", key: "sleep", color: "#8f7bb3" },
          { title: "Anxiety level", key: "anxiety", color: "#D6D979" },
          { title: "Work/study hours", key: "work", color: "#7fd3a5" },
          { title: "Boredom minutes", key: "boredom", color: "#a8b3d9" },
        ].map((metric) => (
          <div key={metric.key} className="chart-card line">
            <h3>{metric.title}</h3>
            <div className="line-grid">
              <div className="line-y">
                {series[metric.key as keyof typeof series].map((item) => (
                  <div key={item.label} className="line-label">
                    {item.label}
                  </div>
                ))}
              </div>
              <LineChart
                points={series[metric.key as keyof typeof series]}
                color={metric.color}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
