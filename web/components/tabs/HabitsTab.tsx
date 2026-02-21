"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import { FIXED_SHARED_HABITS, PERSONAL_HABIT_KEYS, MOOD_PALETTE, WEEKDAY_LABELS_PT } from "@/lib/constants";
import { format } from "date-fns";

export default function HabitsTab({ userEmail }: { userEmail: string }) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const toCamel = (key: string) =>
    key.replace(/_([a-z])/g, (_match, char) => String(char).toUpperCase());
  const dayQuery = useQuery({
    queryKey: ["day", selectedDate],
    queryFn: () => fetchJson<{ entry: any }>(`/api/day/${selectedDate}`),
  });
  const customHabitsQuery = useQuery({
    queryKey: ["custom-habits"],
    queryFn: () => fetchJson<{ items: Array<any> }>("/api/habits/custom"),
  });
  const customDoneQuery = useQuery({
    queryKey: ["custom-habits-done", selectedDate],
    queryFn: () => fetchJson<{ done: Record<string, number> }>(`/api/habits/custom/done/${selectedDate}`),
  });
  const meetingDaysQuery = useQuery({
    queryKey: ["meeting-days"],
    queryFn: () => fetchJson<{ days: number[] }>("/api/settings/meeting-days"),
  });
  const familyDayQuery = useQuery({
    queryKey: ["family-day"],
    queryFn: () => fetchJson<{ day: number }>("/api/settings/family-worship-day"),
  });

  const dayEntry = dayQuery.data?.entry || {};
  const customHabits = customHabitsQuery.data?.items || [];
  const customDone = customDoneQuery.data?.done || {};
  const meetingDays = meetingDaysQuery.data?.days || [];
  const familyDay = familyDayQuery.data?.day ?? 6;

  const isMeetingDay = useMemo(() => {
    const dayIndex = new Date(selectedDate).getDay();
    return meetingDays.includes(dayIndex);
  }, [meetingDays, selectedDate]);

  const isFamilyWorshipDay = useMemo(() => {
    const dayIndex = new Date(selectedDate).getDay();
    return dayIndex === familyDay;
  }, [familyDay, selectedDate]);

  const updateDay = useMutation({
    mutationFn: (payload: Record<string, any>) =>
      fetchJson(`/api/day/${selectedDate}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["day", selectedDate] });
      const previous = queryClient.getQueryData<{ entry: any }>(["day", selectedDate]);
      queryClient.setQueryData(["day", selectedDate], (old: any) => ({
        entry: { ...(old?.entry || {}), ...payload },
      }));
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["day", selectedDate], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["day", selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["init"] });
      queryClient.invalidateQueries({ queryKey: ["couple-streaks"] });
    },
  });

  const updateCustomDone = useMutation({
    mutationFn: (payload: Record<string, number>) =>
      fetchJson(`/api/habits/custom/done/${selectedDate}`, {
        method: "PUT",
        body: JSON.stringify({ done: payload }),
      }),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["custom-habits-done", selectedDate] });
      const previous = queryClient.getQueryData<{ done: Record<string, number> }>([
        "custom-habits-done",
        selectedDate,
      ]);
      queryClient.setQueryData(["custom-habits-done", selectedDate], { done: payload });
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["custom-habits-done", selectedDate], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-habits-done", selectedDate] });
    },
  });

  const addHabit = useMutation({
    mutationFn: (name: string) =>
      fetchJson("/api/habits/custom", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-habits"] });
    },
  });

  const updateMeetingDays = useMutation({
    mutationFn: (days: number[]) =>
      fetchJson("/api/settings/meeting-days", {
        method: "PUT",
        body: JSON.stringify({ days }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-days"] });
    },
  });

  const updateFamilyDay = useMutation({
    mutationFn: (day: number) =>
      fetchJson("/api/settings/family-worship-day", {
        method: "PUT",
        body: JSON.stringify({ day }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-day"] });
    },
  });

  const handleToggleHabit = (key: string, checked: boolean) => {
    updateDay.mutate({ [key]: checked ? 1 : 0 });
  };

  const handleCustomToggle = (id: string, checked: boolean) => {
    const next = { ...customDone, [id]: checked ? 1 : 0 };
    updateCustomDone.mutate(next);
  };

  const [newHabit, setNewHabit] = useState("");

  return (
    <div className="tab-grid">
      <div className="card">
        <div className="form-row">
          <label>Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </div>
        <div className="form-row">
          <label>Weekly meeting days</label>
          <div className="chip-row">
            {WEEKDAY_LABELS_PT.map((label, index) => (
              <button
                key={label}
                className={`chip ${meetingDays.includes(index) ? "active" : ""}`}
                onClick={() => {
                  const next = meetingDays.includes(index)
                    ? meetingDays.filter((day) => day !== index)
                    : [...meetingDays, index];
                  updateMeetingDays.mutate(next);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <label>Family worship day</label>
          <select
            value={familyDay}
            onChange={(event) => updateFamilyDay.mutate(Number(event.target.value))}
          >
            {WEEKDAY_LABELS_PT.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="section">
          <h3>Fixed shared habits</h3>
          <div className="habit-list">
            {FIXED_SHARED_HABITS.map((habit) => {
              const isMeetingHabit =
                habit.key === "meeting_attended" || habit.key === "prepare_meeting";
              const isFamilyHabit = habit.key === "family_worship";
              const disabled =
                (isMeetingHabit && !isMeetingDay) || (isFamilyHabit && !isFamilyWorshipDay);
              return (
                <label key={habit.key} className={`habit-row ${disabled ? "disabled" : ""}`}>
                  <input
                    type="checkbox"
                    checked={Boolean(dayEntry[toCamel(habit.key)])}
                    onChange={(event) => handleToggleHabit(habit.key, event.target.checked)}
                    disabled={disabled}
                  />
                  <span>{habit.label}</span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="section">
          <h3>Personal habits</h3>
          <div className="habit-list">
            {PERSONAL_HABIT_KEYS.map((habit) => (
              <label key={habit.key} className="habit-row">
                <input
                  type="checkbox"
                  checked={Boolean(dayEntry[toCamel(habit.key)])}
                  onChange={(event) => handleToggleHabit(habit.key, event.target.checked)}
                />
                <span>{habit.label}</span>
              </label>
            ))}
            {customHabits.map((habit) => (
              <label key={habit.id} className="habit-row">
                <input
                  type="checkbox"
                  checked={Boolean(customDone[habit.id])}
                  onChange={(event) => handleCustomToggle(habit.id, event.target.checked)}
                />
                <span>{habit.name}</span>
              </label>
            ))}
          </div>
          <div className="form-row add-row">
            <input
              type="text"
              placeholder="Add habit"
              value={newHabit}
              onChange={(event) => setNewHabit(event.target.value)}
            />
            <button
              className="secondary"
              onClick={() => {
                if (!newHabit.trim()) return;
                addHabit.mutate(newHabit.trim());
                setNewHabit("");
              }}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="metrics-grid">
          <div className="form-row">
            <label>Sleep hours</label>
            <input
              type="number"
              step="0.5"
              value={dayEntry.sleepHours || 0}
              onChange={(event) => updateDay.mutate({ sleepHours: Number(event.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Anxiety level</label>
            <input
              type="number"
              min="1"
              max="10"
              value={dayEntry.anxietyLevel || 1}
              onChange={(event) => updateDay.mutate({ anxietyLevel: Number(event.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Work/study hours</label>
            <input
              type="number"
              step="0.5"
              value={dayEntry.workHours || 0}
              onChange={(event) => updateDay.mutate({ workHours: Number(event.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Boredom minutes</label>
            <input
              type="number"
              min="0"
              value={dayEntry.boredomMinutes || 0}
              onChange={(event) => updateDay.mutate({ boredomMinutes: Number(event.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Mood</label>
            <select
              value={dayEntry.moodCategory || "neutral"}
              onChange={(event) => updateDay.mutate({ moodCategory: event.target.value })}
            >
              {MOOD_PALETTE.map((mood) => (
                <option key={mood.key} value={mood.key}>
                  {mood.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Priority focus</label>
            <input
              type="text"
              value={dayEntry.priorityLabel || ""}
              onChange={(event) => updateDay.mutate({ priorityLabel: event.target.value })}
            />
          </div>
          <label className="habit-row">
            <input
              type="checkbox"
              checked={Boolean(dayEntry.priorityDone)}
              onChange={(event) => updateDay.mutate({ priorityDone: event.target.checked ? 1 : 0 })}
            />
            <span>Priority done</span>
          </label>
        </div>
      </div>
    </div>
  );
}
