"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import { FIXED_SHARED_HABITS, MOOD_PALETTE, WEEKDAY_LABELS_PT } from "@/lib/constants";
import { format } from "date-fns";
import type { CustomHabit, DayEntry } from "@/lib/types";

type DayResponse = { entry: DayEntry };
type CustomHabitsResponse = { items: CustomHabit[] };
type CustomDoneResponse = { done: Record<string, number> };
type MeetingDaysResponse = { days: number[] };
type FamilyDayResponse = { day: number };

function readMutationError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return `${fallback} ${error.message}`;
  }
  return fallback;
}

const toCamel = (key: string) =>
  key.replace(/_([a-z])/g, (_match, char) => String(char).toUpperCase());

const canonicalHabitKey = (name: string) =>
  String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*\(books\)/g, "");

const weekdayFromIso = (iso: string) => {
  const [year, month, day] = String(iso || "")
    .split("-")
    .map((value) => Number(value));
  if (!year || !month || !day) return new Date().getDay();
  return new Date(year, month - 1, day).getDay();
};

type MeetingDayChipProps = {
  label: string;
  index: number;
  active: boolean;
  onToggle: (index: number) => void;
};

const MeetingDayChip = memo(function MeetingDayChip({
  label,
  index,
  active,
  onToggle,
}: MeetingDayChipProps) {
  const handleClick = useCallback(() => onToggle(index), [index, onToggle]);
  return (
    <button className={`chip ${active ? "active" : ""}`} onClick={handleClick}>
      {label}
    </button>
  );
});

type FixedHabitRowProps = {
  habitKey: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (habitKey: string, checked: boolean) => void;
};

const FixedHabitRow = memo(function FixedHabitRow({
  habitKey,
  label,
  checked,
  disabled,
  onToggle,
}: FixedHabitRowProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onToggle(habitKey, event.target.checked),
    [habitKey, onToggle]
  );
  return (
    <label className={`habit-row ${disabled ? "disabled" : ""}`}>
      <input type="checkbox" checked={checked} onChange={handleChange} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
});

type CustomHabitRowProps = {
  habit: CustomHabit;
  checked: boolean;
  isEditing: boolean;
  editingName: string;
  onToggle: (id: string, checked: boolean) => void;
  onStartEdit: (habit: CustomHabit) => void;
  onEditNameChange: (value: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
};

const CustomHabitRow = memo(function CustomHabitRow({
  habit,
  checked,
  isEditing,
  editingName,
  onToggle,
  onStartEdit,
  onEditNameChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: CustomHabitRowProps) {
  const handleToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onToggle(habit.id, event.target.checked),
    [habit.id, onToggle]
  );
  const handleStartEdit = useCallback(() => onStartEdit(habit), [habit, onStartEdit]);
  const handleSave = useCallback(() => onSaveEdit(habit.id), [habit.id, onSaveEdit]);
  const handleDelete = useCallback(() => onDelete(habit.id), [habit.id, onDelete]);
  const handleCancel = useCallback(() => onCancelEdit(), [onCancelEdit]);
  const handleNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onEditNameChange(event.target.value),
    [onEditNameChange]
  );

  return (
    <div className="habit-row">
      <input type="checkbox" checked={checked} onChange={handleToggle} />
      {isEditing ? (
        <>
          <input className="inline-input" value={editingName} onChange={handleNameChange} />
          <button className="icon-btn" onClick={handleSave}>
            ✓
          </button>
          <button className="icon-btn" onClick={handleCancel}>
            ✕
          </button>
        </>
      ) : (
        <>
          <span>{habit.name}</span>
          <button className="icon-btn" onClick={handleStartEdit}>
            ✎
          </button>
          <button className="icon-btn" onClick={handleDelete}>
            🗑
          </button>
        </>
      )}
    </div>
  );
});

