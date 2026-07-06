"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collectDissertationDeadlines,
  countDoneToday,
  formatBrazilianDate,
  formatRelativeDeadline,
  frontProgressPercent,
  isDissertationFrontComplete,
  isoDateDiffDays,
  projectProgressPercent,
  todayStepForFront,
  type DissertationAction,
  type DissertationDeadline,
  type DissertationFront,
  type DissertationProject,
  type DissertationStep,
} from "@/lib/dissertation";

type DateUrgency = "overdue" | "soon" | "near" | "later" | "none";

function dateUrgency(iso: string | null, todayIso: string): DateUrgency {
  if (!iso) return "none";
  const days = isoDateDiffDays(todayIso, iso);
  if (days < 0) return "overdue";
  if (days <= 3) return "soon";
  if (days <= 14) return "near";
  return "later";
}

type DissertationResponse = { project: DissertationProject };

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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function projectStats(project: DissertationProject) {
  const steps = project.fronts.flatMap((front) => front.steps);
  const done = steps.filter((step) => step.done).length;
  const withDates = steps.filter((step) => step.dueDate && !step.done).length;
  const completedFronts = project.fronts.filter(isDissertationFrontComplete).length;
  return { total: steps.length, done, withDates, completedFronts };
}

export default function DissertationClient({ initialProject }: { initialProject: DissertationProject }) {
  const queryClient = useQueryClient();
  const [todayDrafts, setTodayDrafts] = useState<Record<string, string>>({});
  const [stepDrafts, setStepDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const today = todayIso();

  const projectQuery = useQuery({
    queryKey: ["dissertation-project"],
    queryFn: fetchProject,
    initialData: initialProject,
  });

  // The server reconciles dissertation→calendar mirrors on every load, so by
  // the time this client renders the calendar's task list may have new mirror
  // rows the user hasn't seen yet. Invalidate the calendar's tasks cache once
  // on mount so the next /calendar visit refetches from scratch.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actionMutation = useMutation({
    mutationFn: patchProject,
    onSuccess: (project) => {
      queryClient.setQueryData(["dissertation-project"], project);
      // Every dissertation step change reconciles the calendar mirror on the
      // server. Invalidate the calendar's tasks query so the new mirrored
      // task (or its title/dueDate update) shows up the moment the user
      // navigates to /calendar — no stale-cache surprises.
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setNotice("Saved");
      window.setTimeout(() => setNotice(null), 1400);
    },
    onError: () => setNotice("Could not save"),
  });

  const project = projectQuery.data;
  const stats = useMemo(() => projectStats(project), [project]);
  const deadlines = useMemo(() => collectDissertationDeadlines(project).slice(0, 12), [project]);
  const { activeFronts, completedFronts } = useMemo(
    () => ({
      activeFronts: project.fronts.filter((front) => !isDissertationFrontComplete(front)),
      completedFronts: project.fronts.filter(isDissertationFrontComplete),
    }),
    [project.fronts]
  );
  const orderedFronts = useMemo(
    () => [...activeFronts, ...completedFronts],
    [activeFronts, completedFronts]
  );
  const activeFrontCount = activeFronts.length;
  const doneToday = countDoneToday(project, today);
  const allTodayDone = activeFrontCount === 0 || (doneToday > 0 && doneToday >= activeFrontCount);
  const defenseUrgency = dateUrgency(project.defenseTargetDate, today);
  const defenseCountdown = project.defenseTargetDate
    ? formatRelativeDeadline(project.defenseTargetDate, today)
    : "sem data";

  // Cross-device sync: when the PWA is suspended (mobile background, tab hide,
  // page navigated away), blur the active input/textarea so any pending onBlur
  // saves fire, then send a keepalive PUT with the current project state as a
  // safety net via sendBeacon. Mirrors the FinancesTab pattern that fixed the
  // mobile-typing-then-switching-to-desktop data-loss class of bugs.
  const projectRef = useRef<DissertationProject>(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    const flush = () => {
      const root = document.querySelector(".dissertation-academic");
      if (root && document.activeElement instanceof HTMLElement && root.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      const snapshot = projectRef.current;
      if (!snapshot) return;
      const body = JSON.stringify(snapshot);
      try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const blob = new Blob([body], { type: "application/json" });
          if (navigator.sendBeacon("/api/dissertation", blob)) return;
        }
      } catch { /* fall through */ }
      void fetch("/api/dissertation", {
        method: "PUT",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => { /* best-effort */ });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  function mutate(action: DissertationAction) {
    actionMutation.mutate(action);
  }

  function addTodayStep(front: DissertationFront) {
    const title = (todayDrafts[front.id] || "").trim();
    if (!title) return;
    setTodayDrafts((current) => ({ ...current, [front.id]: "" }));
    mutate({ type: "add_step", frontId: front.id, title, dueDate: today });
  }

  const syncMutation = useMutation({
    mutationFn: () =>
      fetch("/api/dissertation/sync", { method: "POST" }).then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as {
          ok: boolean;
          mirrorCount: number;
          stepCount: number;
          reconcileError: string | null;
        };
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  function addStep(front: DissertationFront) {
    const title = (stepDrafts[front.id] || "").trim();
    if (!title) return;
    setStepDrafts((current) => ({ ...current, [front.id]: "" }));
    mutate({ type: "add_step", frontId: front.id, title });
  }

  return (
    <section className="dissertation-academic" aria-label="Dissertação">
      <header className="dissertation-academic-hero">
        <div>
          <p>Mestrado · 6 frentes</p>
          <h2>{project.title}</h2>
          <span>{project.subtitle}</span>
        </div>
        <div className="dissertation-academic-progress">
          <strong>{projectProgressPercent(project)}%</strong>
          <span>geral</span>
        </div>
        <div className={`dissertation-academic-date urgency-${defenseUrgency}`}>
          <span>Defesa</span>
          <strong>{defenseCountdown}</strong>
        </div>
      </header>

      <div className="dissertation-academic-stats">
        <SmallStat label="Passos" value={`${stats.done}/${stats.total}`} />
        <SmallStat label="Hoje" value={`${doneToday}/${activeFrontCount}`} />
        <SmallStat label="Frentes" value={`${stats.completedFronts}/${project.fronts.length}`} />
        <SmallStat label="Com prazo" value={String(stats.withDates)} />
      </div>

      <div className="dissertation-sync-chip" role="status">
        <button
          type="button"
          className="dissertation-sync-chip-button"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? "Sincronizando…" : "Sincronizar com calendar"}
        </button>
        {syncMutation.data ? (
          syncMutation.data.reconcileError ? (
            <span className="error">
              ⚠ Falhou: {syncMutation.data.reconcileError}
            </span>
          ) : (
            <span className="success">
              ✓ {syncMutation.data.mirrorCount} task(s) no calendar · {syncMutation.data.stepCount} passo(s) na dissertação
            </span>
          )
        ) : null}
        {syncMutation.isError ? (
          <span className="error">⚠ Erro de rede</span>
        ) : null}
      </div>

      <section className={`dissertation-today-panel ${allTodayDone ? "all-done" : ""}`}>
        <div className="dissertation-section-title">
          <div>
            <p>Hoje</p>
            <h3>Um passinho por frente</h3>
          </div>
          <span>{formatBrazilianDate(today)}</span>
        </div>
        {allTodayDone ? (
          <div className="dissertation-today-celebration" role="status">
            🎉 Dia completo — passinho em todas as frentes
          </div>
        ) : null}
        <div className="dissertation-today-grid">
          {activeFronts.length === 0 ? (
            <p className="dissertation-empty">Todas as frentes estão concluídas.</p>
          ) : null}
          {activeFronts.map((front) => (
            <TodayFrontRow
              key={front.id}
              front={front}
              today={today}
              draft={todayDrafts[front.id] || ""}
              setDrafts={setTodayDrafts}
              onAdd={() => addTodayStep(front)}
              mutate={mutate}
            />
          ))}
        </div>
      </section>

      <section className="dissertation-fronts-section">
        <div className="dissertation-section-title">
          <div>
            <p>Frentes</p>
            <h3>Status, próximos passos e ideias</h3>
          </div>
        </div>
        <div className="dissertation-front-grid">
          {orderedFronts.map((front) => (
            <FrontCard
              key={front.id}
              front={front}
              stepDraft={stepDrafts[front.id] || ""}
              setStepDrafts={setStepDrafts}
              onAddStep={() => addStep(front)}
              mutate={mutate}
            />
          ))}
        </div>
      </section>

      <section className="dissertation-deadlines-panel">
        <div className="dissertation-section-title">
          <div>
            <p>Prazos</p>
            <h3>Próximos marcos</h3>
          </div>
        </div>
        <DeadlineList deadlines={deadlines} today={today} />
      </section>

      <label className="dissertation-general-notes">
        <span>Notas gerais</span>
        <textarea
          defaultValue={project.generalNotes}
          onBlur={(event) => {
            if (event.target.value !== project.generalNotes) {
              mutate({ type: "update_project", generalNotes: event.target.value });
            }
          }}
        />
      </label>

      <div className="dissertation-sync-state" aria-live="polite">
        {notice || (projectQuery.isFetching || actionMutation.isPending ? "Syncing..." : "")}
      </div>
    </section>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function TodayFrontRow({
  front,
  today,
  draft,
  setDrafts,
  onAdd,
  mutate,
}: {
  front: DissertationFront;
  today: string;
  draft: string;
  setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onAdd: () => void;
  mutate: (action: DissertationAction) => void;
}) {
  const todayStep = todayStepForFront(front, today);

  return (
    <article className="dissertation-today-row" style={{ borderLeftColor: front.color }}>
      <div className="dissertation-today-label">
        <span>{front.icon}</span>
        <strong>{front.title}</strong>
      </div>
      {todayStep ? (
        <StepCheckbox front={front} step={todayStep} mutate={mutate} compact />
      ) : (
        <input
          aria-label={`Passinho de hoje para ${front.title}`}
          placeholder="passinho de hoje + Enter"
          value={draft}
          onChange={(event) => setDrafts((current) => ({ ...current, [front.id]: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter") onAdd();
            if (event.key === "Escape") setDrafts((current) => ({ ...current, [front.id]: "" }));
          }}
        />
      )}
    </article>
  );
}

function FrontCard({
  front,
  stepDraft,
  setStepDrafts,
  onAddStep,
  mutate,
}: {
  front: DissertationFront;
  stepDraft: string;
  setStepDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onAddStep: () => void;
  mutate: (action: DissertationAction) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const progress = frontProgressPercent(front);
  const openSteps = front.steps.filter((step) => !step.done);
  const doneSteps = front.steps.filter((step) => step.done);
  const isComplete = isDissertationFrontComplete(front);
  const targetUrgency = dateUrgency(front.targetDate, today);

  return (
    <article
      className={`dissertation-front-card ${isComplete ? "complete" : ""}`}
      style={{ "--front-color": front.color } as CSSProperties}
    >
      <header>
        <div>
          <span>{front.icon}</span>
          <div>
            <h3>{front.title}</h3>
            <p>
              {front.targetDate ? (
                <span className={`diss-date-pill urgency-${targetUrgency}`}>
                  {formatRelativeDeadline(front.targetDate, today)} · {formatBrazilianDate(front.targetDate)}
                </span>
              ) : (
                <span className="diss-date-pill urgency-none">sem prazo</span>
              )}
            </p>
          </div>
        </div>
        <div className="dissertation-front-complete">
          <button
            type="button"
            className={`task-check ${isComplete ? "checked" : ""}`}
            aria-label={isComplete ? `Reabrir ${front.title}` : `Marcar ${front.title} como concluída`}
            aria-pressed={isComplete}
            disabled={front.steps.length === 0}
            onClick={() => mutate({ type: "complete_front", frontId: front.id, done: !isComplete })}
          />
          <strong>{progress}%</strong>
        </div>
      </header>

      <div className="dissertation-front-meter"><span style={{ width: `${progress}%` }} /></div>

      {isComplete ? (
        <div className="dissertation-front-archive-note">
          <span>Concluída</span>
          <p>Arquivada no final. Clique no check para reabrir.</p>
        </div>
      ) : null}

      {!isComplete ? (
        <>
      <label className="dissertation-front-status">
        <span>Status</span>
        <input
          defaultValue={front.status}
          onBlur={(event) => {
            if (event.target.value !== front.status) {
              mutate({ type: "update_front", frontId: front.id, status: event.target.value });
            }
          }}
        />
      </label>

      <label className="dissertation-front-date">
        <span>Prazo da frente</span>
        <input
          type="date"
          defaultValue={front.targetDate || ""}
          onBlur={(event) => mutate({ type: "update_front", frontId: front.id, targetDate: event.target.value || null })}
        />
      </label>

      <div className="dissertation-step-list">
        <p>Próximos passos</p>
        {openSteps.length === 0 ? <span className="dissertation-empty">Nada pendente.</span> : null}
        {openSteps.map((step) => (
          <StepCheckbox key={step.id} front={front} step={step} mutate={mutate} />
        ))}
      </div>

      <div className="dissertation-add-step">
        <input
          placeholder="novo passo + Enter"
          value={stepDraft}
          onChange={(event) => setStepDrafts((current) => ({ ...current, [front.id]: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter") onAddStep();
            if (event.key === "Escape") setStepDrafts((current) => ({ ...current, [front.id]: "" }));
          }}
        />
      </div>

      {doneSteps.length > 0 ? (
        <details className="dissertation-done-steps">
          <summary>{doneSteps.length} concluído(s)</summary>
          {doneSteps.map((step) => (
            <StepCheckbox key={step.id} front={front} step={step} mutate={mutate} compact />
          ))}
        </details>
      ) : null}

      <label className="dissertation-front-notes">
        <span>Ideias / anotações</span>
        <textarea
          defaultValue={front.notes}
          onBlur={(event) => {
            if (event.target.value !== front.notes) {
              mutate({ type: "update_front", frontId: front.id, notes: event.target.value });
            }
          }}
        />
      </label>
        </>
      ) : null}
    </article>
  );
}

function StepCheckbox({
  front,
  step,
  compact = false,
  mutate,
}: {
  front: DissertationFront;
  step: DissertationStep;
  compact?: boolean;
  mutate: (action: DissertationAction) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const urgency = step.done ? "none" : dateUrgency(step.dueDate, today);

  return (
    <div className={`dissertation-step-row ${step.done ? "done" : ""} ${compact ? "compact" : ""} urgency-${urgency}`}>
      <button
        type="button"
        className={`task-check ${step.done ? "checked" : ""}`}
        aria-label={step.done ? "Marcar como pendente" : "Marcar como feito"}
        onClick={() =>
          mutate({ type: "update_step", frontId: front.id, stepId: step.id, done: !step.done })
        }
      />
      <input
        defaultValue={step.title}
        onBlur={(event) => {
          const title = event.target.value.trim();
          if (title && title !== step.title) {
            mutate({ type: "update_step", frontId: front.id, stepId: step.id, title });
          }
        }}
      />
      {!compact ? (
        <input
          type="date"
          defaultValue={step.dueDate || ""}
          onBlur={(event) =>
            mutate({
              type: "update_step",
              frontId: front.id,
              stepId: step.id,
              dueDate: event.target.value || null,
            })
          }
        />
      ) : step.dueDate ? (
        <span className={`diss-date-pill urgency-${urgency}`}>
          {formatRelativeDeadline(step.dueDate, today)}
        </span>
      ) : null}
      {!compact ? (
        <button
          type="button"
          className="dissertation-step-delete"
          aria-label="Remover passo"
          onClick={() =>
            mutate({ type: "delete_step", frontId: front.id, stepId: step.id })
          }
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function DeadlineList({ deadlines, today }: { deadlines: DissertationDeadline[]; today: string }) {
  if (deadlines.length === 0) {
    return <p className="dissertation-empty">✨ Nenhum prazo próximo.</p>;
  }

  return (
    <div className="dissertation-deadline-list-simple">
      {deadlines.map((item) => {
        const urgency = item.done ? "none" : dateUrgency(item.date, today);
        return (
          <article key={item.id} className={`urgency-${urgency} ${item.done ? "done" : ""}`}>
            <span>{item.frontIcon}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.frontTitle}</p>
            </div>
            <em className={`diss-date-pill urgency-${urgency}`}>
              {formatRelativeDeadline(item.date, today)}
            </em>
          </article>
        );
      })}
    </div>
  );
}
