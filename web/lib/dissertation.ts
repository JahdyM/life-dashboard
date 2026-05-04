// Client-facing types + pure helpers for the Dissertation page.
// No server-only imports here so this file is safely consumed by both
// React components and server code.

export const TASK_STATUSES = ["todo", "doing", "done", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type DissertationTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  phase: string | null;
  dueDate: string | null;     // YYYY-MM-DD
  notes: string;
  estimatedHours: number | null;
  completedAt: string | null; // ISO datetime
  createdAt: string;
  updatedAt: string;
};

export type DissertationList = {
  id: string;
  title: string;
  emoji: string;
  color: string;              // hex
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
  date: string;               // YYYY-MM-DD
  done: boolean;
  notes: string;
  order: number;
};

export type DissertationProject = {
  title: string;
  subtitle: string;
  defenseDate: string | null;
  qualificationDate: string | null;
  generalNotes: string;
  lists: DissertationList[];
  milestones: DissertationMilestone[];
  updatedAt: string;
  version: number;
};

// ---- Display helpers --------------------------------------------------------

export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case "todo": return "A fazer";
    case "doing": return "Em andamento";
    case "done": return "Concluído";
    case "blocked": return "Bloqueado";
  }
}

export function priorityLabel(priority: TaskPriority): string {
  switch (priority) {
    case "low": return "Baixa";
    case "medium": return "Média";
    case "high": return "Alta";
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

export type AggregatedDeadline = {
  kind: "task" | "milestone";
  id: string;
  title: string;
  date: string;             // YYYY-MM-DD
  listTitle?: string;       // present when kind === "task"
  status?: TaskStatus;      // present when kind === "task"
  done?: boolean;           // present when kind === "milestone"
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
