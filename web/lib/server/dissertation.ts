import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import {
  DISSERTATION_FRONT_KEYS,
  type DissertationAction,
  type DissertationFront,
  type DissertationFrontKey,
  type DissertationProject,
  type DissertationStep,
} from "@/lib/dissertation";
import { dissertationActionSchema, dissertationProjectSchema } from "./schemas";
import { reconcileDissertationMirrors } from "./dissertationMirror";
import { logServerEvent } from "./logger";

async function reconcileMirrorsSafely(userEmail: string, project: DissertationProject) {
  try {
    await reconcileDissertationMirrors(userEmail, project);
  } catch (error) {
    logServerEvent("warn", {
      endpoint: "dissertationMirror",
      message: "Failed to reconcile dissertation calendar mirrors",
      error,
    });
  }
}

const STORAGE_KEY_PREFIX = "dissertation_v3";
const LEGACY_KEYS = ["dissertation_v2", "dissertation_v1"];

function settingKey(userEmail: string, prefix = STORAGE_KEY_PREFIX) {
  return `${userEmail.toLowerCase()}::${prefix}`;
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return randomUUID().replace(/-/g, "");
}

function parseIsoDateUtc(iso: string) {
  const [year, month, day] = String(iso || "")
    .split("-")
    .map((value) => Number(value));
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDateUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeDissertationDueDate(dateIso: string | null | undefined) {
  if (!dateIso) return null;
  const base = parseIsoDateUtc(dateIso);
  if (!base) return null;
  const normalized = new Date(base);
  while (normalized.getUTCDay() === 0 || normalized.getUTCDay() === 6) {
    normalized.setUTCDate(normalized.getUTCDate() + 1);
  }
  return formatIsoDateUtc(normalized);
}

function step(title: string, dueDate: string | null = null): DissertationStep {
  const created = nowIso();
  return {
    id: newId(),
    title,
    done: false,
    dueDate,
    completedAt: null,
    createdAt: created,
    updatedAt: created,
  };
}

function front(
  key: DissertationFrontKey,
  title: string,
  icon: string,
  color: string,
  status: string,
  targetDate: string | null,
  steps: DissertationStep[],
  notes = ""
): DissertationFront {
  return {
    id: newId(),
    key,
    title,
    icon,
    color,
    status,
    targetDate,
    steps,
    notes,
    order: DISSERTATION_FRONT_KEYS.indexOf(key) * 10 + 10,
  };
}

function buildDefaultProject(): DissertationProject {
  return {
    title: "Mestrado",
    subtitle: "6 frentes · pequenos passos por dia",
    defenseTargetDate: "2026-08-15",
    fronts: [
      front(
        "wse_article",
        "Artigo WSE",
        "📄",
        "#7fb3ff",
        "Em revisão das orientadoras.",
        "2026-05-31",
        [
          step("Aplicar correções das orientadoras"),
          step("Enviar para colaborador internacional"),
          step("Aplicar feedback do colaborador"),
          step("Enviar revisão final para orientadoras"),
          step("Revisão minha + submissão", "2026-05-31"),
        ]
      ),
      front(
        "swe_article",
        "Artigo SWE",
        "📄",
        "#8fd4a8",
        "Metodologia ainda a iniciar.",
        "2026-07-31",
        [
          step("Revisão de literatura SWE"),
          step("Coletar SWOT e dados complementares"),
          step("Definir metodologia"),
          step("Rodar análise principal"),
          step("Escrever resultados e discussão"),
          step("Submissão", "2026-07-31"),
        ]
      ),
      front(
        "integrative_text",
        "Dissertação",
        "📚",
        "#c4a3ff",
        "Introdução e revisão em rascunho.",
        "2026-08-15",
        [
          step("Escrever introdução geral"),
          step("Mapear tópicos da revisão de literatura"),
          step("Escrever seção de revisão SWOT"),
          step("Integrar Artigo WSE como capítulo"),
          step("Integrar Artigo SWE como capítulo"),
          step("Revisão final do documento"),
        ]
      ),
      front(
        "wse_lakes",
        "WSE Lagos",
        "🌊",
        "#64c7d9",
        "Trabalho paralelo para eventos e apresentações.",
        "2026-08-31",
        [
          step("Organizar recorte de eventos"),
          step("Preparar figuras para apresentação"),
          step("Escrever resumo/submissão de evento", "2026-08-31"),
        ]
      ),
      front(
        "defense",
        "Defesa",
        "🎤",
        "#d8b46a",
        "Sem data formal; alvo em meados de agosto.",
        "2026-08-15",
        [
          step("Montar estrutura dos slides"),
          step("Criar slides dos manuscritos"),
          step("Criar slides gerais da dissertação"),
          step("Ensaiar apresentação"),
        ]
      ),
      front(
        "library_formatting",
        "Formatação biblioteca",
        "📐",
        "#e39d94",
        "Passe final depois do texto pronto.",
        null,
        [
          step("Conferir normas da biblioteca"),
          step("Ajustar referências e elementos pré-textuais"),
          step("Revisão final de formatação"),
        ]
      ),
    ],
    generalNotes: "",
    updatedAt: nowIso(),
    version: 3,
  };
}

/**
 * Internal load — does NOT reconcile mirrors. Use this from code paths that
 * already trigger a reconcile after their own write (e.g. applyDissertationAction
 * reconciles after saveDissertationProject) so we don't run reconcile twice
 * per request.
 */
async function loadDissertationProjectRaw(
  userEmail: string
): Promise<DissertationProject> {
  const row = await prisma.setting.findUnique({ where: { key: settingKey(userEmail) } });
  if (row?.value) return parseProject(row.value, userEmail);

  for (const key of LEGACY_KEYS) {
    const legacyRow = await prisma.setting.findUnique({ where: { key: settingKey(userEmail, key) } });
    if (legacyRow?.value) return parseProject(legacyRow.value, userEmail);
  }

  const fresh = buildDefaultProject();
  await saveDissertationProject(userEmail, fresh);
  return fresh;
}

/**
 * If any step has a `dueDate` strictly before today and isn't done, roll its
 * date forward to today. Mirrors the calendar's rollPendingTasksFromYesterday
 * behavior — work that didn't get done yesterday becomes today's plan, so the
 * "Hoje" panel surfaces it naturally and the calendar mirror picks it up for
 * the current day. Steps with future or null dueDates are untouched; done
 * steps keep their historical date.
 */
function rollOverdueStepsToToday(
  project: DissertationProject,
  todayIso: string
): { project: DissertationProject; changed: boolean } {
  let changed = false;
  const updatedAt = nowIso();
  const targetDueDate = normalizeDissertationDueDate(todayIso) || todayIso;
  const next: DissertationProject = {
    ...project,
    fronts: project.fronts.map((front) => ({
      ...front,
      steps: front.steps.map((step) => {
        if (!step.dueDate) return step;
        if (step.done) return step;
        if (step.dueDate >= targetDueDate) return step;
        changed = true;
        return { ...step, dueDate: targetDueDate, updatedAt };
      }),
    })),
  };
  return { project: changed ? next : project, changed };
}

function shiftWeekendUndoneStepsToWeekday(
  project: DissertationProject
): { project: DissertationProject; changed: boolean } {
  let changed = false;
  const updatedAt = nowIso();
  const next: DissertationProject = {
    ...project,
    fronts: project.fronts.map((front) => ({
      ...front,
      steps: front.steps.map((step) => {
        if (!step.dueDate || step.done) return step;
        const normalizedDueDate = normalizeDissertationDueDate(step.dueDate);
        if (!normalizedDueDate || normalizedDueDate === step.dueDate) return step;
        changed = true;
        return { ...step, dueDate: normalizedDueDate, updatedAt };
      }),
    })),
  };
  return { project: changed ? next : project, changed };
}

/**
 * Public load — always reconciles dissertation mirrors against the calendar
 * task list before returning. This covers users with pre-existing data who
 * never triggered a write since the mirror feature shipped: their steps
 * with dueDate / undated steps now appear in the calendar after a single
 * page load, no manual action needed.
 *
 * Also rolls overdue undone steps forward to today, mirroring the calendar
 * behavior — yesterday's incomplete passinho becomes today's plan instead
 * of going stale.
 */
export async function loadDissertationProject(
  userEmail: string
): Promise<DissertationProject> {
  const raw = await loadDissertationProjectRaw(userEmail);
  const { project: shiftedWeekend, changed: shiftedWeekendChanged } =
    shiftWeekendUndoneStepsToWeekday(raw);
  const todayIso = nowIso().slice(0, 10);
  const { project: rolled, changed: rolledChanged } = rollOverdueStepsToToday(
    shiftedWeekend,
    todayIso
  );
  if (shiftedWeekendChanged || rolledChanged) {
    await saveDissertationProject(userEmail, rolled);
  }
  await reconcileMirrorsSafely(userEmail, rolled);
  return rolled;
}

async function parseProject(rawValue: string, userEmail: string): Promise<DissertationProject> {
  try {
    const parsed = JSON.parse(rawValue);
    const validated = dissertationProjectSchema.safeParse(parsed);
    if (validated.success) {
      const normalized = normalizeProject(validated.data);
      const corrected = fixSwappedSubmissionDates(normalized);
      await saveDissertationProject(userEmail, corrected);
      return corrected;
    }
    const migrated = migrateLegacyProject(parsed);
    if (migrated) {
      const normalized = normalizeProject(migrated);
      const corrected = fixSwappedSubmissionDates(normalized);
      await saveDissertationProject(userEmail, corrected);
      return corrected;
    }
  } catch {
    // Use the workflow defaults below.
  }

  const fallback = buildDefaultProject();
  await saveDissertationProject(userEmail, fallback);
  return fallback;
}

/**
 * One-shot correction for the brief window where the seed defaults had the
 * Artigo WSE and Artigo SWE submission dates swapped.
 *
 * If the project still carries the buggy combination — WSE targetDate set to
 * 2026-07-31 AND SWE targetDate set to 2026-05-31 — swap them (plus any
 * matching step dueDates). Once corrected, the heuristic stops firing.
 */
function fixSwappedSubmissionDates(project: DissertationProject): DissertationProject {
  const wse = project.fronts.find((f) => f.key === "wse_article");
  const swe = project.fronts.find((f) => f.key === "swe_article");
  if (!wse || !swe) return project;
  if (wse.targetDate !== "2026-07-31" || swe.targetDate !== "2026-05-31") {
    return project;
  }
  return {
    ...project,
    fronts: project.fronts.map((f) => {
      if (f.id === wse.id) {
        return {
          ...f,
          targetDate: "2026-05-31",
          steps: f.steps.map((s) =>
            s.dueDate === "2026-07-31" ? { ...s, dueDate: "2026-05-31", updatedAt: nowIso() } : s
          ),
        };
      }
      if (f.id === swe.id) {
        return {
          ...f,
          targetDate: "2026-07-31",
          steps: f.steps.map((s) =>
            s.dueDate === "2026-05-31" ? { ...s, dueDate: "2026-07-31", updatedAt: nowIso() } : s
          ),
        };
      }
      return f;
    }),
  };
}


function migrateLegacyProject(raw: unknown): DissertationProject | null {
  if (!raw || typeof raw !== "object") return null;
  const legacy = raw as {
    title?: unknown;
    subtitle?: unknown;
    defenseDate?: unknown;
    generalNotes?: unknown;
    lists?: Array<{
      title?: unknown;
      description?: unknown;
      targetDate?: unknown;
      notes?: unknown;
      tasks?: Array<{
        id?: unknown;
        title?: unknown;
        status?: unknown;
        dueDate?: unknown;
        completedAt?: unknown;
        createdAt?: unknown;
        updatedAt?: unknown;
      }>;
    }>;
  };
  if (!Array.isArray(legacy.lists)) return null;

  const next = buildDefaultProject();
  next.title = typeof legacy.title === "string" && legacy.title.trim() ? legacy.title : next.title;
  next.subtitle = "6 frentes · pequenos passos por dia";
  next.defenseTargetDate = typeof legacy.defenseDate === "string" ? legacy.defenseDate : next.defenseTargetDate;
  next.generalNotes = typeof legacy.generalNotes === "string" ? legacy.generalNotes : "";

  for (const source of legacy.lists) {
    const sourceTitle = typeof source.title === "string" ? source.title.toLowerCase() : "";
    const frontItem = next.fronts.find((frontCandidate) => {
      if (sourceTitle.includes("swe")) return frontCandidate.key === "swe_article";
      if (sourceTitle.includes("wse")) return frontCandidate.key === "wse_article";
      if (sourceTitle.includes("defesa") || sourceTitle.includes("banca")) return frontCandidate.key === "defense";
      if (sourceTitle.includes("disser")) return frontCandidate.key === "integrative_text";
      return false;
    });
    if (!frontItem) continue;

    if (typeof source.description === "string" && source.description.trim()) frontItem.status = source.description;
    if (typeof source.targetDate === "string") frontItem.targetDate = source.targetDate;
    if (typeof source.notes === "string") frontItem.notes = source.notes;
    if (Array.isArray(source.tasks) && source.tasks.length > 0) {
      frontItem.steps = source.tasks
        .filter((task) => typeof task.title === "string" && task.title.trim())
        .map((task) => ({
          id: typeof task.id === "string" ? task.id : newId(),
          title: String(task.title).trim(),
          done: task.status === "done",
          dueDate: typeof task.dueDate === "string" ? task.dueDate : null,
          completedAt: typeof task.completedAt === "string" ? task.completedAt : null,
          createdAt: typeof task.createdAt === "string" ? task.createdAt : nowIso(),
          updatedAt: typeof task.updatedAt === "string" ? task.updatedAt : nowIso(),
        }));
    }
  }

  return next;
}

export async function saveDissertationProject(
  userEmail: string,
  project: DissertationProject
): Promise<DissertationProject> {
  const next = normalizeProject({ ...project, updatedAt: nowIso(), version: 3 });
  await prisma.setting.upsert({
    where: { key: settingKey(userEmail) },
    create: { key: settingKey(userEmail), value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

function normalizeProject(project: DissertationProject): DissertationProject {
  const defaults = buildDefaultProject();
  const frontsByKey = new Map(project.fronts.map((item) => [item.key, item]));

  const fronts = defaults.fronts.map((fallback) => {
    const existing = frontsByKey.get(fallback.key);
    const source = existing || fallback;
    return {
      ...fallback,
      ...source,
      title: source.title.trim() || fallback.title,
      status: source.status.trim() || fallback.status,
      notes: source.notes || "",
      steps: source.steps
        .filter((item) => item.title.trim().length > 0)
        .map((item) => ({
          ...item,
          title: item.title.trim(),
          dueDate: item.done
            ? item.dueDate || null
            : normalizeDissertationDueDate(item.dueDate) || null,
          completedAt: item.done ? item.completedAt || nowIso() : null,
          updatedAt: item.updatedAt || nowIso(),
          createdAt: item.createdAt || nowIso(),
        })),
    };
  });

  return {
    ...defaults,
    ...project,
    title: project.title.trim() || defaults.title,
    subtitle: project.subtitle.trim() || defaults.subtitle,
    defenseTargetDate: project.defenseTargetDate || defaults.defenseTargetDate,
    fronts,
    generalNotes: project.generalNotes || "",
    updatedAt: project.updatedAt || nowIso(),
    version: 3,
  };
}

export async function applyDissertationAction(
  userEmail: string,
  rawAction: unknown
): Promise<DissertationProject> {
  const parsed = dissertationActionSchema.safeParse(rawAction);
  if (!parsed.success) throw new Error("INVALID_ACTION");
  const action = parsed.data as DissertationAction;
  // Use the raw loader to skip the load-time reconcile — we'll reconcile
  // explicitly after the mutation save below.
  const project = await loadDissertationProjectRaw(userEmail);
  const next = mutateProject(project, action);
  const saved = await saveDissertationProject(userEmail, next);
  await reconcileMirrorsSafely(userEmail, saved);
  return saved;
}

function mutateProject(project: DissertationProject, action: DissertationAction): DissertationProject {
  switch (action.type) {
    case "update_project":
      return {
        ...project,
        title: action.title ?? project.title,
        subtitle: action.subtitle ?? project.subtitle,
        defenseTargetDate:
          action.defenseTargetDate === undefined
            ? project.defenseTargetDate
            : action.defenseTargetDate,
        generalNotes: action.generalNotes ?? project.generalNotes,
      };

    case "update_front":
      return {
        ...project,
        fronts: project.fronts.map((item) =>
          item.id !== action.frontId
            ? item
            : {
                ...item,
                status: action.status ?? item.status,
                notes: action.notes ?? item.notes,
                targetDate: action.targetDate === undefined ? item.targetDate : action.targetDate,
              }
        ),
      };

    case "add_step": {
      const nextStep = step(action.title, normalizeDissertationDueDate(action.dueDate) ?? null);
      return {
        ...project,
        fronts: project.fronts.map((item) =>
          item.id !== action.frontId ? item : { ...item, steps: [...item.steps, nextStep] }
        ),
      };
    }

    case "update_step": {
      const updatedAt = nowIso();
      return {
        ...project,
        fronts: project.fronts.map((frontItem) =>
          frontItem.id !== action.frontId
            ? frontItem
            : {
                ...frontItem,
                steps: frontItem.steps.map((item) =>
                  item.id !== action.stepId
                    ? item
                    : {
                        ...item,
                        title: action.title ?? item.title,
                        dueDate:
                          action.dueDate === undefined
                            ? item.dueDate
                            : normalizeDissertationDueDate(action.dueDate),
                        done: action.done ?? item.done,
                        completedAt:
                          action.done === undefined
                            ? item.completedAt
                            : action.done
                              ? item.completedAt || updatedAt
                              : null,
                        updatedAt,
                      }
                ),
              }
        ),
      };
    }

    case "delete_step":
      return {
        ...project,
        fronts: project.fronts.map((frontItem) =>
          frontItem.id !== action.frontId
            ? frontItem
            : { ...frontItem, steps: frontItem.steps.filter((item) => item.id !== action.stepId) }
        ),
      };
  }
}
