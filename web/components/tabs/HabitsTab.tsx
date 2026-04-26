"use client";

import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import InlineActionNotice from "@/components/common/InlineActionNotice";
import { fetchJson } from "@/lib/client/api";
import { FIXED_SHARED_HABITS, WEEKDAY_LABELS_PT } from "@/lib/constants";
import { getMoodMeta } from "@/lib/moods";
import type { DashboardOnboardingPreferences } from "@/lib/config/dashboard";
import type { CustomHabit, DayEntry } from "@/lib/types";

type DayResponse = { entry: DayEntry };
type CustomHabitsResponse = { items: CustomHabit[] };
type CustomDoneResponse = { done: Record<string, number> };
type MeetingDaysResponse = { days: number[] };
type FamilyDayResponse = { day: number };
type OnboardingResponse = { preferences: DashboardOnboardingPreferences };

type PendingDeleteState = {
  habit: CustomHabit;
  index: number;
};

type MetricDrafts = {
  sleep_hours: string;
  anxiety_level: string;
  work_hours: string;
  boredom_minutes: string;
  priority_label: string;
};

const EMPTY_CUSTOM_HABITS: CustomHabit[] = [];
const EMPTY_DONE: Record<string, number> = {};
const EMPTY_DAYS: number[] = [];
const EMPTY_DAY_ENTRY = {} as DayEntry;

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

function buildMetricDrafts(entry: DayEntry): MetricDrafts {
  return {
    sleep_hours: String(entry.sleepHours ?? 0),
    anxiety_level: String(entry.anxietyLevel ?? 1),
    work_hours: String(entry.workHours ?? 0),
    boredom_minutes: String(entry.boredomMinutes ?? 0),
    priority_label: entry.priorityLabel ?? "",
  };
}

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
    <button
      type="button"
      className={`chip ${active ? "active" : ""}`}
      onClick={handleClick}
    >
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
    (event: ChangeEvent<HTMLInputElement>) => onToggle(habitKey, event.target.checked),
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
  draftName: string;
  busy: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onStartEdit: (habit: CustomHabit) => void;
  onDraftNameChange: (value: string) => void;
  onSubmitEdit: (habit: CustomHabit) => void;
  onCancelEdit: () => void;
  onDelete: (habit: CustomHabit) => void;
};

const CustomHabitRow = memo(function CustomHabitRow({
  habit,
  checked,
  isEditing,
  draftName,
  busy,
  onToggle,
  onStartEdit,
  onDraftNameChange,
  onSubmitEdit,
  onCancelEdit,
  onDelete,
}: CustomHabitRowProps) {
  const skipBlurRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handleToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onToggle(habit.id, event.target.checked),
    [habit.id, onToggle]
  );
  const handleDelete = useCallback(() => onDelete(habit), [habit, onDelete]);
  const handleStartEdit = useCallback(() => onStartEdit(habit), [habit, onStartEdit]);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onSubmitEdit(habit);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        skipBlurRef.current = true;
        onCancelEdit();
      }
    },
    [habit, onCancelEdit, onSubmitEdit]
  );

  const handleBlur = useCallback(() => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    onSubmitEdit(habit);
  }, [habit, onSubmitEdit]);

  return (
    <div className={`habit-row custom-habit-row ${busy ? "busy" : ""} ${isEditing ? "editing" : ""}`}>
      <input type="checkbox" checked={checked} onChange={handleToggle} disabled={busy} />

      {isEditing ? (
        <input
          ref={inputRef}
          className="inline-input"
          value={draftName}
          onChange={(event) => onDraftNameChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          aria-label={`Rename ${habit.name}`}
        />
      ) : (
        <button
          type="button"
          className="habit-name-button"
          onClick={handleStartEdit}
          disabled={busy}
        >
          {habit.name}
        </button>
      )}

      <div className="habit-row-actions">
        <button type="button" className="icon-btn danger" onClick={handleDelete} disabled={busy}>
          Remove
        </button>
      </div>
    </div>
  );
});

