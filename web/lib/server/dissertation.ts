import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import {
  type DissertationList,
  type DissertationMilestone,
  type DissertationProject,
  type DissertationTask,
  type TaskStatus,
  TASK_STATUSES,
} from "@/lib/dissertation";
import { dissertationActionSchema, dissertationProjectSchema } from "./schemas";

const STORAGE_KEY_PREFIX = "dissertation_v1";

function settingKey(userEmail: string) {
  return `${userEmail.toLowerCase()}::${STORAGE_KEY_PREFIX}`;
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return randomUUID().replace(/-/g, "");
}

// ---- Defaults ---------------------------------------------------------------

function buildDefaultLists(): DissertationList[] {
  const created = nowIso();
  return [
    {
      id: newId(),
      title: "Artigo WSE",
      emoji: "📝",
      color: "#D2A869",
      description: "Em revisão",
      targetDate: null,
      phasesSuggested: ["Revisão", "Resposta a revisores", "Re-submissão"],
      tasks: [],
      notes: "",
      collapsed: false,
      order: 10,
    },
    {
      id: newId(),
      title: "Artigo SWE",
      emoji: "🧪",
      color: "#9DCFB7",
      description: "Início",
      targetDate: null,
      phasesSuggested: [
        "Seleção de revista",
        "Revisão de literatura",
        "Metodologia",
        "Coleta de dados",
        "Análise",
        "Escrita",
        "Submissão",
      ],
      tasks: [],
      notes: "",
      collapsed: false,
      order: 20,
    },
    {
      id: newId(),
      title: "Documento da Dissertação",
      emoji: "📚",
      color: "#9179C8",
      description: "Texto integrador",
      targetDate: null,
      phasesSuggested: [
        "Introdução",
        "Revisão de literatura",
        "Metodologia",
        "Resultados",
        "Discussão",
        "Conclusão",
        "Revisão final",
      ],
      tasks: [],
      notes: "",
      collapsed: false,
      order: 30,
    },
    {
      id: newId(),
      title: "Atividades extras",
      emoji: "🎤",
      color: "#E29A91",
      description: "Eventos, apresentações, defesa",
      targetDate: null,
      phasesSuggested: ["Apresentação", "Evento", "Defesa", "Qualificação"],
      tasks: [],
      notes: "",
      collapsed: false,
      order: 40,
    },
  ];
}

function buildDefaultMilestones(): DissertationMilestone[] {
  // Dates left null on purpose — user fills in. Order placeholders so they
  // sort sensibly; the UI sorts by date, falling back to order.
  return [];
}

function buildDefaultProject(): DissertationProject {
  return {
    title: "Mestrado",
    subtitle: "Dissertação",
    defenseDate: null,
    qualificationDate: null,
    generalNotes: "",
    lists: buildDefaultLists(),
    milestones: buildDefaultMilestones(),
    updatedAt: nowIso(),
    version: 1,
  };
}

// ---- Persistence ------------------------------------------------------------

export async function loadDissertationProject(
  userEmail: string
): Promise<DissertationProject> {
  const row = await prisma.setting.findUnique({
    where: { key: settingKey(userEmail) },
  });
  if (!row?.value) {
    const fresh = buildDefaultProject();
    await saveDissertationProject(userEmail, fresh);
    return fresh;
  }
  try {
    const parsed = JSON.parse(row.value);
    const validated = dissertationProjectSchema.safeParse(parsed);
    if (!validated.success) {
      const fallback = buildDefaultProject();
      await saveDissertationProject(userEmail, fallback);
      return fallback;
    }
    return normalizeProject(validated.data);
  } catch {
    const fallback = buildDefaultProject();
    await saveDissertationProject(userEmail, fallback);
    return fallback;
  }
}

