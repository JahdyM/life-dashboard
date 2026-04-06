"use client";

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
import { CalendarClock, Share2, Trash2 } from "lucide-react";
import InlineActionNotice from "@/components/common/InlineActionNotice";
import OverflowMenu from "@/components/common/OverflowMenu";
import CompletionPopover from "@/components/calendar/CompletionPopover";
import TaskComposer from "@/components/calendar/TaskComposer";
import { fetchJson } from "@/lib/client/api";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { FIXED_SHARED_HABITS } from "@/lib/constants";
import type {
  CustomHabit,
  DayEntry,
  EstimationResponse,
  TaskShareInvite,
  TodoTask,
} from "@/lib/types";

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
type TaskSharesResponse = { items: TaskShareInvite[]; sent?: TaskShareInvite[] };
type QuickNoteResponse = { text: string };

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

type CalendarViewMode = "timeGridDay" | "timeGridWeek";

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return `${fallback} ${error.message}`;
  }
  return fallback;
}

function isGoogleReconnectErrorText(text: string | null | undefined) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("google authorization expired") ||
    normalized.includes("google calendar not connected") ||
    normalized.includes("reconnect your account")
  );
}

const toCamel = (key: string) =>
  key.replace(/_([a-z])/g, (_match, char) => String(char).toUpperCase());

const canonicalHabitKey = (name: string) =>
  String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*\(books\)/g, "");

const emailHandle = (email: string) => {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized.includes("@")) return normalized;
  return normalized.split("@")[0];
};

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
  saving: boolean;
  saved: boolean;
  onToggleDone: (task: TodoTask, checked: boolean) => void;
  onSave: (task: TodoTask) => void;
  onSetDraft: (taskId: string, patch: TaskDraft) => void;
  onReset: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onShare?: (taskId: string) => void;
  sharing: boolean;
  shareLabel?: string | null;
  shareActionLabel?: string;
};

const EditableTaskRow = memo(function EditableTaskRow({
  task,
  draft,
  saving,
  saved,
  onToggleDone,
  onSave,
  onSetDraft,
  onReset,
  onDelete,
  onShare,
  sharing,
  shareLabel,
  shareActionLabel = "Share with partner",
}: EditableTaskRowProps) {
  const handleToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onToggleDone(task, event.target.checked),
    [onToggleDone, task]
  );
  const handlePriority = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      onSetDraft(task.id, { priorityTag: event.target.value }),
    [onSetDraft, task.id]
  );
  const handleTitle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onSetDraft(task.id, { title: event.target.value }),
    [onSetDraft, task.id]
  );
  const handleTime = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onSetDraft(task.id, { scheduledTime: event.target.value }),
    [onSetDraft, task.id]
  );
  const handleEstimate = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onSetDraft(task.id, { estimatedMinutes: Number(event.target.value || 0) }),
    [onSetDraft, task.id]
  );
  const handleDelete = useCallback(() => onDelete(task.id), [onDelete, task.id]);
  const handleShare = useCallback(() => {
    if (!onShare) return;
    onShare(task.id);
  }, [onShare, task.id]);
  const handleSave = useCallback(() => onSave(task), [onSave, task]);
  const handleReset = useCallback(() => onReset(task.id), [onReset, task.id]);
  const handleFieldKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSave();
        event.currentTarget.blur();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        handleReset();
        event.currentTarget.blur();
      }
    },
    [handleReset, handleSave]
  );
  const summaryMeta = [draft.scheduledTime, draft.estimatedMinutes ? `${draft.estimatedMinutes} min` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className={`task-row task-row-editable ${shareLabel ? "task-row-shared" : ""}`}>
      <summary>
        <input
          type="checkbox"
          checked={draft.isDone}
          onChange={handleToggle}
          onClick={(event) => event.stopPropagation()}
        />
        <div className="task-row-main">
          <span className="task-title">{draft.title}</span>
          {summaryMeta ? <span className="task-time">{summaryMeta}</span> : null}
        </div>
        {shareLabel ? <span className="task-share-badge">{shareLabel}</span> : null}
        {saving ? <span className="task-row-state">Saving…</span> : null}
        {!saving && saved ? <span className="task-row-state success">Saved</span> : null}
        <div className="task-row-menu" onClick={(event) => event.stopPropagation()}>
          <OverflowMenu className="task-row-overflow" align="right">
            <div className="task-row-menu-list">
              {onShare ? (
                <button type="button" className="task-row-menu-action" onClick={handleShare} disabled={sharing}>
                  <Share2 size={15} />
                  {sharing ? "Working..." : shareActionLabel}
                </button>
              ) : null}
              <button type="button" className="task-row-menu-action danger" onClick={handleDelete}>
                <Trash2 size={15} />
                Delete task
              </button>
            </div>
          </OverflowMenu>
        </div>
      </summary>
      <div className="task-details">
        <label>
          Title
          <input
            type="text"
            value={draft.title}
            onChange={handleTitle}
            onBlur={handleSave}
            onKeyDown={handleFieldKeyDown}
          />
        </label>
        <label>
          Priority
          <select
            value={draft.priorityTag}
            onChange={handlePriority}
            onBlur={handleSave}
            onKeyDown={handleFieldKeyDown}
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </label>
        <label>
          Start time
          <input
            type="time"
            value={draft.scheduledTime}
            onChange={handleTime}
            onBlur={handleSave}
            onKeyDown={handleFieldKeyDown}
          />
        </label>
        <label>
          Est. minutes
          <input
            type="number"
            min={0}
            step={5}
            value={draft.estimatedMinutes}
            onChange={handleEstimate}
            onBlur={handleSave}
            onKeyDown={handleFieldKeyDown}
          />
        </label>
        <p className="task-detail-hint">Press Enter to save this field, or Escape to cancel your unsaved edits.</p>
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
  onToggleDone: (task: TodoTask, checked: boolean) => void;
  onScheduleToday?: (taskId: string) => void;
  onShare?: (taskId: string) => void;
  sharing?: boolean;
  completed?: boolean;
  shareLabel?: string | null;
  shareActionLabel?: string;
};

