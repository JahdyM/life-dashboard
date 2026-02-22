"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  parseISO,
  isValid,
  isAfter,
} from "date-fns";
import type { EntryMetric, EstimationBucket, EstimationResponse, EstimationSummary } from "@/lib/types";

type RangeKey = "week" | "month" | "quarter" | "custom";

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
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(420);

  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const updateWidth = () => {
      const next = Math.max(260, Math.floor(node.clientWidth));
      setWidth(next);
    };
    updateWidth();
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const values = points.map((p) => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const rawSpan = maxValue - minValue;
  const padding = rawSpan === 0 ? Math.max(1, Math.abs(maxValue) * 0.1) : rawSpan * 0.12;
  const domainMin = minValue - padding;
  const domainMax = maxValue + padding;
  const domainSpan = Math.max(1, domainMax - domainMin);
  const rows = Math.max(1, points.length);
  const labelWidth = 64;
  const chartRightPad = 12;
  const plotLeft = labelWidth + 8;
  const plotRight = width - chartRightPad;
  const plotHeight = rows * step;
  const axisHeight = 18;
  const totalHeight = plotHeight + axisHeight;

  const tickValues = [0, 0.25, 0.5, 0.75, 1].map(
    (ratio) => domainMin + domainSpan * ratio
  );

  const coords = points.map((p, idx) => {
    const x = plotLeft + ((p.value - domainMin) / domainSpan) * (plotRight - plotLeft);
    const y = idx * step + step / 2;
    return { x, y };
  });

  const path = coords
    .map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x},${p.y}`)
    .join(" ");

  return (
    <div className="line-plot" ref={plotRef}>
      <svg
        className="line-chart"
        viewBox={`0 0 ${width} ${totalHeight}`}
        preserveAspectRatio="none"
        style={{ height: `${totalHeight}px` }}
      >
        {tickValues.map((value, idx) => {
          const x =
            plotLeft + ((value - domainMin) / domainSpan) * (plotRight - plotLeft);
          return (
            <line
              key={`x-grid-${idx}`}
              x1={x}
              y1={0}
              x2={x}
              y2={plotHeight}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          );
        })}
        {tickValues.map((value, idx) => {
          const x =
            plotLeft + ((value - domainMin) / domainSpan) * (plotRight - plotLeft);
          return (
            <text
              key={`x-tick-${idx}`}
              x={x}
              y={plotHeight + 12}
              textAnchor="middle"
              fill="rgba(255,255,255,0.66)"
              fontSize="10"
            >
              {formatMetricTick(value)}
            </text>
          );
        })}
        {coords.map((p, idx) => (
          <line
            key={`grid-${idx}`}
            x1={plotLeft}
            y1={p.y}
            x2={plotRight}
            y2={p.y}
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="1"
          />
        ))}
        {points.map((item, idx) => {
          const y = idx * step + step / 2;
          return (
            <text
              key={`y-label-${item.label}-${idx}`}
              x={labelWidth}
              y={y + 3.5}
              textAnchor="end"
              fill="rgba(255,255,255,0.70)"
              fontSize="11"
            >
              {item.label}
            </text>
          );
        })}
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
  const [customStart, setCustomStart] = useState(() =>
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [customEnd, setCustomEnd] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [estimationPeriod, setEstimationPeriod] = useState<"30d" | "90d" | "all">("90d");

  const range = useMemo(() => {
    if (rangeKey !== "custom") return getRange(rangeKey);

    const parsedStart = parseISO(customStart);
    const parsedEnd = parseISO(customEnd);
    const fallbackStart = startOfMonth(new Date());
    const fallbackEnd = new Date();
    const safeStart = isValid(parsedStart) ? parsedStart : fallbackStart;
    const safeEnd = isValid(parsedEnd) ? parsedEnd : fallbackEnd;
    const normalized = isAfter(safeStart, safeEnd)
      ? { start: safeEnd, end: safeStart }
      : { start: safeStart, end: safeEnd };

    return {
      start: normalized.start,
      end: normalized.end,
      label: `${format(normalized.start, "dd/MM/yyyy")} - ${format(
        normalized.end,
        "dd/MM/yyyy"
      )}`,
    };
  }, [rangeKey, customStart, customEnd]);

  const startIso = format(range.start, "yyyy-MM-dd");
  const endIso = format(range.end, "yyyy-MM-dd");

  const entriesQuery = useQuery({
    queryKey: ["entries", startIso, endIso],
    queryFn: () =>
      fetchJson<{ items: EntryMetric[] }>(`/api/entries?start=${startIso}&end=${endIso}`),
  });

  const estimationQuery = useQuery({
    queryKey: ["stats-estimation", estimationPeriod],
    queryFn: () =>
      fetchJson<EstimationResponse>(
        `/api/stats/estimation?period=${estimationPeriod}`
      ),
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
    const map = new Map<string, EntryMetric>();
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
          <button className={rangeKey === "custom" ? "chip active" : "chip"} onClick={() => setRangeKey("custom")}>
            Custom
          </button>
        </div>
        {rangeKey === "custom" && (
          <div className="stats-controls">
            <input
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
            />
            <input
              type="date"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
            />
          </div>
        )}
        <div className="stats-range">{range.label}</div>
      </div>
      {entriesQuery.isPending && (
        <div className="query-status">Loading chart data...</div>
      )}
      {entriesQuery.isError && (
        <div className="query-status error">
          <span>Could not load metrics for this period.</span>
          <button className="secondary" onClick={() => entriesQuery.refetch()}>
            Retry
          </button>
        </div>
      )}
      <div className="section">
        <h3>Task estimation accuracy</h3>
        <div className="stats-controls">
          <button
            className={estimationPeriod === "30d" ? "chip active" : "chip"}
            onClick={() => setEstimationPeriod("30d")}
          >
            30d
          </button>
          <button
            className={estimationPeriod === "90d" ? "chip active" : "chip"}
            onClick={() => setEstimationPeriod("90d")}
          >
            90d
          </button>
          <button
            className={estimationPeriod === "all" ? "chip active" : "chip"}
            onClick={() => setEstimationPeriod("all")}
          >
            All
          </button>
        </div>
        {estimationQuery.isPending ? (
          <div className="query-status">Loading estimation analytics...</div>
        ) : null}
        {estimationQuery.isError ? (
          <div className="query-status error">
            <span>Could not load estimation analytics.</span>
            <button className="secondary" onClick={() => estimationQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : null}
        {estimationQuery.data ? (
          <div className="estimation-card">
            <div className="estimation-main">
              <div className="estimation-score">
                {estimationQuery.data.summary.planningFallacyScore ?? "--"}
              </div>
              <div>
                <div className="estimation-title">Planning fallacy score</div>
                <div className="estimation-note">
                  {estimationQuery.data.summary.recommendation}
                </div>
              </div>
            </div>
            <div className="estimation-metrics">
              <span>
                Samples: {estimationQuery.data.summary.totalSamples}
              </span>
              <span>
                Ratio: {estimationQuery.data.summary.averageRatio ?? "--"}
              </span>
              <span>
                Avg error: {estimationQuery.data.summary.averageErrorPercent ?? "--"}%
              </span>
              <span>
                Tendency: {estimationQuery.data.summary.tendency}
              </span>
            </div>
            <div className="estimation-breakdown">
              <div>
                <h4>By priority</h4>
                {estimationQuery.data.byPriority.map((item: EstimationBucket) => (
                  <div key={item.label} className="estimation-row">
                    <span>{item.label}</span>
                    <span>{item.averageRatio ?? "--"}x</span>
                    <span>{item.count} tasks</span>
                  </div>
                ))}
              </div>
              <div>
                <h4>By duration</h4>
                {estimationQuery.data.byDuration.map((item: EstimationBucket) => (
                  <div key={item.label} className="estimation-row">
                    <span>{item.label}</span>
                    <span>{item.averageRatio ?? "--"}x</span>
                    <span>{item.count} tasks</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
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

              return <LineChart points={points} color={metric.color} step={LINE_STEP} />;
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
