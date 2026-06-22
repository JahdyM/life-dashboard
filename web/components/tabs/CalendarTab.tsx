"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarX,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Lock,
  LockOpen,
  Pause,
  Play,
  RotateCcw,
  Share2,
  SquarePen,
  Trash2,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import InlineActionNotice from "@/components/common/InlineActionNotice";
import OverflowMenu from "@/components/common/OverflowMenu";
import TaskComposer from "@/components/calendar/TaskComposer";
import TaskDetailSheet from "@/components/calendar/TaskDetailSheet";
import {
  buildScheduleTodayPayload,
  buildScheduleTomorrowPayload,
  buildUnschedulePayload,
} from "@/components/tabs/calendar/CalendarActions";
import {
  formatAutoPlanNotice,
  formatMoveBlockedByLockNotice,
  formatMoveNotice,
} from "@/components/tabs/calendar/CalendarFeedback";
import {
  buildAutoPlanUpdates,
  buildBalancedOrderWithLockedAnchors,
  normalizeAreaTagForPlanning,
  priorityRank,
  taskPriorityWeight,
  type AutoPlanMode,
  type PlanningTaskCandidate,
} from "@/components/tabs/calendar/PlanningEngine";
import {
  buildMoveToBacklogPatch,
  buildMoveToDayPatch,
} from "@/components/tabs/calendar/TaskBoardDnD";
import { fetchJson } from "@/lib/client/api";
import { EFFORT_LABELS, type EffortLevel, type EnergySettings } from "@/lib/energy";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { format, addDays, endOfWeek, startOfWeek, subDays } from "date-fns";
import { FIXED_SHARED_HABITS } from "@/lib/constants";
import {
  getHabitDisplayLabel,
  isHabitEntryDone,
  isHabitScheduledForWeekday,
  isMergedBibleHabitName,
} from "@/lib/config/habits";
import {
  DEFAULT_TASK_AREAS,
  getTaskAreaMeta,
  type TaskAreaTag,
} from "@/lib/taskAreas";
import type { DashboardOnboardingPreferences } from "@/lib/config/dashboard";
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
  areaTag?: string;
  scheduleLocked?: boolean;
  scheduledDate?: string;
  scheduledTime?: string;
  plannedTime?: string;
  startTime?: string;
  endTime?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
  notes?: string;
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
type OnboardingResponse = { preferences: DashboardOnboardingPreferences };
type TaskSharesResponse = { items: TaskShareInvite[]; sent?: TaskShareInvite[] };
type QuickNoteResponse = { text: string };
type EnergyResponse = EnergySettings;
type TaskAreasResponse = { items: TaskAreaTag[] };

type DailyHabitItem = {
  id: string;
  label: string;
  kind: "fixed" | "custom";
  key: string;
  done: boolean;
  inAgenda: boolean;
  taskIds: string[];
};

type TodoSubtaskItem = NonNullable<TodoTask["subtasks"]>[number];

type CreateTaskInput = {
  title: string;
  scheduledDate: string;
  scheduledTime: string | null;
  priorityTag: string;
  areaTag: string;
  scheduleLocked: boolean;
  estimatedMinutes: number;
  shareWithPartner: boolean;
};

type FocusOrderUpdate = {
  id: string;
  focusOrder: number | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  plannedTime?: string | null;
  scheduleLocked?: boolean | null;
};

type CalendarViewMode = "timeGridDay" | "timeGridWeek";

type WheelSegment = {
  task: TodoTask;
  weight: number;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  span: number;
  color: string;
};

const ALL_TAG_FILTER = "__all__";
const NO_TAG_FILTER = "__none__";

const WHEEL_SLICE_COLORS = [
  "#81623a",
  "#54677a",
  "#77558a",
  "#4f745e",
  "#9a6a56",
  "#5e6f90",
  "#8a5d73",
  "#627854",
];
const WHEEL_CENTER = 130;
const WHEEL_RADIUS = 118;
const WHEEL_LABEL_RADIUS = 78;
const WHEEL_SPIN_DURATION_MS = 2600;
const WHEEL_SHUFFLE_STEP_MS = 140;
const MAX_WHEEL_SHUFFLE_COUNT = 999;
const MAX_WHEEL_SHUFFLE_INPUT_LENGTH = String(MAX_WHEEL_SHUFFLE_COUNT).length + 1;

function cleanWheelShuffleCountInput(value: string) {
  return value.replace(/\D/g, "").slice(0, MAX_WHEEL_SHUFFLE_INPUT_LENGTH);
}

function parseWheelShuffleCount(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(MAX_WHEEL_SHUFFLE_COUNT, Math.max(1, parsed));
}

function hashWheelSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let value = seed || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: number) {
  const arr = [...items];
  const random = createSeededRandom(seed);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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

function taskTitleMatchesHabit(taskTitle: string, habit: Pick<DailyHabitItem, "key" | "label">) {
  if (habit.key === "bible_reading") {
    return isMergedBibleHabitName(taskTitle);
  }
  return canonicalHabitKey(taskTitle) === canonicalHabitKey(habit.label);
}

function normalizedHabitAreaName(name: string) {
  return canonicalHabitKey(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function areaTagForHabit(habit: Pick<DailyHabitItem, "key" | "label">) {
  const key = String(habit.key || "").trim().toLowerCase();
  const name = normalizedHabitAreaName(habit.label);

  if (
    key === "bible_reading" ||
    key === "daily_text" ||
    name === "bible reading & study" ||
    name === "bible study" ||
    name === "bible studying" ||
    name === "daily text"
  ) {
    return "jw";
  }
  if (key === "workout" || name === "workout" || name === "remedios") {
    return "saude";
  }
  if (key === "writing" || key === "general_reading" || name === "writing" || name === "general reading") {
    return "hobbies";
  }
  if (key === "shower" || name === "shower") {
    return "eu";
  }
  if (name === "15/15") {
    return "casa";
  }
  return "";
}

function defaultDurationForHabit(habit: Pick<DailyHabitItem, "key" | "label">) {
  const key = String(habit.key || "").trim().toLowerCase();
  const name = normalizedHabitAreaName(habit.label);

  if (key === "workout" || name === "workout") return 60;
  if (key === "daily_text" || name === "daily text") return 2;
  if (
    key === "bible_reading" ||
    name === "bible reading & study" ||
    name === "bible study" ||
    name === "bible studying"
  ) {
    return 15;
  }
  if (key === "general_reading" || name === "general reading") return 15;
  if (key === "writing" || name === "writing") return 10;
  if (name === "remedios") return 2;
  if (name === "15/15") return 35;
  if (key === "shower" || name === "shower") return 25;
  return 30;
}

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
  return isHabitScheduledForWeekday(habitKey, dayIndex, meetingDays, familyDay);
};

function summarizeTaskMetadata(draft: {
  estimatedMinutes: number;
  plannedTime: string;
  startTime: string;
  endTime: string;
  priorityTag: string;
  actualMinutes: number;
}) {
  const pieces: string[] = [];
  if (draft.estimatedMinutes > 0) pieces.push(`${draft.estimatedMinutes} min`);
  if (draft.plannedTime) pieces.push(`planned ${draft.plannedTime}`);
  if (draft.startTime) pieces.push(`start ${draft.startTime}`);
  if (draft.endTime) pieces.push(`end ${draft.endTime}`);
  if (draft.actualMinutes > 0) pieces.push(`actual ${draft.actualMinutes} min`);
  if (draft.priorityTag && draft.priorityTag !== "Medium") pieces.push(draft.priorityTag);
  return pieces.join(" · ");
}

function currentClockTime() {
  return format(new Date(), "HH:mm");
}

function getTaskProgressState(draft: {
  isDone: boolean;
  startTime: string;
  endTime: string;
}) {
  if (draft.isDone) return null;
  if (draft.startTime && draft.endTime) return "needs-finish" as const;
  if (draft.startTime) return "started" as const;
  return null;
}

function normalizeIsoDate(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function getTaskClockState(
  draft: {
    isDone: boolean;
    scheduledDate: string;
    scheduledTime: string;
    plannedTime: string;
    estimatedMinutes: number;
  },
  contextDate: string,
  nowTick: number
) {
  if (draft.isDone) return "done" as const;

  const effectiveDate = normalizeIsoDate(draft.scheduledDate) || normalizeIsoDate(contextDate);
  const now = new Date(nowTick);
  const todayIso = format(now, "yyyy-MM-dd");
  if (effectiveDate && effectiveDate < todayIso) return "late" as const;
  if (effectiveDate && effectiveDate > todayIso) return "todo" as const;

  const anchorTime = draft.plannedTime || draft.scheduledTime;
  if (!anchorTime) return "todo" as const;
  const startMinutes = toMinutes(anchorTime);
  const estimatedMinutes = Math.max(5, Number(draft.estimatedMinutes || 30));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes >= startMinutes + estimatedMinutes) return "late" as const;
  if (nowMinutes >= startMinutes) return "progress" as const;
  return "todo" as const;
}

function polar(cx: number, cy: number, radius: number, angleDegFromTop: number) {
  const radians = (Math.PI / 180) * angleDegFromTop;
  return {
    x: cx + radius * Math.sin(radians),
    y: cy - radius * Math.cos(radians),
  };
}

function describeWheelSlice(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
) {
  const start = polar(cx, cy, radius, startAngle);
  const end = polar(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function truncateWheelLabel(text: string, maxLength: number) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return "Task";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

function findWheelSegmentAtPointer(segments: WheelSegment[], rotationDeg: number) {
  if (!segments.length) return null;
  const pointerAngle = ((-rotationDeg % 360) + 360) % 360;
  return (
    segments.find(
      (segment) =>
        pointerAngle >= segment.startAngle && pointerAngle < segment.endAngle
    ) || segments[segments.length - 1]
  );
}

function getTaskFocusOrder(task: Pick<TodoTask, "focusOrder">) {
  const value = Number(task.focusOrder);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function compareTasksForExecution(left: TodoTask, right: TodoTask) {
  const leftFocus = getTaskFocusOrder(left);
  const rightFocus = getTaskFocusOrder(right);
  const sameDay =
    Boolean(left.scheduledDate) &&
    Boolean(right.scheduledDate) &&
    String(left.scheduledDate) === String(right.scheduledDate);

  if (sameDay && (leftFocus !== null || rightFocus !== null)) {
    const leftFocusValue = leftFocus ?? Number.MAX_SAFE_INTEGER;
    const rightFocusValue = rightFocus ?? Number.MAX_SAFE_INTEGER;
    if (leftFocusValue !== rightFocusValue) return leftFocusValue - rightFocusValue;
  }

  const leftTime = left.plannedTime || left.scheduledTime || "99:99";
  const rightTime = right.plannedTime || right.scheduledTime || "99:99";
  if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);

  if (leftFocus !== null || rightFocus !== null) {
    const leftFocusValue = leftFocus ?? Number.MAX_SAFE_INTEGER;
    const rightFocusValue = rightFocus ?? Number.MAX_SAFE_INTEGER;
    if (leftFocusValue !== rightFocusValue) return leftFocusValue - rightFocusValue;
  }

  return String(left.createdAt).localeCompare(String(right.createdAt));
}

const AUTO_PLAN_DAY_KEY = "calendar.autoPlan.day.v1";
const START_OFFSET_MINUTES_KEY = "calendar.planStartOffsetMinutes.v1";
const NIGHT_OWL_DAYS_KEY = "calendar.nightOwlDays.v1";
const NIGHT_OWL_END_TIMES_KEY = "calendar.nightOwlEndTimes.v1";
const DEFAULT_PLAN_START_OFFSET_MINUTES = 10;
const DAY_END_TIME = "22:00";
const DEFAULT_NIGHT_OWL_END_TIME = "02:00";

function normalizeTaskTitleKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "");
}

function isDissertationFrontTask(task: TodoTask) {
  return task.source === "dissertation";
}

function toMinutes(time: string) {
  const [hourText, minuteText] = String(time || "00:00").split(":");
  const hour = Number(hourText || 0);
  const minute = Number(minuteText || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

function toPlanningEndMinutes(time: string) {
  const minutes = toMinutes(time);
  if (minutes <= 12 * 60) return minutes + 24 * 60;
  return minutes;
}

function toFullCalendarSlotTime(minutes: number) {
  const clean = Math.max(0, Math.round(minutes));
  const hour = Math.floor(clean / 60);
  const minute = clean % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

type EditableTaskRowProps = {
  task: TodoTask;
  draft: {
    title: string;
    isDone: boolean;
    priorityTag: string;
    areaTag: string;
    scheduleLocked: boolean;
    scheduledDate: string;
    scheduledTime: string;
    plannedTime: string;
    startTime: string;
    endTime: string;
    estimatedMinutes: number;
    actualMinutes: number;
    notes: string;
  };
  effort: EffortLevel;
  expanded: boolean;
  active?: boolean;
  saving: boolean;
  saved: boolean;
  area: TaskAreaTag | null;
  scheduleLocked: boolean;
  taskAreas: TaskAreaTag[];
  creatingArea: boolean;
  onToggleDone: (task: TodoTask, checked: boolean) => void;
  onToggleMissed: (task: TodoTask, missed: boolean) => void;
  onToggleExpanded: (taskId: string, currentlyExpanded: boolean) => void;
  onToggleSubtaskDone: (task: TodoTask, subtaskId: string, checked: boolean) => void;
  onOpenDetails: (taskId: string) => void;
  onPriorityTagChange: (task: TodoTask, priorityTag: string) => void;
  onAreaTagChange: (task: TodoTask, areaKey: string) => void;
  onToggleScheduleLock: (task: TodoTask, locked: boolean) => void;
  onCreateAreaTag: (task: TodoTask, label: string) => Promise<TaskAreaTag | null>;
  onScheduleToday?: (taskId: string) => void;
  onUnscheduleToday?: (taskId: string) => void;
  onScheduleTomorrow?: (taskId: string) => void;
  onMoveToTop?: (taskId: string) => void;
  onMoveToEnd?: (taskId: string) => void;
  onMoveToBacklog?: (taskId: string) => void;
  onMoveToToday?: (taskId: string) => void;
  onMarkStarted: (task: TodoTask) => void;
  onMarkNeedsFinish: (task: TodoTask) => void;
  onResumeTask: (task: TodoTask) => void;
  onSetNext: (taskId: string) => void;
  onMoveFocus: (taskId: string, direction: "up" | "down") => void;
  onDelete: (taskId: string) => void;
  onShare?: (taskId: string) => void;
  sharing: boolean;
  contextDate: string;
  focusPosition?: number | null;
  canMoveFocusUp?: boolean;
  canMoveFocusDown?: boolean;
  showOrderControls?: boolean;
  showInlineNext?: boolean;
  subtaskSavingId?: string | null;
  shareLabel?: string | null;
  shareActionLabel?: string;
  draggable?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStartTask?: (taskId: string) => void;
  onDragOverTask?: (taskId: string) => void;
  onDropTask?: (taskId: string) => void;
  onDragEndTask?: () => void;
  showMobileMoveActions?: boolean;
  nowTick: number;
  showClockState?: boolean;
};

function TaskAreaBadge({ area }: { area: TaskAreaTag | null }) {
  if (!area) return null;
  return (
    <span
      className="task-area-badge"
      style={{ "--task-area-color": area.color } as CSSProperties}
      title={area.label}
    >
      {area.label}
    </span>
  );
}

const EditableTaskRow = memo(function EditableTaskRow({
  task,
  draft,
  expanded,
  active = false,
  saving,
  saved,
  area,
  scheduleLocked,
  taskAreas,
  creatingArea,
  onToggleDone,
  onToggleMissed,
  onToggleExpanded,
  onToggleSubtaskDone,
  onOpenDetails,
  onPriorityTagChange,
  onAreaTagChange,
  onToggleScheduleLock,
  onCreateAreaTag,
  onScheduleToday,
  onUnscheduleToday,
  onScheduleTomorrow,
  onMoveToTop,
  onMoveToEnd,
  onMoveToBacklog,
  onMoveToToday,
  onMarkStarted,
  onMarkNeedsFinish,
  onResumeTask,
  onSetNext,
  onMoveFocus,
  onDelete,
  onShare,
  sharing,
  contextDate,
  focusPosition = null,
  canMoveFocusUp = false,
  canMoveFocusDown = false,
  showOrderControls = false,
  showInlineNext = false,
  subtaskSavingId,
  shareLabel,
  shareActionLabel = "Share",
  effort,
  draggable = false,
  dragging = false,
  dropTarget = false,
  onDragStartTask,
  onDragOverTask,
  onDropTask,
  onDragEndTask,
  showMobileMoveActions = false,
  nowTick,
  showClockState = true,
}: EditableTaskRowProps) {
  const [quickAreaLabel, setQuickAreaLabel] = useState("");
  const [showQuickAreaInput, setShowQuickAreaInput] = useState(false);
  const subtasks = useMemo(
    () =>
      [...(task.subtasks || [])].sort(
        (left, right) => Number(left.order || 0) - Number(right.order || 0)
      ),
    [task.subtasks]
  );
  const completedSubtasks = useMemo(
    () => subtasks.filter((subtask) => Boolean(subtask.isDone)).length,
    [subtasks]
  );
  const hasSubtasks = subtasks.length > 0;
  const allSubtasksDone = hasSubtasks && completedSubtasks === subtasks.length;
  const progressState = getTaskProgressState(draft);
  const clockState = getTaskClockState(draft, contextDate, nowTick);
  const clockStateClass =
    !showClockState
      ? ""
      : clockState === "late"
      ? "task-row-clock-late"
      : clockState === "progress"
        ? "task-row-clock-progress"
        : clockState === "done"
          ? "task-row-clock-done"
          : "";
  const metadataSummary = [
    draft.scheduledDate && draft.scheduledDate !== contextDate ? draft.scheduledDate : "",
    summarizeTaskMetadata(draft),
    effort !== "medium" ? EFFORT_LABELS[effort] : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const handleToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onToggleDone(task, event.target.checked),
    [onToggleDone, task]
  );
  const isMissed = Boolean(task.missedAt);
  const handleToggleMissed = useCallback(() => {
    onToggleMissed(task, !isMissed);
  }, [onToggleMissed, task, isMissed]);
  const handleOpen = useCallback(() => onOpenDetails(task.id), [onOpenDetails, task.id]);
  const handleToggleExpanded = useCallback(
    () => onToggleExpanded(task.id, expanded),
    [expanded, onToggleExpanded, task.id]
  );
  const handleScheduleToday = useCallback(() => {
    if (!onScheduleToday) return;
    onScheduleToday(task.id);
  }, [onScheduleToday, task.id]);
  const handleUnscheduleToday = useCallback(() => {
    if (!onUnscheduleToday) return;
    onUnscheduleToday(task.id);
  }, [onUnscheduleToday, task.id]);
  const handleScheduleTomorrow = useCallback(() => {
    if (!onScheduleTomorrow) return;
    onScheduleTomorrow(task.id);
  }, [onScheduleTomorrow, task.id]);
  const handleMarkStarted = useCallback(() => onMarkStarted(task), [onMarkStarted, task]);
  const handleMarkNeedsFinish = useCallback(
    () => onMarkNeedsFinish(task),
    [onMarkNeedsFinish, task]
  );
  const handleResumeTask = useCallback(() => onResumeTask(task), [onResumeTask, task]);
  const handleSetNext = useCallback(() => onSetNext(task.id), [onSetNext, task.id]);
  const handleMoveToTop = useCallback(() => {
    if (!onMoveToTop) return;
    onMoveToTop(task.id);
  }, [onMoveToTop, task.id]);
  const handleMoveToEnd = useCallback(() => {
    if (!onMoveToEnd) return;
    onMoveToEnd(task.id);
  }, [onMoveToEnd, task.id]);
  const handleMoveToBacklog = useCallback(() => {
    if (!onMoveToBacklog) return;
    onMoveToBacklog(task.id);
  }, [onMoveToBacklog, task.id]);
  const handleMoveToToday = useCallback(() => {
    if (!onMoveToToday) return;
    onMoveToToday(task.id);
  }, [onMoveToToday, task.id]);
  const handleMoveFocusUp = useCallback(
    () => onMoveFocus(task.id, "up"),
    [onMoveFocus, task.id]
  );
  const handleMoveFocusDown = useCallback(
    () => onMoveFocus(task.id, "down"),
    [onMoveFocus, task.id]
  );
  const handleDelete = useCallback(() => onDelete(task.id), [onDelete, task.id]);
  const handleShare = useCallback(() => {
    if (!onShare) return;
    onShare(task.id);
  }, [onShare, task.id]);
  const handlePriorityTagChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onPriorityTagChange(task, event.target.value);
    },
    [onPriorityTagChange, task]
  );
  const handleAreaTagChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onAreaTagChange(task, event.target.value);
    },
    [onAreaTagChange, task]
  );
  const handleCreateQuickArea = useCallback(async () => {
    const label = quickAreaLabel.trim();
    if (!label) return;
    const area = await onCreateAreaTag(task, label);
    if (!area) return;
    setQuickAreaLabel("");
    setShowQuickAreaInput(false);
  }, [onCreateAreaTag, quickAreaLabel, task]);
  const handleToggleScheduleLock = useCallback(() => {
    onToggleScheduleLock(task, !scheduleLocked);
  }, [onToggleScheduleLock, scheduleLocked, task]);
  const handleDragStart = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!draggable) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", task.id);
      onDragStartTask?.(task.id);
    },
    [draggable, onDragStartTask, task.id]
  );
  const handleDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!draggable) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      onDragOverTask?.(task.id);
    },
    [draggable, onDragOverTask, task.id]
  );
  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!draggable) return;
      event.preventDefault();
      onDropTask?.(task.id);
    },
    [draggable, onDropTask, task.id]
  );

  return (
    <article
      className={`task-row task-row-editable ${active ? "active" : ""} ${progressState ? `task-row-${progressState}` : ""} ${clockStateClass} ${allSubtasksDone && !draft.isDone ? "task-row-ready" : ""} ${isMissed ? "task-row-missed" : ""} ${shareLabel ? "task-row-shared" : ""} ${draggable ? "task-row-draggable" : ""} ${dragging ? "task-row-dragging" : ""} ${dropTarget ? "task-row-drop-target" : ""}`}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={onDragEndTask}
      title={draggable ? "Drag to reorder" : undefined}
    >
      <div className="task-row-compact-head">
        <input
          type="checkbox"
          checked={draft.isDone}
          onChange={handleToggle}
          onClick={(event) => event.stopPropagation()}
          disabled={isMissed}
        />
        <button type="button" className="task-row-open" onClick={handleOpen}>
          <div className="task-row-main">
            <span className="task-title">{draft.title}</span>
            {metadataSummary ? <span className="task-time">{metadataSummary}</span> : null}
            {hasSubtasks ? (
              <span className="task-subtask-summary">
                {completedSubtasks}/{subtasks.length} subtasks
              </span>
            ) : null}
            {focusPosition ? (
              <span className="task-focus-badge">
                {focusPosition === 1 ? "Next" : `Focus #${focusPosition}`}
              </span>
            ) : null}
            {progressState === "started" ? (
              <span className="task-progress-badge started">Started</span>
            ) : null}
            {progressState === "needs-finish" ? (
              <span className="task-progress-badge needs-finish">Needs finish</span>
            ) : null}
            {allSubtasksDone && !draft.isDone ? (
              <span className="task-ready-badge">Ready</span>
            ) : null}
          </div>
        </button>
        <button
          type="button"
          className="task-subtask-toggle"
          onClick={hasSubtasks ? handleToggleExpanded : handleOpen}
          aria-label={
            hasSubtasks
              ? expanded
                ? "Collapse subtasks"
                : "Expand subtasks"
              : "Open task details"
          }
        >
          {hasSubtasks && expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        {draggable ? (
          <span
            className="task-row-drag-handle"
            title="Drag to reorder"
            aria-hidden="true"
          >
            <GripVertical size={15} />
          </span>
        ) : null}
        <TaskAreaBadge area={area} />
        <button
          type="button"
          className={`task-row-lock-toggle ${scheduleLocked ? "active" : ""}`}
          aria-pressed={scheduleLocked}
          title={scheduleLocked ? "Fixed time locked" : "Enable fixed-time lock"}
          onClick={handleToggleScheduleLock}
        >
          {scheduleLocked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
        {showOrderControls && !draft.isDone ? (
          <div
            className="task-row-order-controls"
            role="group"
            aria-label={`Order controls for ${draft.title}`}
          >
            {showInlineNext ? (
              <button
                type="button"
                className="task-row-next-button"
                onClick={handleSetNext}
                disabled={saving}
                aria-label={`Make ${draft.title} next`}
              >
                Next
              </button>
            ) : null}
            <button
              type="button"
              className="task-row-order-button"
              onClick={handleMoveFocusUp}
              disabled={!canMoveFocusUp || saving}
              aria-label={`Move ${draft.title} up`}
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className="task-row-order-button"
              onClick={handleMoveFocusDown}
              disabled={!canMoveFocusDown || saving}
              aria-label={`Move ${draft.title} down`}
            >
              <ArrowDown size={14} />
            </button>
          </div>
        ) : showInlineNext && !draft.isDone ? (
          <button type="button" className="task-row-next-button" onClick={handleSetNext} disabled={saving}>
            Next
          </button>
        ) : null}
        {shareLabel ? <span className="task-share-badge">{shareLabel}</span> : null}
        {saving ? <span className="task-row-state">Saving…</span> : null}
        {!saving && saved ? <span className="task-row-state success">Saved</span> : null}
        <div className="task-row-menu">
          <button
            type="button"
            className={`task-row-miss-toggle ${isMissed ? "active" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              handleToggleMissed();
            }}
            aria-pressed={isMissed}
            aria-label={isMissed ? "Reabrir — desfazer não feita" : "Marcar como não feita"}
            title={isMissed ? "Desfazer não feita" : "Marcar como não feita"}
          >
            <XCircle size={14} aria-hidden="true" />
          </button>
          <OverflowMenu className="task-row-overflow" align="right">
            <div className="task-row-menu-list">
              <button type="button" className="task-row-menu-action" onClick={handleOpen}>
                <SquarePen size={15} />
                Edit
              </button>
              {onScheduleToday ? (
                <button type="button" className="task-row-menu-action" onClick={handleScheduleToday}>
                  <CalendarClock size={15} />
                  Today
                </button>
              ) : null}
              {!draft.isDone && onUnscheduleToday ? (
                <button type="button" className="task-row-menu-action" onClick={handleUnscheduleToday}>
                  <CalendarX size={15} />
                  Not today
                </button>
              ) : null}
              {!draft.isDone && onScheduleTomorrow ? (
                <button type="button" className="task-row-menu-action" onClick={handleScheduleTomorrow}>
                  <CalendarClock size={15} />
                  Tomorrow
                </button>
              ) : null}
              {!draft.isDone ? (
                <>
                  {!draft.startTime ? (
                    <button type="button" className="task-row-menu-action" onClick={handleMarkStarted}>
                      <Play size={15} />
                      Started
                    </button>
                  ) : draft.endTime ? (
                    <button type="button" className="task-row-menu-action" onClick={handleResumeTask}>
                      <RotateCcw size={15} />
                      Resume
                    </button>
                  ) : (
                    <button type="button" className="task-row-menu-action" onClick={handleMarkNeedsFinish}>
                      <Pause size={15} />
                      Finish later
                    </button>
                  )}
                  <button type="button" className="task-row-menu-action" onClick={handleSetNext}>
                    <ArrowUp size={15} />
                    Next
                  </button>
                  <button
                    type="button"
                    className="task-row-menu-action"
                    onClick={handleMoveFocusUp}
                    disabled={!canMoveFocusUp}
                  >
                    <ArrowUp size={15} />
                    Up
                  </button>
                  <button
                    type="button"
                    className="task-row-menu-action"
                    onClick={handleMoveFocusDown}
                    disabled={!canMoveFocusDown}
                  >
                    <ArrowDown size={15} />
                    Down
                  </button>
                </>
              ) : null}
              {onShare ? (
                <button type="button" className="task-row-menu-action" onClick={handleShare} disabled={sharing}>
                  <Share2 size={15} />
                  {sharing ? "Working..." : shareActionLabel}
                </button>
              ) : null}
              <button
                type="button"
                className={`task-row-menu-action ${isMissed ? "" : "subtle-danger"}`}
                onClick={handleToggleMissed}
              >
                <XCircle size={15} />
                {isMissed ? "Reabrir (não estava feita)" : "Marcar como não feita"}
              </button>
              <button type="button" className="task-row-menu-action danger" onClick={handleDelete}>
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </OverflowMenu>
        </div>
      </div>
      <div className="task-row-quick-tags">
        <label className="task-row-quick-field">
          <span>Priority</span>
          <select value={draft.priorityTag} onChange={handlePriorityTagChange}>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </label>
        <label className="task-row-quick-field">
          <span>Tag</span>
          <select value={draft.areaTag} onChange={handleAreaTagChange}>
            <option value="">No area</option>
            {taskAreas.map((taskArea) => (
              <option key={taskArea.key} value={taskArea.key}>
                {taskArea.label}
              </option>
            ))}
          </select>
        </label>
        {showQuickAreaInput ? (
          <span className="task-row-quick-create">
            <input
              type="text"
              value={quickAreaLabel}
              onChange={(event) => setQuickAreaLabel(event.target.value)}
              placeholder="Nova tag"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreateQuickArea();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setQuickAreaLabel("");
                  setShowQuickAreaInput(false);
                }
              }}
            />
            <button
              type="button"
              className="task-row-quick-create-btn"
              onClick={() => void handleCreateQuickArea()}
              disabled={creatingArea || !quickAreaLabel.trim()}
            >
              {creatingArea ? "…" : "Add"}
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="task-row-quick-new-tag"
            onClick={() => setShowQuickAreaInput(true)}
          >
            + Tag
          </button>
        )}
      </div>
      {showMobileMoveActions ? (
        <div className="task-row-mobile-actions">
          {onMoveToToday ? (
            <button type="button" className="task-row-mobile-action" onClick={handleMoveToToday}>
              Today
            </button>
          ) : null}
          {onMoveToBacklog ? (
            <button type="button" className="task-row-mobile-action" onClick={handleMoveToBacklog}>
              Backlog
            </button>
          ) : null}
          {onMoveToTop ? (
            <button type="button" className="task-row-mobile-action" onClick={handleMoveToTop}>
              Top
            </button>
          ) : null}
          {onMoveToEnd ? (
            <button type="button" className="task-row-mobile-action" onClick={handleMoveToEnd}>
              End
            </button>
          ) : null}
        </div>
      ) : null}
      {expanded && hasSubtasks ? (
        <div className="task-subtasks">
          {subtasks.map((subtask) => (
            <label
              key={subtask.id}
              className={`task-subtask-row ${subtask.isDone ? "completed" : ""}`}
            >
              <input
                type="checkbox"
                checked={Boolean(subtask.isDone)}
                onChange={(event) =>
                  onToggleSubtaskDone(task, subtask.id, event.target.checked)
                }
                disabled={subtaskSavingId === subtask.id}
              />
              <span>{subtask.title}</span>
            </label>
          ))}
        </div>
      ) : null}
    </article>
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
    (event: ChangeEvent<HTMLInputElement>) =>
      onToggleHabit(habit, event.target.checked),
    [habit, onToggleHabit]
  );
  const handleTime = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onTimeChange(habit.id, event.target.value),
    [habit.id, onTimeChange]
  );
  const handleDuration = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
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
        {habit.inAgenda ? "Added" : saving ? "…" : "Add"}
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

type TaskTagStatsRow = {
  key: string;
  label: string;
  planned: number;
  done: number;
};

function TaskTagBars({
  title,
  rows,
}: {
  title: string;
  rows: TaskTagStatsRow[];
}) {
  const peak = rows.reduce((max, row) => Math.max(max, row.planned, row.done), 1);
  return (
    <article className="calendar-tag-bars-card">
      <h4>{title}</h4>
      <div className="calendar-tag-bars-list">
        {rows.map((row) => (
          <div key={`${title}-${row.key}`} className="calendar-tag-bars-row">
            <span className="calendar-tag-bars-label">{row.label}</span>
            <div className="calendar-tag-bars-metrics">
              <div
                className="calendar-tag-bar planned"
                style={{ width: `${Math.max(8, (row.planned / peak) * 100)}%` }}
                title={`Planned: ${row.planned}`}
              >
                <small>{row.planned}</small>
              </div>
              <div
                className="calendar-tag-bar done"
                style={{ width: `${Math.max(8, (row.done / peak) * 100)}%` }}
                title={`Done: ${row.done}`}
              >
                <small>{row.done}</small>
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function CalendarTab({ userEmail: _userEmail }: { userEmail: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const calendarRef = useRef<FullCalendar | null>(null);
  const lastCreateAttemptRef = useRef<CreateTaskInput | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "failed">("idle");
  const [calendarView, setCalendarView] = useState<CalendarViewMode>("timeGridDay");
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [newTime, setNewTime] = useState("");
  const [newEst, setNewEst] = useState(30);
  const [newPriorityTag, setNewPriorityTag] = useState("Medium");
  const [newAreaTag, setNewAreaTag] = useState("");
  const [newScheduleLocked, setNewScheduleLocked] = useState(false);
  const [planStartOffsetMinutes, setPlanStartOffsetMinutes] = useState(
    DEFAULT_PLAN_START_OFFSET_MINUTES
  );
  const [estimateWasTouched, setEstimateWasTouched] = useState(false);
  const [shareOnCreate, setShareOnCreate] = useState(false);
  const [composerAdvancedOpen, setComposerAdvancedOpen] = useState(false);
  const [wheelOnlyToday, setWheelOnlyToday] = useState(true);
  const [wheelAvoidRepeat, setWheelAvoidRepeat] = useState(true);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelResultTaskId, setWheelResultTaskId] = useState<string | null>(null);
  const [wheelLastTaskId, setWheelLastTaskId] = useState<string | null>(null);
  const [wheelShuffleNonce, setWheelShuffleNonce] = useState(0);
  const [wheelShuffleCountInput, setWheelShuffleCountInput] = useState("1");
  const [wheelShuffling, setWheelShuffling] = useState(false);
  const [wheelShuffleProgress, setWheelShuffleProgress] = useState(0);
  const wheelSpinTimeoutRef = useRef<number | null>(null);
  const wheelShuffleTimeoutRef = useRef<number | null>(null);
  const [calendarSelection, setCalendarSelection] = useState<{
    date: string;
    time: string;
    estimatedMinutes: number;
  } | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft>>({});
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [savingSubtaskId, setSavingSubtaskId] = useState<string | null>(null);
  const [savedTaskId, setSavedTaskId] = useState<string | null>(null);
  const [taskSaveError, setTaskSaveError] = useState<string | null>(null);
  const [estimationDrafts, setEstimationDrafts] = useState<
    Record<string, { estimatedMinutes: number; actualMinutes: number }>
  >({});
  const [savingEstimationTaskId, setSavingEstimationTaskId] = useState<string | null>(null);
  const [sharingTaskId, setSharingTaskId] = useState<string | null>(null);
  const [respondingShareId, setRespondingShareId] = useState<string | null>(null);
  const [taskShareNotice, setTaskShareNotice] = useState<string | null>(null);
  const [boardActionNotice, setBoardActionNotice] = useState<{
    tone: "success" | "warning";
    body: string;
  } | null>(null);
  const [nextDissertationStepDraft, setNextDissertationStepDraft] = useState<{
    sourceTaskId: string;
    title: string;
    priorityTag: string;
    areaTag: string;
    estimatedMinutes: number;
  } | null>(null);
  const [reconnectingGoogle, setReconnectingGoogle] = useState(false);
  const [habitTimeDrafts, setHabitTimeDrafts] = useState<Record<string, string>>({});
  const [habitDurationDrafts, setHabitDurationDrafts] = useState<Record<string, number>>({});
  const [dismissedHabitsByDay, setDismissedHabitsByDay] = useState<Record<string, string[]>>({});
  const [quickNoteText, setQuickNoteText] = useState("");
  const [quickNoteSavedAt, setQuickNoteSavedAt] = useState<number | null>(null);
  const [quickNoteDrafts, setQuickNoteDrafts] = useState<Record<string, string>>({});
  const [pendingAutoPlanReason, setPendingAutoPlanReason] = useState<string | null>(null);
  const [autoPlanNotice, setAutoPlanNotice] = useState<string | null>(null);
  const [todayTagFilter, setTodayTagFilter] = useState(ALL_TAG_FILTER);
  const [backlogTagFilter, setBacklogTagFilter] = useState(ALL_TAG_FILTER);
  const [nightOwlDays, setNightOwlDays] = useState<Record<string, boolean>>({});
  const [nightOwlEndTimes, setNightOwlEndTimes] = useState<Record<string, string>>({});
  const autoPlanningRef = useRef(false);

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
      const raw = window.localStorage.getItem(NIGHT_OWL_DAYS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (parsed && typeof parsed === "object") {
        setNightOwlDays(parsed);
      }
    } catch (_error) {
      // ignore storage failures
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NIGHT_OWL_END_TIMES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === "object") {
        setNightOwlEndTimes(parsed);
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

  useEffect(() => {
    try {
      window.localStorage.setItem(NIGHT_OWL_DAYS_KEY, JSON.stringify(nightOwlDays));
    } catch (_error) {
      // ignore storage failures
    }
  }, [nightOwlDays]);

  useEffect(() => {
    try {
      window.localStorage.setItem(NIGHT_OWL_END_TIMES_KEY, JSON.stringify(nightOwlEndTimes));
    } catch (_error) {
      // ignore storage failures
    }
  }, [nightOwlEndTimes]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(START_OFFSET_MINUTES_KEY);
      if (!raw) return;
      const next = Number(raw);
      if (!Number.isFinite(next)) return;
      setPlanStartOffsetMinutes(Math.max(0, Math.min(180, Math.round(next))));
    } catch (_error) {
      // ignore storage failures
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        START_OFFSET_MINUTES_KEY,
        String(planStartOffsetMinutes)
      );
    } catch (_error) {
      // ignore storage failures
    }
  }, [planStartOffsetMinutes]);

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
  const tomorrowFromSelectedIso = useMemo(
    () => format(addDays(new Date(`${selectedDayIso}T12:00:00`), 1), "yyyy-MM-dd"),
    [selectedDayIso]
  );
  const isNightOwlDay = Boolean(nightOwlDays[selectedDayIso]);
  const selectedNightOwlEndTime = nightOwlEndTimes[selectedDayIso] || DEFAULT_NIGHT_OWL_END_TIME;
  const planningDayEndTime = isNightOwlDay ? selectedNightOwlEndTime : DAY_END_TIME;
  const planningDayEndMinutes = isNightOwlDay
    ? toPlanningEndMinutes(selectedNightOwlEndTime)
    : toMinutes(DAY_END_TIME);
  const calendarSlotMaxTime = isNightOwlDay
    ? toFullCalendarSlotTime(Math.max(24 * 60, planningDayEndMinutes))
    : "24:00:00";
  useEffect(() => {
    setAutoPlanNotice(null);
  }, [selectedDayIso]);

  useEffect(() => {
    if (!boardActionNotice) return;
    const timeoutId = window.setTimeout(() => {
      setBoardActionNotice(null);
    }, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [boardActionNotice]);

  const overdueRange = useMemo(() => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const start = format(subDays(weekStart, 7), "yyyy-MM-dd");
    const end = format(subDays(weekStart, 1), "yyyy-MM-dd");
    return { start, end };
  }, [selectedDate]);

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

  useEffect(
    () => () => {
      if (wheelSpinTimeoutRef.current) {
        window.clearTimeout(wheelSpinTimeoutRef.current);
      }
      if (wheelShuffleTimeoutRef.current) {
        window.clearTimeout(wheelShuffleTimeoutRef.current);
      }
    },
    []
  );

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
    if (calendarSelection) return;
    setNewDate(selectedDayIso);
  }, [calendarSelection, selectedDayIso]);

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
  const onboardingQuery = useQuery({
    queryKey: ["onboarding-preferences"],
    queryFn: () => fetchJson<OnboardingResponse>("/api/onboarding"),
  });
  const energyQuery = useQuery({
    queryKey: ["energy-settings"],
    queryFn: () => fetchJson<EnergyResponse>("/api/energy"),
  });
  const taskSharesQuery = useQuery({
    queryKey: ["task-shares"],
    queryFn: () => fetchJson<TaskSharesResponse>("/api/task-shares"),
    staleTime: 10_000,
  });
  const taskAreasQuery = useQuery({
    queryKey: ["task-areas"],
    queryFn: () => fetchJson<TaskAreasResponse>("/api/task-areas"),
    staleTime: 60_000,
  });
  const quickNoteQuery = useQuery({
    queryKey: ["quick-note", selectedDayIso],
    queryFn: () =>
      fetchJson<QuickNoteResponse>(`/api/settings/quick-notes/${selectedDayIso}`),
  });
  const overdueTasksQuery = useQuery({
    queryKey: ["tasks-overdue", overdueRange.start, overdueRange.end],
    queryFn: () =>
      fetchJson<TaskListResponse>(
        `/api/tasks?start=${overdueRange.start}&end=${overdueRange.end}`
      ),
  });

  const tasks = useMemo(
    () => tasksQuery.data?.items || [],
    [tasksQuery.data?.items]
  );
  const overdueTasks = useMemo(
    () => overdueTasksQuery.data?.items || [],
    [overdueTasksQuery.data?.items]
  );
  const taskAreas = useMemo(
    () =>
      taskAreasQuery.data?.items?.length
        ? taskAreasQuery.data.items
        : DEFAULT_TASK_AREAS,
    [taskAreasQuery.data?.items]
  );
  const syncWarning = tasksQuery.data?.warning;
  const reconnectRequired = useMemo(
    () =>
      reconnectingGoogle ||
      isGoogleReconnectErrorText(syncWarning) ||
      isGoogleReconnectErrorText(taskSaveError),
    [reconnectingGoogle, syncWarning, taskSaveError]
  );

  const energySettings = energyQuery.data || { lowEnergyMode: false, taskEffort: {}, habitEffort: {} };
  const taskEffort = energySettings.taskEffort;
  const lowEnergyMode = energySettings.lowEnergyMode;
  const getTaskEffort = useCallback(
    (task: TodoTask): EffortLevel => taskEffort[task.id] || "medium",
    [taskEffort]
  );

  const tasksForDay = tasks.filter((task) => {
    if (task.scheduledDate === selectedDayIso) return true;
    if (!isNightOwlDay || task.scheduledDate !== tomorrowFromSelectedIso) return false;
    const earlyTime = task.plannedTime || task.scheduledTime || "";
    if (!earlyTime) return false;
    return toMinutes(earlyTime) <= Math.max(0, planningDayEndMinutes - 24 * 60);
  });
  const unscheduledTasks = tasks
    .filter((task) => !task.scheduledDate)
    // Done tasks belong on a date (backlog is for *pending* work). If one
    // ever ends up here despite the auto-anchor in toggleTaskDoneNow, hide
    // it from backlog so it doesn't read as "still to do".
    // Use task.isDone directly — readTaskDraft is declared further down,
    // referencing it here would trip the TDZ ("Cannot access X before
    // initialization") when this block runs on first render.
    .filter((task) => !task.isDone)
    .filter((task) => !lowEnergyMode || getTaskEffort(task) === "low")
    .sort(compareTasksForExecution);
  const overdueBacklogTasks = overdueTasks
    .filter((task) => !task.isDone)
    .filter((task) => !task.missedAt)
    .filter((task) => Boolean(task.scheduledDate))
    .filter((task) =>
      task.scheduledDate
        ? task.scheduledDate >= overdueRange.start &&
          task.scheduledDate <= overdueRange.end &&
          task.scheduledDate !== tomorrowFromSelectedIso
        : false
    )
    .filter((task) => !lowEnergyMode || getTaskEffort(task) === "low")
    .sort(compareTasksForExecution);

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
      areaTag: draft.areaTag ?? (task.areaTag || ""),
      scheduleLocked: draft.scheduleLocked ?? Boolean(task.scheduleLocked),
      scheduledDate: draft.scheduledDate ?? (task.scheduledDate || ""),
      scheduledTime: draft.scheduledTime ?? (task.scheduledTime || ""),
      plannedTime:
        draft.plannedTime ?? (task.plannedTime || task.scheduledTime || ""),
      startTime: draft.startTime ?? (task.startTime || ""),
      endTime: draft.endTime ?? (task.endTime || ""),
      estimatedMinutes:
        draft.estimatedMinutes ?? Number(task.estimatedMinutes || 0),
      actualMinutes: draft.actualMinutes ?? Number(task.actualMinutes || 0),
      notes: draft.notes ?? (task.notes || ""),
    };
  }, [taskDrafts]);

  const isTaskExpanded = useCallback(
    (task: TodoTask) =>
      expandedTasks[task.id] ?? Boolean(task.subtasks && task.subtasks.length > 0),
    [expandedTasks]
  );

  const taskMatchesTagFilter = useCallback(
    (task: TodoTask, tagFilter: string) => {
      if (tagFilter === ALL_TAG_FILTER) return true;
      const areaTag = (readTaskDraft(task).areaTag || "").trim();
      if (tagFilter === NO_TAG_FILTER) return !areaTag;
      return areaTag === tagFilter;
    },
    [readTaskDraft]
  );

  const allPendingTasks = tasksForDay
    .filter((task) => !readTaskDraft(task).isDone)
    .sort(compareTasksForExecution);
  const pendingTasks = allPendingTasks.filter(
    (task) => !lowEnergyMode || getTaskEffort(task) === "low"
  );
  const filteredPendingTasks = useMemo(
    () => pendingTasks.filter((task) => taskMatchesTagFilter(task, todayTagFilter)),
    [pendingTasks, taskMatchesTagFilter, todayTagFilter]
  );
  const filteredOverdueBacklogTasks = useMemo(
    () =>
      overdueBacklogTasks.filter((task) =>
        taskMatchesTagFilter(task, backlogTagFilter)
      ),
    [backlogTagFilter, overdueBacklogTasks, taskMatchesTagFilter]
  );
  const filteredUnscheduledTasks = useMemo(
    () =>
      unscheduledTasks.filter((task) =>
        taskMatchesTagFilter(task, backlogTagFilter)
      ),
    [backlogTagFilter, taskMatchesTagFilter, unscheduledTasks]
  );
  const todaySectionCountLabel =
    todayTagFilter !== ALL_TAG_FILTER
      ? `${filteredPendingTasks.length}/${pendingTasks.length}`
      : lowEnergyMode
        ? `${pendingTasks.length}/${allPendingTasks.length}`
        : String(pendingTasks.length);
  const completedTaskRows = tasksForDay
    .filter((task) => readTaskDraft(task).isDone)
    .sort(compareTasksForExecution);
  const completedTasks = completedTaskRows.filter((task) => task.source !== "habit");
  const executionPositionByTaskId = useMemo(
    () => new Map<string, number>(pendingTasks.map((task, index) => [task.id, index + 1])),
    [pendingTasks]
  );
  const pendingTaskPool = useMemo(
    () =>
      tasks.filter((task) => {
        if (readTaskDraft(task).isDone) return false;
        if (wheelOnlyToday) {
          return task.scheduledDate === selectedDayIso;
        }
        if (!task.scheduledDate) return true;
        return task.scheduledDate >= range.start && task.scheduledDate <= range.end;
      }),
    [range.end, range.start, readTaskDraft, selectedDayIso, tasks, wheelOnlyToday]
  );
  const wheelEligibleTasks = useMemo(() => {
    if (!wheelAvoidRepeat || !wheelLastTaskId || pendingTaskPool.length <= 1) {
      return pendingTaskPool;
    }
    const filtered = pendingTaskPool.filter((task) => task.id !== wheelLastTaskId);
    return filtered.length ? filtered : pendingTaskPool;
  }, [pendingTaskPool, wheelAvoidRepeat, wheelLastTaskId]);
  const wheelOrderedTasks = useMemo(() => {
    const sorted = [...wheelEligibleTasks].sort((a, b) => a.id.localeCompare(b.id));
    if (sorted.length <= 1) return sorted;
    const seed = hashWheelSeed(
      `${wheelShuffleNonce}:${sorted.map((task) => task.id).join("|")}`
    );
    return shuffleWithSeed(sorted, seed);
  }, [wheelEligibleTasks, wheelShuffleNonce]);
  const wheelSegments = useMemo<WheelSegment[]>(() => {
    if (!wheelOrderedTasks.length) return [];
    const totalWeight = wheelOrderedTasks.reduce(
      (sum, task) => sum + taskPriorityWeight(task.priorityTag),
      0
    );
    if (totalWeight <= 0) return [];

    let cursor = 0;
    return wheelOrderedTasks.map((task, index) => {
      const weight = taskPriorityWeight(task.priorityTag);
      const span = (weight / totalWeight) * 360;
      const startAngle = cursor;
      const endAngle = cursor + span;
      cursor = endAngle;
      return {
        task,
        weight,
        startAngle,
        endAngle,
        midAngle: startAngle + span / 2,
        span,
        color: WHEEL_SLICE_COLORS[index % WHEEL_SLICE_COLORS.length],
      };
    });
  }, [wheelOrderedTasks]);
  const wheelResultTask = useMemo(
    () => tasks.find((task) => task.id === wheelResultTaskId) || null,
    [tasks, wheelResultTaskId]
  );
  const wheelResultDraft = useMemo(
    () => (wheelResultTask ? readTaskDraft(wheelResultTask) : null),
    [readTaskDraft, wheelResultTask]
  );
  const wheelTotalWeight = useMemo(
    () => wheelSegments.reduce((sum, segment) => sum + segment.weight, 0),
    [wheelSegments]
  );
  const wheelShuffleCount = useMemo(
    () => parseWheelShuffleCount(wheelShuffleCountInput),
    [wheelShuffleCountInput]
  );

  useEffect(() => {
    if (!wheelResultTaskId) return;
    if (!pendingTaskPool.some((task) => task.id === wheelResultTaskId)) {
      setWheelResultTaskId(null);
    }
  }, [pendingTaskPool, wheelResultTaskId]);

  const pendingTaskShares = useMemo(
    () => taskSharesQuery.data?.items || [],
    [taskSharesQuery.data?.items]
  );
  const sentTaskShares = useMemo(
    () => taskSharesQuery.data?.sent || [],
    [taskSharesQuery.data?.sent]
  );
  const detailTaskPool = useMemo(() => {
    if (!overdueTasks.length) return tasks;
    const seen = new Set(tasks.map((task) => task.id));
    const merged = [...tasks];
    overdueTasks.forEach((task) => {
      if (seen.has(task.id)) return;
      seen.add(task.id);
      merged.push(task);
    });
    return merged;
  }, [overdueTasks, tasks]);
  const detailTask = useMemo(
    () => detailTaskPool.find((task) => task.id === detailTaskId) || null,
    [detailTaskId, detailTaskPool]
  );
  const detailTaskDraft = useMemo(
    () => (detailTask ? readTaskDraft(detailTask) : null),
    [detailTask, readTaskDraft]
  );

  useEffect(() => {
    if (!detailTaskId) return;
    if (!detailTaskPool.some((task) => task.id === detailTaskId)) {
      setDetailTaskId(null);
    }
  }, [detailTaskId, detailTaskPool]);

  useEffect(() => {
    setExpandedTasks((previous) => {
      const ids = new Set(tasks.map((task) => task.id));
      const next = Object.entries(previous).reduce<Record<string, boolean>>(
        (acc, [taskId, expanded]) => {
          if (ids.has(taskId)) acc[taskId] = expanded;
          return acc;
        },
        {}
      );
      const nextKeys = Object.keys(next);
      const previousKeys = Object.keys(previous);
      if (
        nextKeys.length === previousKeys.length &&
        nextKeys.every((key) => next[key] === previous[key])
      ) {
        return previous;
      }
      return next;
    });
  }, [tasks]);
  useEffect(() => {
    if (quickNoteQuery.isPending) return;
    if (quickNoteQuery.isError) return;
    setQuickNoteText((current) => {
      if (Object.prototype.hasOwnProperty.call(quickNoteDrafts, selectedDayIso)) {
        return quickNoteDrafts[selectedDayIso] ?? "";
      }
      const serverText = quickNoteQuery.data?.text || "";
      return current === serverText ? current : serverText;
    });
  }, [
    quickNoteDrafts,
    quickNoteQuery.data?.text,
    quickNoteQuery.isError,
    quickNoteQuery.isPending,
    selectedDayIso,
  ]);
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
  const sharedHabits = useMemo(() => {
    const configured =
      onboardingQuery.data?.preferences.sharedHabits ||
      FIXED_SHARED_HABITS.map((habit) => ({ ...habit, enabled: true }));
    return configured
      .filter((habit) => habit.enabled !== false)
      .map((habit) => ({
        ...habit,
        label: getHabitDisplayLabel(habit.key, habit.label),
      }));
  }, [onboardingQuery.data?.preferences.sharedHabits]);

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
      if (isMergedBibleHabitName(name)) return;
      const canonical = canonicalHabitKey(name);
      if (!seen.has(canonical)) seen.set(canonical, habit);
    });
    return Array.from(seen.values());
  }, [customHabitsRaw]);

  const dailyHabits = useMemo<DailyHabitItem[]>(() => {
    const fixed: DailyHabitItem[] = sharedHabits.filter((habit) =>
      isHabitScheduledOnDate(habit.key, selectedDayIso, meetingDays, familyDay)
    ).map((habit) => {
      const taskIds = tasksForDay
        .filter((task) => taskTitleMatchesHabit(task.title, habit))
        .map((task) => task.id);
      return {
        id: `fixed:${habit.key}`,
        label: habit.label,
        kind: "fixed" as const,
        key: habit.key,
        done: isHabitEntryDone(dayEntry as Record<string, unknown>, habit.key),
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
  }, [customDone, customHabits, dayEntry, familyDay, meetingDays, selectedDayIso, sharedHabits, tasksForDay]);
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
      typeof draft.areaTag === "string" &&
      draft.areaTag !== (task.areaTag || "")
    ) {
      patch.area_tag = draft.areaTag || null;
    }
    if (
      typeof draft.scheduleLocked === "boolean" &&
      draft.scheduleLocked !== Boolean(task.scheduleLocked)
    ) {
      patch.schedule_locked = draft.scheduleLocked ? 1 : 0;
    }
    if (
      typeof draft.scheduledDate === "string" &&
      draft.scheduledDate !== (task.scheduledDate || "")
    ) {
      patch.scheduled_date = draft.scheduledDate || null;
      if (!draft.scheduledDate) {
        patch.scheduled_time = null;
        patch.planned_time = null;
      }
    }
    if (
      typeof draft.scheduledTime === "string" &&
      draft.scheduledTime !== (task.scheduledTime || "")
    ) {
      patch.scheduled_time = draft.scheduledTime || null;
      if (draft.scheduledTime) {
        patch.schedule_locked = 1;
      }
    }
    if (
      typeof draft.plannedTime === "string" &&
      draft.plannedTime !== (task.plannedTime || task.scheduledTime || "")
    ) {
      patch.planned_time = draft.plannedTime || null;
      patch.scheduled_time = draft.plannedTime || null;
      if (draft.plannedTime) {
        patch.schedule_locked = 1;
      }
    }
    if (
      typeof draft.startTime === "string" &&
      draft.startTime !== (task.startTime || "")
    ) {
      patch.start_time = draft.startTime || null;
    }
    if (
      typeof draft.endTime === "string" &&
      draft.endTime !== (task.endTime || "")
    ) {
      patch.end_time = draft.endTime || null;
    }
    if (
      typeof draft.notes === "string" &&
      draft.notes !== (task.notes || "")
    ) {
      patch.notes = draft.notes.trim() || null;
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

  const applyTaskPatchToCache = useCallback(
    (taskId: string, patch: Record<string, string | number | null>) => {
      const applyPatch = (
        previous: TaskListResponse | undefined,
        options?: { keepOverdueOnly?: boolean }
      ) => {
        if (!previous?.items) return previous;
        const patchItem = (item: TodoTask): TodoTask => {
          const nextTitle =
            typeof patch.title === "string" && patch.title ? patch.title : item.title;
          const nextPriorityTag =
            typeof patch.priority_tag === "string" || patch.priority_tag === null
              ? patch.priority_tag
              : item.priorityTag;
          const nextAreaTag =
            typeof patch.area_tag === "string" || patch.area_tag === null
              ? patch.area_tag
              : item.areaTag ?? null;
          const nextScheduleLocked =
            typeof patch.schedule_locked === "number" || patch.schedule_locked === null
              ? Boolean(patch.schedule_locked)
              : Boolean(item.scheduleLocked);
          const nextScheduledTime =
            typeof patch.scheduled_time === "string" || patch.scheduled_time === null
              ? patch.scheduled_time
              : item.scheduledTime;
          const nextScheduledDate =
            typeof patch.scheduled_date === "string" || patch.scheduled_date === null
              ? patch.scheduled_date
              : item.scheduledDate;
          const nextPlannedTime =
            typeof patch.planned_time === "string" || patch.planned_time === null
              ? patch.planned_time
              : typeof patch.scheduled_time === "string" || patch.scheduled_time === null
                ? patch.scheduled_time
                : item.plannedTime ?? item.scheduledTime ?? null;
          const nextStartTime =
            typeof patch.start_time === "string" || patch.start_time === null
              ? patch.start_time
              : item.startTime ?? null;
          const nextEndTime =
            typeof patch.end_time === "string" || patch.end_time === null
              ? patch.end_time
              : item.endTime ?? null;
          const nextNotes =
            typeof patch.notes === "string" || patch.notes === null
              ? patch.notes
              : item.notes ?? null;
          const nextEstimatedMinutes =
            typeof patch.estimated_minutes === "number" || patch.estimated_minutes === null
              ? patch.estimated_minutes
              : item.estimatedMinutes;
          const nextActualMinutes =
            typeof patch.actual_minutes === "number" || patch.actual_minutes === null
              ? patch.actual_minutes
              : item.actualMinutes;
          const nextFocusOrder =
            typeof patch.focus_order === "number" || patch.focus_order === null
              ? patch.focus_order
              : item.focusOrder ?? null;
          const nextCompletedAt =
            typeof patch.completed_at === "string" || patch.completed_at === null
              ? patch.completed_at
              : item.completedAt;
          return {
            ...item,
            title: nextTitle,
            isDone: "is_done" in patch ? (patch.is_done ? 1 : 0) : item.isDone,
            priorityTag: nextPriorityTag,
            areaTag: nextAreaTag,
            scheduleLocked: nextScheduleLocked,
            scheduledTime: nextScheduledTime,
            scheduledDate: nextScheduledDate,
            plannedTime: nextPlannedTime,
            startTime: nextStartTime,
            endTime: nextEndTime,
            notes: nextNotes,
            focusOrder: nextFocusOrder,
            estimatedMinutes: nextEstimatedMinutes,
            actualMinutes: nextActualMinutes,
            completedAt: nextCompletedAt,
          };
        };

        let foundTarget = false;
        let items = previous.items.map((item) => {
          if (item.id !== taskId) return item;
          foundTarget = true;
          return patchItem(item);
        });

        if (!options?.keepOverdueOnly) {
          if (!foundTarget) {
            const sourceTask =
              tasks.find((task) => task.id === taskId) ||
              overdueTasks.find((task) => task.id === taskId);
            if (sourceTask) {
              const nextTask = patchItem(sourceTask);
              const nextScheduledDate = nextTask.scheduledDate;
              const inCurrentRange =
                typeof nextScheduledDate === "string" &&
                nextScheduledDate >= range.start &&
                nextScheduledDate <= range.end;
              if (inCurrentRange && !nextTask.isDone) {
                items = [nextTask, ...items];
              }
            }
          }
          return {
            ...previous,
            items,
          };
        }

        return {
          ...previous,
          items: items.filter((item) =>
            item.scheduledDate
              ? item.scheduledDate >= overdueRange.start &&
                item.scheduledDate <= overdueRange.end &&
                item.scheduledDate !== tomorrowFromSelectedIso
              : false
          ),
        };
      };

      queryClient.setQueryData<TaskListResponse | undefined>(
        ["tasks", range.start, range.end],
        (previous: TaskListResponse | undefined) => applyPatch(previous)
      );
      queryClient.setQueryData<TaskListResponse | undefined>(
        ["tasks-overdue", overdueRange.start, overdueRange.end],
        (previous: TaskListResponse | undefined) =>
          applyPatch(previous, { keepOverdueOnly: true })
      );
    },
    [
      overdueRange.end,
      overdueRange.start,
      queryClient,
      range.end,
      range.start,
      overdueTasks,
      tasks,
      tomorrowFromSelectedIso,
    ]
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
      const draft = readTaskDraft(task);
      const sentShare = activeSentShareByTaskId.get(task.id);
      const isSharedReceived =
        task.source === "shared" || task.source === "google_shared";
      const isSharedPending = sentShare?.status === "pending";
      const isSharedAccepted = sentShare?.status === "accepted";
      const isStarted = !draft.isDone && Boolean(draft.startTime) && !draft.endTime;
      const needsFinish = !draft.isDone && Boolean(draft.startTime) && Boolean(draft.endTime);
      const start = `${task.scheduledDate}T${task.scheduledTime}:00`;
      const startDate = new Date(start);
      const endDate = new Date(
        startDate.getTime() + (task.estimatedMinutes || 30) * 60000
      );
      const end = format(endDate, "yyyy-MM-dd'T'HH:mm:ss");
      let backgroundColor = draft.isDone
        ? "rgba(127, 211, 165, 0.76)"
        : "rgba(143, 123, 179, 0.64)";
      let borderColor = draft.isDone
        ? "rgba(127, 211, 165, 0.95)"
        : "rgba(143, 123, 179, 0.95)";
      let textColor = draft.isDone ? "#102418" : "#F5F1EA";
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
      } else if (isStarted) {
        backgroundColor = "rgba(221, 169, 82, 0.72)";
        borderColor = "rgba(235, 194, 116, 0.98)";
        textColor = "#211507";
      } else if (needsFinish) {
        backgroundColor = "rgba(176, 118, 93, 0.72)";
        borderColor = "rgba(229, 158, 128, 0.96)";
        textColor = "#fff5ec";
      }
      return {
        id: task.id,
        title: task.title,
        start,
        end,
        classNames: [
          draft.isDone ? "task-done" : "task-pending",
          isStarted ? "task-started" : "",
          needsFinish ? "task-needs-finish" : "",
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
    mutationFn: (input: CreateTaskInput) =>
      fetchJson<{ task: TodoTask; warning?: string | null }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          scheduled_date: input.scheduledDate,
          scheduled_time: input.scheduledTime,
          planned_time: input.scheduledTime,
          priority_tag: input.priorityTag,
          area_tag: input.areaTag || null,
          schedule_locked: input.scheduleLocked ? 1 : 0,
          estimated_minutes: input.estimatedMinutes,
          sync_google: false,
        }),
      }),
    onSuccess: (payload, variables) => {
      lastCreateAttemptRef.current = null;
      setTaskSaveError(payload.warning || null);
      queryClient.setQueryData<TaskListResponse | undefined>(
        ["tasks", range.start, range.end],
        (current) => {
          if (!payload?.task) return current;
          if (!current) {
            return { items: [payload.task], warning: null };
          }
          if (current.items.some((item) => item.id === payload.task.id)) {
            return current;
          }
          return {
            ...current,
            items: [...current.items, payload.task],
          };
        }
      );
      if (variables.shareWithPartner && payload?.task?.id) {
        shareTaskWithPartner.mutate(payload.task.id);
      }
      setPendingAutoPlanReason("new-task");
      if (variables.scheduledDate && variables.scheduledDate !== selectedDayIso) {
        setSelectedDate(new Date(`${variables.scheduledDate}T12:00:00`));
      }
      void queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error) => {
      const lastAttempt = lastCreateAttemptRef.current;
      if (lastAttempt) {
        setNewTitle((current) => current || lastAttempt.title);
        setNewDate(lastAttempt.scheduledDate);
        setNewTime(lastAttempt.scheduledTime || "");
        setNewPriorityTag(lastAttempt.priorityTag);
        setNewAreaTag(lastAttempt.areaTag || "");
        setNewScheduleLocked(lastAttempt.scheduleLocked);
        setNewEst(lastAttempt.estimatedMinutes);
        setShareOnCreate(lastAttempt.shareWithPartner);
        lastCreateAttemptRef.current = null;
      }
      setTaskSaveError(readErrorMessage(error, "Couldn't add task."));
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
      setTaskSaveError(readErrorMessage(error, "Couldn't update habit."));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["day", selectedDayIso] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["couple-streaks"] });
      queryClient.invalidateQueries({ queryKey: ["spiritual-streaks"] });
      queryClient.invalidateQueries({ queryKey: ["rewards"] });
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
      setTaskSaveError(readErrorMessage(error, "Couldn't update habit."));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-habits-done", selectedDayIso] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["couple-streaks"] });
      queryClient.invalidateQueries({ queryKey: ["rewards"] });
      queryClient.invalidateQueries({ queryKey: ["init"] });
    },
  });

  const syncHabitFromTaskState = useCallback(
    (task: TodoTask, checked: boolean) => {
      if (task.source !== "habit") return;
      if (!task.scheduledDate || task.scheduledDate !== selectedDayIso) return;
      const canonicalTitle = canonicalHabitKey(task.title);
      const linkedHabit = dailyHabits.find(
        (habit) => taskTitleMatchesHabit(canonicalTitle, habit)
      );
      if (!linkedHabit) return;
      if (linkedHabit.kind === "fixed") {
        updateDayHabit.mutate({ [linkedHabit.key]: checked ? 1 : 0 });
        return;
      }
      updateCustomHabitDone.mutate({
        ...customDone,
        [linkedHabit.key]: checked ? 1 : 0,
      });
    },
    [customDone, dailyHabits, selectedDayIso, updateCustomHabitDone, updateDayHabit]
  );

  const createHabitTask = useMutation({
    mutationFn: ({
      title,
      scheduledTime,
      estimatedMinutes,
      areaTag,
    }: {
      title: string;
      scheduledTime?: string | null;
      estimatedMinutes?: number;
      areaTag?: string;
    }) =>
      fetchJson<{ task: TodoTask; warning?: string | null }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          source: "habit",
          scheduled_date: selectedDayIso,
          scheduled_time: scheduledTime || null,
          planned_time: scheduledTime || null,
          estimated_minutes: estimatedMinutes || 30,
          area_tag: areaTag || null,
          sync_google: false,
        }),
      }),
    onSuccess: (payload) => {
      setTaskSaveError(payload.warning || null);
      setPendingAutoPlanReason("new-task");
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error) => {
      setTaskSaveError(readErrorMessage(error, "Couldn't add to agenda."));
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
      queryClient.invalidateQueries({
        queryKey: ["tasks-overdue", overdueRange.start, overdueRange.end],
      });
    },
    onError: (error, _taskIds, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["tasks", range.start, range.end], context.previous);
      }
      setTaskSaveError(readErrorMessage(error, "Couldn't hide habit."));
    },
  });

  const saveQuickNote = useMutation({
    mutationFn: ({ date, text }: { date: string; text: string }) =>
      fetchJson<{ ok: boolean }>(`/api/settings/quick-notes/${date}`, {
        method: "PUT",
        body: JSON.stringify({ text }),
      }),
    onMutate: async ({ date, text }) => {
      setTaskSaveError(null);
      await queryClient.cancelQueries({ queryKey: ["quick-note", date] });
      const previous = queryClient.getQueryData<QuickNoteResponse>([
        "quick-note",
        date,
      ]);
      queryClient.setQueryData(["quick-note", date], { text });
      setQuickNoteDrafts((prev) => ({ ...prev, [date]: text }));
      return { previous, date, text };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ["quick-note", context.date],
          context.previous
        );
      }
      setTaskSaveError(readErrorMessage(error, "Couldn't save notes."));
      setQuickNoteSavedAt(null);
    },
    onSuccess: (_data, _variables, context) => {
      setQuickNoteSavedAt(Date.now());
      if (!context) return;
      setQuickNoteDrafts((prev) => {
        if (prev[context.date] !== context.text) return prev;
        const next = { ...prev };
        delete next[context.date];
        return next;
      });
    },
    onSettled: (_data, _error, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ["quick-note", context?.date || variables?.date || selectedDayIso] });
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
      queryClient.invalidateQueries({
        queryKey: ["tasks-overdue", overdueRange.start, overdueRange.end],
      });
    },
    onError: (error) => {
      setTaskSaveError(readErrorMessage(error, "Couldn't update task."));
    },
  });

  const createTaskArea = useMutation({
    mutationFn: (label: string) =>
      fetchJson<{ area: TaskAreaTag; items: TaskAreaTag[] }>("/api/task-areas", {
        method: "POST",
        body: JSON.stringify({ label }),
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData<TaskAreasResponse>(["task-areas"], {
        items: payload.items,
      });
      setTaskSaveError(null);
    },
    onError: (error) => {
      setTaskSaveError(readErrorMessage(error, "Couldn't add area."));
    },
  });

  const handleCreateTaskArea = useCallback(
    async (label: string) => {
      try {
        const payload = await createTaskArea.mutateAsync(label);
        return payload.area;
      } catch {
        return null;
      }
    },
    [createTaskArea]
  );

  const saveTaskProgressPatch = useCallback(
    (
      task: TodoTask,
      patch: Record<string, string | number | null>
    ) => {
      const cacheSnapshot = queryClient.getQueryData<TaskListResponse>([
        "tasks",
        range.start,
        range.end,
      ]);
      applyTaskPatchToCache(task.id, patch);
      setSavingTaskId(task.id);
      updateTask.mutate(
        { id: task.id, data: patch, syncGoogle: false },
        {
          onSuccess: () => {
            setTaskSaveError(null);
            clearTaskDraft(task.id);
            setSavingTaskId(null);
            setSavedTaskId(task.id);
            window.setTimeout(() => {
              setSavedTaskId((prev) => (prev === task.id ? null : prev));
            }, 900);
          },
          onError: (error) => {
            if (cacheSnapshot) {
              queryClient.setQueryData<TaskListResponse>(
                ["tasks", range.start, range.end],
                cacheSnapshot
              );
            }
            setTaskSaveError(readErrorMessage(error, "Couldn't update progress."));
            setSavingTaskId(null);
          },
        }
      );
    },
    [
      applyTaskPatchToCache,
      clearTaskDraft,
      queryClient,
      range.end,
      range.start,
      updateTask,
    ]
  );

  const handleTaskAreaChange = useCallback(
    (task: TodoTask, areaKey: string) => {
      const nextAreaTag = areaKey || "";
      setTaskDraft(task.id, { areaTag: nextAreaTag });
      if ((task.areaTag || "") === nextAreaTag) return;
      const patch = { area_tag: nextAreaTag || null };
      applyTaskPatchToCache(task.id, patch);
      setSavingTaskId(task.id);
      updateTask.mutate(
        { id: task.id, data: patch, syncGoogle: false },
        {
          onSuccess: () => {
            setTaskSaveError(null);
            setSavingTaskId(null);
            setSavedTaskId(task.id);
            window.setTimeout(() => {
              setSavedTaskId((prev) => (prev === task.id ? null : prev));
            }, 900);
          },
          onError: () => {
            setSavingTaskId(null);
          },
        }
      );
    },
    [applyTaskPatchToCache, setTaskDraft, updateTask]
  );

  const handleTaskPriorityChange = useCallback(
    (task: TodoTask, priorityTag: string) => {
      const nextPriorityTag = priorityTag || "Medium";
      setTaskDraft(task.id, { priorityTag: nextPriorityTag });
      if ((task.priorityTag || "Medium") === nextPriorityTag) return;
      const patch = { priority_tag: nextPriorityTag };
      applyTaskPatchToCache(task.id, patch);
      setSavingTaskId(task.id);
      updateTask.mutate(
        { id: task.id, data: patch, syncGoogle: false },
        {
          onSuccess: () => {
            setTaskSaveError(null);
            setSavingTaskId(null);
            setSavedTaskId(task.id);
            window.setTimeout(() => {
              setSavedTaskId((prev) => (prev === task.id ? null : prev));
            }, 900);
          },
          onError: () => {
            setSavingTaskId(null);
          },
        }
      );
    },
    [applyTaskPatchToCache, setTaskDraft, updateTask]
  );

  const handleCreateTaskAreaForTask = useCallback(
    async (task: TodoTask, label: string) => {
      const area = await handleCreateTaskArea(label);
      if (!area) return null;
      handleTaskAreaChange(task, area.key);
      return area;
    },
    [handleCreateTaskArea, handleTaskAreaChange]
  );

  const handleTaskScheduleLockToggle = useCallback(
    (task: TodoTask, locked: boolean) => {
      setTaskDraft(task.id, { scheduleLocked: locked });
      if (Boolean(task.scheduleLocked) === locked) return;
      const patch = { schedule_locked: locked ? 1 : 0 };
      applyTaskPatchToCache(task.id, patch);
      setSavingTaskId(task.id);
      updateTask.mutate(
        { id: task.id, data: patch, syncGoogle: false },
        {
          onSuccess: () => {
            setTaskSaveError(null);
            setSavingTaskId(null);
            setSavedTaskId(task.id);
            window.setTimeout(() => {
              setSavedTaskId((prev) => (prev === task.id ? null : prev));
            }, 900);
          },
          onError: () => {
            setSavingTaskId(null);
          },
        }
      );
    },
    [applyTaskPatchToCache, setTaskDraft, updateTask]
  );

  const buildTodayPlacementPatch = useCallback(
    (task: TodoTask): Record<string, string | number | null> => {
      if (task.scheduledDate === selectedDayIso) return {};
      return {
        scheduled_date: selectedDayIso,
        scheduled_time: null,
        planned_time: null,
      };
    },
    [selectedDayIso]
  );

  const handleMarkStarted = useCallback(
    (task: TodoTask) => {
      const draft = readTaskDraft(task);
      saveTaskProgressPatch(task, {
        ...buildTodayPlacementPatch(task),
        start_time: draft.startTime || currentClockTime(),
        end_time: null,
        is_done: 0,
        completed_at: null,
      });
    },
    [buildTodayPlacementPatch, readTaskDraft, saveTaskProgressPatch]
  );

  const handleMarkNeedsFinish = useCallback(
    (task: TodoTask) => {
      const draft = readTaskDraft(task);
      const now = currentClockTime();
      saveTaskProgressPatch(task, {
        ...buildTodayPlacementPatch(task),
        start_time: draft.startTime || now,
        end_time: now,
        is_done: 0,
        completed_at: null,
      });
    },
    [buildTodayPlacementPatch, readTaskDraft, saveTaskProgressPatch]
  );

  const handleResumeTask = useCallback(
    (task: TodoTask) => {
      const draft = readTaskDraft(task);
      saveTaskProgressPatch(task, {
        ...buildTodayPlacementPatch(task),
        start_time: draft.startTime || currentClockTime(),
        end_time: null,
        is_done: 0,
        completed_at: null,
      });
    },
    [buildTodayPlacementPatch, readTaskDraft, saveTaskProgressPatch]
  );


  const updateEnergy = useMutation({
    mutationFn: (payload: {
      low_energy_mode?: boolean;
      task_effort?: { id: string; effort: EffortLevel | null };
      habit_effort?: { id: string; effort: EffortLevel | null };
    }) =>
      fetchJson<EnergyResponse>("/api/energy", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["energy-settings"] });
      const previous = queryClient.getQueryData<EnergyResponse>(["energy-settings"]);
      queryClient.setQueryData<EnergyResponse>(["energy-settings"], (current) => {
        const base = current || { lowEnergyMode: false, taskEffort: {}, habitEffort: {} };
        const next: EnergyResponse = {
          lowEnergyMode:
            typeof payload.low_energy_mode === "boolean"
              ? payload.low_energy_mode
              : base.lowEnergyMode,
          taskEffort: { ...base.taskEffort },
          habitEffort: { ...base.habitEffort },
        };
        if (payload.task_effort) {
          if (payload.task_effort.effort) next.taskEffort[payload.task_effort.id] = payload.task_effort.effort;
          else delete next.taskEffort[payload.task_effort.id];
        }
        if (payload.habit_effort) {
          if (payload.habit_effort.effort) next.habitEffort[payload.habit_effort.id] = payload.habit_effort.effort;
          else delete next.habitEffort[payload.habit_effort.id];
        }
        return next;
      });
      return { previous };
    },
    onError: (error, _payload, context) => {
      if (context?.previous) queryClient.setQueryData(["energy-settings"], context.previous);
      setTaskSaveError(readErrorMessage(error, "Couldn't save energy mode."));
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["energy-settings"], data);
    },
  });

  const setTaskEffort = useCallback(
    (taskId: string, effort: EffortLevel) => {
      updateEnergy.mutate({ task_effort: { id: taskId, effort } });
    },
    [updateEnergy]
  );

  const toggleLowEnergyMode = useCallback(() => {
    updateEnergy.mutate({ low_energy_mode: !lowEnergyMode });
  }, [lowEnergyMode, updateEnergy]);

  const reorderFocusTasks = useMutation({
    mutationFn: async (updates: FocusOrderUpdate[]) => {
      await Promise.all(
        updates.map((item) => {
          const body: Record<string, string | number | boolean | null> = {
            focus_order: item.focusOrder,
          };
          if ("scheduledDate" in item) body.scheduled_date = item.scheduledDate ?? null;
          if ("scheduledTime" in item) body.scheduled_time = item.scheduledTime ?? null;
          if ("plannedTime" in item) body.planned_time = item.plannedTime ?? null;
          if ("scheduleLocked" in item) {
            body.schedule_locked =
              item.scheduleLocked === null
                ? null
                : item.scheduleLocked
                  ? 1
                  : 0;
          }
          body.sync_google = false;
          return fetchJson(`/api/tasks/${item.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        })
      );
    },
    onMutate: async (updates) => {
      setTaskSaveError(null);
      await queryClient.cancelQueries({ queryKey: ["tasks", range.start, range.end] });
      const previous = queryClient.getQueryData<TaskListResponse>([
        "tasks",
        range.start,
        range.end,
      ]);
      const updateMap = new Map(updates.map((item) => [item.id, item]));
      queryClient.setQueryData(
        ["tasks", range.start, range.end],
        (old: TaskListResponse | undefined) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((item) => {
              const update = updateMap.get(item.id);
              if (!update) return item;
              return {
                ...item,
                focusOrder: update.focusOrder,
                scheduledDate:
                  "scheduledDate" in update ? update.scheduledDate : item.scheduledDate,
                scheduledTime:
                  "scheduledTime" in update ? update.scheduledTime : item.scheduledTime,
                plannedTime: "plannedTime" in update ? update.plannedTime : item.plannedTime,
                scheduleLocked:
                  "scheduleLocked" in update
                    ? Boolean(update.scheduleLocked)
                    : item.scheduleLocked,
              };
            }),
          };
        }
      );
      return { previous };
    },
    onError: (error, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["tasks", range.start, range.end], context.previous);
      }
      setTaskSaveError(readErrorMessage(error, "Couldn't reorder tasks."));
    },
    onSuccess: () => {
      setTaskSaveError(null);
      router.refresh();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
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
        readErrorMessage(error, "Couldn't update estimate.")
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
      setTaskSaveError(readErrorMessage(error, "Couldn't share task."));
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
      setTaskSaveError(readErrorMessage(error, "Couldn't unshare task."));
    },
  });

  const acceptTaskShare = useMutation({
    mutationFn: (inviteId: string) =>
      fetchJson<{ invite: TaskShareInvite }>(`/api/task-shares/${inviteId}/accept`, {
        method: "POST",
      }),
    onSuccess: () => {
      setTaskSaveError(null);
      setTaskShareNotice("Invite accepted.");
      queryClient.invalidateQueries({ queryKey: ["task-shares"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
      queryClient.invalidateQueries({ queryKey: ["init"] });
    },
    onError: (error) => {
      setTaskShareNotice(null);
      setTaskSaveError(readErrorMessage(error, "Couldn't accept invite."));
    },
  });

  const declineTaskShare = useMutation({
    mutationFn: (inviteId: string) =>
      fetchJson<{ invite: TaskShareInvite }>(`/api/task-shares/${inviteId}/decline`, {
        method: "POST",
      }),
    onSuccess: () => {
      setTaskSaveError(null);
      setTaskShareNotice("Invite declined.");
      queryClient.invalidateQueries({ queryKey: ["task-shares"] });
    },
    onError: (error) => {
      setTaskShareNotice(null);
      setTaskSaveError(readErrorMessage(error, "Couldn't decline invite."));
    },
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/tasks/${id}`, {
        method: "DELETE",
      }),
    onMutate: async (taskId) => {
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
            items: old.items.filter((item) => item.id !== taskId),
          };
        }
      );
      setTaskDrafts((current) => {
        if (!current[taskId]) return current;
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      setExpandedTasks((current) => {
        if (!(taskId in current)) return current;
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      if (detailTaskId === taskId) {
        setDetailTaskId(null);
      }
      if (wheelResultTaskId === taskId) {
        setWheelResultTaskId(null);
      }
      if (wheelLastTaskId === taskId) {
        setWheelLastTaskId(null);
      }
      return { previous };
    },
    onSuccess: () => {
      setTaskSaveError(null);
    },
    onError: (error, _taskId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ["tasks", range.start, range.end],
          context.previous
        );
      }
      setTaskSaveError(readErrorMessage(error, "Couldn't delete task."));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
  });

  const createSubtask = useMutation({
    mutationFn: ({ taskId, title, order }: { taskId: string; title: string; order?: number }) =>
      fetchJson<{ subtask: TodoSubtaskItem }>("/api/subtasks", {
        method: "POST",
        body: JSON.stringify({
          task_id: taskId,
          title,
          order,
        }),
      }),
    onSuccess: () => {
      setTaskSaveError(null);
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error) => {
      setTaskSaveError(readErrorMessage(error, "Couldn't add subtask."));
    },
  });

  const updateSubtaskMutation = useMutation({
    mutationFn: ({
      subtaskId,
      data,
    }: {
      subtaskId: string;
      data: Record<string, string | number | null>;
    }) =>
      fetchJson<{ subtask: TodoSubtaskItem }>(`/api/subtasks/${subtaskId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setTaskSaveError(null);
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error) => {
      setTaskSaveError(readErrorMessage(error, "Couldn't update subtask."));
    },
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: (subtaskId: string) =>
      fetchJson(`/api/subtasks/${subtaskId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setTaskSaveError(null);
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
    onError: (error) => {
      setTaskSaveError(readErrorMessage(error, "Couldn't delete subtask."));
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
      setTaskSaveError("Couldn't start reconnect.");
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
        setTaskSaveError("Google expired. Redirecting…");
        triggerGoogleReconnect();
        return;
      }
      setTaskSaveError(readErrorMessage(error, "Couldn't sync."));
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
      const cacheSnapshot = queryClient.getQueryData<TaskListResponse>([
        "tasks",
        range.start,
        range.end,
      ]);
      applyTaskPatchToCache(task.id, patch);
      setSavingTaskId(task.id);
      updateTask.mutate(
        { id: task.id, data: patch },
        {
          onSuccess: () => {
            setTaskSaveError(null);
            clearTaskDraft(task.id);
            setSavingTaskId(null);
            setSavedTaskId(task.id);
            if (
              typeof patch.scheduled_date === "string" &&
              patch.scheduled_date &&
              patch.scheduled_date !== selectedDayIso
            ) {
              setSelectedDate(new Date(`${patch.scheduled_date}T12:00:00`));
            }
            window.setTimeout(() => {
              setSavedTaskId((prev) => (prev === task.id ? null : prev));
            }, 1400);
          },
          onError: (error) => {
            if (cacheSnapshot) {
              queryClient.setQueryData<TaskListResponse>(
                ["tasks", range.start, range.end],
                cacheSnapshot
              );
            }
            setTaskSaveError(
              readErrorMessage(error, "Couldn't save task.")
            );
            setSavingTaskId(null);
          },
        }
      );
    },
    [
      applyTaskPatchToCache,
      buildTaskPatch,
      clearTaskDraft,
      queryClient,
      range.end,
      range.start,
      selectedDayIso,
      taskDrafts,
      updateTask,
    ]
  );

  const toggleTaskDoneNow = useCallback((
    task: TodoTask,
    checked: boolean,
    actualMinutes?: number | null
  ) => {
    const draft = readTaskDraft(task);
    const cacheSnapshot = queryClient.getQueryData<TaskListResponse>([
      "tasks",
      range.start,
      range.end,
    ]);
    const patch: Record<string, string | number | null> = {
      is_done: checked ? 1 : 0,
      completed_at: checked ? new Date().toISOString() : null,
    };
    if (checked) {
      patch.focus_order = null;
      if (draft.startTime && !draft.endTime) {
        patch.end_time = currentClockTime();
      }
      // If a backlog task (no scheduledDate) is being marked done, anchor it
      // to today so it shows up in today's "Done" section. Without this, the
      // task stays in the unscheduled bucket — done but invisible — because
      // every per-day completed list is filtered from tasksForDay.
      if (!task.scheduledDate) {
        patch.scheduled_date = format(new Date(), "yyyy-MM-dd");
      }
    }
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
            syncHabitFromTaskState(task, checked);
            setSavingTaskId(null);
            setSavedTaskId(task.id);
            if (checked && isDissertationFrontTask(task)) {
              setNextDissertationStepDraft({
                sourceTaskId: task.id,
                title: `${task.title} - proximo passo`,
                priorityTag: draft.priorityTag || task.priorityTag || "Medium",
                areaTag: draft.areaTag || task.areaTag || "mestrado",
                estimatedMinutes: Math.max(
                  5,
                  Number(draft.estimatedMinutes || task.estimatedMinutes || 30)
                ),
              });
            } else if (!checked) {
              setNextDissertationStepDraft((current) =>
                current?.sourceTaskId === task.id ? null : current
              );
            }
          window.setTimeout(() => {
            setSavedTaskId((prev) => (prev === task.id ? null : prev));
          }, 900);
        },
        onError: (error) => {
          if (cacheSnapshot) {
            queryClient.setQueryData<TaskListResponse>(
              ["tasks", range.start, range.end],
              cacheSnapshot
            );
          }
          setTaskSaveError(
            readErrorMessage(error, "Couldn't mark task.")
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
    readTaskDraft,
    setTaskDraft,
    updateTask,
    applyTaskPatchToCache,
    clearDoneDraft,
    syncHabitFromTaskState,
  ]);

  const requestToggleTaskDone = useCallback(
    (task: TodoTask, checked: boolean) => {
      toggleTaskDoneNow(task, checked);
    },
    [toggleTaskDoneNow]
  );

  const requestToggleTaskMissed = useCallback(
    (task: TodoTask, missed: boolean) => {
      const cacheSnapshot = queryClient.getQueryData<TaskListResponse>([
        "tasks",
        range.start,
        range.end,
      ]);
      const nowIso = new Date().toISOString();
      const patch: Record<string, string | number | null> = {
        is_missed: missed ? 1 : 0,
        missed_at: missed ? nowIso : null,
      };
      if (missed) {
        // Server enforces mutual exclusion, but echo the change locally too so
        // the optimistic UI doesn't show "done + missed" simultaneously.
        patch.is_done = 0;
        patch.completed_at = null;
      }
      setTaskDraft(task.id, missed ? { isDone: false } : {});
      applyTaskPatchToCache(task.id, patch);
      setSavingTaskId(task.id);
      updateTask.mutate(
        { id: task.id, data: patch, syncGoogle: false },
        {
          onSuccess: () => {
            setTaskSaveError(null);
            setSavingTaskId(null);
            setSavedTaskId(task.id);
            window.setTimeout(() => {
              setSavedTaskId((prev) => (prev === task.id ? null : prev));
            }, 900);
          },
          onError: (error) => {
            if (cacheSnapshot) {
              queryClient.setQueryData<TaskListResponse>(
                ["tasks", range.start, range.end],
                cacheSnapshot
              );
            }
            setTaskSaveError(
              readErrorMessage(error, "Couldn't mark task as missed.")
            );
            setSavingTaskId(null);
          },
        }
      );
    },
    [
      queryClient,
      range.start,
      range.end,
      setTaskDraft,
      updateTask,
      applyTaskPatchToCache,
    ]
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      deleteTask.mutate(taskId);
    },
    [deleteTask]
  );

  const handleDeleteTaskFromDetails = useCallback(
    (taskId: string) => {
      handleDeleteTask(taskId);
      setDetailTaskId(null);
      setTaskDrafts((current) => {
        if (!current[taskId]) return current;
        const next = { ...current };
        delete next[taskId];
        return next;
      });
    },
    [handleDeleteTask]
  );

  const findTaskById = useCallback(
    (taskId: string) =>
      tasks.find((task) => task.id === taskId) ||
      overdueTasks.find((task) => task.id === taskId),
    [overdueTasks, tasks]
  );

  const isTaskLockedForBoardMove = useCallback(
    (taskId: string) => {
      const task = findTaskById(taskId);
      if (!task) return false;
      return Boolean(readTaskDraft(task).scheduleLocked);
    },
    [findTaskById, readTaskDraft]
  );

  const notifyLockedBoardMove = useCallback(() => {
    setBoardActionNotice({
      tone: "warning",
      body: formatMoveBlockedByLockNotice(),
    });
  }, []);

  const notifyBoardMoveSuccess = useCallback((kind: "toToday" | "toBacklog" | "toTop" | "toEnd") => {
    setBoardActionNotice({
      tone: "success",
      body: formatMoveNotice(kind),
    });
  }, []);

  const prepareNextDissertationStep = useCallback(() => {
    if (!nextDissertationStepDraft) return;
    const tomorrowIso = format(addDays(new Date(), 1), "yyyy-MM-dd");
    setNewTitle(nextDissertationStepDraft.title);
    setNewDate(tomorrowIso);
    setNewTime("");
    setNewPriorityTag(nextDissertationStepDraft.priorityTag || "Medium");
    setNewAreaTag(nextDissertationStepDraft.areaTag || "mestrado");
    setNewEst(Math.max(5, Number(nextDissertationStepDraft.estimatedMinutes || 30)));
    setNewScheduleLocked(false);
    setComposerAdvancedOpen(true);
    setBoardActionNotice({
      tone: "success",
      body: "Rascunho do próximo passo preparado para amanhã no composer.",
    });
    setNextDissertationStepDraft(null);
  }, [nextDissertationStepDraft]);

  const dismissNextDissertationStep = useCallback(() => {
    setNextDissertationStepDraft(null);
  }, []);

  const handleScheduleToday = useCallback(
    (taskId: string) => {
      if (isTaskLockedForBoardMove(taskId)) {
        notifyLockedBoardMove();
        return;
      }
      const payload = buildScheduleTodayPayload(selectedDayIso);
      applyTaskPatchToCache(taskId, payload);
      updateTask.mutate(
        {
          id: taskId,
          data: payload,
          syncGoogle: false,
        }
      );
      notifyBoardMoveSuccess("toToday");
    },
    [
      applyTaskPatchToCache,
      isTaskLockedForBoardMove,
      notifyBoardMoveSuccess,
      notifyLockedBoardMove,
      selectedDayIso,
      updateTask,
    ]
  );

  const handleUnscheduleToday = useCallback(
    (taskId: string) => {
      if (isTaskLockedForBoardMove(taskId)) {
        notifyLockedBoardMove();
        return;
      }
      const patch = buildUnschedulePayload();
      applyTaskPatchToCache(taskId, patch);
      updateTask.mutate({
        id: taskId,
        data: patch,
        syncGoogle: false,
      });
      notifyBoardMoveSuccess("toBacklog");
    },
    [
      applyTaskPatchToCache,
      isTaskLockedForBoardMove,
      notifyBoardMoveSuccess,
      notifyLockedBoardMove,
      updateTask,
    ]
  );

  const handleScheduleTomorrow = useCallback(
    (taskId: string) => {
      if (isTaskLockedForBoardMove(taskId)) {
        notifyLockedBoardMove();
        return;
      }
      const patch = buildScheduleTomorrowPayload(selectedDayIso);
      applyTaskPatchToCache(taskId, patch);
      updateTask.mutate({
        id: taskId,
        data: patch,
        syncGoogle: false,
      });
    },
    [
      applyTaskPatchToCache,
      isTaskLockedForBoardMove,
      notifyLockedBoardMove,
      selectedDayIso,
      updateTask,
    ]
  );

  const handleSetTaskNext = useCallback(
    (taskId: string) => {
      const target = tasks.find((task) => task.id === taskId);
      if (!target || readTaskDraft(target).isDone) return;
      if (isTaskLockedForBoardMove(taskId)) {
        notifyLockedBoardMove();
        return;
      }
      const ordered = [
        target,
        ...pendingTasks.filter((task) => task.id !== taskId),
      ];
      if (target.scheduledDate !== selectedDayIso) {
        const shiftsLockedSlots = pendingTasks.some((task) => isTaskLockedForBoardMove(task.id));
        if (shiftsLockedSlots) {
          notifyLockedBoardMove();
          return;
        }
      }
      const updates = ordered.map<FocusOrderUpdate>((task, index) => {
        const base: FocusOrderUpdate = {
          id: task.id,
          focusOrder: index + 1,
        };
        if (task.id === taskId && task.scheduledDate !== selectedDayIso) {
          const dayPatch = buildMoveToDayPatch(selectedDayIso, index + 1);
          base.scheduledDate = dayPatch.scheduled_date;
          base.scheduledTime = dayPatch.scheduled_time;
          base.plannedTime = dayPatch.planned_time;
          base.scheduleLocked = false;
        }
        return base;
      });
      reorderFocusTasks.mutate(updates);
      notifyBoardMoveSuccess("toTop");
    },
    [
      isTaskLockedForBoardMove,
      notifyBoardMoveSuccess,
      notifyLockedBoardMove,
      pendingTasks,
      readTaskDraft,
      reorderFocusTasks,
      selectedDayIso,
      tasks,
    ]
  );

  const handleMoveFocusTask = useCallback(
    (taskId: string, direction: "up" | "down") => {
      if (isTaskLockedForBoardMove(taskId)) {
        notifyLockedBoardMove();
        return;
      }
      const currentIndex = pendingTasks.findIndex((task) => task.id === taskId);
      if (currentIndex < 0) {
        handleSetTaskNext(taskId);
        return;
      }
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= pendingTasks.length) return;
      const targetTask = pendingTasks[targetIndex];
      if (targetTask && isTaskLockedForBoardMove(targetTask.id)) {
        notifyLockedBoardMove();
        return;
      }
      const ordered = [...pendingTasks];
      [ordered[currentIndex], ordered[targetIndex]] = [
        ordered[targetIndex],
        ordered[currentIndex],
      ];
      reorderFocusTasks.mutate(
        ordered.map((task, index) => ({
          id: task.id,
          focusOrder: index + 1,
        }))
      );
    },
    [
      handleSetTaskNext,
      isTaskLockedForBoardMove,
      notifyLockedBoardMove,
      pendingTasks,
      reorderFocusTasks,
    ]
  );

  const handleDragTaskStart = useCallback((taskId: string) => {
    if (isTaskLockedForBoardMove(taskId)) {
      notifyLockedBoardMove();
      return;
    }
    setDraggingTaskId(taskId);
    setDragOverTaskId(null);
  }, [isTaskLockedForBoardMove, notifyLockedBoardMove]);

  const handleDragTaskOver = useCallback((taskId: string) => {
    setDragOverTaskId((current) => (current === taskId ? current : taskId));
  }, []);

  const handleDragTaskEnd = useCallback(() => {
    setDraggingTaskId(null);
    setDragOverTaskId(null);
  }, []);

  const handleDropTask = useCallback(
    (targetTaskId: string) => {
      const sourceTaskId = draggingTaskId;
      setDraggingTaskId(null);
      setDragOverTaskId(null);
      if (!sourceTaskId || sourceTaskId === targetTaskId) return;
      if (isTaskLockedForBoardMove(sourceTaskId) || isTaskLockedForBoardMove(targetTaskId)) {
        notifyLockedBoardMove();
        return;
      }

      const targetIndex = pendingTasks.findIndex((task) => task.id === targetTaskId);
      if (targetIndex < 0) return;

      const sourceIndex = pendingTasks.findIndex((task) => task.id === sourceTaskId);
      const sourceTask = findTaskById(sourceTaskId);
      if (!sourceTask) return;

      if (sourceIndex >= 0) {
        const minIndex = Math.min(sourceIndex, targetIndex);
        const maxIndex = Math.max(sourceIndex, targetIndex);
        const crossesLocked = pendingTasks
          .slice(minIndex, maxIndex + 1)
          .some((task) => task.id !== sourceTaskId && isTaskLockedForBoardMove(task.id));
        if (crossesLocked) {
          notifyLockedBoardMove();
          return;
        }
      } else {
        const shiftsLockedSlots = pendingTasks
          .slice(targetIndex)
          .some((task) => isTaskLockedForBoardMove(task.id));
        if (shiftsLockedSlots) {
          notifyLockedBoardMove();
          return;
        }
      }

      if (sourceIndex < 0) {
        const updates: FocusOrderUpdate[] = [];
        let insertCursor = 0;
        for (let index = 0; index <= pendingTasks.length; index += 1) {
          if (index === targetIndex) {
            const dayPatch = buildMoveToDayPatch(selectedDayIso, index + 1);
            updates.push({
              id: sourceTaskId,
              focusOrder: index + 1,
              scheduledDate: dayPatch.scheduled_date,
              scheduledTime: dayPatch.scheduled_time,
              plannedTime: dayPatch.planned_time,
              scheduleLocked: false,
            });
            insertCursor += 1;
          }
          if (index < pendingTasks.length) {
            updates.push({
              id: pendingTasks[index].id,
              focusOrder: index + 1 + insertCursor,
            });
          }
        }

        reorderFocusTasks.mutate(updates);
        notifyBoardMoveSuccess("toToday");
        return;
      }

      const ordered = [...pendingTasks];
      const [moved] = ordered.splice(sourceIndex, 1);
      const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      ordered.splice(Math.max(0, insertIndex), 0, moved);

      reorderFocusTasks.mutate(
        ordered.map((task, index) => ({
          id: task.id,
          focusOrder: index + 1,
        }))
      );
    },
    [
      draggingTaskId,
      findTaskById,
      isTaskLockedForBoardMove,
      notifyBoardMoveSuccess,
      notifyLockedBoardMove,
      pendingTasks,
      reorderFocusTasks,
      selectedDayIso,
    ]
  );

  const handleDropTaskToBacklog = useCallback(() => {
    const sourceTaskId = draggingTaskId;
    setDraggingTaskId(null);
    setDragOverTaskId(null);
    if (!sourceTaskId) return;
    if (isTaskLockedForBoardMove(sourceTaskId)) {
      notifyLockedBoardMove();
      return;
    }

    const sourceTask = findTaskById(sourceTaskId);
    if (!sourceTask) return;

    const alreadyBacklog =
      !sourceTask.scheduledDate &&
      !sourceTask.scheduledTime &&
      !sourceTask.plannedTime &&
      sourceTask.focusOrder == null &&
      !sourceTask.scheduleLocked;
    if (alreadyBacklog) return;

    const patch = buildMoveToBacklogPatch();
    applyTaskPatchToCache(sourceTaskId, patch);
    updateTask.mutate({
      id: sourceTaskId,
      data: patch,
      syncGoogle: false,
    });
    notifyBoardMoveSuccess("toBacklog");
  }, [
    applyTaskPatchToCache,
    draggingTaskId,
    findTaskById,
    isTaskLockedForBoardMove,
    notifyBoardMoveSuccess,
    notifyLockedBoardMove,
    updateTask,
  ]);

  const handleDropTaskToBacklogFromRow = useCallback(
    (_targetTaskId: string) => {
      handleDropTaskToBacklog();
    },
    [handleDropTaskToBacklog]
  );

  const handleDropTaskAtEnd = useCallback(() => {
    const sourceTaskId = draggingTaskId;
    setDraggingTaskId(null);
    setDragOverTaskId(null);
    if (!sourceTaskId) return;
    if (isTaskLockedForBoardMove(sourceTaskId)) {
      notifyLockedBoardMove();
      return;
    }

    const sourceIndex = pendingTasks.findIndex((task) => task.id === sourceTaskId);
    if (sourceIndex >= 0) {
      const crossesLocked = pendingTasks
        .slice(sourceIndex + 1)
        .some((task) => isTaskLockedForBoardMove(task.id));
      if (crossesLocked) {
        notifyLockedBoardMove();
        return;
      }
      const ordered = [...pendingTasks];
      const [moved] = ordered.splice(sourceIndex, 1);
      ordered.push(moved);
      reorderFocusTasks.mutate(
        ordered.map((task, index) => ({
          id: task.id,
          focusOrder: index + 1,
        }))
      );
      notifyBoardMoveSuccess("toEnd");
      return;
    }

    const sourceTask = findTaskById(sourceTaskId);
    if (!sourceTask) return;

    const dayPatch = buildMoveToDayPatch(selectedDayIso, pendingTasks.length + 1);
    const updates: FocusOrderUpdate[] = [
      ...pendingTasks.map((task, index) => ({
        id: task.id,
        focusOrder: index + 1,
      })),
      {
        id: sourceTaskId,
        focusOrder: pendingTasks.length + 1,
        scheduledDate: dayPatch.scheduled_date,
        scheduledTime: dayPatch.scheduled_time,
        plannedTime: dayPatch.planned_time,
        scheduleLocked: false,
      },
    ];
    reorderFocusTasks.mutate(updates);
    notifyBoardMoveSuccess("toToday");
  }, [
    draggingTaskId,
    findTaskById,
    isTaskLockedForBoardMove,
    notifyBoardMoveSuccess,
    notifyLockedBoardMove,
    pendingTasks,
    reorderFocusTasks,
    selectedDayIso,
  ]);

  const handleDropTaskAtStart = useCallback(() => {
    const sourceTaskId = draggingTaskId;
    setDraggingTaskId(null);
    setDragOverTaskId(null);
    if (!sourceTaskId) return;
    if (isTaskLockedForBoardMove(sourceTaskId)) {
      notifyLockedBoardMove();
      return;
    }

    const sourceIndex = pendingTasks.findIndex((task) => task.id === sourceTaskId);
    if (sourceIndex >= 0) {
      const crossesLocked = pendingTasks
        .slice(0, sourceIndex)
        .some((task) => isTaskLockedForBoardMove(task.id));
      if (crossesLocked) {
        notifyLockedBoardMove();
        return;
      }
      const ordered = [...pendingTasks];
      const [moved] = ordered.splice(sourceIndex, 1);
      ordered.unshift(moved);
      reorderFocusTasks.mutate(
        ordered.map((task, index) => ({
          id: task.id,
          focusOrder: index + 1,
        }))
      );
      notifyBoardMoveSuccess("toTop");
      return;
    }

    const sourceTask = findTaskById(sourceTaskId);
    if (!sourceTask) return;
    const shiftsLockedSlots = pendingTasks.some((task) => isTaskLockedForBoardMove(task.id));
    if (shiftsLockedSlots) {
      notifyLockedBoardMove();
      return;
    }

    const dayPatch = buildMoveToDayPatch(selectedDayIso, 1);
    const updates: FocusOrderUpdate[] = [
      {
        id: sourceTaskId,
        focusOrder: 1,
        scheduledDate: dayPatch.scheduled_date,
        scheduledTime: dayPatch.scheduled_time,
        plannedTime: dayPatch.planned_time,
        scheduleLocked: false,
      },
      ...pendingTasks.map((task, index) => ({
        id: task.id,
        focusOrder: index + 2,
      })),
    ];
    reorderFocusTasks.mutate(updates);
    notifyBoardMoveSuccess("toToday");
  }, [
    draggingTaskId,
    findTaskById,
    isTaskLockedForBoardMove,
    notifyBoardMoveSuccess,
    notifyLockedBoardMove,
    pendingTasks,
    reorderFocusTasks,
    selectedDayIso,
  ]);

  const handleMoveTaskToEnd = useCallback(
    (taskId: string) => {
      if (isTaskLockedForBoardMove(taskId)) {
        notifyLockedBoardMove();
        return;
      }
      const sourceIndex = pendingTasks.findIndex((task) => task.id === taskId);
      if (sourceIndex >= 0) {
        const crossesLocked = pendingTasks
          .slice(sourceIndex + 1)
          .some((task) => isTaskLockedForBoardMove(task.id));
        if (crossesLocked) {
          notifyLockedBoardMove();
          return;
        }
        const ordered = [...pendingTasks];
        const [moved] = ordered.splice(sourceIndex, 1);
        ordered.push(moved);
        reorderFocusTasks.mutate(
          ordered.map((task, index) => ({
            id: task.id,
            focusOrder: index + 1,
          }))
        );
        notifyBoardMoveSuccess("toEnd");
        return;
      }

      const sourceTask = findTaskById(taskId);
      if (!sourceTask) return;
      const dayPatch = buildMoveToDayPatch(selectedDayIso, pendingTasks.length + 1);
      const updates: FocusOrderUpdate[] = [
        ...pendingTasks.map((task, index) => ({
          id: task.id,
          focusOrder: index + 1,
        })),
        {
          id: taskId,
          focusOrder: pendingTasks.length + 1,
          scheduledDate: dayPatch.scheduled_date,
          scheduledTime: dayPatch.scheduled_time,
          plannedTime: dayPatch.planned_time,
          scheduleLocked: false,
        },
      ];
      reorderFocusTasks.mutate(updates);
      notifyBoardMoveSuccess("toToday");
    },
    [
      findTaskById,
      isTaskLockedForBoardMove,
      notifyBoardMoveSuccess,
      notifyLockedBoardMove,
      pendingTasks,
      reorderFocusTasks,
      selectedDayIso,
    ]
  );

  const handleOpenTaskDetails = useCallback((taskId: string) => {
    setDetailTaskId(taskId);
  }, []);

  const handleCloseTaskDetails = useCallback(() => {
    if (detailTask) {
      confirmTaskUpdate(detailTask);
    }
    setDetailTaskId(null);
  }, [confirmTaskUpdate, detailTask]);

  const handleToggleTaskExpanded = useCallback((taskId: string, currentlyExpanded: boolean) => {
    setExpandedTasks((previous) => ({
      ...previous,
      [taskId]: !currentlyExpanded,
    }));
  }, []);

  const handleToggleSubtaskDone = useCallback(
    (task: TodoTask, subtaskId: string, checked: boolean) => {
      setSavingSubtaskId(subtaskId);
      updateSubtaskMutation.mutate(
        {
          subtaskId,
          data: {
            is_done: checked ? 1 : 0,
            completed_at: checked ? new Date().toISOString() : null,
          },
        },
        {
          onSettled: () => {
            setSavingSubtaskId((current) =>
              current === subtaskId ? null : current
            );
          },
        }
      );
      if (!isTaskExpanded(task)) {
        setExpandedTasks((previous) => ({ ...previous, [task.id]: true }));
      }
    },
    [isTaskExpanded, updateSubtaskMutation]
  );

  const handleCreateSubtask = useCallback(
    (taskId: string, title: string) => {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) return;
      const nextOrder = (task.subtasks?.length || 0) + 1;
      createSubtask.mutate({ taskId, title, order: nextOrder });
    },
    [createSubtask, tasks]
  );

  const handleRenameSubtask = useCallback(
    (subtaskId: string, title: string) => {
      setSavingSubtaskId(subtaskId);
      updateSubtaskMutation.mutate(
        { subtaskId, data: { title } },
        {
          onSettled: () => {
            setSavingSubtaskId((current) =>
              current === subtaskId ? null : current
            );
          },
        }
      );
    },
    [updateSubtaskMutation]
  );

  const handleDeleteSubtask = useCallback(
    (subtaskId: string) => {
      setSavingSubtaskId(subtaskId);
      deleteSubtaskMutation.mutate(subtaskId, {
        onSettled: () => {
          setSavingSubtaskId((current) =>
            current === subtaskId ? null : current
          );
        },
      });
    },
    [deleteSubtaskMutation]
  );

  const handleMoveSubtask = useCallback(
    (task: TodoTask, subtaskId: string, direction: "up" | "down") => {
      const ordered = [...(task.subtasks || [])].sort(
        (left, right) => Number(left.order || 0) - Number(right.order || 0)
      );
      const index = ordered.findIndex((subtask) => subtask.id === subtaskId);
      if (index < 0) return;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= ordered.length) return;
      const current = ordered[index];
      const target = ordered[targetIndex];
      const currentOrder = Number(current.order || index + 1);
      const targetOrder = Number(target.order || targetIndex + 1);

      setSavingSubtaskId(subtaskId);
      updateSubtaskMutation.mutate(
        {
          subtaskId: current.id,
          data: { order: targetOrder },
        },
        {
          onSuccess: () => {
            updateSubtaskMutation.mutate(
              {
                subtaskId: target.id,
                data: { order: currentOrder },
              },
              {
                onSettled: () => {
                  setSavingSubtaskId((currentSaving) =>
                    currentSaving === subtaskId ? null : currentSaving
                  );
                },
              }
            );
          },
          onError: () => {
            setSavingSubtaskId((currentSaving) =>
              currentSaving === subtaskId ? null : currentSaving
            );
          },
        }
      );
    },
    [updateSubtaskMutation]
  );

  const spinActivityWheel = useCallback(() => {
    if (wheelSpinning || wheelShuffling) return;
    if (!wheelSegments.length || wheelTotalWeight <= 0) {
      setWheelResultTaskId(null);
      return;
    }
    if (wheelSegments.length === 1) {
      const single = wheelSegments[0];
      setWheelResultTaskId(single.task.id);
      setWheelLastTaskId(single.task.id);
      setWheelRotation((previous) => previous + 360);
      return;
    }

    let weightCursor = Math.random() * wheelTotalWeight;
    let selectedSegment = wheelSegments[wheelSegments.length - 1];
    for (const segment of wheelSegments) {
      weightCursor -= segment.weight;
      if (weightCursor <= 0) {
        selectedSegment = segment;
        break;
      }
    }

    const safeMargin = Math.min(
      8,
      Math.max(1.5, selectedSegment.span * 0.18)
    );
    const minStop = selectedSegment.startAngle + safeMargin;
    const maxStop = selectedSegment.endAngle - safeMargin;
    const stopAngle =
      maxStop > minStop
        ? minStop + Math.random() * (maxStop - minStop)
        : selectedSegment.midAngle;

    setWheelResultTaskId(null);
    setWheelSpinning(true);
    const currentRotation = ((wheelRotation % 360) + 360) % 360;
    const targetRotationMod = (360 - stopAngle + 360) % 360;
    let delta = targetRotationMod - currentRotation;
    if (delta < 0) delta += 360;
    const finalRotation = wheelRotation + 1800 + delta;
    setWheelRotation(finalRotation);
    if (wheelSpinTimeoutRef.current) {
      window.clearTimeout(wheelSpinTimeoutRef.current);
    }
    wheelSpinTimeoutRef.current = window.setTimeout(() => {
      const resultSegment = findWheelSegmentAtPointer(wheelSegments, finalRotation);
      const resultTaskId = resultSegment?.task.id || selectedSegment.task.id;
      setWheelResultTaskId(resultTaskId);
      setWheelLastTaskId(resultTaskId);
      setWheelSpinning(false);
    }, WHEEL_SPIN_DURATION_MS);
  }, [wheelRotation, wheelSegments, wheelShuffling, wheelSpinning, wheelTotalWeight]);

  const shuffleWheelStart = useCallback(() => {
    if (wheelSpinning || wheelShuffling) return;
    if (wheelShuffleTimeoutRef.current) {
      window.clearTimeout(wheelShuffleTimeoutRef.current);
    }
    const totalShuffles = wheelShuffleCount;
    let currentShuffle = 0;

    setWheelShuffleCountInput(String(wheelShuffleCount));
    setWheelResultTaskId(null);
    setWheelShuffleProgress(0);
    setWheelShuffling(true);

    const runNextShuffle = () => {
      currentShuffle += 1;
      setWheelShuffleNonce((previous) => previous + 1);
      setWheelShuffleProgress(currentShuffle);
      setWheelRotation((previous) => previous + 60 + Math.floor(Math.random() * 140));

      if (currentShuffle >= totalShuffles) {
        wheelShuffleTimeoutRef.current = window.setTimeout(() => {
          setWheelShuffling(false);
          setWheelShuffleProgress(0);
          wheelShuffleTimeoutRef.current = null;
        }, WHEEL_SHUFFLE_STEP_MS);
        return;
      }

      wheelShuffleTimeoutRef.current = window.setTimeout(runNextShuffle, WHEEL_SHUFFLE_STEP_MS);
    };

    runNextShuffle();
  }, [wheelShuffleCount, wheelShuffling, wheelSpinning]);

  const wheelRotorStyle = useMemo(
    () =>
      ({
        transform: `rotate(${wheelRotation}deg)`,
        transition: wheelShuffling
          ? `transform ${WHEEL_SHUFFLE_STEP_MS}ms ease-out`
          : `transform ${WHEEL_SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.88, 0.16, 1)`,
      }) as CSSProperties,
    [wheelRotation, wheelShuffling]
  );

  const handleOpenWheelResult = useCallback(() => {
    if (!wheelResultTask) return;
    handleOpenTaskDetails(wheelResultTask.id);
  }, [handleOpenTaskDetails, wheelResultTask]);

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
      saveQuickNoteMutation({ date: selectedDayIso, text: quickNoteText });
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [
    quickNoteText,
    quickNoteQuery.data?.text,
    quickNoteQuery.isError,
    quickNoteQuery.isPending,
    saveQuickNoteMutation,
    selectedDayIso,
  ]);

  const handleSaveQuickNoteNow = useCallback(() => {
    saveQuickNoteMutation({ date: selectedDayIso, text: quickNoteText });
  }, [quickNoteText, saveQuickNoteMutation, selectedDayIso]);

  const handleComposerSubmit = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;

    const scheduledDate = newDate || selectedDayIso;
    const payload: CreateTaskInput = {
      title,
      scheduledDate,
      scheduledTime: newTime || null,
      priorityTag: newPriorityTag || "Medium",
      areaTag: newAreaTag,
      scheduleLocked: newScheduleLocked || Boolean(newTime),
      estimatedMinutes: newEst,
      shareWithPartner: shareOnCreate,
    };

    setTaskSaveError(null);
    lastCreateAttemptRef.current = payload;
    setNewTitle("");
    setShareOnCreate(false);
    setNewScheduleLocked(false);
    setEstimateWasTouched(false);
    setCalendarSelection(null);
    setComposerAdvancedOpen(false);

    createTask.mutate(payload);
  }, [
    createTask,
    newAreaTag,
    newDate,
    newEst,
    newPriorityTag,
    newScheduleLocked,
    newTime,
    newTitle,
    selectedDayIso,
    shareOnCreate,
  ]);

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
      const estimatedMinutes = Math.max(
        1,
        Number(habitDurationDrafts[habit.id] || defaultDurationForHabit(habit))
      );
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
        areaTag: areaTagForHabit(habit),
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

  const titleEstimateStats = useMemo(() => {
    const stats = new Map<string, { sum: number; count: number; weekdays: number[] }>();
    estimationPoints.forEach((point) => {
      const key = normalizeTaskTitleKey(point.title);
      if (!key || point.estimatedMinutes <= 0) return;
      const current = stats.get(key) || { sum: 0, count: 0, weekdays: [] };
      current.sum += point.actualMinutes > 0 ? point.actualMinutes : point.estimatedMinutes;
      current.count += 1;
      if (point.scheduledDate) {
        const date = new Date(`${point.scheduledDate}T12:00:00`);
        if (!Number.isNaN(date.getTime())) {
          current.weekdays.push(date.getDay());
        }
      }
      stats.set(key, current);
    });
    return stats;
  }, [estimationPoints]);

  const suggestedEstimate = useMemo(() => {
    const key = normalizeTaskTitleKey(newTitle);
    if (!key) return null;
    const stat = titleEstimateStats.get(key);
    if (!stat || stat.count < 3) return null;
    return Math.max(5, Math.round((stat.sum / stat.count) / 5) * 5);
  }, [newTitle, titleEstimateStats]);

  const recurringSuggestion = useMemo(() => {
    const key = normalizeTaskTitleKey(newTitle);
    if (!key) return null;
    const stat = titleEstimateStats.get(key);
    if (!stat || stat.count < 4 || stat.weekdays.length < 4) return null;
    const byDay = new Map<number, number>();
    stat.weekdays.forEach((day) => {
      byDay.set(day, (byDay.get(day) || 0) + 1);
    });
    const sorted = Array.from(byDay.entries()).sort((a, b) => b[1] - a[1]);
    const [bestDay, hits] = sorted[0] || [];
    if (bestDay === undefined || hits < 3) return null;
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `Recurring pattern detected: often on ${labels[bestDay]}.`;
  }, [newTitle, titleEstimateStats]);

  const tagStatsDaily = useMemo(() => {
    const areaLabelByKey = new Map(taskAreas.map((area) => [area.key, area.label]));
    const byTag = new Map<string, TaskTagStatsRow>();
    tasksForDay.forEach((task) => {
      const draft = readTaskDraft(task);
      const key = String(draft.areaTag || "").trim() || "__none__";
      const label = key === "__none__" ? "Sem tag" : areaLabelByKey.get(key) || key;
      if (!byTag.has(key)) {
        byTag.set(key, { key, label, planned: 0, done: 0 });
      }
      const row = byTag.get(key)!;
      row.planned += 1;
      if (draft.isDone) row.done += 1;
    });
    return Array.from(byTag.values()).sort((a, b) => b.planned - a.planned);
  }, [readTaskDraft, taskAreas, tasksForDay]);

  const tagStatsWeek = useMemo(() => {
    const areaLabelByKey = new Map(taskAreas.map((area) => [area.key, area.label]));
    const byTag = new Map<string, TaskTagStatsRow>();
    tasks
      .filter((task) => Boolean(task.scheduledDate))
      .filter((task) => {
        const date = String(task.scheduledDate || "");
        return date >= range.start && date <= range.end;
      })
      .forEach((task) => {
        const draft = readTaskDraft(task);
        const key = String(draft.areaTag || "").trim() || "__none__";
        const label = key === "__none__" ? "Sem tag" : areaLabelByKey.get(key) || key;
        if (!byTag.has(key)) {
          byTag.set(key, { key, label, planned: 0, done: 0 });
        }
        const row = byTag.get(key)!;
        row.planned += 1;
        if (draft.isDone) row.done += 1;
      });
    return Array.from(byTag.values()).sort((a, b) => b.planned - a.planned);
  }, [range.end, range.start, readTaskDraft, taskAreas, tasks]);

  useEffect(() => {
    if (estimateWasTouched) return;
    if (!suggestedEstimate) return;
    setNewEst(suggestedEstimate);
  }, [estimateWasTouched, suggestedEstimate]);

  const areaBufferFactor = useMemo(() => {
    const bucket = new Map<string, number[]>();
    const all: number[] = [];
    estimationPoints.forEach((point) => {
      if (point.estimatedMinutes <= 0 || point.actualMinutes <= 0) return;
      const ratio = point.actualMinutes / point.estimatedMinutes;
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      const areaKey = String(point.areaTag || "").trim().toLowerCase();
      if (!bucket.has(areaKey)) bucket.set(areaKey, []);
      bucket.get(areaKey)!.push(ratio);
      all.push(ratio);
    });
    const median = (values: number[]) => {
      if (!values.length) return 1;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    const fallback = Math.max(1, median(all));
    const byArea = new Map<string, number>();
    bucket.forEach((values, key) => {
      byArea.set(key, Math.max(1, median(values)));
    });
    return { byArea, fallback };
  }, [estimationPoints]);

  const requestAutoPlanning = useCallback((reason: string) => {
    setPendingAutoPlanReason(reason);
  }, []);

  const toggleNightOwlDay = useCallback(() => {
    const willEnable = !nightOwlDays[selectedDayIso];
    setNightOwlDays((current) => {
      const next = { ...current };
      if (next[selectedDayIso]) {
        delete next[selectedDayIso];
      } else {
        next[selectedDayIso] = true;
      }
      return next;
    });
    if (willEnable) {
      setNightOwlEndTimes((currentEndTimes) => ({
        ...currentEndTimes,
        [selectedDayIso]: currentEndTimes[selectedDayIso] || DEFAULT_NIGHT_OWL_END_TIME,
      }));
    }
    requestAutoPlanning("manual-time");
  }, [nightOwlDays, requestAutoPlanning, selectedDayIso]);

  const updateNightOwlEndTime = useCallback(
    (value: string) => {
      setNightOwlEndTimes((current) => ({
        ...current,
        [selectedDayIso]: value || DEFAULT_NIGHT_OWL_END_TIME,
      }));
      requestAutoPlanning("manual-time");
    },
    [requestAutoPlanning, selectedDayIso]
  );

  const runAutoPlanning = useCallback(
    (reason: string, mode: AutoPlanMode = "full") => {
      if (autoPlanningRef.current) return false;
      if (reorderFocusTasks.isPending || tasksQuery.isPending) return false;

      const allTodayPending = tasksForDay
        .filter((task) => !readTaskDraft(task).isDone)
        .sort(compareTasksForExecution);
      if (!allTodayPending.length) return true;

      if (mode === "full") {
        const inProgressTask = allTodayPending.find((task) => {
          const draft = readTaskDraft(task);
          return Boolean(draft.startTime) && !draft.endTime;
        });
        if (inProgressTask) return true;
      }

      const planningCandidates = allTodayPending.map<PlanningTaskCandidate>((task, baseIndex) => {
        const draft = readTaskDraft(task);
        return {
          task,
          draft: {
            priorityTag: draft.priorityTag,
            areaTag: draft.areaTag,
            scheduleLocked: Boolean(draft.scheduleLocked),
            scheduledDate: draft.scheduledDate || "",
            scheduledTime: draft.scheduledTime || "",
            plannedTime: draft.plannedTime || "",
            estimatedMinutes: Number(draft.estimatedMinutes || 0),
          },
          rank: priorityRank(draft.priorityTag),
          tagKey: normalizeAreaTagForPlanning(draft.areaTag),
          isLocked: Boolean(draft.scheduleLocked),
          baseIndex,
        };
      });

      const hasAnyFocusOrder = planningCandidates.some(
        (candidate) => getTaskFocusOrder(candidate.task) !== null
      );
      const candidatesForPlanning =
        mode === "time" && !hasAnyFocusOrder
          ? buildBalancedOrderWithLockedAnchors(planningCandidates)
          : planningCandidates;

      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const isManualTimeRun = mode === "time" && reason === "manual-time";
      const startMinutesByNow =
        nowMinutes +
        (isManualTimeRun ? 0 : Math.max(0, Math.round(planStartOffsetMinutes)));
      const earliestPlannedStart = allTodayPending.reduce<number | null>((current, task) => {
        const draft = readTaskDraft(task);
        const next = draft.plannedTime || draft.scheduledTime;
        if (!next) return current;
        const minutes = toMinutes(next);
        if (!Number.isFinite(minutes)) return current;
        return current === null ? minutes : Math.min(current, minutes);
      }, null);
      const todayIsoNow = format(new Date(), "yyyy-MM-dd");
      const defaultDayStartMinutes = toMinutes("08:00");
      const isSelectedDayToday = selectedDayIso === todayIsoNow;
      const startMinutes =
        mode === "time"
          ? isSelectedDayToday
            ? startMinutesByNow
            : earliestPlannedStart ?? defaultDayStartMinutes
          : isSelectedDayToday
            ? startMinutesByNow
            : earliestPlannedStart ?? defaultDayStartMinutes;
      const endMinutes = planningDayEndMinutes;
      const { updates, stats } = buildAutoPlanUpdates({
        mode,
        candidates: candidatesForPlanning,
        selectedDayIso,
        startMinutes,
        endMinutes,
        areaBufferByKey: areaBufferFactor.byArea,
        areaBufferFallback: areaBufferFactor.fallback,
      });

      const shouldReport = reason.startsWith("manual-") || reason === "new-task";
      if (shouldReport) {
        setAutoPlanNotice(formatAutoPlanNotice(mode, stats, planningDayEndTime));
      }

      if (!updates.length) return true;

      autoPlanningRef.current = true;
      reorderFocusTasks.mutate(updates as FocusOrderUpdate[], {
        onSettled: () => {
          autoPlanningRef.current = false;
        },
      });
      return true;
    },
    [
      areaBufferFactor.byArea,
      areaBufferFactor.fallback,
      planStartOffsetMinutes,
      planningDayEndMinutes,
      planningDayEndTime,
      readTaskDraft,
      reorderFocusTasks,
      selectedDayIso,
      setAutoPlanNotice,
      tasksForDay,
      tasksQuery.isPending,
    ]
  );

  useEffect(() => {
    if (!selectedDayIso || tasksQuery.isPending) return;
    try {
      const last = window.localStorage.getItem(AUTO_PLAN_DAY_KEY);
      if (last !== selectedDayIso) {
        window.localStorage.setItem(AUTO_PLAN_DAY_KEY, selectedDayIso);
        requestAutoPlanning("first-open-day");
      }
    } catch (_error) {
      requestAutoPlanning("first-open-day");
    }
  }, [requestAutoPlanning, selectedDayIso, tasksQuery.isPending]);

  useEffect(() => {
    if (!pendingAutoPlanReason) return;
    if (autoPlanningRef.current) return;
    const consumed = runAutoPlanning(pendingAutoPlanReason, "full");
    if (consumed) {
      setPendingAutoPlanReason(null);
    }
  }, [pendingAutoPlanReason, runAutoPlanning]);

  const planningActionsBusy =
    autoPlanningRef.current ||
    tasksQuery.isPending ||
    reorderFocusTasks.isPending ||
    updateTask.isPending ||
    createTask.isPending ||
    createHabitTask.isPending ||
    deleteTask.isPending;

  const handleAutoReorderNow = useCallback(() => {
    runAutoPlanning("manual-order", "order");
  }, [runAutoPlanning]);

  const handleAutoRescheduleNow = useCallback(() => {
    runAutoPlanning("manual-time", "time");
  }, [runAutoPlanning]);

  const getTaskSharePresentation = useCallback(
    (task: TodoTask) => {
      if (task.source === "shared" || task.source === "google_shared") {
        return {
          label: task.source === "google_shared" ? "Google share" : "Shared",
          canToggle: false,
          actionLabel: "Share",
        };
      }
      const sentShare = activeSentShareByTaskId.get(task.id);
      if (sentShare?.status === "pending") {
        return {
          label: `Shared · ${emailHandle(sentShare.toEmail)}`,
          canToggle: true,
          actionLabel: "Unshare",
        };
      }
      if (sentShare?.status === "accepted") {
        return {
          label: `Shared · ${emailHandle(sentShare.toEmail)}`,
          canToggle: true,
          actionLabel: "Unshare",
        };
      }
      return {
        label: null,
        canToggle: true,
        actionLabel: "Share",
      };
    },
    [activeSentShareByTaskId]
  );

  const renderTodayTaskRow = useCallback(
    (task: TodoTask) => {
      const draft = readTaskDraft(task);
      const shareUi = getTaskSharePresentation(task);
      return (
        <EditableTaskRow
          key={task.id}
          task={task}
          draft={draft}
          effort={getTaskEffort(task)}
          area={getTaskAreaMeta(draft.areaTag, taskAreas)}
          expanded={isTaskExpanded(task)}
          active={detailTaskId === task.id}
          saving={savingTaskId === task.id}
          saved={savedTaskId === task.id}
          scheduleLocked={Boolean(draft.scheduleLocked)}
          taskAreas={taskAreas}
          creatingArea={createTaskArea.isPending}
          onToggleDone={requestToggleTaskDone}
          onToggleMissed={requestToggleTaskMissed}
          onToggleExpanded={handleToggleTaskExpanded}
          onToggleSubtaskDone={handleToggleSubtaskDone}
          onOpenDetails={handleOpenTaskDetails}
          onPriorityTagChange={handleTaskPriorityChange}
          onAreaTagChange={handleTaskAreaChange}
          onToggleScheduleLock={handleTaskScheduleLockToggle}
          onCreateAreaTag={handleCreateTaskAreaForTask}
          onUnscheduleToday={handleUnscheduleToday}
          onScheduleTomorrow={handleScheduleTomorrow}
          onMoveToTop={handleSetTaskNext}
          onMoveToEnd={handleMoveTaskToEnd}
          onMoveToBacklog={handleUnscheduleToday}
          onMarkStarted={handleMarkStarted}
          onMarkNeedsFinish={handleMarkNeedsFinish}
          onResumeTask={handleResumeTask}
          onSetNext={handleSetTaskNext}
          onMoveFocus={handleMoveFocusTask}
          onDelete={handleDeleteTask}
          onShare={shareUi.canToggle ? handleShareTask : undefined}
          sharing={sharingTaskId === task.id}
          contextDate={selectedDayIso}
          nowTick={nowTick}
          focusPosition={executionPositionByTaskId.get(task.id) || null}
          canMoveFocusUp={(executionPositionByTaskId.get(task.id) || 0) > 1}
          canMoveFocusDown={(executionPositionByTaskId.get(task.id) || 0) < pendingTasks.length}
          showOrderControls={pendingTasks.length > 1}
          showInlineNext={pendingTasks[0]?.id !== task.id}
          subtaskSavingId={savingSubtaskId}
          shareLabel={shareUi.label}
          shareActionLabel={shareUi.actionLabel}
          draggable={!draft.scheduleLocked && pendingTasks.length > 0}
          dragging={draggingTaskId === task.id}
          dropTarget={Boolean(draggingTaskId && dragOverTaskId === task.id && draggingTaskId !== task.id)}
          onDragStartTask={handleDragTaskStart}
          onDragOverTask={handleDragTaskOver}
          onDropTask={handleDropTask}
          onDragEndTask={handleDragTaskEnd}
          showMobileMoveActions={!draft.isDone}
        />
      );
    },
    [
      createTaskArea.isPending,
      detailTaskId,
      dragOverTaskId,
      draggingTaskId,
      executionPositionByTaskId,
      getTaskEffort,
      handleCreateTaskAreaForTask,
      handleDeleteTask,
      handleDragTaskEnd,
      handleDragTaskOver,
      handleDragTaskStart,
      handleMarkNeedsFinish,
      handleMarkStarted,
      handleMoveFocusTask,
      handleMoveTaskToEnd,
      handleOpenTaskDetails,
      handleResumeTask,
      handleScheduleTomorrow,
      handleSetTaskNext,
      handleDropTask,
      handleShareTask,
      handleTaskAreaChange,
      handleTaskPriorityChange,
      handleTaskScheduleLockToggle,
      handleToggleSubtaskDone,
      handleToggleTaskExpanded,
      getTaskSharePresentation,
      isTaskExpanded,
      pendingTasks,
      readTaskDraft,
      requestToggleTaskDone,
      requestToggleTaskMissed,
      savingSubtaskId,
      savingTaskId,
      savedTaskId,
      selectedDayIso,
      nowTick,
      sharingTaskId,
      taskAreas,
      handleUnscheduleToday,
    ]
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

  const detailShareUi = useMemo(
    () => (detailTask ? getTaskSharePresentation(detailTask) : null),
    [detailTask, getTaskSharePresentation]
  );

  return (
    <div className="calendar-layout">
      <div className="task-list">
        <div className="task-header calm">
          <div>
            <p className="panel-kicker">Today</p>
            <h2>Agenda</h2>
              <p className="task-header-meta">
              {completedTaskRows.length}/{tasksForDay.length} done
              </p>
          </div>
          <div className="task-header-actions">
            <button
              className={`secondary subtle ${lowEnergyMode ? "active" : ""}`}
              type="button"
              onClick={toggleLowEnergyMode}
              aria-pressed={lowEnergyMode}
            >
              Low energy
            </button>
            {syncStatus !== "idle" ? (
              <span className={`sync-status ${syncStatus}`}>
                {syncStatus === "syncing" ? "Syncing…" : "Sync failed"}
              </span>
            ) : null}
            <button className="secondary subtle" type="button" onClick={syncNow}>
              Sync
            </button>
          </div>
        </div>

        <TaskComposer
          title={newTitle}
          date={newDate}
          time={newTime}
          estimate={newEst}
          priorityTag={newPriorityTag}
          areaTag={newAreaTag}
          scheduleLocked={newScheduleLocked}
          startOffsetMinutes={planStartOffsetMinutes}
          areaOptions={taskAreas.map((area) => ({ key: area.key, label: area.label }))}
          shareWithPartner={shareOnCreate}
          advancedOpen={composerAdvancedOpen}
          selectionLabel={composerSelectionLabel}
          pending={createTask.isPending}
          onSubmit={handleComposerSubmit}
          onTitleChange={(value) => {
            setNewTitle(value);
            if (!value.trim()) {
              setEstimateWasTouched(false);
              setNewEst(30);
            }
          }}
          onDateChange={(value) => setNewDate(value)}
          onTimeChange={(value) => setNewTime(value)}
          onEstimateChange={(value) => {
            setEstimateWasTouched(true);
            setNewEst(value);
          }}
          onPriorityTagChange={(value) => setNewPriorityTag(value)}
          onAreaTagChange={(value) => setNewAreaTag(value)}
          onScheduleLockedChange={(checked) => setNewScheduleLocked(checked)}
          onStartOffsetMinutesChange={(value) => setPlanStartOffsetMinutes(value)}
          onShareChange={(checked) => setShareOnCreate(checked)}
          onToggleAdvanced={() => setComposerAdvancedOpen((current) => !current)}
          onClearSelection={clearCalendarSelection}
          onCancel={handleComposerCancel}
        />
        {suggestedEstimate ? (
          <p className="task-composer-smart-hint">
            Suggested estimate: {suggestedEstimate} min from similar past tasks.
          </p>
        ) : null}
        {recurringSuggestion ? (
          <p className="task-composer-smart-hint">{recurringSuggestion}</p>
        ) : null}

        <div className="calendar-status-rail">
          {tasksQuery.isPending ? (
            <div className="query-status quiet">Loading…</div>
          ) : null}
          {tasksQuery.isError ? (
            <InlineActionNotice
              tone="error"
              title="Couldn't load tasks"
              body="Refresh to try again."
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
              body="Reconnect Google to sync."
              actionLabel={reconnectingGoogle ? "Redirecting..." : "Reconnect"}
              onAction={triggerGoogleReconnect}
            />
          ) : null}
          {taskSaveError ? <InlineActionNotice tone="warning" body={taskSaveError} /> : null}
          {nextDissertationStepDraft ? (
            <InlineActionNotice
              tone="default"
              body="Frente da dissertação concluída. Quer preparar o próximo passo para amanhã?"
              actionLabel="Preparar"
              onAction={prepareNextDissertationStep}
              secondaryLabel="Dispensar"
              onSecondary={dismissNextDissertationStep}
            />
          ) : null}
          {boardActionNotice ? (
            <InlineActionNotice tone={boardActionNotice.tone} body={boardActionNotice.body} />
          ) : null}
          {taskShareNotice ? <InlineActionNotice tone="success" body={taskShareNotice} /> : null}
        </div>

        <TaskDetailSheet
          open={Boolean(detailTask && detailTaskDraft)}
          task={detailTask}
          draft={detailTaskDraft}
          saving={Boolean(detailTask && savingTaskId === detailTask.id)}
          subtaskSavingId={savingSubtaskId}
          shareLabel={detailShareUi?.label || null}
          shareActionLabel={detailShareUi?.actionLabel || "Share"}
          sharing={Boolean(detailTask && sharingTaskId === detailTask.id)}
          canShare={Boolean(detailShareUi?.canToggle)}
          taskAreas={taskAreas}
          creatingArea={createTaskArea.isPending}
          effort={detailTask ? getTaskEffort(detailTask) : "medium"}
          onClose={handleCloseTaskDetails}
          onSetDraft={setTaskDraft}
          onSave={confirmTaskUpdate}
          onAreaChange={handleTaskAreaChange}
          onReset={resetTaskDraft}
          onDelete={handleDeleteTaskFromDetails}
          onToggleDone={(task, checked) => requestToggleTaskDone(task, checked)}
          onShare={handleShareTask}
          onEffortChange={setTaskEffort}
          onCreateArea={handleCreateTaskArea}
          onCreateSubtask={handleCreateSubtask}
          onRenameSubtask={handleRenameSubtask}
          onToggleSubtask={(task, subtaskId, checked) =>
            handleToggleSubtaskDone(task, subtaskId, checked)
          }
          onDeleteSubtask={handleDeleteSubtask}
          onMoveSubtask={handleMoveSubtask}
        />

        <section className="calendar-primary-section">
          <div className="calendar-section-head">
            <div>
              <p className="panel-kicker">Today</p>
              <h3>Tasks</h3>
            </div>
            <span className="calendar-section-count">
              {todaySectionCountLabel}
            </span>
          </div>
          <div className="calendar-list-filter">
            <label htmlFor="today-tag-filter">Tag</label>
            <select
              id="today-tag-filter"
              value={todayTagFilter}
              onChange={(event) => setTodayTagFilter(event.target.value)}
            >
              <option value={ALL_TAG_FILTER}>All tags</option>
              <option value={NO_TAG_FILTER}>No tag</option>
              {taskAreas.map((taskArea) => (
                <option key={`today-filter-${taskArea.key}`} value={taskArea.key}>
                  {taskArea.label}
                </option>
              ))}
            </select>
          </div>
          {filteredPendingTasks.length ? (
            <div
              className="task-items"
              onDragOver={(event) => {
                if (!draggingTaskId) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!draggingTaskId) return;
                event.preventDefault();
                handleDropTaskAtEnd();
              }}
            >
              {filteredPendingTasks.map((task) => renderTodayTaskRow(task))}
              {draggingTaskId ? (
                <div
                  className="task-drop-slot active"
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDropTaskAtEnd();
                  }}
                >
                  Solte aqui para enviar para o fim da lista
                </div>
              ) : null}
            </div>
          ) : (
            <div
              className="line-empty"
              onDragOver={(event) => {
                if (!draggingTaskId) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!draggingTaskId) return;
                event.preventDefault();
                handleDropTaskAtStart();
              }}
            >
              {todayTagFilter === ALL_TAG_FILTER
                ? lowEnergyMode
                  ? "No light tasks."
                  : "No pending tasks."
                : "No tasks for this tag."}
            </div>
          )}
        </section>

        <section className="calendar-primary-section">
          <div className="calendar-section-head">
            <div>
              <p className="panel-kicker">Later</p>
              <h3>Backlog</h3>
            </div>
            <span className="calendar-section-count">
              {filteredUnscheduledTasks.length + filteredOverdueBacklogTasks.length}
            </span>
          </div>
          <div className="calendar-list-filter">
            <label htmlFor="backlog-tag-filter">Tag</label>
            <select
              id="backlog-tag-filter"
              value={backlogTagFilter}
              onChange={(event) => setBacklogTagFilter(event.target.value)}
            >
              <option value={ALL_TAG_FILTER}>All tags</option>
              <option value={NO_TAG_FILTER}>No tag</option>
              {taskAreas.map((taskArea) => (
                <option key={`backlog-filter-${taskArea.key}`} value={taskArea.key}>
                  {taskArea.label}
                </option>
              ))}
            </select>
          </div>
          {filteredUnscheduledTasks.length || filteredOverdueBacklogTasks.length ? (
            <div
              className="task-items"
              onDragOver={(event) => {
                if (!draggingTaskId) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!draggingTaskId) return;
                event.preventDefault();
                handleDropTaskToBacklog();
              }}
            >
              {filteredOverdueBacklogTasks.length ? (
                <p className="calendar-backlog-subtitle">
                  Overdue from last 7 days ({filteredOverdueBacklogTasks.length})
                </p>
              ) : null}
              {draggingTaskId ? (
                <div className="task-drop-slot active">
                  Solte aqui para mover para Backlog (sem horário)
                </div>
              ) : null}
              {filteredOverdueBacklogTasks.map((task) => {
                const draft = readTaskDraft(task);
                const shareUi = getTaskSharePresentation(task);
                return (
                  <EditableTaskRow
                    key={`overdue-${task.id}`}
                    task={task}
                    draft={draft}
                    effort={getTaskEffort(task)}
                    area={getTaskAreaMeta(draft.areaTag, taskAreas)}
                    expanded={isTaskExpanded(task)}
                    active={detailTaskId === task.id}
                    saving={savingTaskId === task.id}
                    saved={savedTaskId === task.id}
                    scheduleLocked={Boolean(draft.scheduleLocked)}
                    taskAreas={taskAreas}
                    creatingArea={createTaskArea.isPending}
                    onToggleDone={requestToggleTaskDone}
                    onToggleMissed={requestToggleTaskMissed}
                    onToggleExpanded={handleToggleTaskExpanded}
                    onToggleSubtaskDone={handleToggleSubtaskDone}
                    onOpenDetails={handleOpenTaskDetails}
                    onPriorityTagChange={handleTaskPriorityChange}
                    onAreaTagChange={handleTaskAreaChange}
                    onToggleScheduleLock={handleTaskScheduleLockToggle}
                    onCreateAreaTag={handleCreateTaskAreaForTask}
                    onScheduleToday={handleScheduleToday}
                    onScheduleTomorrow={handleScheduleTomorrow}
                    onMoveToToday={handleScheduleToday}
                    onMarkStarted={handleMarkStarted}
                    onMarkNeedsFinish={handleMarkNeedsFinish}
                    onResumeTask={handleResumeTask}
                    onSetNext={handleSetTaskNext}
                    onMoveFocus={handleMoveFocusTask}
                    onDelete={handleDeleteTask}
                    onShare={shareUi.canToggle ? handleShareTask : undefined}
                    sharing={sharingTaskId === task.id}
                    contextDate={selectedDayIso}
                    nowTick={nowTick}
                    showClockState={false}
                    showInlineNext
                    subtaskSavingId={savingSubtaskId}
                    shareLabel={shareUi.label}
                    shareActionLabel={shareUi.actionLabel}
                    draggable={!draft.scheduleLocked}
                    dragging={draggingTaskId === task.id}
                    dropTarget={Boolean(draggingTaskId && dragOverTaskId === task.id && draggingTaskId !== task.id)}
                    onDragStartTask={handleDragTaskStart}
                    onDragOverTask={handleDragTaskOver}
                    onDropTask={handleDropTaskToBacklogFromRow}
                    onDragEndTask={handleDragTaskEnd}
                    showMobileMoveActions={!draft.isDone}
                  />
                );
              })}
              {filteredUnscheduledTasks.length ? (
                <p className="calendar-backlog-subtitle">
                  Unscheduled ({filteredUnscheduledTasks.length})
                </p>
              ) : null}
              {filteredUnscheduledTasks.map((task) => {
                const draft = readTaskDraft(task);
                const shareUi = getTaskSharePresentation(task);
                return (
                  <EditableTaskRow
                    key={task.id}
                    task={task}
                    draft={draft}
                    effort={getTaskEffort(task)}
                    area={getTaskAreaMeta(draft.areaTag, taskAreas)}
                    expanded={isTaskExpanded(task)}
                    active={detailTaskId === task.id}
                    saving={savingTaskId === task.id}
                    saved={savedTaskId === task.id}
                    scheduleLocked={Boolean(draft.scheduleLocked)}
                    taskAreas={taskAreas}
                    creatingArea={createTaskArea.isPending}
                    onToggleDone={requestToggleTaskDone}
                    onToggleMissed={requestToggleTaskMissed}
                    onToggleExpanded={handleToggleTaskExpanded}
                    onToggleSubtaskDone={handleToggleSubtaskDone}
                    onOpenDetails={handleOpenTaskDetails}
                    onPriorityTagChange={handleTaskPriorityChange}
                    onAreaTagChange={handleTaskAreaChange}
                    onToggleScheduleLock={handleTaskScheduleLockToggle}
                    onCreateAreaTag={handleCreateTaskAreaForTask}
                    onScheduleToday={handleScheduleToday}
                    onScheduleTomorrow={handleScheduleTomorrow}
                    onMoveToToday={handleScheduleToday}
                    onMarkStarted={handleMarkStarted}
                    onMarkNeedsFinish={handleMarkNeedsFinish}
                    onResumeTask={handleResumeTask}
                    onSetNext={handleSetTaskNext}
                    onMoveFocus={handleMoveFocusTask}
                    onDelete={handleDeleteTask}
                    onShare={shareUi.canToggle ? handleShareTask : undefined}
                    sharing={sharingTaskId === task.id}
                    contextDate={selectedDayIso}
                    nowTick={nowTick}
                    showClockState={false}
                    focusPosition={executionPositionByTaskId.get(task.id) || null}
                    canMoveFocusUp={(executionPositionByTaskId.get(task.id) || 0) > 1}
                    canMoveFocusDown={
                      (executionPositionByTaskId.get(task.id) || 0) < pendingTasks.length
                    }
                    showInlineNext
                    subtaskSavingId={savingSubtaskId}
                    shareLabel={shareUi.label}
                    shareActionLabel={shareUi.actionLabel}
                    draggable={!draft.scheduleLocked}
                    dragging={draggingTaskId === task.id}
                    dropTarget={Boolean(draggingTaskId && dragOverTaskId === task.id && draggingTaskId !== task.id)}
                    onDragStartTask={handleDragTaskStart}
                    onDragOverTask={handleDragTaskOver}
                    onDropTask={handleDropTaskToBacklogFromRow}
                    onDragEndTask={handleDragTaskEnd}
                    showMobileMoveActions={!draft.isDone}
                  />
                );
              })}
            </div>
          ) : (
            <div className="line-empty">
              {backlogTagFilter === ALL_TAG_FILTER
                ? "No backlog."
                : "No backlog tasks for this tag."}
            </div>
          )}
        </section>

        <section className="calendar-primary-section">
          <div className="calendar-section-head">
            <div>
              <p className="panel-kicker">Completed</p>
              <h3>Done</h3>
            </div>
            <span className="calendar-section-count">{completedTasks.length + completedHabits.length}</span>
          </div>
          <div className="calendar-completed">
            {completedTasks.length === 0 && completedHabits.length === 0 ? (
              <div className="line-empty">Nothing done yet.</div>
            ) : null}
            {completedTasks.map((task) => {
              const draft = readTaskDraft(task);
              const shareUi = getTaskSharePresentation(task);
              return (
                <EditableTaskRow
                  key={`done-task-${task.id}`}
                  task={task}
                  draft={draft}
                  effort={getTaskEffort(task)}
                  area={getTaskAreaMeta(draft.areaTag, taskAreas)}
                  expanded={isTaskExpanded(task)}
                  active={detailTaskId === task.id}
                  saving={savingTaskId === task.id}
                  saved={savedTaskId === task.id}
                  scheduleLocked={Boolean(draft.scheduleLocked)}
                  taskAreas={taskAreas}
                  creatingArea={createTaskArea.isPending}
                  onToggleDone={requestToggleTaskDone}
                  onToggleMissed={requestToggleTaskMissed}
                  onToggleExpanded={handleToggleTaskExpanded}
                  onToggleSubtaskDone={handleToggleSubtaskDone}
                  onOpenDetails={handleOpenTaskDetails}
                  onPriorityTagChange={handleTaskPriorityChange}
                  onAreaTagChange={handleTaskAreaChange}
                  onToggleScheduleLock={handleTaskScheduleLockToggle}
                  onCreateAreaTag={handleCreateTaskAreaForTask}
                  onUnscheduleToday={handleUnscheduleToday}
                  onScheduleTomorrow={handleScheduleTomorrow}
                  onMarkStarted={handleMarkStarted}
                  onMarkNeedsFinish={handleMarkNeedsFinish}
                  onResumeTask={handleResumeTask}
                  onSetNext={handleSetTaskNext}
                  onMoveFocus={handleMoveFocusTask}
                  onDelete={handleDeleteTask}
                  onShare={shareUi.canToggle ? handleShareTask : undefined}
                  sharing={sharingTaskId === task.id}
                  contextDate={selectedDayIso}
                  nowTick={nowTick}
                  subtaskSavingId={savingSubtaskId}
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
              <h3>Notes</h3>
            </div>
            <div className="quick-note-actions">
              <span className="quick-note-status">
                {quickNoteQuery.isPending
                  ? "Loading…"
                  : saveQuickNote.isPending
                    ? "Saving…"
                    : quickNoteSavedAt
                      ? "Saved"
                      : "Auto"}
              </span>
              <button
                type="button"
                className="page-link inline muted"
                onClick={handleSaveQuickNoteNow}
                disabled={saveQuickNote.isPending || quickNoteQuery.isPending}
              >
                Save
              </button>
            </div>
          </div>
          {quickNoteQuery.isError ? (
            <InlineActionNotice
              tone="error"
              body="Couldn't load notes."
              actionLabel="Retry"
              onAction={() => {
                void quickNoteQuery.refetch();
              }}
            />
          ) : null}
          <textarea
            className="quick-note-textarea"
            value={quickNoteText}
            onChange={(event) => {
              const value = event.target.value.slice(0, 20000);
              setQuickNoteText(value);
              setQuickNoteDrafts((prev) => ({ ...prev, [selectedDayIso]: value }));
            }}
            placeholder="Write freely here..."
            disabled={quickNoteQuery.isPending}
          />
        </section>

        <details className="calendar-secondary-panel" open={pendingTaskShares.length > 0}>
          <summary>
            <span className="calendar-secondary-title">Shared invites</span>
            <span className="calendar-secondary-meta">{pendingTaskShares.length}</span>
          </summary>
          <div className="calendar-secondary-body">
            {taskSharesQuery.isPending ? (
              <div className="query-status quiet">Loading…</div>
            ) : null}
            {taskSharesQuery.isError ? (
              <InlineActionNotice
                tone="error"
                body="Couldn't load invites."
                actionLabel="Retry"
                onAction={() => {
                  void taskSharesQuery.refetch();
                }}
              />
            ) : null}
            {!taskSharesQuery.isPending && !taskSharesQuery.isError ? (
              pendingTaskShares.length === 0 ? (
                <div className="line-empty">No invites.</div>
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
            <span className="calendar-secondary-title">Habits</span>
            <span className="calendar-secondary-meta">{visibleDailyHabits.length}</span>
          </summary>
          <div className="calendar-secondary-body">
            {habitsLoading ? (
              <div className="query-status quiet">Loading…</div>
            ) : null}
            {habitsError ? (
              <InlineActionNotice
                tone="error"
                body="Couldn't load habits."
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
                ? <div className="line-empty">No habits to add.</div>
                : visibleDailyHabits.map((habit) => (
                    <DailyHabitRow
                      key={habit.id}
                      habit={habit}
                      timeValue={habitTimeDrafts[habit.id] || ""}
                      durationValue={Math.max(
                        1,
                        Number(habitDurationDrafts[habit.id] || defaultDurationForHabit(habit))
                      )}
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
            <span className="calendar-secondary-title">Estimates</span>
            <span className="calendar-secondary-meta">{estimationPoints.length} rows</span>
          </summary>
          <div className="calendar-secondary-body">
            {estimationHint ? <p className="task-estimation-hint">{estimationHint}</p> : null}
            {estimationHintQuery.isPending ? (
              <div className="query-status quiet">Loading…</div>
            ) : null}
            {estimationHintQuery.isError ? (
              <InlineActionNotice
                tone="error"
                body="Couldn't load estimates."
                actionLabel="Retry"
                onAction={() => {
                  void estimationHintQuery.refetch();
                }}
              />
            ) : null}
            {!estimationHintQuery.isPending && !estimationHintQuery.isError ? (
              estimationPoints.length === 0 ? (
                <div className="line-empty">No time data yet.</div>
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
            <button
              className={isNightOwlDay ? "chip active" : "chip"}
              onClick={toggleNightOwlDay}
              type="button"
              aria-pressed={isNightOwlDay}
              title={isNightOwlDay ? "Planning until 02:00" : "Allow tasks after 22:00"}
            >
              Corujão
            </button>
            {isNightOwlDay ? (
              <label className="night-owl-end-control">
                Até
                <input
                  type="time"
                  value={selectedNightOwlEndTime}
                  onChange={(event) => updateNightOwlEndTime(event.target.value)}
                  aria-label="Horário final do corujão"
                />
              </label>
            ) : null}
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
          slotMaxTime={calendarSlotMaxTime}
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
              data: { scheduled_date: dateStr, scheduled_time: timeStr, schedule_locked: 1 },
            });
          }}
        />

        <section className="activity-wheel">
          <div className="activity-wheel-head">
            <div>
              <p className="panel-kicker">Focus</p>
              <h3>Activity Wheel</h3>
              <p className="activity-wheel-copy">Not sure what to do next? Spin the wheel.</p>
            </div>
            <div className="activity-wheel-head-actions">
              <button
                type="button"
                className="secondary subtle"
                onClick={handleAutoReorderNow}
                disabled={planningActionsBusy || allPendingTasks.length <= 1}
              >
                Auto reordenar
              </button>
              <button
                type="button"
                className="secondary subtle"
                onClick={handleAutoRescheduleNow}
                disabled={planningActionsBusy || allPendingTasks.length === 0}
              >
                Auto horários
              </button>
              <label className="activity-wheel-shuffle-count">
                <span>Shuffle x</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label="Quantidade de embaralhadas da roleta"
                  value={wheelShuffleCountInput}
                  disabled={wheelSpinning || wheelShuffling}
                  onChange={(event) =>
                    setWheelShuffleCountInput(cleanWheelShuffleCountInput(event.target.value))
                  }
                  onBlur={() => setWheelShuffleCountInput(String(wheelShuffleCount))}
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={shuffleWheelStart}
                disabled={wheelSpinning || wheelShuffling || wheelEligibleTasks.length <= 1}
              >
                {wheelShuffling
                  ? `Shuffling ${wheelShuffleProgress}/${wheelShuffleCount}`
                  : `Shuffle${wheelShuffleCount > 1 ? ` ${wheelShuffleCount}x` : ""}`}
              </button>
            </div>
          </div>
          {autoPlanNotice ? (
            <p className="activity-wheel-plan-feedback">{autoPlanNotice}</p>
          ) : null}

          <div className="activity-wheel-controls">
            <label className="activity-wheel-toggle">
              <input
                type="checkbox"
                checked={wheelOnlyToday}
                onChange={(event) => setWheelOnlyToday(event.target.checked)}
              />
              <span>Only today</span>
            </label>
            <label className="activity-wheel-toggle">
              <input
                type="checkbox"
                checked={wheelAvoidRepeat}
                onChange={(event) => setWheelAvoidRepeat(event.target.checked)}
              />
              <span>Avoid repeat</span>
            </label>
            <span className="activity-wheel-meta">
              {wheelEligibleTasks.length} tasks · weight {wheelTotalWeight}
            </span>
          </div>

          <div className="activity-wheel-stage">
            <div
              className={`activity-wheel-dial-wrap ${wheelSpinning ? "spinning" : ""} ${
                wheelShuffling ? "shuffling" : ""
              }`}
            >
              <span className="activity-wheel-pointer" aria-hidden="true" />
              <div className="activity-wheel-dial-shell">
                <svg
                  className="activity-wheel-dial"
                  viewBox="0 0 260 260"
                  role="img"
                  aria-label="Roulette wheel with pending tasks"
                >
                  <g
                    className={`activity-wheel-rotor ${wheelSpinning ? "spinning" : ""} ${
                      wheelShuffling ? "shuffling" : ""
                    }`}
                    style={wheelRotorStyle}
                  >
                    {wheelSegments.map((segment) => {
                      const labelPoint = polar(
                        WHEEL_CENTER,
                        WHEEL_CENTER,
                        WHEEL_LABEL_RADIUS,
                        segment.midAngle
                      );
                      const labelMaxLength =
                        segment.span >= 72 ? 11 : segment.span >= 45 ? 9 : 8;
                      const label = truncateWheelLabel(segment.task.title, labelMaxLength);
                      const canRenderLabel = segment.span >= 28;

                      return (
                        <g key={segment.task.id}>
                          <path
                            d={describeWheelSlice(
                              WHEEL_CENTER,
                              WHEEL_CENTER,
                              WHEEL_RADIUS,
                              segment.startAngle,
                              segment.endAngle
                            )}
                            className={`activity-wheel-slice ${
                              !wheelSpinning &&
                              !wheelShuffling &&
                              segment.task.id === wheelResultTaskId
                                ? "is-result"
                                : ""
                            }`}
                            style={{ fill: segment.color }}
                          >
                            <title>{segment.task.title}</title>
                          </path>
                          {canRenderLabel ? (
                            <text
                              x={labelPoint.x}
                              y={labelPoint.y}
                              className="activity-wheel-slice-label"
                              dominantBaseline="middle"
                              textAnchor="middle"
                            >
                              {label}
                            </text>
                          ) : null}
                        </g>
                      );
                    })}
                    <circle
                      cx={WHEEL_CENTER}
                      cy={WHEEL_CENTER}
                      r={WHEEL_RADIUS}
                      className="activity-wheel-rim"
                    />
                  </g>
                  <circle
                    cx={WHEEL_CENTER}
                    cy={WHEEL_CENTER}
                    r="31"
                    className="activity-wheel-hub"
                  />
                  <circle
                    cx={WHEEL_CENTER}
                    cy={WHEEL_CENTER}
                    r="6"
                    className="activity-wheel-hub-dot"
                  />
                </svg>
                <button
                  type="button"
                  className="activity-wheel-hub-button"
                  onClick={spinActivityWheel}
                  disabled={wheelSpinning || wheelShuffling || wheelEligibleTasks.length === 0}
                  aria-label={
                    wheelSpinning
                      ? "Wheel spinning"
                      : wheelShuffling
                        ? "Wheel shuffling"
                      : wheelEligibleTasks.length === 0
                        ? "No pending tasks to spin"
                        : "Spin activity wheel"
                  }
                >
                  {wheelSpinning ? "..." : wheelShuffling ? "Mix" : "Spin"}
                </button>
              </div>
            </div>

            <div className="activity-wheel-result">
              {wheelEligibleTasks.length === 0 ? (
                <p className="line-empty">No pending tasks in this scope.</p>
              ) : wheelResultTask && wheelResultDraft ? (
                <article className="activity-wheel-result-card">
                  <strong>{wheelResultTask.title}</strong>
                  <p>
                    {wheelResultDraft.estimatedMinutes > 0
                      ? `${wheelResultDraft.estimatedMinutes} min`
                      : "No estimate"}
                    {wheelResultTask.priorityTag
                      ? ` · ${wheelResultTask.priorityTag}`
                      : ""}
                  </p>
                  <div className="activity-wheel-result-actions">
                    <button type="button" className="secondary" onClick={handleOpenWheelResult}>
                      Open
                    </button>
                    <button
                      type="button"
                      className="page-link inline muted"
                      onClick={spinActivityWheel}
                      disabled={wheelSpinning || wheelShuffling}
                    >
                      Spin again
                    </button>
                  </div>
                </article>
              ) : (
                <article className="activity-wheel-summary-card">
                  <p className="activity-wheel-summary-title">In this wheel</p>
                  <ul className="activity-wheel-task-list">
                    {wheelOrderedTasks.slice(0, 8).map((task) => (
                      <li key={task.id} title={task.title}>
                        <span>{truncateWheelLabel(task.title, 28)}</span>
                        <small>{task.priorityTag || "Default"}</small>
                      </li>
                    ))}
                  </ul>
                  {wheelOrderedTasks.length > 8 ? (
                    <p className="activity-wheel-more">+{wheelOrderedTasks.length - 8} more</p>
                  ) : null}
                  <p className="activity-wheel-tip">Tap the center hub to spin.</p>
                </article>
              )}
            </div>
          </div>
        </section>

        <section className="calendar-tag-stats">
          <div className="calendar-tag-stats-head">
            <div>
              <p className="panel-kicker">Week</p>
              <h3>Task Stats By Tag</h3>
            </div>
          </div>
          <div className="calendar-tag-stats-grid">
            <TaskTagBars title="Today · Planned vs Done" rows={tagStatsDaily} />
            <TaskTagBars title="Week · Planned vs Done" rows={tagStatsWeek} />
          </div>
        </section>
      </div>
    </div>
  );
}
