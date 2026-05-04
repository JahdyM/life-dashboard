import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import {
  type DissertationAction,
  type DissertationDecision,
  type DissertationDocument,
  type DissertationList,
  type DissertationMilestone,
  type DissertationProject,
  type DissertationRaidItem,
  type DissertationStakeholder,
  type DissertationTask,
  type GovernanceItemStatus,
  type ImpactLevel,
  type ProjectStatus,
  type RaidKind,
  type TaskPriority,
  type TaskStatus,
  TASK_STATUSES,
} from "@/lib/dissertation";
import { dissertationActionSchema, dissertationProjectSchema } from "./schemas";

const STORAGE_KEY_PREFIX = "dissertation_v2";
const LEGACY_STORAGE_KEY_PREFIX = "dissertation_v1";

function settingKey(userEmail: string) {
  return `${userEmail.toLowerCase()}::${STORAGE_KEY_PREFIX}`;
}

function legacySettingKey(userEmail: string) {
  return `${userEmail.toLowerCase()}::${LEGACY_STORAGE_KEY_PREFIX}`;
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function newId() {
  return randomUUID().replace(/-/g, "");
}

function buildDefaultLists(): DissertationList[] {
  return [
    {
      id: newId(),
      title: "Artigo WSE",
      emoji: "WSE",
      color: "#2F80ED",
      description: "Manuscrito, revisões e submissão.",
      targetDate: null,
      phasesSuggested: ["Draft", "Figures", "Review", "Submission"],
      tasks: [],
      notes: "",
      collapsed: false,
      order: 10,
    },
    {
      id: newId(),
      title: "Artigo SWE",
      emoji: "SWE",
      color: "#27AE60",
      description: "Pipeline de análise, escrita e journal fit.",
      targetDate: null,
      phasesSuggested: ["Literature", "Methods", "Analysis", "Writing"],
      tasks: [],
      notes: "",
      collapsed: false,
      order: 20,
    },
    {
      id: newId(),
      title: "Dissertação",
      emoji: "DOC",
      color: "#9B6BD3",
      description: "Documento integrador e versão final.",
      targetDate: null,
      phasesSuggested: ["Intro", "Methods", "Results", "Discussion", "Final review"],
      tasks: [],
      notes: "",
      collapsed: false,
      order: 30,
    },
    {
      id: newId(),
      title: "Defesa e banca",
      emoji: "DEF",
      color: "#D2A869",
      description: "Qualificação, defesa, apresentações e burocracias.",
      targetDate: null,
      phasesSuggested: ["Qualification", "Slides", "Committee", "Defense"],
      tasks: [],
      notes: "",
      collapsed: false,
      order: 40,
    },
  ];
}

function buildDefaultProject(): DissertationProject {
  const created = nowIso();
  return {
    title: "Mestrado",
    subtitle: "Dissertation Project Control Center",
    status: "on_track",
    currentPhase: "Execution",
    weeklyFocus: "Definir a próxima entrega crítica.",
    defenseDate: null,
    qualificationDate: null,
    nextReviewDate: null,
    generalNotes: "",
    charter: {
      objective: "Concluir a dissertação e os manuscritos derivados com rastreabilidade de decisões, riscos e entregas.",
      scope: "Artigos, documento da dissertação, análise, revisão, submissão e preparação para defesa.",
      outOfScope: "Demandas acadêmicas não ligadas diretamente à conclusão do projeto.",
      successCriteria: "Manuscritos submetidos, dissertação final revisada, defesa preparada e pendências críticas resolvidas.",
    },
    weeklyStatus: {
      summary: "",
      wins: "",
      blockers: "",
      nextFocus: "",
      updatedAt: created,
    },
    lists: buildDefaultLists(),
    milestones: [],
    raid: [],
    decisions: [],
    stakeholders: [
      {
        id: newId(),
        name: "Orientador(a)",
        role: "Sponsor / reviewer",
        email: "",
        notes: "",
        createdAt: created,
        updatedAt: created,
      },
    ],
    documents: [],
    updatedAt: created,
    version: 2,
  };
}

export async function loadDissertationProject(
  userEmail: string
): Promise<DissertationProject> {
  const row = await prisma.setting.findUnique({
    where: { key: settingKey(userEmail) },
  });
  if (row?.value) return parseProject(row.value, userEmail);

  const legacyRow = await prisma.setting.findUnique({
    where: { key: legacySettingKey(userEmail) },
  });
  if (legacyRow?.value) return parseProject(legacyRow.value, userEmail);

  const fresh = buildDefaultProject();
  await saveDissertationProject(userEmail, fresh);
  return fresh;
}

async function parseProject(rawValue: string, userEmail: string) {
  try {
    const parsed = JSON.parse(rawValue);
    const validated = dissertationProjectSchema.safeParse(parsed);
    if (validated.success) {
      const normalized = normalizeProject(validated.data);
      await saveDissertationProject(userEmail, normalized);
      return normalized;
    }
  } catch {
    // Fall through to default below.
  }
  const fallback = buildDefaultProject();
  await saveDissertationProject(userEmail, fallback);
  return fallback;
}

export async function saveDissertationProject(
  userEmail: string,
  project: DissertationProject
): Promise<DissertationProject> {
  const next = normalizeProject({ ...project, updatedAt: nowIso(), version: 2 });
  await prisma.setting.upsert({
    where: { key: settingKey(userEmail) },
    create: { key: settingKey(userEmail), value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

function normalizeProject(project: DissertationProject): DissertationProject {
  const base = buildDefaultProject();
  const lists = (project.lists || base.lists)
    .map((list, index) => ({
      ...list,
      title: list.title.trim() || "Untitled workstream",
      emoji: (list.emoji || "WS").trim().slice(0, 8),
      description: (list.description || "").trim(),
      notes: list.notes || "",
      phasesSuggested: (list.phasesSuggested || []).map((p) => p.trim()).filter(Boolean),
      order: typeof list.order === "number" ? list.order : index * 10,
      tasks: (list.tasks || [])
        .filter((t) => t.title.trim().length > 0)
        .map((t) => ({
          ...t,
          title: t.title.trim(),
          notes: t.notes || "",
          priority: t.priority || "medium",
          status: TASK_STATUSES.includes(t.status) ? t.status : "todo",
        })),
    }))
    .sort((a, b) => a.order - b.order);

  const milestones = (project.milestones || [])
    .filter((m) => m.title.trim().length > 0 && m.date)
    .map((m, index) => ({
      ...m,
      title: m.title.trim(),
      notes: m.notes || "",
      order: typeof m.order === "number" ? m.order : index * 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...base,
    ...project,
    title: project.title?.trim() || base.title,
    subtitle: (project.subtitle || base.subtitle).trim(),
    status: project.status || base.status,
    currentPhase: (project.currentPhase || base.currentPhase).trim(),
    weeklyFocus: project.weeklyFocus || "",
    nextReviewDate: project.nextReviewDate ?? null,
    generalNotes: project.generalNotes || "",
    charter: { ...base.charter, ...(project.charter || {}) },
    weeklyStatus: { ...base.weeklyStatus, ...(project.weeklyStatus || {}) },
    lists,
    milestones,
    raid: normalizeTimedItems(project.raid || []),
    decisions: normalizeTimedItems(project.decisions || []),
    stakeholders: normalizeTimedItems(project.stakeholders || []),
    documents: normalizeTimedItems(project.documents || []),
    updatedAt: project.updatedAt || nowIso(),
    version: 2,
  };
}

function normalizeTimedItems<T extends { id: string; createdAt: string; updatedAt: string }>(items: T[]): T[] {
  return items.map((item) => ({
    ...item,
    id: item.id || newId(),
    createdAt: item.createdAt || nowIso(),
    updatedAt: item.updatedAt || nowIso(),
  }));
}

export async function applyDissertationAction(
  userEmail: string,
  rawAction: unknown
): Promise<DissertationProject> {
  const parsed = dissertationActionSchema.safeParse(rawAction);
  if (!parsed.success) throw new Error("INVALID_ACTION");
  const action = parsed.data as DissertationAction;
  const project = await loadDissertationProject(userEmail);
  const next = mutateProject(project, action);
  return saveDissertationProject(userEmail, next);
}

function mutateProject(
  project: DissertationProject,
  action: DissertationAction
): DissertationProject {
  switch (action.type) {
    case "update_meta":
      return {
        ...project,
        title: action.title ?? project.title,
        subtitle: action.subtitle ?? project.subtitle,
        status: action.status ?? project.status,
        currentPhase: action.currentPhase ?? project.currentPhase,
        weeklyFocus: action.weeklyFocus ?? project.weeklyFocus,
        defenseDate: action.defenseDate === undefined ? project.defenseDate : action.defenseDate,
        qualificationDate:
          action.qualificationDate === undefined
            ? project.qualificationDate
            : action.qualificationDate,
        nextReviewDate:
          action.nextReviewDate === undefined ? project.nextReviewDate : action.nextReviewDate,
        generalNotes: action.generalNotes ?? project.generalNotes,
        charter: action.charter ? { ...project.charter, ...action.charter } : project.charter,
        weeklyStatus: action.weeklyStatus
          ? { ...project.weeklyStatus, ...action.weeklyStatus, updatedAt: nowIso() }
          : project.weeklyStatus,
      };

    case "add_list": {
      const list: DissertationList = {
        id: newId(),
        title: action.title,
        emoji: action.emoji || "WS",
        color: action.color || "#2F80ED",
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
      return { ...project, lists: project.lists.filter((l) => l.id !== action.listId) };

    case "reorder_lists": {
      const idIndex = new Map(action.listIds.map((id, idx) => [id, idx]));
      return {
        ...project,
        lists: [...project.lists]
          .map((list) => ({ ...list, order: (idIndex.get(list.id) ?? list.order) * 10 }))
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
          list.id !== action.listId ? list : { ...list, tasks: [...list.tasks, task] }
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
                  task.id !== action.taskId ? task : applyTaskUpdate(task, action, updatedAt)
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
                    : { ...task, status, updatedAt, completedAt: status === "done" ? task.completedAt || updatedAt : null }
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
            const index = typeof action.index === "number" ? Math.max(0, Math.min(tasks.length, action.index)) : tasks.length;
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
            : { ...ms, title: action.title ?? ms.title, date: action.date ?? ms.date, done: action.done ?? ms.done, notes: action.notes ?? ms.notes }
        ),
      };

    case "delete_milestone":
      return { ...project, milestones: project.milestones.filter((m) => m.id !== action.id) };

    case "add_raid": {
      const item: DissertationRaidItem = {
        id: newId(),
        kind: action.kind,
        title: action.title,
        owner: action.owner || "",
        status: "open",
        impact: action.impact || "medium",
        dueDate: action.dueDate ?? null,
        notes: action.notes || "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      return { ...project, raid: [item, ...project.raid] };
    }

    case "update_raid":
      return { ...project, raid: project.raid.map((item) => item.id === action.id ? updateRaid(item, action) : item) };

    case "delete_raid":
      return { ...project, raid: project.raid.filter((item) => item.id !== action.id) };

    case "add_decision": {
      const item: DissertationDecision = {
        id: newId(),
        title: action.title,
        rationale: action.rationale || "",
        impact: action.impact || "",
        owner: action.owner || "",
        date: action.date || todayIso(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      return { ...project, decisions: [item, ...project.decisions] };
    }

    case "update_decision":
      return {
        ...project,
        decisions: project.decisions.map((item) =>
          item.id === action.id
            ? {
                ...item,
                title: action.title ?? item.title,
                rationale: action.rationale ?? item.rationale,
                impact: action.impact ?? item.impact,
                owner: action.owner ?? item.owner,
                date: action.date ?? item.date,
                updatedAt: nowIso(),
              }
            : item
        ),
      };

    case "delete_decision":
      return { ...project, decisions: project.decisions.filter((item) => item.id !== action.id) };

    case "add_stakeholder": {
      const item: DissertationStakeholder = {
        id: newId(),
        name: action.name,
        role: action.role || "",
        email: action.email || "",
        notes: action.notes || "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      return { ...project, stakeholders: [...project.stakeholders, item] };
    }

    case "update_stakeholder":
      return {
        ...project,
        stakeholders: project.stakeholders.map((item) =>
          item.id === action.id
            ? {
                ...item,
                name: action.name ?? item.name,
                role: action.role ?? item.role,
                email: action.email ?? item.email,
                notes: action.notes ?? item.notes,
                updatedAt: nowIso(),
              }
            : item
        ),
      };

    case "delete_stakeholder":
      return { ...project, stakeholders: project.stakeholders.filter((item) => item.id !== action.id) };

    case "add_document": {
      const item: DissertationDocument = {
        id: newId(),
        title: action.title,
        type: action.docType || "Document",
        url: action.url || "",
        version: action.version || "",
        notes: action.notes || "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      return { ...project, documents: [item, ...project.documents] };
    }

    case "update_document":
      return {
        ...project,
        documents: project.documents.map((item) =>
          item.id === action.id
            ? {
                ...item,
                title: action.title ?? item.title,
                type: action.docType ?? item.type,
                url: action.url ?? item.url,
                version: action.version ?? item.version,
                notes: action.notes ?? item.notes,
                updatedAt: nowIso(),
              }
            : item
        ),
      };

    case "delete_document":
      return { ...project, documents: project.documents.filter((item) => item.id !== action.id) };
    default:
      return project;
  }
}

function updateRaid(
  item: DissertationRaidItem,
  action: Partial<{
    kind: RaidKind;
    title: string;
    owner: string;
    status: GovernanceItemStatus;
    impact: ImpactLevel;
    dueDate: string | null;
    notes: string;
  }>
): DissertationRaidItem {
  return {
    ...item,
    kind: action.kind ?? item.kind,
    title: action.title ?? item.title,
    owner: action.owner ?? item.owner,
    status: action.status ?? item.status,
    impact: action.impact ?? item.impact,
    dueDate: action.dueDate === undefined ? item.dueDate : action.dueDate,
    notes: action.notes ?? item.notes,
    updatedAt: nowIso(),
  };
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
  action: { title?: string; status?: TaskStatus; priority?: TaskPriority;
    phase?: string | null; dueDate?: string | null; notes?: string;
    estimatedHours?: number | null },
  updatedAt: string
): DissertationTask {
  const status = action.status ?? task.status;
  if (action.status && !TASK_STATUSES.includes(action.status)) return task;
  return {
    ...task,
    title: action.title ?? task.title,
    status,
    priority: action.priority ?? task.priority,
    phase: action.phase === undefined ? task.phase : action.phase,
    dueDate: action.dueDate === undefined ? task.dueDate : action.dueDate,
    notes: action.notes ?? task.notes,
    estimatedHours: action.estimatedHours === undefined ? task.estimatedHours : action.estimatedHours,
    completedAt: status === "done" ? task.completedAt || updatedAt : null,
    updatedAt,
  };
}

function nextOrder(items: { order: number }[]): number {
  if (items.length === 0) return 10;
  return Math.max(...items.map((i) => i.order)) + 10;
}
