"use client";

import { useEffect, useMemo, useState } from "react";
import { addMonths, format, getDate, getDaysInMonth } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MinistryDayComputed, MinistryMonthPayload } from "@/lib/types";
import {
  buildMinistryCalendarWeeks,
  formatMinutes,
  hoursMinutesToTotalMinutes,
  monthKeyFromDate,
  monthKeyToDate,
  minutesToParts,
} from "@/lib/ministry";
import { fetchJson } from "@/lib/client/api";
import MinistrySummaryCards from "./MinistrySummaryCards";
import MinistryDayEditor from "./MinistryDayEditor";

function formatDifference(value: number | null) {
  if (value == null) return "—";
  if (value === 0) return "On plan";
  return `${value > 0 ? "+" : "−"}${formatMinutes(Math.abs(value))}`;
}

function readStatusLabel(status: MinistryDayComputed["status"]) {
  if (status === "no_goal") return "No goal";
  if (status === "planned") return "Planned";
  if (status === "missed") return "Below goal";
  if (status === "partial") return "Partial";
  if (status === "met") return "Met";
  return "Exceeded";
}

function toneClass(day: MinistryDayComputed) {
  return `ministry-day-card ${day.status}${day.isToday ? " today" : ""}`;
}

function buildDayAriaLabel(day: MinistryDayComputed) {
  const planned = day.goalMinutes == null ? "no goal set" : `planned ${formatMinutes(day.goalMinutes)}`;
  const actual =
    day.actualMinutes == null
      ? day.goalMinutes == null
        ? "no time logged"
        : "0 minutes completed so far"
      : `completed ${formatMinutes(day.actualMinutes)}`;
  return `${day.date}, ${readStatusLabel(day.status)}, ${planned}, ${actual}`;
}