export default function HabitsTab({ userEmail: _userEmail }: { userEmail: string }) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [newHabit, setNewHabit] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const dayQuery = useQuery({
    queryKey: ["day", selectedDate],
    queryFn: () => fetchJson<DayResponse>(`/api/day/${selectedDate}`),
  });
  const customHabitsQuery = useQuery({
    queryKey: ["custom-habits"],
    queryFn: () => fetchJson<CustomHabitsResponse>("/api/habits/custom"),
  });
  const customDoneQuery = useQuery({
    queryKey: ["custom-habits-done", selectedDate],
    queryFn: () => fetchJson<CustomDoneResponse>(`/api/habits/custom/done/${selectedDate}`),
  });
  const meetingDaysQuery = useQuery({
    queryKey: ["meeting-days"],
    queryFn: () => fetchJson<MeetingDaysResponse>("/api/settings/meeting-days"),
  });
  const familyDayQuery = useQuery({
    queryKey: ["family-day"],
    queryFn: () => fetchJson<FamilyDayResponse>("/api/settings/family-worship-day"),
  });

  const queryLoading =
    dayQuery.isPending ||
    customHabitsQuery.isPending ||
    customDoneQuery.isPending ||
    meetingDaysQuery.isPending ||
    familyDayQuery.isPending;
  const queryError =
    dayQuery.isError ||
    customHabitsQuery.isError ||
    customDoneQuery.isError ||
    meetingDaysQuery.isError ||
    familyDayQuery.isError;

  const retryAllQueries = useCallback(() => {
    dayQuery.refetch();
    customHabitsQuery.refetch();
    customDoneQuery.refetch();
    meetingDaysQuery.refetch();
    familyDayQuery.refetch();
  }, [dayQuery, customHabitsQuery, customDoneQuery, meetingDaysQuery, familyDayQuery]);

  const dayEntry = dayQuery.data?.entry || {};
  const customHabitsRaw = customHabitsQuery.data?.items || [];
  const customDone = customDoneQuery.data?.done || {};
  const meetingDaysRaw = meetingDaysQuery.data?.days || [];
  const familyDay = familyDayQuery.data?.day ?? 6;

  const meetingDays = useMemo(() => {
    const unique = Array.from(new Set(meetingDaysRaw));
    unique.sort((a, b) => a - b);
    return unique;
  }, [meetingDaysRaw.join(",")]);

  const uniqueCustomHabits = useMemo(() => {
    const seen = new Map<string, CustomHabit>();
    customHabitsRaw.forEach((habit) => {
      const name = String(habit?.name || "").trim();
      if (!name) return;
      const key = canonicalHabitKey(name);
      if (!seen.has(key)) {
        seen.set(key, habit);
      }
    });
    return Array.from(seen.values());
  }, [customHabitsRaw]);

  const isMeetingDay = useMemo(() => {
    const dayIndex = weekdayFromIso(selectedDate);
    return meetingDays.includes(dayIndex);
  }, [meetingDays, selectedDate]);

  const isFamilyWorshipDay = useMemo(() => {
    const dayIndex = weekdayFromIso(selectedDate);
    return dayIndex === familyDay;
  }, [familyDay, selectedDate]);

  const updateDay = useMutation({
    mutationFn: (payload: Record<string, number | string>) =>
      fetchJson<DayResponse>(`/api/day/${selectedDate}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onMutate: async (payload) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: ["day", selectedDate] });
      const previous = queryClient.getQueryData<DayResponse>(["day", selectedDate]);
      queryClient.setQueryData(["day", selectedDate], (old: DayResponse | undefined) => ({
        entry: { ...(old?.entry || {}), ...payload },
      }));
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["day", selectedDate], context.previous);
      }
      setMutationError(readMutationError(error, "Could not update daily fields."));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["day", selectedDate] });
    },
  });

  const updateCustomDone = useMutation({
    mutationFn: (payload: Record<string, number>) =>
      fetchJson(`/api/habits/custom/done/${selectedDate}`, {
        method: "PUT",
        body: JSON.stringify({ done: payload }),
      }),
    onMutate: async (payload) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: ["custom-habits-done", selectedDate] });
      const previous = queryClient.getQueryData<CustomDoneResponse>([
        "custom-habits-done",
        selectedDate,
      ]);
      queryClient.setQueryData(["custom-habits-done", selectedDate], { done: payload });
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["custom-habits-done", selectedDate], context.previous);
      }
      setMutationError(readMutationError(error, "Could not update custom habit state."));
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
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ["custom-habits"] });
    },
    onError: (error) => {
      setMutationError(readMutationError(error, "Could not add habit."));
    },
  });

  const updateMeetingDays = useMutation({
    mutationFn: (days: number[]) =>
      fetchJson("/api/settings/meeting-days", {
        method: "PUT",
        body: JSON.stringify({ days }),
      }),
    onSuccess: () => {
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ["meeting-days"] });
    },
    onError: (error) => {
      setMutationError(readMutationError(error, "Could not update meeting days."));
    },
  });

  const updateFamilyDay = useMutation({
    mutationFn: (day: number) =>
      fetchJson("/api/settings/family-worship-day", {
        method: "PUT",
        body: JSON.stringify({ day }),
      }),
    onSuccess: () => {
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ["family-day"] });
    },
    onError: (error) => {
      setMutationError(readMutationError(error, "Could not update family worship day."));
    },
  });

  const updateHabit = useMutation({
    mutationFn: (payload: { id: string; name: string }) =>
      fetchJson(`/api/habits/custom/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: payload.name }),
      }),
    onSuccess: () => {
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ["custom-habits"] });
      setEditingId(null);
      setEditingName("");
    },
    onError: (error) => {
      setMutationError(readMutationError(error, "Could not rename habit."));
    },
  });

  const deleteHabit = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/habits/custom/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setMutationError(null);
      queryClient.invalidateQueries({ queryKey: ["custom-habits"] });
    },
    onError: (error) => {
      setMutationError(readMutationError(error, "Could not delete habit."));
    },
  });

  const mutationSaving =
    updateDay.isPending ||
    updateCustomDone.isPending ||
    addHabit.isPending ||
    updateMeetingDays.isPending ||
    updateFamilyDay.isPending ||
    updateHabit.isPending ||
    deleteHabit.isPending;

  const handleDateChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSelectedDate(event.target.value);
    },
    []
  );

  const handleMeetingDayToggle = useCallback(
    (index: number) => {
      const next = meetingDays.includes(index)
        ? meetingDays.filter((day) => day !== index)
        : [...meetingDays, index];
      updateMeetingDays.mutate(next);
    },
    [meetingDays, updateMeetingDays]
  );

  const handleFamilyDayChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      updateFamilyDay.mutate(Number(event.target.value));
    },
    [updateFamilyDay]
  );

  const handleToggleHabit = useCallback(
    (key: string, checked: boolean) => {
      updateDay.mutate({ [key]: checked ? 1 : 0 });
    },
    [updateDay]
  );

  const handleCustomToggle = useCallback(
    (id: string, checked: boolean) => {
      const next = { ...customDone, [id]: checked ? 1 : 0 };
      updateCustomDone.mutate(next);
    },
    [customDone, updateCustomDone]
  );

  const handleStartEdit = useCallback((habit: CustomHabit) => {
    setEditingId(habit.id);
    setEditingName(habit.name);
  }, []);

  const handleEditNameChange = useCallback((value: string) => {
    setEditingName(value);
  }, []);

  const handleSaveEdit = useCallback(
    (id: string) => {
      if (!editingName.trim()) return;
      updateHabit.mutate({ id, name: editingName.trim() });
    },
    [editingName, updateHabit]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingName("");
  }, []);

  const handleDeleteHabit = useCallback(
    (id: string) => {
      if (confirm("Excluir este hábito?")) {
        deleteHabit.mutate(id);
      }
    },
    [deleteHabit]
  );

  const handleNewHabitChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setNewHabit(event.target.value);
    },
    []
  );

  const submitNewHabit = useCallback(() => {
    const value = newHabit.trim();
    if (!value) return;
    addHabit.mutate(value);
    setNewHabit("");
  }, [newHabit, addHabit]);

  const handleNewHabitKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      submitNewHabit();
    },
    [submitNewHabit]
  );

  return (
    <div className="tab-grid">
      <div className="card">
        {queryLoading ? <div className="query-status">Loading habits data...</div> : null}
        {queryError ? (
          <div className="query-status error">
            <span>Could not load habits data.</span>
            <button className="secondary" onClick={retryAllQueries}>
              Retry
            </button>
          </div>
        ) : null}
        {mutationSaving ? <div className="query-status">Saving changes...</div> : null}
        {mutationError ? <div className="warning">{mutationError}</div> : null}

        <div className="form-row">
          <label>Date</label>
          <input type="date" value={selectedDate} onChange={handleDateChange} />
        </div>

        <div className="form-row">
          <label>Weekly meeting days</label>
          <div className="chip-row">
            {WEEKDAY_LABELS_PT.map((label, index) => (
              <MeetingDayChip
                key={label}
                label={label}
                index={index}
                active={meetingDays.includes(index)}
                onToggle={handleMeetingDayToggle}
              />
            ))}
          </div>
        </div>

        <div className="form-row">
          <label>Adoração em família (dia)</label>
          <select value={familyDay} onChange={handleFamilyDayChange}>
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
                <FixedHabitRow
                  key={habit.key}
                  habitKey={habit.key}
                  label={habit.label}
                  checked={Boolean(dayEntry[toCamel(habit.key) as keyof DayEntry])}
                  disabled={disabled}
                  onToggle={handleToggleHabit}
                />
              );
            })}
          </div>
        </div>

        <div className="section">
          <h3>Personal habits (custom)</h3>
          <div className="habit-list">
            {uniqueCustomHabits.map((habit) => (
              <CustomHabitRow
                key={habit.id}
                habit={habit}
                checked={Boolean(customDone[habit.id])}
                isEditing={editingId === habit.id}
                editingName={editingName}
                onToggle={handleCustomToggle}
                onStartEdit={handleStartEdit}
                onEditNameChange={handleEditNameChange}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={handleCancelEdit}
                onDelete={handleDeleteHabit}
              />
            ))}
          </div>
          <div className="form-row add-row">
            <input
              type="text"
              placeholder="Add habit"
              value={newHabit}
              onChange={handleNewHabitChange}
              onKeyDown={handleNewHabitKeyDown}
            />
            <button className="secondary" onClick={submitNewHabit}>
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
              onChange={(event) => updateDay.mutate({ sleep_hours: Number(event.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Anxiety level</label>
            <input
              type="number"
              min="1"
              max="10"
              value={dayEntry.anxietyLevel || 1}
              onChange={(event) => updateDay.mutate({ anxiety_level: Number(event.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Work/study hours</label>
            <input
              type="number"
              step="0.5"
              value={dayEntry.workHours || 0}
              onChange={(event) => updateDay.mutate({ work_hours: Number(event.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Boredom minutes</label>
            <input
              type="number"
              min="0"
              value={dayEntry.boredomMinutes || 0}
              onChange={(event) =>
                updateDay.mutate({ boredom_minutes: Number(event.target.value) })
              }
            />
          </div>
          <div className="form-row">
            <label>Mood</label>
            <select
              value={dayEntry.moodCategory || "neutral"}
              onChange={(event) => updateDay.mutate({ mood_category: event.target.value })}
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
              onChange={(event) => updateDay.mutate({ priority_label: event.target.value })}
            />
          </div>
          <label className="habit-row">
            <input
              type="checkbox"
              checked={Boolean(dayEntry.priorityDone)}
              onChange={(event) =>
                updateDay.mutate({ priority_done: event.target.checked ? 1 : 0 })
              }
            />
            <span>Priority done</span>
          </label>
        </div>
      </div>
    </div>
  );
}