const SimpleTaskRow = memo(function SimpleTaskRow({
  task,
  draft,
  onToggleDone,
  onScheduleToday,
  onShare,
  sharing = false,
  completed = false,
  shareLabel,
  shareActionLabel = "Share",
}: SimpleTaskRowProps) {
  const handleToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onToggleDone(task, event.target.checked),
    [onToggleDone, task]
  );
  const handleSchedule = useCallback(() => {
    if (!onScheduleToday) return;
    onScheduleToday(task.id);
  }, [onScheduleToday, task.id]);
  const handleShare = useCallback(() => {
    if (!onShare) return;
    onShare(task.id);
  }, [onShare, task.id]);

  return (
    <div className={`task-row ${completed ? "completed" : ""} ${shareLabel ? "task-row-shared" : ""}`}>
      <input type="checkbox" checked={draft.isDone} onChange={handleToggle} />
      <div className="task-row-main">
        <span className="task-title">{draft.title}</span>
        <span className="task-time">{completed ? "Completed outside the agenda" : "Not scheduled yet"}</span>
      </div>
      {shareLabel ? <span className="task-share-badge">{shareLabel}</span> : null}
      {onScheduleToday ? (
        <button className="secondary subtle" type="button" onClick={handleSchedule}>
          Schedule today
        </button>
      ) : null}
      <OverflowMenu className="task-row-overflow" align="right">
        <div className="task-row-menu-list">
          {onShare ? (
            <button type="button" className="task-row-menu-action" onClick={handleShare} disabled={sharing}>
              <Share2 size={15} />
              {sharing ? "Working..." : shareActionLabel}
            </button>
          ) : null}
        </div>
      </OverflowMenu>
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
  saving: boolean;
  onToggleDone: (task: TodoTask, checked: boolean) => void;
  onSetDraft: (taskId: string, patch: TaskDraft) => void;
  onSave: (task: TodoTask) => void;
  onReset: (taskId: string) => void;
  onShare?: (taskId: string) => void;
  sharing: boolean;
  shareLabel?: string | null;
  shareActionLabel?: string;
};

const CompletedTaskRow = memo(function CompletedTaskRow({
  task,
  draft,
  saving,
  onToggleDone,
  onSetDraft,
  onSave,
  onReset,
  onShare,
  sharing,
  shareLabel,
  shareActionLabel = "share",
}: CompletedTaskRowProps) {
  const handleToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onToggleDone(task, event.target.checked),
    [onToggleDone, task]
  );
  const handleActual = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onSetDraft(task.id, { actualMinutes: Math.max(0, Number(event.target.value || 0)) });
    },
    [onSetDraft, task.id]
  );
  const handleSave = useCallback(() => onSave(task), [onSave, task]);
  const handleReset = useCallback(() => onReset(task.id), [onReset, task.id]);
  const handleShare = useCallback(() => {
    if (!onShare) return;
    onShare(task.id);
  }, [onShare, task.id]);
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSave();
        event.currentTarget.blur();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        handleReset();
        event.currentTarget.blur();
      }
    },
    [handleReset, handleSave]
  );

  return (
    <div className={`calendar-completed-item editable ${shareLabel ? "task-row-shared" : ""}`}>
      <input type="checkbox" checked={draft.isDone} onChange={handleToggle} disabled={saving} />
      <span className="calendar-completed-title">{task.title}</span>
      {shareLabel ? <span className="task-share-badge">{shareLabel}</span> : null}
      <div className="calendar-completed-editor">
        <input
          className="completed-actual-input"
          type="number"
          min={0}
          step={5}
          value={draft.actualMinutes}
          onChange={handleActual}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
        />
        {saving ? <span className="task-row-state">Saving…</span> : null}
        <OverflowMenu className="task-row-overflow" align="right">
          <div className="task-row-menu-list">
            {onShare ? (
              <button className="task-row-menu-action" type="button" onClick={handleShare} disabled={sharing}>
                <Share2 size={15} />
                {sharing ? "Working..." : shareActionLabel}
              </button>
            ) : null}
          </div>
        </OverflowMenu>
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
        disabled={saving}
        type="button"
        title={`Hide ${habit.label} for today`}
        aria-label={`Hide ${habit.label} for today`}
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
  const [calendarView, setCalendarView] = useState<CalendarViewMode>("timeGridDay");
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [newTime, setNewTime] = useState("");
  const [newEst, setNewEst] = useState(30);
  const [shareOnCreate, setShareOnCreate] = useState(false);
  const [composerAdvancedOpen, setComposerAdvancedOpen] = useState(false);
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
  const [estimationDrafts, setEstimationDrafts] = useState<
    Record<string, { estimatedMinutes: number; actualMinutes: number }>
  >({});
  const [savingEstimationTaskId, setSavingEstimationTaskId] = useState<string | null>(null);
  const [sharingTaskId, setSharingTaskId] = useState<string | null>(null);
  const [respondingShareId, setRespondingShareId] = useState<string | null>(null);
  const [taskShareNotice, setTaskShareNotice] = useState<string | null>(null);
  const [reconnectingGoogle, setReconnectingGoogle] = useState(false);
  const [habitTimeDrafts, setHabitTimeDrafts] = useState<Record<string, string>>({});
  const [habitDurationDrafts, setHabitDurationDrafts] = useState<Record<string, number>>({});
  const [dismissedHabitsByDay, setDismissedHabitsByDay] = useState<Record<string, string[]>>({});
  const [quickNoteText, setQuickNoteText] = useState("");
  const [quickNoteSavedAt, setQuickNoteSavedAt] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("calendar.dismissedHabitsByDay.v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      if (parsed && typeof parsed === "object") {
        setDismissedHabitsByDay(parsed);
      }
    } catch (_error) {
      // ignore malformed local cache
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("calendar.view.mode.v1");
      if (raw === "timeGridDay" || raw === "timeGridWeek") {
        setCalendarView(raw);
      }
    } catch (_error) {
      // ignore storage failures
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "calendar.dismissedHabitsByDay.v1",
        JSON.stringify(dismissedHabitsByDay)
      );
    } catch (_error) {
      // ignore storage failures
    }
  }, [dismissedHabitsByDay]);

  useEffect(() => {
    try {
      window.localStorage.setItem("calendar.view.mode.v1", calendarView);
    } catch (_error) {
      // ignore storage failures
    }
  }, [calendarView]);

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
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.changeView(calendarView);
    api.gotoDate(selectedDate);
  }, [calendarView, selectedDate]);

  useEffect(() => {
    setHabitTimeDrafts({});
    setHabitDurationDrafts({});
  }, [selectedDayIso]);

  useEffect(() => {
    setQuickNoteSavedAt(null);
  }, [selectedDayIso]);

  const tasksQuery = useQuery({
    queryKey: ["tasks", range.start, range.end],
    queryFn: () =>
      fetchJson<TaskListResponse>(
        `/api/tasks?start=${range.start}&end=${range.end}&include_unscheduled=1`
      ),
  });

  const dayQuery = useQuery({
    queryKey: ["day", selectedDayIso],
    queryFn: () => fetchJson<DayResponse>(`/api/day/${selectedDayIso}`),
  });
  const estimationHintQuery = useQuery({
    queryKey: ["stats-estimation", "calendar-hint"],
    queryFn: () => fetchJson<EstimationResponse>("/api/stats/estimation?period=all"),
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
  const taskSharesQuery = useQuery({
    queryKey: ["task-shares"],
    queryFn: () => fetchJson<TaskSharesResponse>("/api/task-shares"),
    staleTime: 10_000,
  });
  const quickNoteQuery = useQuery({
    queryKey: ["quick-note", selectedDayIso],
    queryFn: () =>
      fetchJson<QuickNoteResponse>(`/api/settings/quick-notes/${selectedDayIso}`),
  });

  const tasks = useMemo(
    () => tasksQuery.data?.items || [],
    [tasksQuery.data?.items]
  );
  const syncWarning = tasksQuery.data?.warning;
  const reconnectRequired = useMemo(
    () =>
      reconnectingGoogle ||
      isGoogleReconnectErrorText(syncWarning) ||
      isGoogleReconnectErrorText(taskSaveError),
    [reconnectingGoogle, syncWarning, taskSaveError]
  );

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
  const pendingTaskShares = useMemo(
    () => taskSharesQuery.data?.items || [],
    [taskSharesQuery.data?.items]
  );
  const sentTaskShares = useMemo(
    () => taskSharesQuery.data?.sent || [],
    [taskSharesQuery.data?.sent]
  );
  useEffect(() => {
    if (quickNoteQuery.isPending) return;
    if (quickNoteQuery.isError) return;
    setQuickNoteText(quickNoteQuery.data?.text || "");
  }, [quickNoteQuery.data?.text, quickNoteQuery.isError, quickNoteQuery.isPending, selectedDayIso]);
  const activeSentShareByTaskId = useMemo(() => {
    const map = new Map<
      string,
      { inviteId: string; status: TaskShareInvite["status"]; toEmail: string }
    >();
    sentTaskShares.forEach((invite) => {
      if (invite.status !== "pending" && invite.status !== "accepted") return;
      const current = map.get(invite.sourceTaskId);
      if (!current) {
        map.set(invite.sourceTaskId, {
          inviteId: invite.id,
          status: invite.status,
          toEmail: invite.toEmail,
        });
        return;
      }
      if (current.status === "pending" && invite.status === "accepted") {
        map.set(invite.sourceTaskId, {
          inviteId: invite.id,
          status: invite.status,
          toEmail: invite.toEmail,
        });
      }
    });
    return map;
  }, [sentTaskShares]);

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
  const visibleDailyHabits = useMemo(
    () =>
      dailyHabits.filter((habit) => {
        if (habit.done) return false;
        if (habit.inAgenda) return false;
        const dismissedForDay = dismissedHabitsByDay[selectedDayIso] || [];
        return !dismissedForDay.includes(habit.id);
      }),
    [dailyHabits, dismissedHabitsByDay, selectedDayIso]
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
                scheduledDate:
                  "scheduled_date" in patch
                    ? patch.scheduled_date || null
                    : item.scheduledDate,
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
      const sentShare = activeSentShareByTaskId.get(task.id);
      const isSharedReceived =
        task.source === "shared" || task.source === "google_shared";
      const isSharedPending = sentShare?.status === "pending";
      const isSharedAccepted = sentShare?.status === "accepted";
      const start = `${task.scheduledDate}T${task.scheduledTime}:00`;
      const startDate = new Date(start);
      const endDate = new Date(
        startDate.getTime() + (task.estimatedMinutes || 30) * 60000
      );
      const end = format(endDate, "yyyy-MM-dd'T'HH:mm:ss");
      let backgroundColor = task.isDone
        ? "rgba(127, 211, 165, 0.76)"
        : "rgba(143, 123, 179, 0.64)";
      let borderColor = task.isDone
        ? "rgba(127, 211, 165, 0.95)"
        : "rgba(143, 123, 179, 0.95)";
      let textColor = task.isDone ? "#102418" : "#F5F1EA";
      if (isSharedReceived) {
        backgroundColor = "rgba(76, 153, 226, 0.72)";
        borderColor = "rgba(76, 153, 226, 0.95)";
        textColor = "#f7fbff";
      } else if (isSharedPending) {
        backgroundColor = "rgba(231, 178, 76, 0.72)";
        borderColor = "rgba(231, 178, 76, 0.95)";
        textColor = "#1f1606";
      } else if (isSharedAccepted) {
        backgroundColor = "rgba(76, 153, 226, 0.66)";
        borderColor = "rgba(76, 153, 226, 0.9)";
        textColor = "#f7fbff";
      }
      return {
        id: task.id,
        title: task.title,
        start,
        end,
        classNames: [
          task.isDone ? "task-done" : "task-pending",
          isSharedReceived ? "task-shared-received" : "",
          isSharedPending ? "task-shared-pending" : "",
          isSharedAccepted ? "task-shared-accepted" : "",
        ].filter(Boolean),
        backgroundColor,
        borderColor,
        textColor,
      };
    });

  const createTask = useMutation({
    mutationFn: () =>
      fetchJson<{ task: TodoTask }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          scheduled_date: newDate,
          scheduled_time: newTime || null,
          estimated_minutes: newEst,
          sync_google: true,
        }),
      }),
    onSuccess: (payload) => {
      setTaskSaveError(null);
      setNewTitle("");
      setCalendarSelection(null);
      if (shareOnCreate && payload?.task?.id) {
        shareTaskWithPartner.mutate(payload.task.id);
      }
      setShareOnCreate(false);
      setComposerAdvancedOpen(false);
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

  const saveQuickNote = useMutation({
    mutationFn: (text: string) =>
      fetchJson<{ ok: boolean }>(`/api/settings/quick-notes/${selectedDayIso}`, {
        method: "PUT",
        body: JSON.stringify({ text }),
      }),
    onMutate: async (text) => {
      setTaskSaveError(null);
      await queryClient.cancelQueries({ queryKey: ["quick-note", selectedDayIso] });
      const previous = queryClient.getQueryData<QuickNoteResponse>([
        "quick-note",
        selectedDayIso,
      ]);
      queryClient.setQueryData(["quick-note", selectedDayIso], { text });
      return { previous };
    },
    onError: (error, _text, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ["quick-note", selectedDayIso],
          context.previous
        );
      }
      setTaskSaveError(readErrorMessage(error, "Could not save notes."));
      setQuickNoteSavedAt(null);
    },
    onSuccess: () => {
      setQuickNoteSavedAt(Date.now());
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["quick-note", selectedDayIso] });
    },
  });
  const saveQuickNoteMutation = saveQuickNote.mutate;

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

  const updateEstimationRow = useMutation({
    mutationFn: ({
      taskId,
      estimatedMinutes,
      actualMinutes,
    }: {
      taskId: string;
      estimatedMinutes: number;
      actualMinutes: number;
    }) =>
      fetchJson(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({
          estimated_minutes: Math.max(0, estimatedMinutes),
          actual_minutes: Math.max(0, actualMinutes),
          sync_google: false,
        }),
      }),
    onSuccess: () => {
      setTaskSaveError(null);
      queryClient.invalidateQueries({ queryKey: ["stats-estimation", "calendar-hint"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error) => {
      setTaskSaveError(
        readErrorMessage(error, "Could not update estimation values for this task.")
      );
    },
  });

  const shareTaskWithPartner = useMutation({
    mutationFn: (taskId: string) =>
      fetchJson<{ invite: TaskShareInvite }>("/api/task-shares", {
        method: "POST",
        body: JSON.stringify({ task_id: taskId }),
      }),
    onSuccess: (payload) => {
      setTaskSaveError(null);
      setTaskShareNotice(
        `Task shared with ${emailHandle(payload.invite.toEmail)}. Waiting for acceptance.`
      );
      queryClient.invalidateQueries({ queryKey: ["task-shares"] });
    },
    onError: (error) => {
      setTaskShareNotice(null);
      setTaskSaveError(readErrorMessage(error, "Could not share this task."));
    },
  });

  const revokeTaskShare = useMutation({
    mutationFn: (inviteId: string) =>
      fetchJson<{ invite: TaskShareInvite }>(`/api/task-shares/${inviteId}/revoke`, {
        method: "POST",
      }),
    onSuccess: () => {
      setTaskSaveError(null);
      setTaskShareNotice("Share removed.");
      queryClient.invalidateQueries({ queryKey: ["task-shares"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error) => {
      setTaskShareNotice(null);
      setTaskSaveError(readErrorMessage(error, "Could not undo task share."));
    },
  });

  const acceptTaskShare = useMutation({
    mutationFn: (inviteId: string) =>
      fetchJson<{ invite: TaskShareInvite }>(`/api/task-shares/${inviteId}/accept`, {
        method: "POST",
      }),
    onSuccess: () => {
      setTaskSaveError(null);
      setTaskShareNotice("Shared task accepted and added to your calendar.");
      queryClient.invalidateQueries({ queryKey: ["task-shares"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
      queryClient.invalidateQueries({ queryKey: ["init"] });
    },
    onError: (error) => {
      setTaskShareNotice(null);
      setTaskSaveError(readErrorMessage(error, "Could not accept shared task."));
    },
  });

  const declineTaskShare = useMutation({
    mutationFn: (inviteId: string) =>
      fetchJson<{ invite: TaskShareInvite }>(`/api/task-shares/${inviteId}/decline`, {
        method: "POST",
      }),
    onSuccess: () => {
      setTaskSaveError(null);
      setTaskShareNotice("Shared task invite declined.");
      queryClient.invalidateQueries({ queryKey: ["task-shares"] });
    },
    onError: (error) => {
      setTaskShareNotice(null);
      setTaskSaveError(readErrorMessage(error, "Could not decline shared task."));
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

  const triggerGoogleReconnect = useCallback(() => {
    if (typeof window === "undefined") return;
    setReconnectingGoogle(true);
    try {
      const callbackUrl = window.location.href;
      const reconnectUrl = `/signin?reconnect=google&callbackUrl=${encodeURIComponent(
        callbackUrl
      )}`;
      window.location.assign(reconnectUrl);
    } catch (_error) {
      setReconnectingGoogle(false);
      setTaskSaveError("Could not start Google reconnection. Please try again.");
    }
  }, []);

  const syncNow = async () => {
    setSyncStatus("syncing");
    try {
      await fetchJson("/api/calendar/sync", {
        method: "POST",
        body: JSON.stringify(range),
      });
      setSyncStatus("idle");
      setReconnectingGoogle(false);
      setTaskSaveError(null);
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    } catch (error) {
      setSyncStatus("failed");
      const rawMessage = error instanceof Error ? error.message : "";
      if (isGoogleReconnectErrorText(rawMessage)) {
        setTaskSaveError("Google authorization expired. Redirecting for reconnection...");
        triggerGoogleReconnect();
        return;
      }
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
    setComposerAdvancedOpen(true);
    setCalendarSelection({
      date: nextDate,
      time: nextTime,
      estimatedMinutes,
    });
  };

  const clearCalendarSelection = useCallback(() => {
    setCalendarSelection(null);
    setComposerAdvancedOpen(false);
  }, []);

  const composerSelectionLabel = useMemo(() => {
    if (!calendarSelection) return null;
    return `${calendarSelection.date}${calendarSelection.time ? ` • ${calendarSelection.time}` : ""} • ${calendarSelection.estimatedMinutes} min`;
  }, [calendarSelection]);

  const resetTaskDraft = useCallback(
    (taskId: string) => {
      clearTaskDraft(taskId);
      setSavedTaskId((current) => (current === taskId ? null : current));
    },
    [clearTaskDraft]
  );

  const confirmTaskUpdate = useCallback(
    (task: TodoTask) => {
      const patch = buildTaskPatch(task, taskDrafts[task.id]);
      if (!Object.keys(patch).length) {
        clearTaskDraft(task.id);
        return;
      }
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
    },
    [buildTaskPatch, clearTaskDraft, taskDrafts, updateTask]
  );

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

  const handleShareTask = useCallback(
    (taskId: string) => {
      const activeShare = activeSentShareByTaskId.get(taskId);
      setSharingTaskId(taskId);
      if (activeShare) {
        revokeTaskShare.mutate(activeShare.inviteId, {
          onSettled: () => {
            setSharingTaskId(null);
          },
        });
        return;
      }
      shareTaskWithPartner.mutate(taskId, {
        onSettled: () => {
          setSharingTaskId(null);
        },
      });
    },
    [activeSentShareByTaskId, revokeTaskShare, shareTaskWithPartner]
  );

  const handleAcceptShare = useCallback(
    (inviteId: string) => {
      setRespondingShareId(inviteId);
      acceptTaskShare.mutate(inviteId, {
        onSettled: () => {
          setRespondingShareId(null);
        },
      });
    },
    [acceptTaskShare]
  );

  const handleDeclineShare = useCallback(
    (inviteId: string) => {
      setRespondingShareId(inviteId);
      declineTaskShare.mutate(inviteId, {
        onSettled: () => {
          setRespondingShareId(null);
        },
      });
    },
    [declineTaskShare]
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

  useEffect(() => {
    if (quickNoteQuery.isPending || quickNoteQuery.isError) return;
    const serverText = quickNoteQuery.data?.text || "";
    if (quickNoteText === serverText) return;
    const timeoutId = window.setTimeout(() => {
      saveQuickNoteMutation(quickNoteText);
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [
    quickNoteText,
    quickNoteQuery.data?.text,
    quickNoteQuery.isError,
    quickNoteQuery.isPending,
    saveQuickNoteMutation,
  ]);

  const handleSaveQuickNoteNow = useCallback(() => {
    saveQuickNoteMutation(quickNoteText);
  }, [quickNoteText, saveQuickNoteMutation]);

  const handleComposerSubmit = useCallback(() => {
    if (!newTitle.trim() || createTask.isPending) return;
    createTask.mutate();
  }, [createTask, newTitle]);

  const handleComposerCancel = useCallback(() => {
    setComposerAdvancedOpen(false);
    setCalendarSelection(null);
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
      setDismissedHabitsByDay((prev) => {
        const current = prev[selectedDayIso] || [];
        if (!current.includes(habit.id)) return prev;
        const nextDay = current.filter((id) => id !== habit.id);
        return { ...prev, [selectedDayIso]: nextDay };
      });
      createHabitTask.mutate({
        title: habit.label,
        scheduledTime,
        estimatedMinutes,
      });
    },
    [createHabitTask, habitDurationDrafts, habitTimeDrafts, selectedDayIso]
  );

  const handleRemoveHabitFromAgenda = useCallback(
    (habit: DailyHabitItem) => {
      if (habit.taskIds.length) {
        removeHabitTasks.mutate(habit.taskIds);
        return;
      }
      setDismissedHabitsByDay((prev) => {
        const current = prev[selectedDayIso] || [];
        if (current.includes(habit.id)) return prev;
        return { ...prev, [selectedDayIso]: [...current, habit.id] };
      });
    },
    [removeHabitTasks, selectedDayIso]
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
    const ratio = Number(summary.averageRatio || 1);
    const sampleCount = Number(summary.totalSamples || 0);
    const projected30 = Math.max(5, Math.round(30 * ratio));
    if (summary.tendency === "overestimate") {
      return `Estimativa (historico completo, ${sampleCount} tarefas feitas): voce costuma superestimar. Tarefa de 30 min tende a levar ~${projected30} min.`;
    }
    if (summary.tendency === "underestimate") {
      return `Estimativa (historico completo, ${sampleCount} tarefas feitas): voce costuma subestimar. Tarefa de 30 min tende a levar ~${projected30} min.`;
    }
    return `Estimativa (historico completo, ${sampleCount} tarefas feitas): seu tempo real esta proximo do planejado.`;
  }, [estimationHintQuery.data]);

  const estimationPoints = useMemo(
    () => estimationHintQuery.data?.points || [],
    [estimationHintQuery.data?.points]
  );

  const readEstimationDraft = useCallback(
    (taskId: string, estimatedMinutes: number, actualMinutes: number) => {
      const current = estimationDrafts[taskId];
      return {
        estimatedMinutes:
          current?.estimatedMinutes ?? Math.max(0, Number(estimatedMinutes || 0)),
        actualMinutes: current?.actualMinutes ?? Math.max(0, Number(actualMinutes || 0)),
      };
    },
    [estimationDrafts]
  );

  const setEstimationDraft = useCallback(
    (
      taskId: string,
      patch: Partial<{ estimatedMinutes: number; actualMinutes: number }>
    ) => {
      setEstimationDrafts((prev) => ({
        ...prev,
        [taskId]: {
          estimatedMinutes:
            patch.estimatedMinutes ?? prev[taskId]?.estimatedMinutes ?? 0,
          actualMinutes: patch.actualMinutes ?? prev[taskId]?.actualMinutes ?? 0,
        },
      }));
    },
    []
  );

  const saveEstimationDraft = useCallback(
    (taskId: string, fallbackEstimated: number, fallbackActual: number) => {
      const draft = readEstimationDraft(taskId, fallbackEstimated, fallbackActual);
      const estimated = Math.max(0, Number(draft.estimatedMinutes || 0));
      const actual = Math.max(0, Number(draft.actualMinutes || 0));
      if (estimated <= 0) {
        setTaskSaveError("Estimated minutes must be greater than zero.");
        return;
      }
      setSavingEstimationTaskId(taskId);
      updateEstimationRow.mutate(
        { taskId, estimatedMinutes: estimated, actualMinutes: actual },
        {
          onSuccess: () => {
            setSavingEstimationTaskId(null);
            setEstimationDrafts((prev) => {
              if (!prev[taskId]) return prev;
              const next = { ...prev };
              delete next[taskId];
              return next;
            });
          },
          onError: () => {
            setSavingEstimationTaskId(null);
          },
        }
      );
    },
    [readEstimationDraft, updateEstimationRow]
  );

  const getTaskSharePresentation = useCallback(
    (task: TodoTask) => {
      if (task.source === "shared" || task.source === "google_shared") {
        return {
          label:
            task.source === "google_shared"
              ? "Shared from Google"
              : "Shared with you",
          canToggle: false,
          actionLabel: "Share",
        };
      }
      const sentShare = activeSentShareByTaskId.get(task.id);
      if (sentShare?.status === "pending") {
        return {
          label: `Shared with ${emailHandle(sentShare.toEmail)} • pending`,
          canToggle: true,
          actionLabel: "Unshare",
        };
      }
      if (sentShare?.status === "accepted") {
        return {
          label: `Shared with ${emailHandle(sentShare.toEmail)} • accepted`,
          canToggle: true,
          actionLabel: "Unshare",
        };
      }
      return {
        label: null,
        canToggle: true,
        actionLabel: "Share with partner",
      };
    },
    [activeSentShareByTaskId]
  );

  return (
    <div className="calendar-layout">
      <div className="task-list">
        <div className="task-header calm">
          <div>
            <p className="panel-kicker">Today&apos;s agenda</p>
            <h2>Keep the day moving with one clear list.</h2>
            <p className="task-header-meta">
              {completedTasks.length}/{tasksForDay.length} tasks finished
            </p>
          </div>
          <div className="task-header-actions">
            {syncStatus !== "idle" ? (
              <span className={`sync-status ${syncStatus}`}>
                {syncStatus === "syncing" ? "Syncing…" : "Sync failed"}
              </span>
            ) : null}
            <button className="secondary subtle" type="button" onClick={syncNow}>
              Sync calendar
            </button>
          </div>
        </div>

        <TaskComposer
          title={newTitle}
          date={newDate}
          time={newTime}
          estimate={newEst}
          shareWithPartner={shareOnCreate}
          advancedOpen={composerAdvancedOpen}
          selectionLabel={composerSelectionLabel}
          disabled={createTask.isPending}
          submitLabel={createTask.isPending ? "Adding..." : calendarSelection ? "Add selected slot" : "Add task"}
          onSubmit={handleComposerSubmit}
          onTitleChange={setNewTitle}
          onDateChange={setNewDate}
          onTimeChange={setNewTime}
          onEstimateChange={setNewEst}
          onShareChange={setShareOnCreate}
          onToggleAdvanced={() => setComposerAdvancedOpen((current) => !current)}
          onClearSelection={clearCalendarSelection}
          onCancel={handleComposerCancel}
        />

        <div className="calendar-status-rail">
          {tasksQuery.isPending ? (
            <div className="query-status quiet">Loading tasks…</div>
          ) : null}
          {tasksQuery.isError ? (
            <InlineActionNotice
              tone="error"
              title="Could not load tasks"
              body="The calendar is still here, but the agenda needs a refresh."
              actionLabel="Retry"
              onAction={() => {
                void tasksQuery.refetch();
              }}
            />
          ) : null}
          {syncWarning && !reconnectRequired ? (
            <InlineActionNotice tone="warning" body={syncWarning} />
          ) : null}
          {reconnectRequired ? (
            <InlineActionNotice
              tone="warning"
              title="Google Calendar needs reconnection"
              body="Your local list still works, but syncing needs a quick reconnect."
              actionLabel={reconnectingGoogle ? "Redirecting..." : "Reconnect Google"}
              onAction={triggerGoogleReconnect}
            />
          ) : null}
          {taskSaveError ? <InlineActionNotice tone="warning" body={taskSaveError} /> : null}
          {taskShareNotice ? <InlineActionNotice tone="success" body={taskShareNotice} /> : null}
        </div>

        <CompletionPopover
          open={Boolean(completionPrompt)}
          title={completionPrompt?.title || "task"}
          estimatedMinutes={completionPrompt?.estimatedMinutes || 0}
          actualMinutes={completionMinutes}
          onActualMinutesChange={setCompletionMinutes}
          onConfirm={confirmCompletionMinutes}
          onSkip={skipCompletionMinutes}
          onClose={() => setCompletionPrompt(null)}
        />

        <section className="calendar-primary-section">
          <div className="calendar-section-head">
            <div>
              <p className="panel-kicker">Agenda</p>
              <h3>What still needs attention today</h3>
            </div>
            <span className="calendar-section-count">{pendingTasks.length} pending</span>
          </div>
          {pendingTasks.length ? (
            <div className="task-items">
              {pendingTasks.map((task) => {
                const draft = readTaskDraft(task);
                const shareUi = getTaskSharePresentation(task);
                return (
                  <EditableTaskRow
                    key={task.id}
                    task={task}
                    draft={draft}
                    saving={savingTaskId === task.id}
                    saved={savedTaskId === task.id}
                    onToggleDone={requestToggleTaskDone}
                    onSave={confirmTaskUpdate}
                    onSetDraft={setTaskDraft}
                    onReset={resetTaskDraft}
                    onDelete={handleDeleteTask}
                    onShare={shareUi.canToggle ? handleShareTask : undefined}
                    sharing={sharingTaskId === task.id}
                    shareLabel={shareUi.label}
                    shareActionLabel={shareUi.actionLabel}
                  />
                );
              })}
            </div>
          ) : (
            <div className="line-empty">No pending tasks here right now. Let the schedule stay quiet unless you need a new next step.</div>
          )}
        </section>

        <section className="calendar-primary-section">
          <div className="calendar-section-head">
            <div>
              <p className="panel-kicker">Remembered tasks</p>
              <h3>Loose tasks waiting to be anchored</h3>
            </div>
            <span className="calendar-section-count">{unscheduledTasks.length}</span>
          </div>
          {unscheduledTasks.length ? (
            <div className="task-items">
              {unscheduledTasks.map((task) => {
                const shareUi = getTaskSharePresentation(task);
                return (
                  <SimpleTaskRow
                    key={task.id}
                    task={task}
                    draft={readTaskDraft(task)}
                    onToggleDone={requestToggleTaskDone}
                    onScheduleToday={handleScheduleToday}
                    onShare={shareUi.canToggle ? handleShareTask : undefined}
                    sharing={sharingTaskId === task.id}
                    shareLabel={shareUi.label}
                    shareActionLabel={shareUi.actionLabel}
                  />
                );
              })}
            </div>
          ) : (
            <div className="line-empty">No remembered tasks waiting outside the schedule.</div>
          )}
        </section>

        <section className="calendar-primary-section">
          <div className="calendar-section-head">
            <div>
              <p className="panel-kicker">Completed</p>
              <h3>Proof of progress for this day</h3>
            </div>
            <span className="calendar-section-count">{completedTasks.length + completedHabits.length}</span>
          </div>
          <div className="calendar-completed">
            {completedTasks.length === 0 && completedHabits.length === 0 ? (
              <div className="line-empty">Nothing completed yet. As the day moves, this becomes the quiet record of what is already done.</div>
            ) : null}
            {completedTasks.map((task) => {
              const shareUi = getTaskSharePresentation(task);
              return (
                <CompletedTaskRow
                  key={`done-task-${task.id}`}
                  task={task}
                  draft={readTaskDraft(task)}
                  saving={savingTaskId === task.id}
                  onToggleDone={requestToggleTaskDone}
                  onSetDraft={setTaskDraft}
                  onSave={confirmTaskUpdate}
                  onReset={resetTaskDraft}
                  onShare={shareUi.canToggle ? handleShareTask : undefined}
                  sharing={sharingTaskId === task.id}
                  shareLabel={shareUi.label}
                  shareActionLabel={shareUi.actionLabel}
                />
              );
            })}
            {completedHabits.map((habit) => (
              <div key={`done-habit-${habit.id}`} className="calendar-completed-item">
                <span className="calendar-completed-mark">✓</span>
                <span className="calendar-completed-title">{habit.label}</span>
                <span className="calendar-completed-badge">habit</span>
              </div>
            ))}
          </div>
        </section>

        <section className="quick-note-block">
          <div className="quick-note-head">
            <div>
              <p className="panel-kicker">Notes</p>
              <h3>Keep the loose thoughts nearby</h3>
            </div>
            <div className="quick-note-actions">
              <span className="quick-note-status">
                {quickNoteQuery.isPending
                  ? "Loading…"
                  : saveQuickNote.isPending
                    ? "Saving…"
                    : quickNoteSavedAt
                      ? "Saved"
                      : "Autosave"}
              </span>
              <button
                type="button"
                className="page-link inline muted"
                onClick={handleSaveQuickNoteNow}
                disabled={saveQuickNote.isPending || quickNoteQuery.isPending}
              >
                Save now
              </button>
            </div>
          </div>
          {quickNoteQuery.isError ? (
            <InlineActionNotice
              tone="error"
              body="Could not load notes."
              actionLabel="Retry"
              onAction={() => {
                void quickNoteQuery.refetch();
              }}
            />
          ) : null}
          <textarea
            className="quick-note-textarea"
            value={quickNoteText}
            onChange={(event) => setQuickNoteText(event.target.value.slice(0, 20000))}
            placeholder="Write freely here..."
            disabled={quickNoteQuery.isPending}
          />
        </section>

        <details className="calendar-secondary-panel" open={pendingTaskShares.length > 0}>
          <summary>
            <span className="calendar-secondary-title">Shared tasks waiting for a reply</span>
            <span className="calendar-secondary-meta">{pendingTaskShares.length}</span>
          </summary>
          <div className="calendar-secondary-body">
            {taskSharesQuery.isPending ? (
              <div className="query-status quiet">Loading shared invites…</div>
            ) : null}
            {taskSharesQuery.isError ? (
              <InlineActionNotice
                tone="error"
                body="Could not load shared invites."
                actionLabel="Retry"
                onAction={() => {
                  void taskSharesQuery.refetch();
                }}
              />
            ) : null}
            {!taskSharesQuery.isPending && !taskSharesQuery.isError ? (
              pendingTaskShares.length === 0 ? (
                <div className="line-empty">No shared tasks waiting for your answer.</div>
              ) : (
                pendingTaskShares.map((invite) => (
                  <div key={`share-invite-${invite.id}`} className="share-invite-row">
                    <div className="share-invite-meta">
                      <strong>{invite.title}</strong>
                      <span>
                        From {emailHandle(invite.fromEmail)}
                        {invite.scheduledDate
                          ? ` • ${invite.scheduledDate} ${invite.scheduledTime || ""}`.trim()
                          : ""}
                      </span>
                    </div>
                    <div className="share-invite-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={respondingShareId === invite.id}
                        onClick={() => handleAcceptShare(invite.id)}
                      >
                        {respondingShareId === invite.id ? "Working..." : "Accept"}
                      </button>
                      <button
                        type="button"
                        className="page-link inline muted"
                        disabled={respondingShareId === invite.id}
                        onClick={() => handleDeclineShare(invite.id)}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              )
            ) : null}
          </div>
        </details>

        <details className="calendar-secondary-panel">
          <summary>
            <span className="calendar-secondary-title">Daily habits to add</span>
            <span className="calendar-secondary-meta">{visibleDailyHabits.length}</span>
          </summary>
          <div className="calendar-secondary-body">
            {habitsLoading ? (
              <div className="query-status quiet">Loading habits for this day…</div>
            ) : null}
            {habitsError ? (
              <InlineActionNotice
                tone="error"
                body="Could not load daily habits."
                actionLabel="Retry"
                onAction={() => {
                  void dayQuery.refetch();
                  void customHabitsQuery.refetch();
                  void customDoneQuery.refetch();
                  void meetingDaysQuery.refetch();
                  void familyDayQuery.refetch();
                }}
              />
            ) : null}
            {!habitsLoading && !habitsError
              ? visibleDailyHabits.length === 0
                ? <div className="line-empty">All habits are already done, in the agenda, or hidden for today.</div>
                : visibleDailyHabits.map((habit) => (
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
        </details>

        <details className="calendar-secondary-panel">
          <summary>
            <span className="calendar-secondary-title">Estimation editor</span>
            <span className="calendar-secondary-meta">{estimationPoints.length} rows</span>
          </summary>
          <div className="calendar-secondary-body">
            {estimationHint ? <p className="task-estimation-hint">{estimationHint}</p> : null}
            {estimationHintQuery.isPending ? (
              <div className="query-status quiet">Loading estimation rows…</div>
            ) : null}
            {estimationHintQuery.isError ? (
              <InlineActionNotice
                tone="error"
                body="Could not load estimation rows."
                actionLabel="Retry"
                onAction={() => {
                  void estimationHintQuery.refetch();
                }}
              />
            ) : null}
            {!estimationHintQuery.isPending && !estimationHintQuery.isError ? (
              estimationPoints.length === 0 ? (
                <div className="line-empty">No completed tasks with time data yet.</div>
              ) : (
                <div className="estimation-editor-table">
                  <div className="estimation-editor-row estimation-editor-head">
                    <span>Task</span>
                    <span>Date</span>
                    <span>Estimated</span>
                    <span>Actual</span>
                    <span />
                  </div>
                  {estimationPoints.map((point) => {
                    const draft = readEstimationDraft(
                      point.taskId,
                      point.estimatedMinutes,
                      point.actualMinutes
                    );
                    const dirty =
                      draft.estimatedMinutes !== point.estimatedMinutes ||
                      draft.actualMinutes !== point.actualMinutes;
                    return (
                      <div className="estimation-editor-row" key={`estimation-row-${point.taskId}`}>
                        <span className="estimation-task-title">{point.title}</span>
                        <span>{point.scheduledDate || "--"}</span>
                        <input
                          type="number"
                          min={1}
                          step={5}
                          value={draft.estimatedMinutes}
                          onChange={(event) =>
                            setEstimationDraft(point.taskId, {
                              estimatedMinutes: Math.max(0, Number(event.target.value || 0)),
                            })
                          }
                          aria-label={`Estimated minutes for ${point.title}`}
                        />
                        <input
                          type="number"
                          min={0}
                          step={5}
                          value={draft.actualMinutes}
                          onChange={(event) =>
                            setEstimationDraft(point.taskId, {
                              actualMinutes: Math.max(0, Number(event.target.value || 0)),
                            })
                          }
                          aria-label={`Actual minutes for ${point.title}`}
                        />
                        <button
                          type="button"
                          className={`task-confirm-btn ${dirty ? "visible" : ""}`}
                          disabled={!dirty || savingEstimationTaskId === point.taskId}
                          onClick={() =>
                            saveEstimationDraft(
                              point.taskId,
                              point.estimatedMinutes,
                              point.actualMinutes
                            )
                          }
                        >
                          {savingEstimationTaskId === point.taskId ? "..." : "save"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            ) : null}
          </div>
        </details>
      </div>

      <div className="calendar-panel">
        <div className="calendar-header">
          <button
            type="button"
            onClick={() =>
              setSelectedDate(
                addDays(selectedDate, calendarView === "timeGridWeek" ? -7 : -1)
              )
            }
          >
            Prev
          </button>
          <div className="calendar-header-date">
            <CalendarClock size={16} />
            {format(selectedDate, "MMMM dd, yyyy")}
          </div>
          <button
            type="button"
            onClick={() =>
              setSelectedDate(
                addDays(selectedDate, calendarView === "timeGridWeek" ? 7 : 1)
              )
            }
          >
            Next
          </button>
          <div className="calendar-view-toggle">
            <button
              className={calendarView === "timeGridDay" ? "chip active" : "chip"}
              onClick={() => setCalendarView("timeGridDay")}
              type="button"
            >
              Day
            </button>
            <button
              className={calendarView === "timeGridWeek" ? "chip active" : "chip"}
              onClick={() => setCalendarView("timeGridWeek")}
              type="button"
            >
              Week
            </button>
          </div>
        </div>
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView={calendarView}
          height={560}
          contentHeight={500}
          expandRows={false}
          headerToolbar={false}
          allDaySlot={false}
          nowIndicator
          scrollTime={scrollTime}
          scrollTimeReset={false}
          slotMinTime="05:00:00"
          slotMaxTime="24:00:00"
          slotDuration="00:30:00"
          selectable
          selectMirror
          events={events}
          editable
          dateClick={(info) => {
            setSelectedDate(info.date);
            applyCalendarSelection(info.date, null);
          }}
          select={(info) => {
            setSelectedDate(info.start);
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
      </div>
    </div>
  );
}
