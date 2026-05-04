"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type DissertationProject,
  listProgressPercent,
  priorityLabel,
  projectProgressPercent,
  statusLabel,
} from "@/lib/dissertation";

type DissertationResponse = {
  project: DissertationProject;
};

type DissertationAction =
  | { type: "add_task"; listId: string; title: string; priority?: "low" | "medium" | "high" }
  | { type: "toggle_task_status"; listId: string; taskId: string; status: "todo" | "doing" | "done" | "blocked" }
  | { type: "delete_task"; listId: string; taskId: string };

async function fetchProject() {
  const response = await fetch("/api/dissertation", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load dissertation project");
  const data = (await response.json()) as DissertationResponse;
  return data.project;
}

async function patchProject(action: DissertationAction) {
  const response = await fetch("/api/dissertation", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  if (!response.ok) throw new Error("Could not update dissertation project");
  const data = (await response.json()) as DissertationResponse;
  return data.project;
}

export default function DissertationClient({ initialProject }: { initialProject: DissertationProject }) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const projectQuery = useQuery({
    queryKey: ["dissertation-project"],
    queryFn: fetchProject,
    initialData: initialProject,
  });

  const actionMutation = useMutation({
    mutationFn: patchProject,
    onSuccess: (project) => {
      queryClient.setQueryData(["dissertation-project"], project);
    },
  });

  const project = projectQuery.data;
  const totalTasks = project.lists.reduce((sum, list) => sum + list.tasks.length, 0);
  const doneTasks = project.lists.reduce(
    (sum, list) => sum + list.tasks.filter((task) => task.status === "done").length,
    0
  );

  function addTask(listId: string) {
    const title = (drafts[listId] || "").trim();
    if (!title) return;
    setDrafts((current) => ({ ...current, [listId]: "" }));
    actionMutation.mutate({ type: "add_task", listId, title });
  }

  return (
    <section className="dashboard-card dissertation-board" aria-label="Dissertation project">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{project.subtitle}</p>
          <h2>{project.title}</h2>
        </div>
        <div className="metric-pill">{projectProgressPercent(project)}%</div>
      </div>

      <div className="soft-grid two-up">
        <div className="mini-stat-card">
          <span>Tasks</span>
          <strong>{doneTasks}/{totalTasks}</strong>
        </div>
        <div className="mini-stat-card">
          <span>Lists</span>
          <strong>{project.lists.length}</strong>
        </div>
      </div>

      <div className="route-stack tight">
        {project.lists.map((list) => (
          <article key={list.id} className="dashboard-card nested-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">{listProgressPercent(list)}%</p>
                <h3>{list.emoji} {list.title}</h3>
              </div>
              <span className="quiet-text">{list.tasks.length} tasks</span>
            </div>

            {list.description ? <p className="quiet-text">{list.description}</p> : null}

            <div className="inline-entry compact">
              <input
                aria-label={`Add task to ${list.title}`}
                placeholder="Nova tarefa"
                value={drafts[list.id] || ""}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [list.id]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") addTask(list.id);
                  if (event.key === "Escape") {
                    setDrafts((current) => ({ ...current, [list.id]: "" }));
                  }
                }}
              />
            </div>

            <div className="task-tree compact">
              {list.tasks.length === 0 ? (
                <p className="quiet-text">Sem tarefas ainda.</p>
              ) : (
                list.tasks.map((task) => (
                  <div key={task.id} className="task-tree-row">
                    <button
                      type="button"
                      className={`task-check ${task.status === "done" ? "checked" : ""}`}
                      aria-label={task.status === "done" ? "Mark task as todo" : "Mark task as done"}
                      onClick={() =>
                        actionMutation.mutate({
                          type: "toggle_task_status",
                          listId: list.id,
                          taskId: task.id,
                          status: task.status === "done" ? "todo" : "done",
                        })
                      }
                    />
                    <div className="task-tree-content">
                      <strong>{task.title}</strong>
                      <span>
                        {statusLabel(task.status)} · {priorityLabel(task.priority)}
                        {task.estimatedHours ? ` · ${task.estimatedHours}h` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-button danger"
                      onClick={() =>
                        actionMutation.mutate({
                          type: "delete_task",
                          listId: list.id,
                          taskId: task.id,
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </article>
        ))}
      </div>

      {projectQuery.isFetching || actionMutation.isPending ? (
        <p className="quiet-text">Syncing...</p>
      ) : null}
      {projectQuery.isError || actionMutation.isError ? (
        <p className="form-error">Could not sync dissertation.</p>
      ) : null}
    </section>
  );
}
