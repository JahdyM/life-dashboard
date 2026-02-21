"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";

export default function CalendarTab({ userEmail }: { userEmail: string }) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "failed">("idle");
  const [didSync, setDidSync] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [newTime, setNewTime] = useState("");
  const [newEst, setNewEst] = useState(30);

  const range = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
    };
  }, [selectedDate]);

  const tasksQuery = useQuery({
    queryKey: ["tasks", range.start, range.end],
    queryFn: async () => {
      const response = await fetchJson<{ items: any[] }>(
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
  const pendingTasks = tasksForDay.filter((task) => !task.isDone);
  const completedTasks = tasksForDay.filter((task) => task.isDone);

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

  const updateTask = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      fetchJson(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...data, sync_google: true }),
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
        <div className="task-items">
          {pendingTasks.map((task) => (
            <details key={task.id} className="task-row">
              <summary>
                <input
                  type="checkbox"
                  checked={Boolean(task.isDone)}
                  onChange={(event) =>
                    updateTask.mutate({ id: task.id, data: { is_done: event.target.checked ? 1 : 0 } })
                  }
                />
                <span className="task-title">{task.title}</span>
                {task.scheduledTime && <span className="task-time">{task.scheduledTime}</span>}
              </summary>
              <div className="task-details">
                <label>
                  Priority
                  <select
                    value={task.priorityTag || "Medium"}
                    onChange={(event) =>
                      updateTask.mutate({ id: task.id, data: { priority_tag: event.target.value } })
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
                    value={task.scheduledTime || ""}
                    onChange={(event) =>
                      updateTask.mutate({ id: task.id, data: { scheduled_time: event.target.value } })
                    }
                  />
                </label>
                <label>
                  Est. minutes
                  <input
                    type="number"
                    value={task.estimatedMinutes || 0}
                    onChange={(event) =>
                      updateTask.mutate({ id: task.id, data: { estimated_minutes: Number(event.target.value) } })
                    }
                  />
                </label>
                <button
                  className="link danger"
                  onClick={() => deleteTask.mutate(task.id)}
                >
                  Delete
                </button>
              </div>
            </details>
          ))}
        </div>
        {unscheduledTasks.length > 0 && (
          <div className="task-remembered">
            <h3>Remembered tasks</h3>
            {unscheduledTasks.map((task) => (
              <div key={task.id} className="task-row">
                <input
                  type="checkbox"
                  checked={Boolean(task.isDone)}
                  onChange={(event) =>
                    updateTask.mutate({ id: task.id, data: { is_done: event.target.checked ? 1 : 0 } })
                  }
                />
                <span className="task-title">{task.title}</span>
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
              </div>
            ))}
          </div>
        )}
        {completedTasks.length > 0 && (
          <div className="task-completed">
            <h3>Completed</h3>
            {completedTasks.map((task) => (
              <div key={task.id} className="task-row completed">
                <input
                  type="checkbox"
                  checked
                  onChange={() =>
                    updateTask.mutate({ id: task.id, data: { is_done: 0 } })
                  }
                />
                <span className="task-title">{task.title}</span>
                {task.scheduledTime && <span className="task-time">{task.scheduledTime}</span>}
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
        <div className="calendar-header">
          <button onClick={() => setSelectedDate(addDays(selectedDate, -1))}>Prev</button>
          <div>{format(selectedDate, "MMMM dd, yyyy")}</div>
          <button onClick={() => setSelectedDate(addDays(selectedDate, 1))}>Next</button>
        </div>
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridDay"
          height="auto"
          headerToolbar={false}
          allDaySlot={false}
          slotDuration="00:30:00"
          events={events}
          editable
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
