// Client-facing types + pure helpers for the Dissertation page.
// No server-only imports here so this file is safely consumed by both
// React components and server code.

export const TASK_STATUSES = ["todo", "doing", "done", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PROJECT_STATUSES = ["on_track", "at_risk", "blocked", "complete"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const RAID_KINDS = ["risk", "assumption", "issue", "dependency"] as const;
export type RaidKind = (typeof RAID_KINDS)[number];

export const GOVERNANCE_ITEM_STATUSES = ["open", "monitoring", "resolved"] as const;
export type GovernanceItemStatus = (typeof GOVERNANCE_ITEM_STATUSES)[number];

export const IMPACT_LEVELS = ["low", "medium", "high"] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

export type DissertationTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  phase: string | null;
  dueDate: string | null;
  notes: string;
  estimatedHours: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DissertationList = {
  id: string;
  title: string;
  emoji: string;
  color: string;
  description: string;
  targetDate: string | null;
  phasesSuggested: string[];
  tasks: DissertationTask[];
  notes: string;
  collapsed: boolean;
  order: number;
};

export type DissertationMilestone = {
  id: string;
  title: string;
  date: string;
  done: boolean;
  notes: string;
  order: number;
};

export type DissertationCharter = {
  objective: string;
  scope: string;
  outOfScope: string;
  successCriteria: string;
};

export type DissertationWeeklyStatus = {
  summary: string;
  wins: string;
  blockers: string;
  nextFocus: string;
  updatedAt: string;
};

export type DissertationRaidItem = {
  id: string;
  kind: RaidKind;
  title: string;
  owner: string;
  status: GovernanceItemStatus;
  impact: ImpactLevel;
  dueDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type DissertationDecision = {
  id: string;
  title: string;
  rationale: string;
  impact: string;
  owner: string;
  date: string;
  createdAt: string;
  updatedAt: string;
};

export type DissertationStakeholder = {
  id: string;
  name: string;
  role: string;
  email: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type DissertationDocument = {
  id: string;
  title: string;
  type: string;
  url: string;
  version: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type DissertationProject = {
  title: string;
  subtitle: string;
  status: ProjectStatus;
  currentPhase: string;
  weeklyFocus: string;
  defenseDate: string | null;
  qualificationDate: string | null;
  nextReviewDate: string | null;
  generalNotes: string;
  charter: DissertationCharter;
  weeklyStatus: DissertationWeeklyStatus;
  lists: DissertationList[];
  milestones: DissertationMilestone[];
  raid: DissertationRaidItem[];
  decisions: DissertationDecision[];
  stakeholders: DissertationStakeholder[];
  documents: DissertationDocument[];
  updatedAt: string;
  version: number;
};


export type DissertationAction =
  | {
      type: "update_meta";
      title?: string;
      subtitle?: string;
      status?: ProjectStatus;
      currentPhase?: string;
      weeklyFocus?: string;
      defenseDate?: string | null;
      qualificationDate?: string | null;
      nextReviewDate?: string | null;
      generalNotes?: string;
      charter?: Partial<DissertationCharter>;
      weeklyStatus?: Partial<DissertationWeeklyStatus>;
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
  | { type: "move_task"; taskId: string; fromListId: string; toListId: string; index?: number }
  | { type: "add_milestone"; title: string; date: string; notes?: string }
  | { type: "update_milestone"; id: string; title?: string; date?: string; done?: boolean; notes?: string }
  | { type: "delete_milestone"; id: string }
  | { type: "add_raid"; kind: RaidKind; title: string; owner?: string; impact?: ImpactLevel; dueDate?: string | null; notes?: string }
  | { type: "update_raid"; id: string; kind?: RaidKind; title?: string; owner?: string; status?: GovernanceItemStatus; impact?: ImpactLevel; dueDate?: string | null; notes?: string }
  | { type: "delete_raid"; id: string }
  | { type: "add_decision"; title: string; rationale?: string; impact?: string; owner?: string; date?: string }
  | { type: "update_decision"; id: string; title?: string; rationale?: string; impact?: string; owner?: string; date?: string }
  | { type: "delete_decision"; id: string }
  | { type: "add_stakeholder"; name: string; role?: string; email?: string; notes?: string }
  | { type: "update_stakeholder"; id: string; name?: string; role?: string; email?: string; notes?: string }
  | { type: "delete_stakeholder"; id: string }
  | { type: "add_document"; title: string; docType?: string; url?: string; version?: string; notes?: string }
  | { type: "update_document"; id: string; title?: string; docType?: string; url?: string; version?: string; notes?: string }
  | { type: "delete_document"; id: string };

// ---- Display helpers --------------------------------------------------------

export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case "todo": return "A fazer";
    case "doing": return "Em andamento";
    case "done": return "Concluído";
    case "blocked": return "Bloqueado";
  }
}

export function projectStatusLabel(status: ProjectStatus): string {
  switch (status) {
    case "on_track": return "On track";
    case "at_risk": return "At risk";
    case "blocked": return "Blocked";
    case "complete": return "Complete";
  }
}

export function priorityLabel(priority: TaskPriority): string {
  switch (priority) {
    case "low": return "Baixa";
    case "medium": return "Média";
    case "high": return "Alta";
  }
}

export function raidKindLabel(kind: RaidKind): string {
  switch (kind) {
    case "risk": return "Risk";
    case "assumption": return "Assumption";
    case "issue": return "Issue";
    case "dependency": return "Dependency";
  }
}

export function impactLabel(impact: ImpactLevel): string {
  switch (impact) {
    case "low": return "Low";
    case "medium": return "Medium";
    case "high": return "High";
  }
}

export function governanceStatusLabel(status: GovernanceItemStatus): string {
  switch (status) {
    case "open": return "Open";
    case "monitoring": return "Monitoring";
    case "resolved": return "Resolved";
  }
}

/** Returns a hex-tinted accent for due-date pills. */
export function dueDateUrgency(dueIso: string | null, todayIso?: string):
  | "overdue" | "soon" | "near" | "later" | "none" {
  if (!dueIso) return "none";
  const today = todayIso || new Date().toISOString().slice(0, 10);
  const days = isoDateDiffDays(today, dueIso);
  if (days < 0) return "overdue";
  if (days <= 2) return "soon";
  if (days <= 7) return "near";
  return "later";
}

/** Difference in whole days between two YYYY-MM-DD strings (b - a). */
export function isoDateDiffDays(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00Z`).getTime();
  const b = new Date(`${bIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function formatBrazilianDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** "em 12 dias" | "amanhã" | "hoje" | "atrasado 3 dias". */
export function formatRelativeDeadline(iso: string | null, todayIso?: string): string {
  if (!iso) return "sem prazo";
  const today = todayIso || new Date().toISOString().slice(0, 10);
  const days = isoDateDiffDays(today, iso);
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "atrasado 1 dia";
  if (days < 0) return `atrasado ${Math.abs(days)} dias`;
  return `em ${days} dias`;
}

export function projectProgressPercent(project: DissertationProject): number {
  let total = 0;
  let done = 0;
  for (const list of project.lists) {
    for (const task of list.tasks) {
      total += 1;
      if (task.status === "done") done += 1;
    }
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export function listProgressPercent(list: DissertationList): number {
  if (list.tasks.length === 0) return 0;
  const done = list.tasks.filter((t) => t.status === "done").length;
  return Math.round((done / list.tasks.length) * 100);
}

export function activeRaidCount(project: DissertationProject): number {
  return project.raid.filter((item) => item.status !== "resolved").length;
}

export type AggregatedDeadline = {
  kind: "task" | "milestone";
  id: string;
  title: string;
  date: string;
  listTitle?: string;
  status?: TaskStatus;
  done?: boolean;
};

export function collectUpcomingDeadlines(
  project: DissertationProject,
  daysAhead: number = 14,
  todayIso?: string
): AggregatedDeadline[] {
  const today = todayIso || new Date().toISOString().slice(0, 10);
  const items: AggregatedDeadline[] = [];

  for (const list of project.lists) {
    for (const task of list.tasks) {
      if (!task.dueDate) continue;
      if (task.status === "done") continue;
      const days = isoDateDiffDays(today, task.dueDate);
      if (days > daysAhead) continue;
      items.push({
        kind: "task",
        id: task.id,
        title: task.title,
        date: task.dueDate,
        listTitle: list.title,
        status: task.status,
      });
    }
  }

  for (const ms of project.milestones) {
    if (ms.done) continue;
    const days = isoDateDiffDays(today, ms.date);
    if (days > daysAhead) continue;
    items.push({
      kind: "milestone",
      id: ms.id,
      title: ms.title,
      date: ms.date,
      done: ms.done,
    });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}
