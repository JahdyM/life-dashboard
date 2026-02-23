"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { FIXED_SHARED_HABITS } from "@/lib/constants";
import type { CustomHabit, DayEntry, EstimationResponse, TodoTask } from "@/lib/types";

type TaskDraft = {
  title?: string;
  isDone?: boolean;
  priorityTag?: string;
  scheduledTime?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
};

type TaskListResponse = {
  items: TodoTask[];
  warning?: string | null;
};

type DayResponse = { entry: DayEntry };
type CustomHabitsResponse = { items: CustomHabit[] };
type CustomDoneResponse = { done: Record<string, number> };
type MeetingDaysResponse = { days: number[] };
type FamilyDayResponse = { day: number };

type DailyHabitItem = {
  id: string;
  label: string;
  kind: "fixed" | "custom";
  key: string;
  done: boolean;
  inAgenda: boolean;
  taskIds: string[];
};

type CompletionPromptState = {
  taskId: string;
  title: string;
  estimatedMinutes: number;
};

function readErrorMessage(error: unknown, fallback: string) {
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

const isHabitScheduledOnDate = (
  habitKey: string,
  dayIso: string,
  meetingDays: number[],
  familyDay: number
) => {
  const dayIndex = weekdayFromIso(dayIso);
  if (habitKey === "meeting_attended" || habitKey === "prepare_meeting") {
    return meetingDays.includes(dayIndex);
  }
  if (habitKey === "family_worship") {
    return dayIndex === familyDay;
  }
  return true;
};

type EditableTaskRowProps = {
  task: TodoTask;
  draft: {
    title: string;
    isDone: boolean;
    priorityTag: string;
    scheduledTime: string;
    estimatedMinutes: number;
    actualMinutes: number;
  };
  hasChanges: boolean;
  saving: boolean;
  saved: boolean;
  onToggleDone: (task: TodoTask, checked: boolean) => void;
  onConfirm: (task: TodoTask) => void;
  onSetDraft: (taskId: string, patch: TaskDraft) => void;
  onDelete: (taskId: string) => void;
};

const EditableTaskRow = memo(function EditableTaskRow({
  task,
  draft,
  hasChanges,
  saving,
  saved,
  onToggleDone,
  onConfirm,
  onSetDraft,
  onDelete,
}: EditableTaskRowProps) {
  const handleToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onToggleDone(task, event.target.checked),
    [onToggleDone, task]
  );
  const handleConfirm = useCallback(
    (event?: React.MouseEvent) => {
      event?.preventDefault();
      event?.stopPropagation();
      onConfirm(task);
    },
    [onConfirm, task]
  );
  const handlePriority = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) =>
      onSetDraft(task.id, { priorityTag: event.target.value }),
    [onSetDraft, task.id]
  );
  const handleTitle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onSetDraft(task.id, { title: event.target.value }),
    [onSetDraft, task.id]
  );
  const handleTime = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onSetDraft(task.id, { scheduledTime: event.target.value }),
    [onSetDraft, task.id]
  );
  const handleEstimate = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onSetDraft(task.id, { estimatedMinutes: Number(event.target.value || 0) }),
    [onSetDraft, task.id]
  );
  const handleDelete = useCallback(() => onDelete(task.id), [onDelete, task.id]);

  return (
    <details className={`task-row ${hasChanges ? "dirty" : ""}`}>
      <summary>
        <input type="checkbox" checked={draft.isDone} onChange={handleToggle} />
        <span className="task-title">{draft.title}</span>
        {draft.scheduledTime ? <span className="task-time">{draft.scheduledTime}</span> : null}
        <button
          className={`task-confirm-btn ${hasChanges || saved ? "visible" : ""}`}
          onClick={handleConfirm}
          disabled={!hasChanges || saving}
          title="Confirm task changes"
        >
          {saving ? "..." : saved ? "✓" : "ok"}
        </button>
      </summary>
      <div className="task-details">
        <label>
          Title
          <input type="text" value={draft.title} onChange={handleTitle} />
        </label>
        <label>
          Priority
          <select value={draft.priorityTag} onChange={handlePriority}>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </label>
        <label>
          Start time
          <input type="time" value={draft.scheduledTime} onChange={handleTime} />
        </label>
        <label>
          Est. minutes
          <input type="number" value={draft.estimatedMinutes} onChange={handleEstimate} />
        </label>
        <button
          className="task-confirm-inline"
          onClick={() => onConfirm(task)}
          disabled={!hasChanges || saving}
        >
          {saving ? "Saving..." : "Confirm changes"}
        </button>
        <button className="link danger" onClick={handleDelete}>
          Delete
        </button>
      </div>
    </details>
  );
});

type SimpleTaskRowProps = {
  task: TodoTask;
  draft: {
    title: string;
    isDone: boolean;
    priorityTag: string;
    scheduledTime: string;
    estimatedMinutes: number;
    actualMinutes: number;
  };
  hasChanges: boolean;
  saving: boolean;
  onToggleDone: (task: TodoTask, checked: boolean) => void;
  onConfirm: (task: TodoTask) => void;
  onScheduleToday?: (taskId: string) => void;
  completed?: boolean;
};

