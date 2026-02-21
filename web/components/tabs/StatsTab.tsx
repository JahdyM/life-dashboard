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
const LINE_STEP = 30;

function formatMetricTick(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function LineChart({
  points,
  color,
  step,
}: {
  points: SeriesPoint[];
  color: string;
  step: number;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const rows = Math.max(1, points.length);
  const height = rows * step;
  const width = 360;
  const padX = 12;

  const tickValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => max * ratio);

  const coords = points.map((p, idx) => {
    const x = padX + (p.value / max) * (width - padX * 2);
    const y = idx * step + step / 2;
    return { x, y };
  });

  const path = coords
    .map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x},${p.y}`)
    .join(" ");

  return (
    <div className="line-plot">
      <svg
        className="line-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ height: `${height}px` }}
      >
        {tickValues.map((value, idx) => {
          const x = padX + (value / max) * (width - padX * 2);
          return (
            <line
              key={`x-grid-${idx}`}
              x1={x}
              y1={0}
              x2={x}
              y2={height}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          );
        })}
        {coords.map((p, idx) => (
          <line
            key={`grid-${idx}`}
            x1={padX}
            y1={p.y}
            x2={width - padX}
            y2={p.y}
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="1"
          />
        ))}
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" />
        {coords.map((p, idx) => (
          <g key={idx}>
            <circle cx={p.x} cy={p.y} r="4" fill={color} />
            <title>{`${points[idx]?.label}: ${points[idx]?.value}`}</title>
          </g>
        ))}
      </svg>
      <div className="line-x-scale">
        {tickValues.map((value, idx) => (
          <span key={idx}>{formatMetricTick(value)}</span>
        ))}
      </div>
    </div>
  );
}

function toMetricValue(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export default function StatsTab({ userEmail: _userEmail }: { userEmail: string }) {
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
        return { label: day.label, value: toMetricValue(entry?.[key]) };
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
            {(() => {
              const rawPoints = series[metric.key as keyof typeof series];
              const points = rawPoints
                .filter((item): item is { label: string; value: number } => item.value !== null)
                .map((item) => ({ label: item.label, value: item.value }));

              if (points.length === 0) {
                return <div className="line-empty">No data recorded in this range.</div>;
              }

              return (
                <div className="line-grid">
                  <div
                    className="line-y"
                    style={{
                      gridTemplateRows: `repeat(${points.length}, ${LINE_STEP}px)`,
                    }}
                  >
                    {points.map((item) => (
                      <div key={item.label} className="line-label">
                        {item.label}
                      </div>
                    ))}
                  </div>
                  <LineChart points={points} color={metric.color} step={LINE_STEP} />
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
