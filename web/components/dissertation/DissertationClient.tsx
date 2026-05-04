"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collectUpcomingDeadlines,
  formatBrazilianDate,
  formatRelativeDeadline,
  type DissertationList,
  type DissertationMilestone,
  type DissertationProject,
  type DissertationTask,
  listProgressPercent,
  priorityLabel,
  projectProgressPercent,
  statusLabel,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/dissertation";

type DissertationResponse = {
  project: DissertationProject;
};

type DissertationAction =
  | {
      type: "update_meta";
      title?: string;
      subtitle?: string;
      defenseDate?: string | null;
      qualificationDate?: string | null;
      generalNotes?: string;
    }
  | {
      type: "add_list";
      title: string;
      emoji?: string;
      color?: string;
      description?: string;
      phasesSuggested?: string[];
    }
  | {
      type: "update_list";
      listId: string;
      title?: string;
      emoji?: string;
      color?: string;
      description?: string;
      targetDate?: string | null;
      phasesSuggested?: string[];
      notes?: string;
      collapsed?: boolean;
    }
  | { type: "delete_list"; listId: string }
  | { type: "reorder_lists"; listIds: string[] }
  | {
      type: "add_task";
      listId: string;
      title: string;
      priority?: TaskPriority;
      phase?: string | null;
      dueDate?: string | null;
      estimatedHours?: number | null;
    }
  | {
      type: "update_task";
      listId: string;
      taskId: string;
      title?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      phase?: string | null;
      dueDate?: string | null;
      notes?: string;
      estimatedHours?: number | null;
    }
  | { type: "toggle_task_status"; listId: string; taskId: string; status: TaskStatus }
  | { type: "delete_task"; listId: string; taskId: string }
  | { type: "move_task"; listId?: string; taskId: string; fromListId: string; toListId: string; index?: number }
  | { type: "add_milestone"; title: string; date: string; notes?: string }
  | { type: "update_milestone"; id: string; title?: string; date?: string; done?: boolean; notes?: string }
  | { type: "delete_milestone"; id: string };

type SelectedTask = {
  listId: string;
  taskId: string;
};

type TaskEditorDraft = {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  phase: string;
  dueDate: string;
  estimatedHours: string;
  notes: string;
};

const priorityOptions: TaskPriority[] = ["low", "medium", "high"];
const statusOptions: TaskStatus[] = ["todo", "doing", "blocked", "done"];

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

function getTask(project: DissertationProject, selected: SelectedTask | null) {
  if (!selected) return null;
  const list = project.lists.find((item) => item.id === selected.listId);
  const task = list?.tasks.find((item) => item.id === selected.taskId) || null;
  return task ? { list: list as DissertationList, task } : null;
}

function taskToDraft(task: DissertationTask): TaskEditorDraft {
  return {
    title: task.title,
    status: task.status,
    priority: task.priority,
    phase: task.phase || "",
    dueDate: task.dueDate || "",
    estimatedHours: task.estimatedHours === null ? "" : String(task.estimatedHours),
    notes: task.notes || "",
  };
}

function cleanNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function splitPhases(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function projectStats(project: DissertationProject) {
  const tasks = project.lists.flatMap((list) => list.tasks);
  const done = tasks.filter((task) => task.status === "done").length;
  const doing = tasks.filter((task) => task.status === "doing").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const estimated = tasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);
  return { total: tasks.length, done, doing, blocked, estimated };
}

function shortDate(iso: string | null) {
  return iso ? formatBrazilianDate(iso) : "Sem data";
}