const SimpleTaskRow = memo(function SimpleTaskRow({
  task,
  draft,
  hasChanges,
  saving,
  onToggleDone,
  onConfirm,
  onScheduleToday,
  completed = false,
}: SimpleTaskRowProps) {
  const handleToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onToggleDone(task, event.target.checked),
    [onToggleDone, task]
  );
  const handleConfirm = useCallback(() => onConfirm(task), [onConfirm, task]);
  const handleSchedule = useCallback(() => {
    if (!onScheduleToday) return;
    onScheduleToday(task.id);
  }, [onScheduleToday, task.id]);

  return (
    <div className={`task-row ${completed ? "completed" : ""}`}>
      <input type="checkbox" checked={draft.isDone} onChange={handleToggle} />
      <span className="task-title">{draft.title}</span>
      {draft.scheduledTime ? <span className="task-time">{draft.scheduledTime}</span> : null}
      <button
        className={`task-confirm-btn ${hasChanges ? "visible" : ""}`}
        onClick={handleConfirm}
        disabled={!hasChanges || saving}
        title="Confirm task changes"
      >
        {saving ? "..." : "ok"}
      </button>
      {onScheduleToday ? (
        <button className="link" onClick={handleSchedule}>
          Schedule today
        </button>
      ) : null}
    </div>
  );
});

type CompletedTaskRowProps = {
  task: TodoTask;
  draft: {
    title: string;
    isDone: boolean;
    priorityTag: string;
    scheduledTime: string;
    estimatedMinutes: number;
    actualMinutes: number;
  };
  hasChanges: boolean;
  saving: boolean;
  onSetDraft: (taskId: string, patch: TaskDraft) => void;
  onConfirm: (task: TodoTask) => void;
};

const CompletedTaskRow = memo(function CompletedTaskRow({
  task,
  draft,
  hasChanges,
  saving,
  onSetDraft,
  onConfirm,
}: CompletedTaskRowProps) {
  const handleActual = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onSetDraft(task.id, { actualMinutes: Math.max(0, Number(event.target.value || 0)) });
    },
    [onSetDraft, task.id]
  );
  const handleConfirm = useCallback(() => onConfirm(task), [onConfirm, task]);

  return (
    <div className="calendar-completed-item editable">
      <span className="calendar-completed-mark">✓</span>
      <span className="calendar-completed-title">{task.title}</span>
      <div className="calendar-completed-editor">
        <input
          className="completed-actual-input"
          type="number"
          min={0}
          step={5}
          value={draft.actualMinutes}
          onChange={handleActual}
        />
        <button
          className={`task-confirm-btn ${hasChanges ? "visible" : ""}`}
          disabled={!hasChanges || saving}
          onClick={handleConfirm}
          title="Save actual minutes"
          type="button"
        >
          {saving ? "..." : "save"}
        </button>
      </div>
    </div>
  );
});

type DailyHabitRowProps = {
  habit: DailyHabitItem;
  timeValue: string;
  durationValue: number;
  saving: boolean;
  onToggleHabit: (habit: DailyHabitItem, checked: boolean) => void;
  onTimeChange: (habitId: string, value: string) => void;
  onDurationChange: (habitId: string, value: number) => void;
  onAddToAgenda: (habit: DailyHabitItem) => void;
  onRemoveFromAgenda: (habit: DailyHabitItem) => void;
};

const DailyHabitRow = memo(function DailyHabitRow({
  habit,
  timeValue,
  durationValue,
  saving,
  onToggleHabit,
  onTimeChange,
  onDurationChange,
  onAddToAgenda,
  onRemoveFromAgenda,
}: DailyHabitRowProps) {
  const handleToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onToggleHabit(habit, event.target.checked),
    [habit, onToggleHabit]
  );
  const handleTime = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onTimeChange(habit.id, event.target.value),
    [habit.id, onTimeChange]
  );
  const handleDuration = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Math.max(5, Number(event.target.value || 30));
      onDurationChange(habit.id, next);
    },
    [habit.id, onDurationChange]
  );
  const handleAdd = useCallback(() => onAddToAgenda(habit), [habit, onAddToAgenda]);
  const handleRemove = useCallback(
    () => onRemoveFromAgenda(habit),
    [habit, onRemoveFromAgenda]
  );

  return (
    <div className={`task-row habit-row-inline ${habit.done ? "completed" : ""}`}>
      <input type="checkbox" checked={habit.done} onChange={handleToggle} />
      <span className="task-title">{habit.label}</span>
      <input
        className="habit-time-input"
        type="time"
        value={timeValue}
        onChange={handleTime}
      />
      <input
        className="habit-duration-input"
        type="number"
        min={5}
        step={5}
        value={durationValue}
        onChange={handleDuration}
      />
      <button
        className="task-confirm-btn visible"
        disabled={habit.inAgenda || saving}
        type="button"
        onClick={handleAdd}
      >
        {habit.inAgenda ? "in agenda" : saving ? "..." : "add"}
      </button>
      <button
        className="habit-remove-btn"
        disabled={!habit.inAgenda || saving}
        type="button"
        title={`Remove ${habit.label} from agenda`}
        aria-label={`Remove ${habit.label} from agenda`}
        onClick={handleRemove}
      >
        -
      </button>
    </div>
  );
});

