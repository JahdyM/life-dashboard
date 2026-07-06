// Client-facing types + pure helpers for the Dissertation page.
// This module intentionally models an academic workflow, not a corporate PMO.

export const DISSERTATION_FRONT_KEYS = [
  "wse_article",
  "swe_article",
  "integrative_text",
  "wse_lakes",
  "defense",
  "library_formatting",
] as const;
export type DissertationFrontKey = (typeof DISSERTATION_FRONT_KEYS)[number];

export type DissertationStep = {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DissertationFront = {
  id: string;
  key: DissertationFrontKey;
  title: string;
  icon: string;
  color: string;
  status: string;
  targetDate: string | null;
  steps: DissertationStep[];
  notes: string;
  order: number;
};

export type DissertationProject = {
  title: string;
  subtitle: string;
  defenseTargetDate: string | null;
  fronts: DissertationFront[];
  generalNotes: string;
  updatedAt: string;
  version: number;
};

export type DissertationAction =
  | { type: "update_project"; title?: string; subtitle?: string; defenseTargetDate?: string | null; generalNotes?: string }
  | { type: "update_front"; frontId: string; status?: string; notes?: string; targetDate?: string | null }
  | { type: "complete_front"; frontId: string; done: boolean }
  | { type: "add_step"; frontId: string; title: string; dueDate?: string | null }
  | { type: "update_step"; frontId: string; stepId: string; title?: string; dueDate?: string | null; done?: boolean }
  | { type: "delete_step"; frontId: string; stepId: string };

export type DissertationDeadline = {
  id: string;
  frontTitle: string;
  frontIcon: string;
  title: string;
  date: string;
  done: boolean;
};

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

export function frontProgressPercent(front: DissertationFront): number {
  if (front.steps.length === 0) return 0;
  const done = front.steps.filter((step) => step.done).length;
  return Math.round((done / front.steps.length) * 100);
}

export function isDissertationFrontComplete(front: DissertationFront): boolean {
  return front.steps.length > 0 && front.steps.every((step) => step.done);
}

export function projectProgressPercent(project: DissertationProject): number {
  const steps = project.fronts.flatMap((front) => front.steps);
  if (steps.length === 0) return 0;
  const done = steps.filter((step) => step.done).length;
  return Math.round((done / steps.length) * 100);
}

export function todayStepForFront(front: DissertationFront, todayIso?: string): DissertationStep | null {
  const today = todayIso || new Date().toISOString().slice(0, 10);
  return front.steps.find((step) => step.dueDate === today && !step.done) ||
    front.steps.find((step) => step.dueDate === today) ||
    null;
}

export function collectDissertationDeadlines(project: DissertationProject): DissertationDeadline[] {
  const stepDeadlines = project.fronts.flatMap((front) =>
    front.steps
      .filter((step) => step.dueDate && !step.done)
      .map((step) => ({
        id: step.id,
        frontTitle: front.title,
        frontIcon: front.icon,
        title: step.title,
        date: step.dueDate as string,
        done: step.done,
      }))
  );

  const frontTargets = project.fronts
    .filter((front) => front.targetDate)
    .map((front) => ({
      id: `${front.id}-target`,
      frontTitle: front.title,
      frontIcon: front.icon,
      title: `Meta: ${front.title}`,
      date: front.targetDate as string,
      done: frontProgressPercent(front) === 100,
    }));

  return [...stepDeadlines, ...frontTargets].sort((a, b) => a.date.localeCompare(b.date));
}

export function countDoneToday(project: DissertationProject, todayIso?: string): number {
  const today = todayIso || new Date().toISOString().slice(0, 10);
  return project.fronts.reduce(
    (total, front) => total + front.steps.filter((step) => step.dueDate === today && step.done).length,
    0
  );
}