export default function DissertationClient({ initialProject }: { initialProject: DissertationProject }) {
  const queryClient = useQueryClient();
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>({});
  const [listDraft, setListDraft] = useState({ title: "", emoji: "📌" });
  const [milestoneDraft, setMilestoneDraft] = useState({ title: "", date: "" });
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);
  const [taskEditor, setTaskEditor] = useState<TaskEditorDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const projectQuery = useQuery({
    queryKey: ["dissertation-project"],
    queryFn: fetchProject,
    initialData: initialProject,
  });

  const actionMutation = useMutation({
    mutationFn: patchProject,
    onSuccess: (project) => {
      queryClient.setQueryData(["dissertation-project"], project);
      setNotice("Saved");
      window.setTimeout(() => setNotice(null), 1600);
    },
    onError: () => {
      setNotice("Could not save");
    },
  });

  const project = projectQuery.data;
  const stats = useMemo(() => projectStats(project), [project]);
  const deadlines = useMemo(() => collectUpcomingDeadlines(project, 45).slice(0, 6), [project]);
  const selected = useMemo(() => getTask(project, selectedTask), [project, selectedTask]);

  useEffect(() => {
    if (!selected) {
      setTaskEditor(null);
      return;
    }
    setTaskEditor(taskToDraft(selected.task));
  }, [selected]);

  useEffect(() => {
    if (selectedTask && !selected) setSelectedTask(null);
  }, [selected, selectedTask]);

  function mutate(action: DissertationAction) {
    actionMutation.mutate(action);
  }

  function addTask(listId: string) {
    const title = (taskDrafts[listId] || "").trim();
    if (!title) return;
    setTaskDrafts((current) => ({ ...current, [listId]: "" }));
    mutate({ type: "add_task", listId, title });
  }

  function addList() {
    const title = listDraft.title.trim();
    if (!title) return;
    mutate({ type: "add_list", title, emoji: listDraft.emoji.trim() || "📌" });
    setListDraft({ title: "", emoji: "📌" });
  }

  function addMilestone() {
    const title = milestoneDraft.title.trim();
    if (!title || !milestoneDraft.date) return;
    mutate({ type: "add_milestone", title, date: milestoneDraft.date });
    setMilestoneDraft({ title: "", date: "" });
  }

  function updateTaskFromEditor(patch?: Partial<TaskEditorDraft>) {
    if (!selected || !taskEditor) return;
    const next = { ...taskEditor, ...patch };
    const payload = {
      type: "update_task" as const,
      listId: selected.list.id,
      taskId: selected.task.id,
      title: next.title.trim() || selected.task.title,
      status: next.status,
      priority: next.priority,
      phase: next.phase.trim() || null,
      dueDate: next.dueDate || null,
      estimatedHours: cleanNumber(next.estimatedHours),
      notes: next.notes,
    };
    mutate(payload);
  }

  function moveList(listId: string, direction: -1 | 1) {
    const ids = project.lists.map((list) => list.id);
    const index = ids.indexOf(listId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    const next = [...ids];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    mutate({ type: "reorder_lists", listIds: next });
  }

  function moveTaskToList(task: DissertationTask, fromListId: string, toListId: string) {
    if (fromListId === toListId) return;
    mutate({ type: "move_task", taskId: task.id, fromListId, toListId });
  }

  return (
    <section className="dissertation-shell" aria-label="Dissertation project">
      <div className="dissertation-hero dashboard-card">
        <div className="dissertation-hero-main">
          <p className="eyebrow">Research desk</p>
          <h2>{project.title}</h2>
          <p>{project.subtitle || "Projeto de dissertação"}</p>
        </div>
        <div className="dissertation-progress-orb" style={{ "--progress": `${projectProgressPercent(project)}%` } as CSSProperties}>
          <strong>{projectProgressPercent(project)}%</strong>
          <span>done</span>
        </div>
      </div>

      <div className="dissertation-summary-grid">
        <SummaryCard label="Tasks" value={`${stats.done}/${stats.total}`} hint="concluídas" />
        <SummaryCard label="Doing" value={String(stats.doing)} hint="em andamento" />
        <SummaryCard label="Blocked" value={String(stats.blocked)} hint="bloqueadas" />
        <SummaryCard label="Hours" value={stats.estimated ? `${stats.estimated}h` : "—"} hint="estimadas" />
      </div>

      <details className="dissertation-settings dashboard-card">
        <summary>Configurar projeto</summary>
        <div className="dissertation-settings-grid">
          <label>
            <span>Título</span>
            <input
              key={`title-${project.title}`}
              defaultValue={project.title}
              onBlur={(event) => {
                const title = event.target.value.trim();
                if (title && title !== project.title) mutate({ type: "update_meta", title });
              }}
            />
          </label>
          <label>
            <span>Subtítulo</span>
            <input
              key={`subtitle-${project.subtitle}`}
              defaultValue={project.subtitle}
              onBlur={(event) => {
                if (event.target.value !== project.subtitle) {
                  mutate({ type: "update_meta", subtitle: event.target.value });
                }
              }}
            />
          </label>
          <label>
            <span>Qualificação</span>
            <input
              type="date"
              key={`qualification-${project.qualificationDate || ""}`}
              defaultValue={project.qualificationDate || ""}
              onBlur={(event) => mutate({ type: "update_meta", qualificationDate: event.target.value || null })}
            />
          </label>
          <label>
            <span>Defesa</span>
            <input
              type="date"
              key={`defense-${project.defenseDate || ""}`}
              defaultValue={project.defenseDate || ""}
              onBlur={(event) => mutate({ type: "update_meta", defenseDate: event.target.value || null })}
            />
          </label>
        </div>
        <label className="dissertation-wide-field">
          <span>Notas gerais</span>
          <textarea
            key={`notes-${project.generalNotes}`}
            defaultValue={project.generalNotes}
            onBlur={(event) => {
              if (event.target.value !== project.generalNotes) {
                mutate({ type: "update_meta", generalNotes: event.target.value });
              }
            }}
          />
        </label>
      </details>

      <div className="dissertation-layout">
        <div className="dissertation-main-column">
          <div className="dissertation-toolbar dashboard-card">
            <div>
              <h3>Frentes de trabalho</h3>
              <p>Artigos, texto principal e etapas extras.</p>
            </div>
            <div className="dissertation-add-list">
              <input
                aria-label="Emoji da lista"
                className="dissertation-emoji-input"
                value={listDraft.emoji}
                onChange={(event) => setListDraft((current) => ({ ...current, emoji: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addList();
                }}
              />
              <input
                aria-label="Nova lista"
                placeholder="Nova frente"
                value={listDraft.title}
                onChange={(event) => setListDraft((current) => ({ ...current, title: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addList();
                  if (event.key === "Escape") setListDraft({ title: "", emoji: "📌" });
                }}
              />
            </div>
          </div>

          <div className="dissertation-list-grid">
            {project.lists.map((list, index) => (
              <article key={list.id} className="dissertation-list-card dashboard-card" style={{ "--list-accent": list.color } as CSSProperties}>
                <header className="dissertation-list-head">
                  <button
                    type="button"
                    className="dissertation-list-title"
                    onClick={() => mutate({ type: "update_list", listId: list.id, collapsed: !list.collapsed })}
                  >
                    <span>{list.emoji}</span>
                    <strong>{list.title}</strong>
                  </button>
                  <div className="dissertation-list-actions">
                    <button type="button" onClick={() => moveList(list.id, -1)} disabled={index === 0} aria-label="Mover lista para cima">↑</button>
                    <button type="button" onClick={() => moveList(list.id, 1)} disabled={index === project.lists.length - 1} aria-label="Mover lista para baixo">↓</button>
                  </div>
                </header>

                <div className="dissertation-list-meter">
                  <span style={{ width: `${listProgressPercent(list)}%` }} />
                </div>

                <div className="dissertation-list-meta">
                  <span>{listProgressPercent(list)}%</span>
                  <span>{list.tasks.length} tasks</span>
                  <span>{shortDate(list.targetDate)}</span>
                </div>

                {!list.collapsed ? (
                  <>
                    <details className="dissertation-list-config">
                      <summary>Editar frente</summary>
                      <div className="dissertation-settings-grid compact">
                        <label>
                          <span>Título</span>
                          <input
                            key={`list-title-${list.id}-${list.title}`}
                            defaultValue={list.title}
                            onBlur={(event) => {
                              const title = event.target.value.trim();
                              if (title && title !== list.title) mutate({ type: "update_list", listId: list.id, title });
                            }}
                          />
                        </label>
                        <label>
                          <span>Emoji</span>
                          <input
                            key={`list-emoji-${list.id}-${list.emoji}`}
                            defaultValue={list.emoji}
                            onBlur={(event) => mutate({ type: "update_list", listId: list.id, emoji: event.target.value || "📌" })}
                          />
                        </label>
                        <label>
                          <span>Prazo</span>
                          <input
                            type="date"
                            key={`list-target-${list.id}-${list.targetDate || ""}`}
                            defaultValue={list.targetDate || ""}
                            onBlur={(event) => mutate({ type: "update_list", listId: list.id, targetDate: event.target.value || null })}
                          />
                        </label>
                        <label>
                          <span>Cor</span>
                          <input
                            type="color"
                            key={`list-color-${list.id}-${list.color}`}
                            defaultValue={list.color}
                            onBlur={(event) => mutate({ type: "update_list", listId: list.id, color: event.target.value })}
                          />
                        </label>
                      </div>
                      <label className="dissertation-wide-field">
                        <span>Descrição</span>
                        <input
                          key={`list-description-${list.id}-${list.description}`}
                          defaultValue={list.description}
                          onBlur={(event) => mutate({ type: "update_list", listId: list.id, description: event.target.value })}
                        />
                      </label>
                      <label className="dissertation-wide-field">
                        <span>Fases sugeridas</span>
                        <input
                          key={`list-phases-${list.id}-${list.phasesSuggested.join(",")}`}
                          defaultValue={list.phasesSuggested.join(", ")}
                          onBlur={(event) => mutate({ type: "update_list", listId: list.id, phasesSuggested: splitPhases(event.target.value) })}
                        />
                      </label>
                    </details>

                    {list.phasesSuggested.length > 0 ? (
                      <div className="dissertation-phase-row">
                        {list.phasesSuggested.slice(0, 7).map((phase) => (
                          <span key={phase}>{phase}</span>
                        ))}
                      </div>
                    ) : null}

                    <div className="dissertation-task-entry">
                      <input
                        aria-label={`Nova tarefa em ${list.title}`}
                        placeholder="Tarefa + Enter"
                        value={taskDrafts[list.id] || ""}
                        onChange={(event) => setTaskDrafts((current) => ({ ...current, [list.id]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") addTask(list.id);
                          if (event.key === "Escape") setTaskDrafts((current) => ({ ...current, [list.id]: "" }));
                        }}
                      />
                    </div>

                    <div className="dissertation-task-list">
                      {list.tasks.length === 0 ? (
                        <p className="quiet-text">Sem tarefas.</p>
                      ) : (
                        list.tasks.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            list={list}
                            lists={project.lists}
                            active={selectedTask?.taskId === task.id}
                            onOpen={() => setSelectedTask({ listId: list.id, taskId: task.id })}
                            onToggle={() => mutate({ type: "toggle_task_status", listId: list.id, taskId: task.id, status: task.status === "done" ? "todo" : "done" })}
                            onPatch={(patch) => mutate({ type: "update_task", listId: list.id, taskId: task.id, ...patch })}
                            onMove={(toListId) => moveTaskToList(task, list.id, toListId)}
                            onDelete={() => mutate({ type: "delete_task", listId: list.id, taskId: task.id })}
                          />
                        ))
                      )}
                    </div>
                  </>
                ) : null}
              </article>
            ))}
          </div>
        </div>

        <aside className="dissertation-side-column">
          <section className="dashboard-card dissertation-panel">
            <h3>Próximos prazos</h3>
            {deadlines.length === 0 ? (
              <p className="quiet-text">Nenhum prazo próximo.</p>
            ) : (
              <div className="dissertation-deadline-list">
                {deadlines.map((item) => (
                  <div key={`${item.kind}-${item.id}`} className="dissertation-deadline-item">
                    <span>{formatRelativeDeadline(item.date)}</span>
                    <strong>{item.title}</strong>
                    <small>{formatBrazilianDate(item.date)}{item.listTitle ? ` · ${item.listTitle}` : ""}</small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="dashboard-card dissertation-panel">
            <div className="section-heading compact">
              <h3>Marcos</h3>
            </div>
            <div className="dissertation-milestone-entry">
              <input
                aria-label="Novo marco"
                placeholder="Marco"
                value={milestoneDraft.title}
                onChange={(event) => setMilestoneDraft((current) => ({ ...current, title: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addMilestone();
                }}
              />
              <input
                aria-label="Data do marco"
                type="date"
                value={milestoneDraft.date}
                onChange={(event) => setMilestoneDraft((current) => ({ ...current, date: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addMilestone();
                }}
              />
            </div>
            <div className="dissertation-milestone-list">
              {project.milestones.length === 0 ? (
                <p className="quiet-text">Sem marcos.</p>
              ) : (
                project.milestones.map((milestone) => (
                  <MilestoneRow
                    key={milestone.id}
                    milestone={milestone}
                    onPatch={(patch) => mutate({ type: "update_milestone", id: milestone.id, ...patch })}
                    onDelete={() => mutate({ type: "delete_milestone", id: milestone.id })}
                  />
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      {selected && taskEditor ? (
        <div className="dissertation-task-drawer" role="dialog" aria-modal="true" aria-label="Editar tarefa">
          <button className="dissertation-drawer-backdrop" type="button" aria-label="Fechar" onClick={() => setSelectedTask(null)} />
          <section className="dissertation-drawer-panel dashboard-card">
            <header className="dissertation-drawer-head">
              <div>
                <p className="eyebrow">{selected.list.title}</p>
                <h3>Task details</h3>
              </div>
              <button type="button" className="page-link inline" onClick={() => setSelectedTask(null)}>Close</button>
            </header>

            <label className="dissertation-wide-field">
              <span>Título</span>
              <input
                value={taskEditor.title}
                onChange={(event) => setTaskEditor((current) => current ? { ...current, title: event.target.value } : current)}
                onBlur={() => updateTaskFromEditor()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") setTaskEditor(taskToDraft(selected.task));
                }}
              />
            </label>

            <div className="dissertation-settings-grid compact">
              <label>
                <span>Status</span>
                <select
                  value={taskEditor.status}
                  onChange={(event) => {
                    const status = event.target.value as TaskStatus;
                    setTaskEditor((current) => current ? { ...current, status } : current);
                    updateTaskFromEditor({ status });
                  }}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{statusLabel(status)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Prioridade</span>
                <select
                  value={taskEditor.priority}
                  onChange={(event) => {
                    const priority = event.target.value as TaskPriority;
                    setTaskEditor((current) => current ? { ...current, priority } : current);
                    updateTaskFromEditor({ priority });
                  }}
                >
                  {priorityOptions.map((priority) => (
                    <option key={priority} value={priority}>{priorityLabel(priority)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Fase</span>
                <input
                  value={taskEditor.phase}
                  onChange={(event) => setTaskEditor((current) => current ? { ...current, phase: event.target.value } : current)}
                  onBlur={() => updateTaskFromEditor()}
                />
              </label>
              <label>
                <span>Prazo</span>
                <input
                  type="date"
                  value={taskEditor.dueDate}
                  onChange={(event) => {
                    const dueDate = event.target.value;
                    setTaskEditor((current) => current ? { ...current, dueDate } : current);
                    updateTaskFromEditor({ dueDate });
                  }}
                />
              </label>
              <label>
                <span>Horas</span>
                <input
                  inputMode="decimal"
                  value={taskEditor.estimatedHours}
                  onChange={(event) => setTaskEditor((current) => current ? { ...current, estimatedHours: event.target.value } : current)}
                  onBlur={() => updateTaskFromEditor()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>
            </div>

            <label className="dissertation-wide-field">
              <span>Notas</span>
              <textarea
                value={taskEditor.notes}
                onChange={(event) => setTaskEditor((current) => current ? { ...current, notes: event.target.value } : current)}
                onBlur={() => updateTaskFromEditor()}
              />
            </label>

            <div className="dissertation-drawer-actions">
              <button type="button" className="page-link" onClick={() => mutate({ type: "delete_task", listId: selected.list.id, taskId: selected.task.id })}>
                Delete
              </button>
              <button type="button" className="page-link primary" onClick={() => updateTaskFromEditor()}>
                Save
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <div className="dissertation-sync-state" aria-live="polite">
        {notice || (projectQuery.isFetching || actionMutation.isPending ? "Syncing..." : "")}
      </div>
    </section>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="dissertation-summary-card dashboard-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function TaskRow({
  task,
  list,
  lists,
  active,
  onOpen,
  onToggle,
  onPatch,
  onMove,
  onDelete,
}: {
  task: DissertationTask;
  list: DissertationList;
  lists: DissertationList[];
  active: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onPatch: (patch: Partial<Pick<DissertationTask, "title" | "status" | "priority" | "phase" | "dueDate" | "notes" | "estimatedHours">>) => void;
  onMove: (toListId: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`dissertation-task-row ${active ? "active" : ""} ${task.status}`}>
      <button
        type="button"
        className={`task-check ${task.status === "done" ? "checked" : ""}`}
        aria-label={task.status === "done" ? "Marcar como pendente" : "Marcar como concluída"}
        onClick={onToggle}
      />
      <button type="button" className="dissertation-task-main" onClick={onOpen}>
        <strong>{task.title}</strong>
        <span>
          {statusLabel(task.status)} · {priorityLabel(task.priority)}
          {task.phase ? ` · ${task.phase}` : ""}
          {task.dueDate ? ` · ${formatRelativeDeadline(task.dueDate)}` : ""}
          {task.estimatedHours ? ` · ${task.estimatedHours}h` : ""}
        </span>
      </button>
      <select
        aria-label="Mover tarefa"
        value={list.id}
        onChange={(event) => onMove(event.target.value)}
      >
        {lists.map((item) => (
          <option key={item.id} value={item.id}>{item.title}</option>
        ))}
      </select>
      <details className="dissertation-task-more">
        <summary aria-label="Mais ações">•••</summary>
        <div>
          <button type="button" onClick={() => onPatch({ status: "doing" })}>Doing</button>
          <button type="button" onClick={() => onPatch({ status: "blocked" })}>Blocked</button>
          <button type="button" onClick={onDelete}>Delete</button>
        </div>
      </details>
    </div>
  );
}

function MilestoneRow({
  milestone,
  onPatch,
  onDelete,
}: {
  milestone: DissertationMilestone;
  onPatch: (patch: Partial<Pick<DissertationMilestone, "title" | "date" | "done" | "notes">>) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`dissertation-milestone-row ${milestone.done ? "done" : ""}`}>
      <button
        type="button"
        className={`task-check ${milestone.done ? "checked" : ""}`}
        aria-label={milestone.done ? "Marcar marco como pendente" : "Marcar marco como feito"}
        onClick={() => onPatch({ done: !milestone.done })}
      />
      <div>
        <input
          key={`ms-title-${milestone.id}-${milestone.title}`}
          defaultValue={milestone.title}
          onBlur={(event) => {
            const title = event.target.value.trim();
            if (title && title !== milestone.title) onPatch({ title });
          }}
        />
        <input
          type="date"
          key={`ms-date-${milestone.id}-${milestone.date}`}
          defaultValue={milestone.date}
          onBlur={(event) => {
            if (event.target.value && event.target.value !== milestone.date) onPatch({ date: event.target.value });
          }}
        />
      </div>
      <button type="button" className="text-button danger" onClick={onDelete}>Delete</button>
    </div>
  );
}
