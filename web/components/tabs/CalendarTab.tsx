"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";

type TaskDraft = {
  isDone?: boolean;
  priorityTag?: string;
  scheduledTime?: string;
  estimatedMinutes?: number;
};

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

  const range = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
    };
  }, [selectedDate]);

  const scrollTime = useMemo(() => {
    const now = new Date(nowTick);
    const anchor = new Date(now.getTime() - 60 * 60 * 1000);
    return format(anchor, "HH:mm:ss");
  }, [nowTick]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTick(Date.now());
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.scrollToTime(scrollTime);
  }, [scrollTime, selectedDate]);

  const tasksQuery = useQuery({
    queryKey: ["tasks", range.start, range.end],
    queryFn: async () => {
      const response = await fetchJson<{ items: any[]; warning?: string | null }>(
        `/api/tasks?start=${range.start}&end=${range.end}&sync=${didSync ? 0 : 1}&include_unscheduled=1`
      );
      if (!didSync) setDidSync(true);
      return response;
    },
  });

  const tasks = tasksQuery.data?.items || [];
  const syncWarning = tasksQuery.data?.warning;

  const tasksForDay = tasks.filter(
    (task) => task.scheduledDate === format(selectedDate, "yyyy-MM-dd")
  );
  const unscheduledTasks = tasks.filter((task) => !task.scheduledDate);

  const setTaskDraft = (taskId: string, patch: TaskDraft) => {
    setTaskDrafts((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        ...patch,
      },
    }));
  };

  const clearTaskDraft = (taskId: string) => {
    setTaskDrafts((prev) => {
      if (!prev[taskId]) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const readTaskDraft = (task: any) => {
    const draft = taskDrafts[task.id] || {};
    return {
      isDone: draft.isDone ?? Boolean(task.isDone),
      priorityTag: draft.priorityTag ?? (task.priorityTag || "Medium"),
      scheduledTime: draft.scheduledTime ?? (task.scheduledTime || ""),
      estimatedMinutes:
        draft.estimatedMinutes ?? Number(task.estimatedMinutes || 0),
    };
  };

  const pendingTasks = tasksForDay.filter((task) => !readTaskDraft(task).isDone);
  const completedTasks = tasksForDay.filter((task) => readTaskDraft(task).isDone);

  const buildTaskPatch = (task: any, draft?: TaskDraft) => {
    if (!draft) return {};
    const patch: Record<string, any> = {};
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
    return patch;
  };

  const hasTaskChanges = (task: any) =>
    Object.keys(buildTaskPatch(task, taskDrafts[task.id])).length > 0;

  const applyTaskPatchToCache = (taskId: string, patch: Record<string, any>) => {
    queryClient.setQueryData(
      ["tasks", range.start, range.end],
      (previous: { items?: any[]; warning?: string | null } | undefined) => {
        if (!previous?.items) return previous;
        return {
          ...previous,
          items: previous.items.map((item) => {
            if (item.id !== taskId) return item;
            return {
              ...item,
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
            };
          }),
        };
      }
    );
  };

  const clearDoneDraft = (taskId: string) => {
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
  };

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
      setNewTitle("");
      setNewTime("");
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
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
      setCalendarDraftTitle("");
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
  });

  const updateTask = useMutation({
    mutationFn: ({
      id,
      data,
      syncGoogle = true,
    }: {
      id: string;
      data: any;
      syncGoogle?: boolean;
    }) =>
      fetchJson(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(
          syncGoogle ? { ...data, sync_google: true } : { ...data }
        ),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/tasks/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
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
      queryClient.invalidateQueries({ queryKey: ["tasks", range.start, range.end] });
    } catch (_err) {
      setSyncStatus("failed");
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

  const confirmTaskUpdate = (task: any) => {
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
        onError: () => {
          setTaskSaveError("Could not save task changes. Please try again.");
          setSavingTaskId(null);
        },
      }
    );
  };

  const toggleTaskDoneNow = (task: any, checked: boolean) => {
    const cacheSnapshot = queryClient.getQueryData(["tasks", range.start, range.end]);
    const patch = { is_done: checked ? 1 : 0 };
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
          setSavedTaskId(task.id);
          window.setTimeout(() => {
            setSavedTaskId((prev) => (prev === task.id ? null : prev));
          }, 900);
        },
        onError: () => {
          if (cacheSnapshot) {
            queryClient.setQueryData(["tasks", range.start, range.end], cacheSnapshot);
          }
          setTaskSaveError("Could not mark task. Please try again.");
          clearDoneDraft(task.id);
          setSavingTaskId(null);
        },
      }
    );
  };

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
        {syncWarning && <div className="warning">{syncWarning}</div>}
        {taskSaveError && <div className="warning">{taskSaveError}</div>}
        <div className="task-items">
          {pendingTasks.map((task) => (
            <details key={task.id} className={`task-row ${hasTaskChanges(task) ? "dirty" : ""}`}>
              <summary>
                {(() => {
                  const draft = readTaskDraft(task);
                  const hasChanges = hasTaskChanges(task);
                  const saving = savingTaskId === task.id;
                  const saved = savedTaskId === task.id;
                  return (
                    <>
                      <input
                        type="checkbox"
                        checked={draft.isDone}
                        onChange={(event) =>
                          toggleTaskDoneNow(task, event.target.checked)
                        }
                      />
                      <span className="task-title">{task.title}</span>
                      {task.scheduledTime && <span className="task-time">{task.scheduledTime}</span>}
                      <button
                        className={`task-confirm-btn ${hasChanges || saved ? "visible" : ""}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          confirmTaskUpdate(task);
                        }}
                        disabled={!hasChanges || saving}
                        title="Confirm task changes"
                      >
                        {saving ? "..." : saved ? "✓" : "ok"}
                      </button>
                    </>
                  );
                })()}
              </summary>
              <div className="task-details">
                {(() => {
                  const draft = readTaskDraft(task);
                  return (
                    <>
                <label>
                  Priority
                  <select
                    value={draft.priorityTag}
                    onChange={(event) =>
                      setTaskDraft(task.id, { priorityTag: event.target.value })
                    }
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
                    onChange={(event) =>
                      setTaskDraft(task.id, { scheduledTime: event.target.value })
                    }
                  />
                </label>
                <label>
                  Est. minutes
                  <input
                    type="number"
                    value={draft.estimatedMinutes}
                    onChange={(event) =>
                      setTaskDraft(task.id, {
                        estimatedMinutes: Number(event.target.value || 0),
                      })
                    }
                  />
                </label>
                <button
                  className="task-confirm-inline"
                  onClick={() => confirmTaskUpdate(task)}
                  disabled={!hasTaskChanges(task) || savingTaskId === task.id}
                >
                  {savingTaskId === task.id ? "Saving..." : "Confirm changes"}
                </button>
                <button
                  className="link danger"
                  onClick={() => deleteTask.mutate(task.id)}
                >
                  Delete
                </button>
                    </>
                  );
                })()}
              </div>
            </details>
          ))}
        </div>
        {unscheduledTasks.length > 0 && (
          <div className="task-remembered">
            <h3>Remembered tasks</h3>
            {unscheduledTasks.map((task) => (
              <div key={task.id} className="task-row">
                {(() => {
                  const draft = readTaskDraft(task);
                  return (
                    <>
                <input
                  type="checkbox"
                  checked={draft.isDone}
                  onChange={(event) =>
                    toggleTaskDoneNow(task, event.target.checked)
                  }
                />
                <span className="task-title">{task.title}</span>
                <button
                  className={`task-confirm-btn ${hasTaskChanges(task) ? "visible" : ""}`}
                  onClick={() => confirmTaskUpdate(task)}
                  disabled={!hasTaskChanges(task) || savingTaskId === task.id}
                  title="Confirm task changes"
                >
                  {savingTaskId === task.id ? "..." : "ok"}
                </button>
                <button
                  className="link"
                  onClick={() =>
                    updateTask.mutate({
                      id: task.id,
                      data: { scheduled_date: format(selectedDate, "yyyy-MM-dd") },
                    })
                  }
                >
                  Schedule today
                </button>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
        {completedTasks.length > 0 && (
          <div className="task-completed">
            <h3>Completed</h3>
            {completedTasks.map((task) => (
              <div key={task.id} className="task-row completed">
                {(() => {
                  const draft = readTaskDraft(task);
                  return (
                    <>
                <input
                  type="checkbox"
                  checked={draft.isDone}
                  onChange={(event) => toggleTaskDoneNow(task, event.target.checked)}
                />
                <span className="task-title">{task.title}</span>
                {task.scheduledTime && <span className="task-time">{task.scheduledTime}</span>}
                <button
                  className={`task-confirm-btn ${hasTaskChanges(task) ? "visible" : ""}`}
                  onClick={() => confirmTaskUpdate(task)}
                  disabled={!hasTaskChanges(task) || savingTaskId === task.id}
                  title="Confirm task changes"
                >
                  {savingTaskId === task.id ? "..." : "ok"}
                </button>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
        <div className="task-form">
          <h3>Add activity</h3>
          <div className="form-row">
            <label>Title</label>
            <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
          </div>
          <div className="form-row">
            <label>Date</label>
            <input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
          </div>
          <div className="form-row">
            <label>Start time</label>
            <input type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} />
          </div>
          <div className="form-row">
            <label>Est. minutes</label>
            <input
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
          headerToolbar={false}
          allDaySlot={false}
          nowIndicator
          scrollTime={scrollTime}
          scrollTimeReset={false}
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
      </div>
    </div>
  );
}