export async function saveDissertationProject(
  userEmail: string,
  project: DissertationProject
): Promise<DissertationProject> {
  const next = normalizeProject({ ...project, updatedAt: nowIso(), version: 1 });
  await prisma.setting.upsert({
    where: { key: settingKey(userEmail) },
    create: { key: settingKey(userEmail), value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

/** Trim strings, ensure ordering is deterministic, drop empty titles. */
function normalizeProject(project: DissertationProject): DissertationProject {
  const lists = project.lists
    .map((list, index) => ({
      ...list,
      title: list.title.trim() || "Sem título",
      description: (list.description || "").trim(),
      notes: list.notes || "",
      order: typeof list.order === "number" ? list.order : index * 10,
      tasks: list.tasks
        .filter((t) => t.title.trim().length > 0)
        .map((t) => ({
          ...t,
          title: t.title.trim(),
          notes: t.notes || "",
        })),
    }))
    .sort((a, b) => a.order - b.order);

  const milestones = project.milestones
    .filter((m) => m.title.trim().length > 0 && m.date)
    .map((m, index) => ({
      ...m,
      title: m.title.trim(),
      notes: m.notes || "",
      order: typeof m.order === "number" ? m.order : index * 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...project,
    title: project.title.trim() || "Mestrado",
    subtitle: (project.subtitle || "").trim(),
    generalNotes: project.generalNotes || "",
    lists,
    milestones,
  };
}

// ---- Action dispatch --------------------------------------------------------

export async function applyDissertationAction(
  userEmail: string,
  rawAction: unknown
): Promise<DissertationProject> {
  const parsed = dissertationActionSchema.safeParse(rawAction);
  if (!parsed.success) {
    throw new Error("INVALID_ACTION");
  }
  const action = parsed.data;
  const project = await loadDissertationProject(userEmail);
  const next = mutateProject(project, action);
  return saveDissertationProject(userEmail, next);
}

function mutateProject(
  project: DissertationProject,
  action: ReturnType<typeof dissertationActionSchema.parse>
): DissertationProject {
  switch (action.type) {
    case "update_meta":
      return {
        ...project,
        title: action.title ?? project.title,
        subtitle: action.subtitle ?? project.subtitle,
        defenseDate: action.defenseDate === undefined ? project.defenseDate : action.defenseDate,
        qualificationDate:
          action.qualificationDate === undefined
            ? project.qualificationDate
            : action.qualificationDate,
        generalNotes: action.generalNotes ?? project.generalNotes,
      };

    case "add_list": {
      const list: DissertationList = {
        id: newId(),
        title: action.title,
        emoji: action.emoji || "📌",
        color: action.color || "#D2A869",
        description: action.description || "",
        targetDate: null,
        phasesSuggested: action.phasesSuggested || [],
        tasks: [],
        notes: "",
        collapsed: false,
        order: nextOrder(project.lists),
      };
      return { ...project, lists: [...project.lists, list] };
    }

    case "update_list":
      return {
        ...project,
        lists: project.lists.map((list) =>
          list.id !== action.listId ? list : applyListUpdate(list, action)
        ),
      };

    case "delete_list":
      return {
        ...project,
        lists: project.lists.filter((l) => l.id !== action.listId),
      };

    case "reorder_lists": {
      const idIndex = new Map(action.listIds.map((id, idx) => [id, idx]));
      return {
        ...project,
        lists: [...project.lists]
          .map((list) => ({
            ...list,
            order: (idIndex.get(list.id) ?? list.order) * 10,
          }))
          .sort((a, b) => a.order - b.order),
      };
    }

    case "add_task": {
      const created = nowIso();
      const task: DissertationTask = {
        id: newId(),
        title: action.title,
        status: "todo",
        priority: action.priority || "medium",
        phase: action.phase ?? null,
        dueDate: action.dueDate ?? null,
        notes: "",
        estimatedHours: action.estimatedHours ?? null,
        completedAt: null,
        createdAt: created,
        updatedAt: created,
      };
      return {
        ...project,
        lists: project.lists.map((list) =>
          list.id !== action.listId
            ? list
            : { ...list, tasks: [...list.tasks, task] }
        ),
      };
    }

    case "update_task": {
      const updatedAt = nowIso();
      return {
        ...project,
        lists: project.lists.map((list) =>
          list.id !== action.listId
            ? list
            : {
                ...list,
                tasks: list.tasks.map((task) =>
                  task.id !== action.taskId
                    ? task
                    : applyTaskUpdate(task, action, updatedAt)
                ),
              }
        ),
      };
    }

    case "toggle_task_status": {
      const updatedAt = nowIso();
      const status = action.status as TaskStatus;
      return {
        ...project,
        lists: project.lists.map((list) =>
          list.id !== action.listId
            ? list
            : {
                ...list,
                tasks: list.tasks.map((task) =>
                  task.id !== action.taskId
                    ? task
                    : {
                        ...task,
                        status,
                        updatedAt,
                        completedAt:
                          status === "done"
                            ? task.completedAt || updatedAt
                            : null,
                      }
                ),
              }
        ),
      };
    }

    case "delete_task":
      return {
        ...project,
        lists: project.lists.map((list) =>
          list.id !== action.listId
            ? list
            : { ...list, tasks: list.tasks.filter((t) => t.id !== action.taskId) }
        ),
      };

    case "move_task": {
      const fromList = project.lists.find((l) => l.id === action.fromListId);
      if (!fromList) return project;
      const moved = fromList.tasks.find((t) => t.id === action.taskId);
      if (!moved) return project;
      return {
        ...project,
        lists: project.lists.map((list) => {
          if (list.id === action.fromListId) {
            return { ...list, tasks: list.tasks.filter((t) => t.id !== action.taskId) };
          }
          if (list.id === action.toListId) {
            const tasks = [...list.tasks];
            const index =
              typeof action.index === "number"
                ? Math.max(0, Math.min(tasks.length, action.index))
                : tasks.length;
            tasks.splice(index, 0, { ...moved, updatedAt: nowIso() });
            return { ...list, tasks };
          }
          return list;
        }),
      };
    }

    case "add_milestone": {
      const ms: DissertationMilestone = {
        id: newId(),
        title: action.title,
        date: action.date,
        done: false,
        notes: action.notes || "",
        order: nextOrder(project.milestones),
      };
      return { ...project, milestones: [...project.milestones, ms] };
    }

    case "update_milestone":
      return {
        ...project,
        milestones: project.milestones.map((ms) =>
          ms.id !== action.id
            ? ms
            : {
                ...ms,
                title: action.title ?? ms.title,
                date: action.date ?? ms.date,
                done: action.done ?? ms.done,
                notes: action.notes ?? ms.notes,
              }
        ),
      };

    case "delete_milestone":
      return {
        ...project,
        milestones: project.milestones.filter((m) => m.id !== action.id),
      };
  }
}

function applyListUpdate(
  list: DissertationList,
  action: { title?: string; emoji?: string; color?: string; description?: string;
    targetDate?: string | null; phasesSuggested?: string[]; notes?: string;
    collapsed?: boolean }
): DissertationList {
  return {
    ...list,
    title: action.title ?? list.title,
    emoji: action.emoji ?? list.emoji,
    color: action.color ?? list.color,
    description: action.description ?? list.description,
    targetDate: action.targetDate === undefined ? list.targetDate : action.targetDate,
    phasesSuggested: action.phasesSuggested ?? list.phasesSuggested,
    notes: action.notes ?? list.notes,
    collapsed: action.collapsed ?? list.collapsed,
  };
}

function applyTaskUpdate(
  task: DissertationTask,
  action: { title?: string; status?: TaskStatus; priority?: "low" | "medium" | "high";
    phase?: string | null; dueDate?: string | null; notes?: string;
    estimatedHours?: number | null },
  updatedAt: string
): DissertationTask {
  const status = action.status ?? task.status;
  if (action.status && !TASK_STATUSES.includes(action.status)) {
    return task;
  }
  return {
    ...task,
    title: action.title ?? task.title,
    status,
    priority: action.priority ?? task.priority,
    phase: action.phase === undefined ? task.phase : action.phase,
    dueDate: action.dueDate === undefined ? task.dueDate : action.dueDate,
    notes: action.notes ?? task.notes,
    estimatedHours:
      action.estimatedHours === undefined ? task.estimatedHours : action.estimatedHours,
    completedAt:
      status === "done" ? task.completedAt || updatedAt : null,
    updatedAt,
  };
}

function nextOrder(items: { order: number }[]): number {
  if (items.length === 0) return 10;
  return Math.max(...items.map((i) => i.order)) + 10;
}