export default function CalendarTab({ userEmail: _userEmail }: { userEmail: string }) {
  const queryClient = useQueryClient();
  const calendarRef = useRef<FullCalendar | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "failed">("idle");
  const [didSync, setDidSync] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [newTime, setNewTime] = useState("");
  const [newEst, setNewEst] = useState(30);
  const [calendarDraftTitle, setCalendarDraftTitle] = useState("");
  const [calendarSelection, setCalendarSelection] = useState<{
    date: string;
    time: string;
    estimatedMinutes: number;
  } | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft>>({});
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [savedTaskId, setSavedTaskId] = useState<string | null>(null);
  const [taskSaveError, setTaskSaveError] = useState<string | null>(null);
  const [completionPrompt, setCompletionPrompt] = useState<CompletionPromptState | null>(null);
  const [completionMinutes, setCompletionMinutes] = useState(0);
  const [habitTimeDrafts, setHabitTimeDrafts] = useState<Record<string, string>>({});
  const [habitDurationDrafts, setHabitDurationDrafts] = useState<Record<string, number>>({});

  const range = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
    };
  }, [selectedDate]);
  const selectedDayIso = useMemo(
    () => format(selectedDate, "yyyy-MM-dd"),
    [selectedDate]
  );

  const scrollTime = useMemo(() => {
    const now = new Date(nowTick);
    const anchor = new Date(now.getTime() - 60 * 60 * 1000);
    return format(anchor, "HH:mm:ss");
  }, [nowTick]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      setNowTick(Date.now());
    }, 60_000);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        setNowTick(Date.now());
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.scrollToTime(scrollTime);
  }, [scrollTime, selectedDate]);

  useEffect(() => {
    setHabitTimeDrafts({});
    setHabitDurationDrafts({});
  }, [selectedDayIso]);

  const tasksQuery = useQuery({
    queryKey: ["tasks", range.start, range.end],
    queryFn: () =>
      fetchJson<TaskListResponse>(
        `/api/tasks?start=${range.start}&end=${range.end}&sync=${didSync ? 0 : 1}&include_unscheduled=1`
      ),
  });

  const dayQuery = useQuery({
    queryKey: ["day", selectedDayIso],
    queryFn: () => fetchJson<DayResponse>(`/api/day/${selectedDayIso}`),
  });
  const estimationHintQuery = useQuery({
    queryKey: ["stats-estimation", "calendar-hint"],
    queryFn: () => fetchJson<EstimationResponse>("/api/stats/estimation?period=90d"),
    staleTime: 5 * 60 * 1000,
  });
  const customHabitsQuery = useQuery({
    queryKey: ["custom-habits"],
    queryFn: () => fetchJson<CustomHabitsResponse>("/api/habits/custom"),
  });
  const customDoneQuery = useQuery({
    queryKey: ["custom-habits-done", selectedDayIso],
    queryFn: () =>
      fetchJson<CustomDoneResponse>(`/api/habits/custom/done/${selectedDayIso}`),
  });
  const meetingDaysQuery = useQuery({
    queryKey: ["meeting-days"],
    queryFn: () => fetchJson<MeetingDaysResponse>("/api/settings/meeting-days"),
  });
  const familyDayQuery = useQuery({
    queryKey: ["family-day"],
    queryFn: () => fetchJson<FamilyDayResponse>("/api/settings/family-worship-day"),
  });

  useEffect(() => {
    if (tasksQuery.data && !didSync) {
      setDidSync(true);
    }
  }, [tasksQuery.data, didSync]);

  const tasks = useMemo(
    () => tasksQuery.data?.items || [],
    [tasksQuery.data?.items]
  );
  const syncWarning = tasksQuery.data?.warning;

  const tasksForDay = tasks.filter((task) => task.scheduledDate === selectedDayIso);
  const unscheduledTasks = tasks.filter((task) => !task.scheduledDate);

  const setTaskDraft = useCallback((taskId: string, patch: TaskDraft) => {
    setTaskDrafts((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        ...patch,
      },
    }));
  }, []);

  const clearTaskDraft = useCallback((taskId: string) => {
    setTaskDrafts((prev) => {
      if (!prev[taskId]) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  const readTaskDraft = useCallback((task: TodoTask) => {
    const draft = taskDrafts[task.id] || {};
    return {
      title: draft.title ?? task.title,
      isDone: draft.isDone ?? Boolean(task.isDone),
      priorityTag: draft.priorityTag ?? (task.priorityTag || "Medium"),
      scheduledTime: draft.scheduledTime ?? (task.scheduledTime || ""),
      estimatedMinutes:
        draft.estimatedMinutes ?? Number(task.estimatedMinutes || 0),
      actualMinutes: draft.actualMinutes ?? Number(task.actualMinutes || 0),
    };
  }, [taskDrafts]);

  const pendingTasks = tasksForDay.filter((task) => !readTaskDraft(task).isDone);
  const completedTasks = tasksForDay.filter((task) => readTaskDraft(task).isDone);

  const dayEntry = useMemo(() => dayQuery.data?.entry || {}, [dayQuery.data?.entry]);
  const customHabitsRaw = useMemo(
    () => customHabitsQuery.data?.items || [],
    [customHabitsQuery.data?.items]
  );
  const customDone = useMemo(
    () => customDoneQuery.data?.done || {},
    [customDoneQuery.data?.done]
  );
  const meetingDaysRaw = useMemo(
    () => meetingDaysQuery.data?.days || [],
    [meetingDaysQuery.data?.days]
  );
  const familyDay = familyDayQuery.data?.day ?? 6;

  const meetingDays = useMemo(() => {
    const unique = Array.from(new Set(meetingDaysRaw.map((value) => Number(value))));
    unique.sort((a, b) => a - b);
    return unique.filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  }, [meetingDaysRaw]);

  const customHabits = useMemo(() => {
    const seen = new Map<string, CustomHabit>();
    customHabitsRaw.forEach((habit) => {
      const name = String(habit?.name || "").trim();
      if (!name) return;
      const canonical = canonicalHabitKey(name);
      if (!seen.has(canonical)) seen.set(canonical, habit);
    });
    return Array.from(seen.values());
  }, [customHabitsRaw]);

  const dailyHabits = useMemo<DailyHabitItem[]>(() => {
    const fixed: DailyHabitItem[] = FIXED_SHARED_HABITS.filter((habit) =>
      isHabitScheduledOnDate(habit.key, selectedDayIso, meetingDays, familyDay)
    ).map((habit) => {
      const taskIds = tasksForDay
        .filter(
          (task) =>
            canonicalHabitKey(task.title) === canonicalHabitKey(habit.label)
        )
        .map((task) => task.id);
      return {
        id: `fixed:${habit.key}`,
        label: habit.label,
        kind: "fixed" as const,
        key: habit.key,
        done: Boolean(dayEntry[toCamel(habit.key) as keyof DayEntry]),
        inAgenda: taskIds.length > 0,
        taskIds,
      };
    });

    const custom: DailyHabitItem[] = customHabits.map((habit) => {
      const taskIds = tasksForDay
        .filter(
          (task) =>
            canonicalHabitKey(task.title) === canonicalHabitKey(habit.name)
        )
        .map((task) => task.id);
      return {
        id: `custom:${habit.id}`,
        label: habit.name,
        kind: "custom" as const,
        key: habit.id,
        done: Boolean(customDone[habit.id]),
        inAgenda: taskIds.length > 0,
        taskIds,
      };
    });

    return [...fixed, ...custom];
  }, [customDone, customHabits, dayEntry, familyDay, meetingDays, selectedDayIso, tasksForDay]);
  const completedHabits = useMemo(
    () => dailyHabits.filter((habit) => habit.done),
    [dailyHabits]
  );

  const buildTaskPatch = useCallback((task: TodoTask, draft?: TaskDraft) => {
    if (!draft) return {};
    const patch: Record<string, string | number | null> = {};
    if (typeof draft.title === "string") {
      const trimmed = draft.title.trim();
      if (trimmed && trimmed !== task.title) {
        patch.title = trimmed;
      }
    }
    if (typeof draft.isDone === "boolean" && draft.isDone !== Boolean(task.isDone)) {
      patch.is_done = draft.isDone ? 1 : 0;
    }
    if (
      typeof draft.priorityTag === "string" &&
      draft.priorityTag !== (task.priorityTag || "Medium")
    ) {
      patch.priority_tag = draft.priorityTag;
    }
    if (
      typeof draft.scheduledTime === "string" &&
      draft.scheduledTime !== (task.scheduledTime || "")
    ) {
      patch.scheduled_time = draft.scheduledTime || null;
    }
    if (
      typeof draft.estimatedMinutes === "number" &&
      draft.estimatedMinutes !== Number(task.estimatedMinutes || 0)
    ) {
      patch.estimated_minutes = draft.estimatedMinutes;
    }
    if (
      typeof draft.actualMinutes === "number" &&
      draft.actualMinutes !== Number(task.actualMinutes || 0)
    ) {
      patch.actual_minutes = draft.actualMinutes;
    }
    return patch;
  }, []);

  const hasTaskChanges = useCallback(
    (task: TodoTask) =>
      Object.keys(buildTaskPatch(task, taskDrafts[task.id])).length > 0,
    [buildTaskPatch, taskDrafts]
  );

  const applyTaskPatchToCache = useCallback(
    (taskId: string, patch: Record<string, string | number | null>) => {
      queryClient.setQueryData(
        ["tasks", range.start, range.end],
        (previous: TaskListResponse | undefined) => {
          if (!previous?.items) return previous;
          return {
            ...previous,
            items: previous.items.map((item) => {
              if (item.id !== taskId) return item;
              return {
                ...item,
                title: "title" in patch ? String(patch.title || item.title) : item.title,
                isDone: "is_done" in patch ? (patch.is_done ? 1 : 0) : item.isDone,
                priorityTag: "priority_tag" in patch ? patch.priority_tag : item.priorityTag,
                scheduledTime:
                  "scheduled_time" in patch
                    ? patch.scheduled_time || null
                    : item.scheduledTime,
                estimatedMinutes:
                  "estimated_minutes" in patch
                    ? patch.estimated_minutes
                    : item.estimatedMinutes,
                actualMinutes:
                  "actual_minutes" in patch
                    ? patch.actual_minutes
                    : item.actualMinutes,
                completedAt:
                  "completed_at" in patch ? patch.completed_at : item.completedAt,
              };
            }),
          };
        }
      );
    },
    [queryClient, range.start, range.end]
  );

  const clearDoneDraft = useCallback((taskId: string) => {
    setTaskDrafts((prev) => {
      const current = prev[taskId];
      if (!current || !("isDone" in current)) return prev;
      const nextDraft = { ...current };
      delete nextDraft.isDone;
      const next = { ...prev };
      if (Object.keys(nextDraft).length === 0) {
        delete next[taskId];
      } else {
        next[taskId] = nextDraft;
      }
      return next;
    });
  }, []);

  const events = tasksForDay
    .filter((task) => task.scheduledTime)
    .map((task) => {
      const start = `${task.scheduledDate}T${task.scheduledTime}:00`;
      const startDate = new Date(start);
      const endDate = new Date(
        startDate.getTime() + (task.estimatedMinutes || 30) * 60000
      );
      const end = format(endDate, "yyyy-MM-dd'T'HH:mm:ss");
      return {
        id: task.id,
        title: task.title,
        start,
        end,
        classNames: [task.isDone ? "task-done" : "task-pending"],
        backgroundColor: task.isDone
          ? "rgba(127, 211, 165, 0.76)"
          : "rgba(143, 123, 179, 0.64)",
        borderColor: task.isDone ? "rgba(127, 211, 165, 0.95)" : "rgba(143, 123, 179, 0.95)",
        textColor: task.isDone ? "#102418" : "#F5F1EA",
      };
    });

  const createTask = useMutation({
    mutationFn: () =>
      fetchJson("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle,
          scheduled_date: newDate,
          scheduled_time: newTime || null,
          estimated_minutes: newEst,
          sync_google: true,
        }),
      }),
    onSuccess: () => {
      setTaskSaveError(null);
      setNewTitle("");
      setNewTime("");
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error) => {
      setTaskSaveError(readErrorMessage(error, "Could not create task."));
    },
  });

  const updateDayHabit = useMutation({
    mutationFn: (payload: Record<string, number>) =>
      fetchJson<DayResponse>(`/api/day/${selectedDayIso}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onMutate: async (payload) => {
      setTaskSaveError(null);
      await queryClient.cancelQueries({ queryKey: ["day", selectedDayIso] });
      const previous = queryClient.getQueryData<DayResponse>(["day", selectedDayIso]);
      const normalizedPayload = Object.entries(payload).reduce(
        (acc, [key, value]) => ({
          ...acc,
          [toCamel(key)]: value,
        }),
        {} as Record<string, number>
      );
      queryClient.setQueryData(["day", selectedDayIso], (old: DayResponse | undefined) => ({
        entry: { ...(old?.entry || {}), ...normalizedPayload },
      }));
      return { previous };
    },
    onError: (error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["day", selectedDayIso], context.previous);
      }
      setTaskSaveError(readErrorMessage(error, "Could not update daily habit."));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["day", selectedDayIso] });
      queryClient.invalidateQueries({ queryKey: ["couple-streaks"] });
      queryClient.invalidateQueries({ queryKey: ["init"] });
    },
  });

  const updateCustomHabitDone = useMutation({
    mutationFn: (done: Record<string, number>) =>
      fetchJson<{ ok: boolean }>(`/api/habits/custom/done/${selectedDayIso}`, {
        method: "PUT",
        body: JSON.stringify({ done }),
      }),
    onMutate: async (done) => {
      setTaskSaveError(null);
      await queryClient.cancelQueries({ queryKey: ["custom-habits-done", selectedDayIso] });
      const previous = queryClient.getQueryData<CustomDoneResponse>([
        "custom-habits-done",
        selectedDayIso,
      ]);
      queryClient.setQueryData(["custom-habits-done", selectedDayIso], { done });
      return { previous };
    },
    onError: (error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ["custom-habits-done", selectedDayIso],
          context.previous
        );
      }
      setTaskSaveError(readErrorMessage(error, "Could not update custom habit."));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-habits-done", selectedDayIso] });
      queryClient.invalidateQueries({ queryKey: ["couple-streaks"] });
      queryClient.invalidateQueries({ queryKey: ["init"] });
    },
  });

  const createHabitTask = useMutation({
    mutationFn: ({
      title,
      scheduledTime,
      estimatedMinutes,
    }: {
      title: string;
      scheduledTime?: string | null;
      estimatedMinutes?: number;
    }) =>
      fetchJson("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          source: "habit",
          scheduled_date: selectedDayIso,
          scheduled_time: scheduledTime || null,
          estimated_minutes: estimatedMinutes || 30,
          sync_google: true,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error) => {
      setTaskSaveError(readErrorMessage(error, "Could not add habit to agenda."));
    },
  });

  const removeHabitTasks = useMutation({
    mutationFn: async (taskIds: string[]) => {
      if (!taskIds.length) return;
      for (const taskId of taskIds) {
        try {
          await fetchJson(`/api/tasks/${taskId}`, {
            method: "DELETE",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          const notFound =
            message.includes("404") ||
            message.includes("Task not found") ||
            message.includes("RESOURCE_NOT_FOUND");
          if (!notFound) {
            throw error;
          }
        }
      }
    },
    onMutate: async (taskIds) => {
      setTaskSaveError(null);
      await queryClient.cancelQueries({ queryKey: ["tasks", range.start, range.end] });
      const previous = queryClient.getQueryData<TaskListResponse>([
        "tasks",
        range.start,
        range.end,
      ]);
      queryClient.setQueryData(
        ["tasks", range.start, range.end],
        (old: TaskListResponse | undefined) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.filter((item) => !taskIds.includes(item.id)),
          };
        }
      );
      return { previous };
    },
    onSuccess: () => {
      setTaskSaveError(null);
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error, _taskIds, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["tasks", range.start, range.end], context.previous);
      }
      setTaskSaveError(readErrorMessage(error, "Could not remove habit from agenda."));
    },
  });

  const createTaskFromCalendar = useMutation({
    mutationFn: () => {
      if (!calendarSelection) return Promise.resolve(null);
      return fetchJson("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: (calendarDraftTitle || newTitle || "New task").trim(),
          scheduled_date: calendarSelection.date,
          scheduled_time: calendarSelection.time || null,
          estimated_minutes: calendarSelection.estimatedMinutes || newEst || 30,
          sync_google: true,
        }),
      });
    },
    onSuccess: () => {
      setTaskSaveError(null);
      setCalendarDraftTitle("");
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error) => {
      setTaskSaveError(
        readErrorMessage(error, "Could not create task from calendar slot.")
      );
    },
  });

  const updateTask = useMutation({
    mutationFn: ({
      id,
      data,
      syncGoogle = true,
    }: {
      id: string;
      data: Record<string, string | number | null>;
      syncGoogle?: boolean;
    }) =>
      fetchJson(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(
          syncGoogle ? { ...data, sync_google: true } : { ...data }
        ),
      }),
    onSuccess: () => {
      setTaskSaveError(null);
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error) => {
      setTaskSaveError(readErrorMessage(error, "Could not update task."));
    },
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/tasks/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setTaskSaveError(null);
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error) => {
      setTaskSaveError(readErrorMessage(error, "Could not delete task."));
    },
  });

  const syncNow = async () => {
    setSyncStatus("syncing");
    try {
      await fetchJson("/api/calendar/sync", {
        method: "POST",
        body: JSON.stringify(range),
      });
      setSyncStatus("idle");
      setTaskSaveError(null);
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    } catch (error) {
      setSyncStatus("failed");
      setTaskSaveError(readErrorMessage(error, "Could not sync calendar now. Please retry."));
    }
  };

  const applyCalendarSelection = (startDate: Date, endDate?: Date | null) => {
    const nextDate = format(startDate, "yyyy-MM-dd");
    const nextTime = format(startDate, "HH:mm");
    const estimatedMinutes = endDate
      ? Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60000))
      : 30;
    setSelectedDate(startDate);
    setNewDate(nextDate);
    setNewTime(nextTime);
    setNewEst(estimatedMinutes);
    setCalendarSelection({
      date: nextDate,
      time: nextTime,
      estimatedMinutes,
    });
  };

  const confirmTaskUpdate = useCallback((task: TodoTask) => {
    const patch = buildTaskPatch(task, taskDrafts[task.id]);
    if (!Object.keys(patch).length) return;
    setSavingTaskId(task.id);
    updateTask.mutate(
      { id: task.id, data: patch },
      {
        onSuccess: () => {
          setTaskSaveError(null);
          clearTaskDraft(task.id);
          setSavingTaskId(null);
          setSavedTaskId(task.id);
          window.setTimeout(() => {
            setSavedTaskId((prev) => (prev === task.id ? null : prev));
          }, 1400);
        },
        onError: (error) => {
          setTaskSaveError(
            readErrorMessage(error, "Could not save task changes. Please try again.")
          );
          setSavingTaskId(null);
        },
      }
    );
  }, [buildTaskPatch, taskDrafts, updateTask, clearTaskDraft]);

  const toggleTaskDoneNow = useCallback((
    task: TodoTask,
    checked: boolean,
    actualMinutes?: number | null
  ) => {
    const cacheSnapshot = queryClient.getQueryData(["tasks", range.start, range.end]);
    const patch: Record<string, string | number | null> = {
      is_done: checked ? 1 : 0,
      completed_at: checked ? new Date().toISOString() : null,
    };
    if (typeof actualMinutes === "number" && checked) {
      patch.actual_minutes = actualMinutes;
    }
    setTaskDraft(task.id, { isDone: checked });
    applyTaskPatchToCache(task.id, patch);
    setSavingTaskId(task.id);
    updateTask.mutate(
      { id: task.id, data: patch, syncGoogle: false },
      {
        onSuccess: () => {
          setTaskSaveError(null);
          clearDoneDraft(task.id);
          setSavingTaskId(null);
          setCompletionPrompt(null);
          setSavedTaskId(task.id);
          window.setTimeout(() => {
            setSavedTaskId((prev) => (prev === task.id ? null : prev));
          }, 900);
        },
        onError: (error) => {
          if (cacheSnapshot) {
            queryClient.setQueryData(["tasks", range.start, range.end], cacheSnapshot);
          }
          setTaskSaveError(
            readErrorMessage(error, "Could not mark task. Please try again.")
          );
          clearDoneDraft(task.id);
          setSavingTaskId(null);
        },
      }
    );
  }, [
    queryClient,
    range.start,
    range.end,
    setTaskDraft,
    updateTask,
    applyTaskPatchToCache,
    clearDoneDraft,
  ]);

  const requestToggleTaskDone = useCallback(
    (task: TodoTask, checked: boolean) => {
      if (checked) {
        const estimated = Number(task.estimatedMinutes || 0);
        if (estimated > 0) {
          setCompletionPrompt({
            taskId: task.id,
            title: task.title,
            estimatedMinutes: estimated,
          });
          setCompletionMinutes(estimated);
          return;
        }
      }
      setCompletionPrompt(null);
      toggleTaskDoneNow(task, checked);
    },
    [toggleTaskDoneNow]
  );

  const confirmCompletionMinutes = useCallback(() => {
    if (!completionPrompt) return;
    const task = tasks.find((item) => item.id === completionPrompt.taskId);
    if (!task) {
      setCompletionPrompt(null);
      return;
    }
    const minutes = Math.max(0, Number(completionMinutes || 0));
    toggleTaskDoneNow(task, true, minutes);
  }, [completionPrompt, completionMinutes, tasks, toggleTaskDoneNow]);

  const skipCompletionMinutes = useCallback(() => {
    if (!completionPrompt) return;
    const task = tasks.find((item) => item.id === completionPrompt.taskId);
    if (!task) {
      setCompletionPrompt(null);
      return;
    }
    toggleTaskDoneNow(task, true);
  }, [completionPrompt, tasks, toggleTaskDoneNow]);

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      deleteTask.mutate(taskId);
    },
    [deleteTask]
  );

  const handleScheduleToday = useCallback(
    (taskId: string) => {
      updateTask.mutate({
        id: taskId,
        data: { scheduled_date: selectedDayIso },
      });
    },
    [updateTask, selectedDayIso]
  );

  const handleHabitTimeChange = useCallback((habitId: string, value: string) => {
    setHabitTimeDrafts((prev) => ({
      ...prev,
      [habitId]: value,
    }));
  }, []);

  const handleHabitDurationChange = useCallback((habitId: string, value: number) => {
    setHabitDurationDrafts((prev) => ({
      ...prev,
      [habitId]: value,
    }));
  }, []);

  const handleToggleHabit = useCallback(
    (habit: DailyHabitItem, checked: boolean) => {
      if (habit.kind === "fixed") {
        updateDayHabit.mutate({ [habit.key]: checked ? 1 : 0 });
        return;
      }
      const nextDone = { ...customDone, [habit.key]: checked ? 1 : 0 };
      updateCustomHabitDone.mutate(nextDone);
    },
    [customDone, updateCustomHabitDone, updateDayHabit]
  );

  const handleAddHabitToAgenda = useCallback(
    (habit: DailyHabitItem) => {
      const scheduledTime = habitTimeDrafts[habit.id] || null;
      const estimatedMinutes = Math.max(5, Number(habitDurationDrafts[habit.id] || 30));
      createHabitTask.mutate({
        title: habit.label,
        scheduledTime,
        estimatedMinutes,
      });
    },
    [createHabitTask, habitDurationDrafts, habitTimeDrafts]
  );

  const handleRemoveHabitFromAgenda = useCallback(
    (habit: DailyHabitItem) => {
      if (!habit.taskIds.length) return;
      removeHabitTasks.mutate(habit.taskIds);
    },
    [removeHabitTasks]
  );

  const habitsLoading =
    dayQuery.isPending ||
    customHabitsQuery.isPending ||
    customDoneQuery.isPending ||
    meetingDaysQuery.isPending ||
    familyDayQuery.isPending;
  const habitsError =
    dayQuery.isError ||
    customHabitsQuery.isError ||
    customDoneQuery.isError ||
    meetingDaysQuery.isError ||
    familyDayQuery.isError;
  const estimationHint = useMemo(() => {
    const summary = estimationHintQuery.data?.summary;
    if (!summary) return null;
    if (summary.tendency === "insufficient_data") {
      return summary.recommendation;
    }
    const avgError = Number(summary.averageErrorMinutes || 0);
    const absMinutes = Math.round(Math.abs(avgError));
    if (summary.tendency === "overestimate") {
      const planned30 = Math.max(5, 30 - absMinutes);
      return `Estimativa: voce costuma superestimar em ~${absMinutes} min por tarefa. Ex.: tarefa de 30 min tende a levar ~${planned30} min.`;
    }
    if (summary.tendency === "underestimate") {
      return `Estimativa: voce costuma subestimar em ~${absMinutes} min por tarefa. Ex.: tarefa de 30 min tende a levar ~${30 + absMinutes} min.`;
    }
    return "Estimativa: seu tempo real esta proximo do planejado.";
  }, [estimationHintQuery.data]);

  return (
    <div className="calendar-layout">
      <div className="task-list">
        <div className="task-header">
          <div>
            <h2>Daily tasks list</h2>
            <p>
              {completedTasks.length}/{tasksForDay.length} done
            </p>
          </div>
          <button className="secondary" onClick={syncNow}>
            Sync now
          </button>
          <span className={`sync-status ${syncStatus}`}>{syncStatus}</span>
        </div>
        {estimationHint ? (
          <div className="task-estimation-hint">{estimationHint}</div>
        ) : null}
        {tasksQuery.isPending && (
          <div className="query-status">Loading tasks...</div>
        )}
        {tasksQuery.isError && (
          <div className="query-status error">
            <span>Could not load tasks for this range.</span>
            <button className="secondary" onClick={() => tasksQuery.refetch()}>
              Retry
            </button>
          </div>
        )}
        {syncWarning && <div className="warning">{syncWarning}</div>}
        {taskSaveError && <div className="warning">{taskSaveError}</div>}
        <div className="task-remembered">
          <h3>Daily habits (show every day)</h3>
          {habitsLoading ? (
            <div className="query-status">Loading habits for this day...</div>
          ) : null}
          {habitsError ? (
            <div className="query-status error">
              <span>Could not load daily habits.</span>
              <button
                className="secondary"
                onClick={() => {
                  dayQuery.refetch();
                  customHabitsQuery.refetch();
                  customDoneQuery.refetch();
                  meetingDaysQuery.refetch();
                  familyDayQuery.refetch();
                }}
              >
                Retry
              </button>
            </div>
          ) : null}
          {!habitsLoading && !habitsError
            ? dailyHabits.map((habit) => (
                <DailyHabitRow
                  key={habit.id}
                  habit={habit}
                  timeValue={habitTimeDrafts[habit.id] || ""}
                  durationValue={Math.max(5, Number(habitDurationDrafts[habit.id] || 30))}
                  saving={
                    updateDayHabit.isPending ||
                    updateCustomHabitDone.isPending ||
                    createHabitTask.isPending ||
                    removeHabitTasks.isPending
                  }
                  onToggleHabit={handleToggleHabit}
                  onTimeChange={handleHabitTimeChange}
                  onDurationChange={handleHabitDurationChange}
                  onAddToAgenda={handleAddHabitToAgenda}
                  onRemoveFromAgenda={handleRemoveHabitFromAgenda}
                />
              ))
            : null}
        </div>
        {completionPrompt ? (
          <div className="completion-prompt">
            <div className="completion-prompt-title">
              Complete &ldquo;{completionPrompt.title}&rdquo;
            </div>
            <div className="completion-prompt-row">
              <label htmlFor="completion-minutes">
                Actual minutes (estimated {completionPrompt.estimatedMinutes})
              </label>
              <input
                id="completion-minutes"
                type="number"
                min={0}
                value={completionMinutes}
                onChange={(event) => setCompletionMinutes(Number(event.target.value || 0))}
              />
              <button className="secondary" onClick={confirmCompletionMinutes}>
                Confirm
              </button>
              <button className="link" onClick={skipCompletionMinutes}>
                Skip time
              </button>
              <button className="link danger" onClick={() => setCompletionPrompt(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <div className="task-items">
          {pendingTasks.map((task) => {
            const draft = readTaskDraft(task);
            return (
              <EditableTaskRow
                key={task.id}
                task={task}
                draft={draft}
                hasChanges={hasTaskChanges(task)}
                saving={savingTaskId === task.id}
                saved={savedTaskId === task.id}
                onToggleDone={requestToggleTaskDone}
                onConfirm={confirmTaskUpdate}
                onSetDraft={setTaskDraft}
                onDelete={handleDeleteTask}
              />
            );
          })}
        </div>
        {unscheduledTasks.length > 0 && (
          <div className="task-remembered">
            <h3>Remembered tasks</h3>
            {unscheduledTasks.map((task) => (
              <SimpleTaskRow
                key={task.id}
                task={task}
                draft={readTaskDraft(task)}
                hasChanges={hasTaskChanges(task)}
                saving={savingTaskId === task.id}
                onToggleDone={requestToggleTaskDone}
                onConfirm={confirmTaskUpdate}
                onScheduleToday={handleScheduleToday}
              />
            ))}
          </div>
        )}
        <div className="task-form">
          <h3>Add activity</h3>
          <div className="form-row">
            <label htmlFor="new-task-title">Title</label>
            <input
              id="new-task-title"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="new-task-date">Date</label>
            <input
              id="new-task-date"
              type="date"
              value={newDate}
              onChange={(event) => setNewDate(event.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="new-task-time">Start time</label>
            <input
              id="new-task-time"
              type="time"
              value={newTime}
              onChange={(event) => setNewTime(event.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="new-task-est">Est. minutes</label>
            <input
              id="new-task-est"
              type="number"
              value={newEst}
              onChange={(event) => setNewEst(Number(event.target.value))}
            />
          </div>
          <button className="primary" onClick={() => createTask.mutate()}>
            Confirm task
          </button>
        </div>
      </div>

      <div className="calendar-panel">
        <div className="calendar-quick-add">
          <div className="calendar-quick-title">Add directly from calendar</div>
          <div className="calendar-quick-row">
            <input
              className="calendar-quick-input"
              placeholder="Task title from selected slot..."
              value={calendarDraftTitle}
              onChange={(event) => setCalendarDraftTitle(event.target.value)}
            />
            <button
              className="secondary"
              disabled={!calendarSelection || !calendarDraftTitle.trim()}
              onClick={() => createTaskFromCalendar.mutate()}
            >
              {createTaskFromCalendar.isPending ? "Adding..." : "Add"}
            </button>
          </div>
          {calendarSelection ? (
            <div className="calendar-selection-meta">
              Selected: {calendarSelection.date} {calendarSelection.time} ({calendarSelection.estimatedMinutes}m)
            </div>
          ) : (
            <div className="calendar-selection-meta">
              Click or drag a time slot to prefill task creation.
            </div>
          )}
        </div>
        <div className="calendar-header">
          <button onClick={() => setSelectedDate(addDays(selectedDate, -1))}>Prev</button>
          <div>{format(selectedDate, "MMMM dd, yyyy")}</div>
          <button onClick={() => setSelectedDate(addDays(selectedDate, 1))}>Next</button>
        </div>
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridDay"
          height={560}
          contentHeight={500}
          expandRows={false}
          headerToolbar={false}
          allDaySlot={false}
          nowIndicator
          scrollTime={scrollTime}
          scrollTimeReset={false}
          slotMinTime="05:00:00"
          slotMaxTime="23:30:00"
          slotDuration="00:30:00"
          selectable
          selectMirror
          events={events}
          editable
          dateClick={(info) => {
            applyCalendarSelection(info.date, null);
          }}
          select={(info) => {
            applyCalendarSelection(info.start, info.end);
          }}
          eventDrop={(info) => {
            const date = info.event.start;
            if (!date) return;
            const dateStr = format(date, "yyyy-MM-dd");
            const timeStr = format(date, "HH:mm");
            updateTask.mutate({
              id: info.event.id,
              data: { scheduled_date: dateStr, scheduled_time: timeStr },
            });
          }}
        />
        <div className="calendar-completed">
          <h3>Completed</h3>
          {completedTasks.length === 0 && completedHabits.length === 0 ? (
            <div className="line-empty">No completed items for this day yet.</div>
          ) : null}
          {completedTasks.map((task) => (
            <CompletedTaskRow
              key={`done-task-${task.id}`}
              task={task}
              draft={readTaskDraft(task)}
              hasChanges={hasTaskChanges(task)}
              saving={savingTaskId === task.id}
              onSetDraft={setTaskDraft}
              onConfirm={confirmTaskUpdate}
            />
          ))}
          {completedHabits.map((habit) => (
            <div key={`done-habit-${habit.id}`} className="calendar-completed-item">
              <span className="calendar-completed-mark">✓</span>
              <span className="calendar-completed-title">{habit.label}</span>
              <span className="calendar-completed-badge">habit</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