export default function HabitsTab({ userEmail: _userEmail }: { userEmail: string }) {
  const queryClient = useQueryClient();
  const deleteTimeoutRef = useRef<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [newHabit, setNewHabit] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteState | null>(null);
  const [metricDrafts, setMetricDrafts] = useState<MetricDrafts>({
    sleep_hours: "0",
    anxiety_level: "1",
    work_hours: "0",
    boredom_minutes: "0",
    priority_label: "",
  });

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
  const onboardingQuery = useQuery({
    queryKey: ["onboarding-preferences"],
    queryFn: () => fetchJson<OnboardingResponse>("/api/onboarding"),
  });

  const hasBlockingData =
    Boolean(dayQuery.data) &&
    Boolean(customHabitsQuery.data) &&
    Boolean(customDoneQuery.data) &&
    Boolean(meetingDaysQuery.data) &&
    Boolean(familyDayQuery.data);

  const queryLoading =
    !hasBlockingData &&
    (dayQuery.isPending ||
      customHabitsQuery.isPending ||
      customDoneQuery.isPending ||
      meetingDaysQuery.isPending ||
      familyDayQuery.isPending);

  const queryError =
    dayQuery.isError ||
    customHabitsQuery.isError ||
    customDoneQuery.isError ||
    meetingDaysQuery.isError ||
    familyDayQuery.isError;

  const retryAllQueries = useCallback(() => {
    void dayQuery.refetch();
    void customHabitsQuery.refetch();
    void customDoneQuery.refetch();
    void meetingDaysQuery.refetch();
    void familyDayQuery.refetch();
  }, [dayQuery, customHabitsQuery, customDoneQuery, meetingDaysQuery, familyDayQuery]);

  const dayEntry = useMemo(
    () => dayQuery.data?.entry ?? EMPTY_DAY_ENTRY,
    [dayQuery.data?.entry]
  );
  const customHabitsRaw = useMemo(
    () => customHabitsQuery.data?.items ?? EMPTY_CUSTOM_HABITS,
    [customHabitsQuery.data?.items]
  );
  const customDone = customDoneQuery.data?.done ?? EMPTY_DONE;
  const meetingDaysRaw = useMemo(
    () => meetingDaysQuery.data?.days ?? EMPTY_DAYS,
    [meetingDaysQuery.data?.days]
  );
  const familyDay = familyDayQuery.data?.day ?? 6;
  const sharedHabits = useMemo(
    () => {
      const configured =
        onboardingQuery.data?.preferences.sharedHabits ||
        FIXED_SHARED_HABITS.map((habit) => ({ ...habit, enabled: true }));
      return configured.filter((habit) => habit.enabled !== false);
    },
    [onboardingQuery.data?.preferences.sharedHabits]
  );

  useEffect(() => {
    setMetricDrafts(buildMetricDrafts(dayEntry));
  }, [dayEntry]);

  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) {
        window.clearTimeout(deleteTimeoutRef.current);
      }
    };
  }, []);

  const meetingDays = useMemo(() => {
    const unique = Array.from(new Set(meetingDaysRaw));
    unique.sort((a, b) => a - b);
    return unique;
  }, [meetingDaysRaw]);

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

  const patchCustomHabitsCache = useCallback(
    (updater: (items: CustomHabit[]) => CustomHabit[]) => {
      queryClient.setQueryData<CustomHabitsResponse | undefined>(["custom-habits"], (current) => ({
        items: updater(current?.items ?? EMPTY_CUSTOM_HABITS),
      }));
    },
    [queryClient]
  );

  const updateDay = useMutation({
    mutationFn: (payload: Record<string, number | string | null>) =>
      fetchJson<DayResponse>(`/api/day/${selectedDate}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onMutate: async (payload) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: ["day", selectedDate] });
      const previous = queryClient.getQueryData<DayResponse>(["day", selectedDate]);
      queryClient.setQueryData(["day", selectedDate], (old: DayResponse | undefined) => ({
        entry: {
          ...(old?.entry || {}),
          ...Object.entries(payload).reduce((acc, [key, value]) => {
            acc[toCamel(key)] = value;
            return acc;
          }, {} as Record<string, string | number | null>),
        },
      }));
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["day", selectedDate], context.previous);
      }
      setMutationError(readMutationError(error, "Could not update daily fields."));
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
  });

  const addHabit = useMutation({
    mutationFn: (name: string) =>
      fetchJson<{ habit: CustomHabit }>("/api/habits/custom", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: ({ habit }) => {
      setMutationError(null);
      patchCustomHabitsCache((items) => [...items, habit]);
      setNewHabit("");
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
    onMutate: async (payload) => {
      setMutationError(null);
      await queryClient.cancelQueries({ queryKey: ["custom-habits"] });
      const previous = queryClient.getQueryData<CustomHabitsResponse>(["custom-habits"]);
      patchCustomHabitsCache((items) =>
        items.map((habit) =>
          habit.id === payload.id ? { ...habit, name: payload.name } : habit
        )
      );
      return { previous };
    },
    onSuccess: () => {
      setEditingId(null);
      setEditingName("");
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["custom-habits"], context.previous);
      }
      setMutationError(readMutationError(error, "Could not rename habit."));
    },
  });

  const deleteHabit = useMutation({
    mutationFn: ({ id }: { id: string; restore: PendingDeleteState }) =>
      fetchJson(`/api/habits/custom/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setMutationError(null);
    },
    onError: (error, variables) => {
      patchCustomHabitsCache((items) => {
        if (items.some((item) => item.id === variables.restore.habit.id)) {
          return items;
        }
        const next = [...items];
        next.splice(Math.min(variables.restore.index, next.length), 0, variables.restore.habit);
        return next;
      });
      setMutationError(readMutationError(error, "Could not remove habit."));
    },
  });

  const mutationBusy =
    updateDay.isPending ||
    updateCustomDone.isPending ||
    addHabit.isPending ||
    updateMeetingDays.isPending ||
    updateFamilyDay.isPending ||
    updateHabit.isPending ||
    deleteHabit.isPending;

  const commitPendingDelete = useCallback(() => {
    if (!pendingDelete) return;
    if (deleteTimeoutRef.current) {
      window.clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
    const restore = pendingDelete;
    setPendingDelete(null);
    deleteHabit.mutate({ id: restore.habit.id, restore });
  }, [deleteHabit, pendingDelete]);

  const undoPendingDelete = useCallback(() => {
    if (!pendingDelete) return;
    if (deleteTimeoutRef.current) {
      window.clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
    patchCustomHabitsCache((items) => {
      if (items.some((item) => item.id === pendingDelete.habit.id)) {
        return items;
      }
      const next = [...items];
      next.splice(Math.min(pendingDelete.index, next.length), 0, pendingDelete.habit);
      return next;
    });
    setPendingDelete(null);
  }, [patchCustomHabitsCache, pendingDelete]);

  const handleDateChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(event.target.value);
  }, []);

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
    (event: ChangeEvent<HTMLSelectElement>) => {
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

  const handleDraftNameChange = useCallback((value: string) => {
    setEditingName(value);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingName("");
  }, []);

  const handleSubmitEdit = useCallback(
    (habit: CustomHabit) => {
      const next = editingName.trim();
      if (editingId !== habit.id) return;
      if (!next) {
        setEditingName(habit.name);
        setEditingId(null);
        return;
      }
      if (next === habit.name) {
        setEditingId(null);
        setEditingName("");
        return;
      }
      updateHabit.mutate({ id: habit.id, name: next });
    },
    [editingId, editingName, updateHabit]
  );

  const handleDeleteHabit = useCallback(
    (habit: CustomHabit) => {
      if (pendingDelete) {
        commitPendingDelete();
      }

      const currentItems = customHabitsQuery.data?.items ?? EMPTY_CUSTOM_HABITS;
      const index = currentItems.findIndex((item) => item.id === habit.id);
      if (index === -1) return;

      patchCustomHabitsCache((items) => items.filter((item) => item.id !== habit.id));
      setPendingDelete({ habit, index });
      setEditingId((current) => (current === habit.id ? null : current));
      setEditingName("");

      deleteTimeoutRef.current = window.setTimeout(() => {
        setPendingDelete((current) => {
          if (!current || current.habit.id !== habit.id) return current;
          deleteTimeoutRef.current = null;
          deleteHabit.mutate({ id: current.habit.id, restore: current });
          return null;
        });
      }, 4200);
    },
    [commitPendingDelete, customHabitsQuery.data?.items, deleteHabit, patchCustomHabitsCache, pendingDelete]
  );

  const handleNewHabitChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setNewHabit(event.target.value);
  }, []);

  const submitNewHabit = useCallback(() => {
    const value = newHabit.trim();
    if (!value || addHabit.isPending) return;
    addHabit.mutate(value);
  }, [addHabit, newHabit]);

  const handleNewHabitKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitNewHabit();
      }
      if (event.key === "Escape") {
        setNewHabit("");
      }
    },
    [submitNewHabit]
  );

  const commitMetric = useCallback(
    (field: keyof MetricDrafts) => {
      const current = metricDrafts[field];
      if (field === "priority_label") {
        const nextValue = current.trim();
        const existingValue = dayEntry.priorityLabel?.trim() || "";
        if (nextValue === existingValue) return;
        updateDay.mutate({ priority_label: nextValue || null });
        return;
      }

      const numericValue = Math.max(0, Number(current || 0));
      const currentValueByField: Record<Exclude<keyof MetricDrafts, "priority_label">, number> = {
        sleep_hours: Number(dayEntry.sleepHours ?? 0),
        anxiety_level: Number(dayEntry.anxietyLevel ?? 1),
        work_hours: Number(dayEntry.workHours ?? 0),
        boredom_minutes: Number(dayEntry.boredomMinutes ?? 0),
      };
      if (numericValue === currentValueByField[field]) return;
      updateDay.mutate({ [field]: numericValue });
    },
    [dayEntry, metricDrafts, updateDay]
  );

  const resetMetric = useCallback(
    (field: keyof MetricDrafts) => {
      setMetricDrafts((current) => ({
        ...current,
        [field]: buildMetricDrafts(dayEntry)[field],
      }));
    },
    [dayEntry]
  );

  const handleMetricChange = useCallback(
    (field: keyof MetricDrafts, value: string) => {
      setMetricDrafts((current) => ({ ...current, [field]: value }));
    },
    []
  );

  const handleMetricKeyDown = useCallback(
    (field: keyof MetricDrafts, event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitMetric(field);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        resetMetric(field);
        (event.currentTarget as HTMLInputElement).blur();
      }
    },
    [commitMetric, resetMetric]
  );

  return (
    <div className="tab-grid">
      <div className="card habits-primary-card">
        {queryLoading ? <div className="query-status quiet">Loading…</div> : null}
        {queryError ? (
          <InlineActionNotice
            tone="error"
            title="Couldn't load habits"
            body="Refresh to try again."
            actionLabel="Retry"
            onAction={retryAllQueries}
          />
        ) : null}
        {mutationError ? (
          <InlineActionNotice tone="warning" body={mutationError} />
        ) : null}
        {pendingDelete ? (
          <InlineActionNotice
            tone="default"
            title="Removed"
            body={pendingDelete.habit.name}
            actionLabel="Undo"
            onAction={undoPendingDelete}
            secondaryLabel="Remove"
            onSecondary={commitPendingDelete}
          />
        ) : null}

        <section className="habits-setup-block">
          <div className="habits-section-head">
            <div>
              <p className="panel-kicker">Setup</p>
              <h3>Schedule</h3>
            </div>
          </div>

          <div className="form-row">
            <label htmlFor="habits-date">Date</label>
            <input id="habits-date" type="date" value={selectedDate} onChange={handleDateChange} />
          </div>

          <div className="form-row">
            <div id="meeting-days-label">Meeting days</div>
            <div className="chip-row" role="group" aria-labelledby="meeting-days-label">
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
            <label htmlFor="family-day-select">Family worship</label>
            <select id="family-day-select" value={familyDay} onChange={handleFamilyDayChange}>
              {WEEKDAY_LABELS_PT.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="section">
          <div className="habits-section-head">
            <div>
              <p className="panel-kicker">Today</p>
              <h3>Shared</h3>
            </div>
          </div>
          <div className="habit-list">
            {sharedHabits.map((habit) => {
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
        </section>

        <section className="section">
          <div className="habits-section-head split">
            <div>
              <p className="panel-kicker">Personal</p>
              <h3>Custom</h3>
            </div>
            <p className="section-hint">Enter saves · Esc cancels</p>
          </div>

          <div className="habit-list">
            {uniqueCustomHabits.map((habit) => (
              <CustomHabitRow
                key={habit.id}
                habit={habit}
                checked={Boolean(customDone[habit.id])}
                isEditing={editingId === habit.id}
                draftName={editingId === habit.id ? editingName : habit.name}
                busy={mutationBusy}
                onToggle={handleCustomToggle}
                onStartEdit={handleStartEdit}
                onDraftNameChange={handleDraftNameChange}
                onSubmitEdit={handleSubmitEdit}
                onCancelEdit={handleCancelEdit}
                onDelete={handleDeleteHabit}
              />
            ))}
          </div>

          <div className="form-row add-row quiet-add-row">
            <input
              type="text"
              placeholder="Add habit"
              value={newHabit}
              onChange={handleNewHabitChange}
              onKeyDown={handleNewHabitKeyDown}
            />
            <button className="secondary subtle" type="button" onClick={submitNewHabit} disabled={addHabit.isPending || !newHabit.trim()}>
              {addHabit.isPending ? "Adding..." : "Add"}
            </button>
          </div>
        </section>
      </div>

      <div className="card">
        <div className="habits-section-head">
          <div>
              <p className="panel-kicker">Today</p>
            <h3>Metrics</h3>
          </div>
          <p className="section-hint">Blur or Enter saves</p>
        </div>

        <div className="metrics-grid">
          <div className="form-row">
            <label htmlFor="metric-sleep">Sleep hours</label>
            <input
              id="metric-sleep"
              type="number"
              step="0.5"
              value={metricDrafts.sleep_hours}
              onChange={(event) => handleMetricChange("sleep_hours", event.target.value)}
              onBlur={() => commitMetric("sleep_hours")}
              onKeyDown={(event) => handleMetricKeyDown("sleep_hours", event)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="metric-anxiety">Anxiety level</label>
            <input
              id="metric-anxiety"
              type="number"
              min="1"
              max="10"
              value={metricDrafts.anxiety_level}
              onChange={(event) => handleMetricChange("anxiety_level", event.target.value)}
              onBlur={() => commitMetric("anxiety_level")}
              onKeyDown={(event) => handleMetricKeyDown("anxiety_level", event)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="metric-work">Work/study hours</label>
            <input
              id="metric-work"
              type="number"
              step="0.5"
              value={metricDrafts.work_hours}
              onChange={(event) => handleMetricChange("work_hours", event.target.value)}
              onBlur={() => commitMetric("work_hours")}
              onKeyDown={(event) => handleMetricKeyDown("work_hours", event)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="metric-boredom">Boredom minutes</label>
            <input
              id="metric-boredom"
              type="number"
              min="0"
              value={metricDrafts.boredom_minutes}
              onChange={(event) => handleMetricChange("boredom_minutes", event.target.value)}
              onBlur={() => commitMetric("boredom_minutes")}
              onKeyDown={(event) => handleMetricKeyDown("boredom_minutes", event)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="metric-mood">Mood</label>
            <div id="metric-mood" className="metric-readonly-row">
              <span>
                {getMoodMeta(dayEntry.moodCategory)?.emoji
                  ? `${getMoodMeta(dayEntry.moodCategory)?.emoji} `
                  : ""}
                {getMoodMeta(dayEntry.moodCategory)?.label || "No entries"}
              </span>
              <Link href="/mood" className="page-link inline muted">
                Open
              </Link>
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="metric-priority">Priority</label>
            <input
              id="metric-priority"
              type="text"
              value={metricDrafts.priority_label}
              onChange={(event) => handleMetricChange("priority_label", event.target.value)}
              onBlur={() => commitMetric("priority_label")}
              onKeyDown={(event) => handleMetricKeyDown("priority_label", event)}
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