export default function MinistryHoursClient({
  initialData,
}: {
  initialData: MinistryMonthPayload;
}) {
  const queryClient = useQueryClient();
  const [monthKey, setMonthKey] = useState(initialData.monthKey);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [targetHours, setTargetHours] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const monthQuery = useQuery({
    queryKey: ["ministry-month", monthKey],
    queryFn: () => fetchJson<MinistryMonthPayload>(`/api/ministry?month=${monthKey}`),
    initialData: monthKey === initialData.monthKey ? initialData : undefined,
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    const parts = minutesToParts(monthQuery.data?.summary.targetMinutes);
    if (monthQuery.data?.summary.targetMinutes == null) {
      setTargetHours("");
      setTargetMinutes("");
      return;
    }
    setTargetHours(String(parts.hours));
    setTargetMinutes(String(parts.minutes));
  }, [monthQuery.data?.summary.targetMinutes, monthKey]);

  const selectedDay = useMemo(
    () => monthQuery.data?.days.find((day) => day.date === selectedDate) || null,
    [monthQuery.data?.days, selectedDate]
  );

  const weeks = useMemo(
    () =>
      monthQuery.data ? buildMinistryCalendarWeeks(monthQuery.data.days, monthKey) : [],
    [monthKey, monthQuery.data]
  );

  const monthContextCopy = useMemo(() => {
    if (!monthQuery.data) return "";
    const todayMonthKey = monthQuery.data.todayIso.slice(0, 7);
    const viewedMonthDate = monthKeyToDate(monthKey);

    if (monthKey === todayMonthKey) {
      return `Today is day ${getDate(new Date(`${monthQuery.data.todayIso}T12:00:00`))} of ${getDaysInMonth(viewedMonthDate)}. Future goal days stay neutral until their date arrives.`;
    }

    if (monthKey < todayMonthKey) {
      return "This is a past month, so every planned goal day is already due.";
    }

    return "This is a future month. Your monthly plan is visible now, and pace will start once the month begins.";
  }, [monthKey, monthQuery.data]);

  const planningMeta = useMemo(() => {
    if (!monthQuery.data) return "Only manual daily goals count toward this number.";
    const difference = monthQuery.data.summary.plannedDifferenceFromTargetMinutes;

    if (difference == null) {
      return "Only manual daily goals count toward this number.";
    }

    if (difference === 0) {
      return "Your planned month matches the monthly target exactly.";
    }

    if (difference > 0) {
      return `Your plan is ${formatMinutes(difference)} above the monthly target.`;
    }

    return `Your plan is still missing ${formatMinutes(Math.abs(difference))} to cover the monthly target.`;
  }, [monthQuery.data]);

  const monthlyGoalMutation = useMutation({
    mutationFn: async (targetMinutesValue: number | null) =>
      fetchJson<{ goal: unknown }>("/api/ministry/monthly-goal", {
        method: "PUT",
        body: JSON.stringify({
          month: monthKey,
          target_minutes: targetMinutesValue,
        }),
      }),
    onSuccess: async () => {
      setFeedback("Monthly goal updated.");
      await queryClient.invalidateQueries({ queryKey: ["ministry-month", monthKey] });
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "Could not save monthly goal.");
    },
  });

  const dayMutation = useMutation({
    mutationFn: async ({
      date,
      goalMinutes,
      actualMinutes,
      notes,
    }: {
      date: string;
      goalMinutes: number | null;
      actualMinutes: number | null;
      notes: string | null;
    }) =>
      fetchJson<{ entry: unknown }>(`/api/ministry/day/${date}`, {
        method: "PUT",
        body: JSON.stringify({
          goal_minutes: goalMinutes,
          actual_minutes: actualMinutes,
          notes,
        }),
      }),
    onSuccess: async () => {
      setFeedback("Day updated.");
      setSelectedDate(null);
      await queryClient.invalidateQueries({ queryKey: ["ministry-month", monthKey] });
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "Could not save that day.");
    },
  });

  const changeMonth = (delta: number) => {
    setFeedback(null);
    setMonthKey(monthKeyFromDate(addMonths(monthKeyToDate(monthKey), delta)));
  };

  const saveMonthlyGoal = () => {
    const hours = Number(targetHours || 0);
    const minutes = Number(targetMinutes || 0);
    const hasAnyValue = targetHours.trim() || targetMinutes.trim();
    const total = hasAnyValue ? hoursMinutesToTotalMinutes(hours, minutes) : null;
    monthlyGoalMutation.mutate(total);
  };

  const goToCurrentMonth = () => {
    setFeedback(null);
    setMonthKey(initialData.todayIso.slice(0, 7));
  };

  const data = monthQuery.data;

  return (
    <div className="route-stack">
      <section className="ministry-topbar">
        <div className="ministry-month-panel">
          <p className="panel-kicker">Ministry hours</p>
          <h2>{format(monthKeyToDate(monthKey), "MMMM yyyy")}</h2>
          <p className="ministry-panel-copy">
            Daily goals stay fully manual. The month respects exactly what you plan for each day.
          </p>
          <p className="ministry-panel-copy">{monthContextCopy}</p>
          <div className="ministry-month-actions">
            <button className="secondary" type="button" onClick={() => changeMonth(-1)}>
              Previous
            </button>
            <button className="secondary" type="button" onClick={goToCurrentMonth}>
              Current month
            </button>
            <button className="secondary" type="button" onClick={() => changeMonth(1)}>
              Next
            </button>
          </div>
        </div>

        <div className="ministry-target-panel">
          <div>
            <p className="panel-kicker">Monthly target</p>
            <h2>{data?.summary.targetMinutes == null ? "Set your goal" : formatMinutes(data.summary.targetMinutes)}</h2>
            <p className="ministry-panel-copy">
              Stored internally in minutes. No automatic distribution across days.
            </p>
            <p className="ministry-panel-copy">{planningMeta}</p>
          </div>
          <div className="ministry-target-inputs">
            <label>
              Hours
              <input
                type="number"
                min={0}
                value={targetHours}
                onChange={(event) => setTargetHours(event.target.value)}
              />
            </label>
            <label>
              Minutes
              <input
                type="number"
                min={0}
                max={59}
                value={targetMinutes}
                onChange={(event) => setTargetMinutes(event.target.value)}
              />
            </label>
          </div>
          <div className="ministry-target-actions">
            <button className="primary" type="button" onClick={saveMonthlyGoal}>
              {monthlyGoalMutation.isPending ? "Saving..." : "Save monthly goal"}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={monthlyGoalMutation.isPending}
              onClick={() => monthlyGoalMutation.mutate(null)}
            >
              Clear target
            </button>
          </div>
        </div>
      </section>

      {feedback ? <div className="query-status">{feedback}</div> : null}
      {monthQuery.isError ? (
        <div className="query-status error">
          <span>Could not load ministry hours for this month.</span>
          <button className="secondary" type="button" onClick={() => monthQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {data ? (
        <>
          <div className={`ministry-pace-banner ${data.summary.paceStatus}`}>
            <div>
              <p className="panel-kicker">Pace</p>
              <h2>{data.summary.paceLabel}</h2>
            </div>
            <p className="ministry-panel-copy">
              Planned through today: {formatMinutes(data.summary.accumulatedPlannedMinutes)} ·
              Actual through today: {formatMinutes(data.summary.accumulatedActualMinutes)} ·
              Difference: {formatDifference(data.summary.accumulatedDifferenceMinutes)} · Pace only counts days up to today.
            </p>
          </div>

          <MinistrySummaryCards summary={data.summary} />

          {data.summary.targetMinutes == null &&
          data.summary.activeGoalDays === 0 &&
          data.summary.totalCompletedMinutes === 0 ? (
            <div className="ministry-empty-banner">
              <h3>Start with the monthly target or any individual day.</h3>
              <p>
                Nothing is auto-filled here. You decide the month goal and each day&apos;s plan
                manually.
              </p>
            </div>
          ) : null}

          <section className="ministry-calendar card">
            <div className="ministry-calendar-head">
              <div>
                <p className="panel-kicker">Monthly calendar</p>
                <h2>Planned vs completed</h2>
              </div>
              <p className="ministry-panel-copy">
                Tap any day to enter a manual goal, actual time, and note.
              </p>
            </div>

            <div className="ministry-weekdays">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div className="ministry-calendar-grid">
              {weeks.map((week, weekIndex) => (
                <div className="ministry-calendar-row" key={`${monthKey}-week-${weekIndex}`}>
                  {week.map((day, dayIndex) =>
                    day ? (
                      <button
                        key={day.date}
                        type="button"
                        className={toneClass(day)}
                        aria-label={buildDayAriaLabel(day)}
                        onClick={() => setSelectedDate(day.date)}
                      >
                        <div className="ministry-day-head">
                          <span className="ministry-day-number">
                            {Number(day.date.slice(-2))}
                          </span>
                          <span className={`ministry-status-badge ${day.status}`}>
                            {readStatusLabel(day.status)}
                          </span>
                        </div>
                        <div className="ministry-day-metrics">
                          <div>
                            <span>Planned</span>
                            <strong>
                              {day.goalMinutes == null ? "No goal" : formatMinutes(day.goalMinutes)}
                            </strong>
                          </div>
                          <div>
                            <span>Actual</span>
                            <strong>
                              {day.actualMinutes == null
                                ? day.goalMinutes == null
                                  ? "—"
                                  : "0m"
                                : formatMinutes(day.actualMinutes)}
                            </strong>
                          </div>
                        </div>
                        <div className="ministry-day-footer">
                          <span>{formatDifference(day.differenceMinutes)}</span>
                          {day.notes ? <span className="ministry-note-indicator">Note</span> : null}
                        </div>
                      </button>
                    ) : (
                      <div
                        key={`${monthKey}-empty-${weekIndex}-${dayIndex}`}
                        className="ministry-day-empty"
                      />
                    )
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="card">
          <div className="query-status">Loading ministry month...</div>
        </div>
      )}

      <MinistryDayEditor
        day={selectedDay}
        saving={dayMutation.isPending}
        onClose={() => setSelectedDate(null)}
        onSave={(payload) => {
          if (!selectedDay) return;
          dayMutation.mutate({
            date: selectedDay.date,
            goalMinutes: payload.goalMinutes,
            actualMinutes: payload.actualMinutes,
            notes: payload.notes,
          });
        }}
      />
    </div>
  );
}
