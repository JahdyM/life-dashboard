"use client";

import { useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collectDissertationDeadlines,
  countDoneToday,
  formatBrazilianDate,
  formatRelativeDeadline,
  frontProgressPercent,
  projectProgressPercent,
  todayStepForFront,
  type DissertationAction,
  type DissertationDeadline,
  type DissertationFront,
  type DissertationProject,
  type DissertationStep,
} from "@/lib/dissertation";

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
  return { total: steps.length, done, withDates };
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

  const actionMutation = useMutation({
    mutationFn: patchProject,
    onSuccess: (project) => {
      queryClient.setQueryData(["dissertation-project"], project);
      setNotice("Saved");
      window.setTimeout(() => setNotice(null), 1400);
    },
    onError: () => setNotice("Could not save"),
  });

  const project = projectQuery.data;
  const stats = useMemo(() => projectStats(project), [project]);
  const deadlines = useMemo(() => collectDissertationDeadlines(project).slice(0, 12), [project]);
  const doneToday = countDoneToday(project, today);
  const defenseCountdown = project.defenseTargetDate ? formatRelativeDeadline(project.defenseTargetDate, today) : "sem data";

  function mutate(action: DissertationAction) {
    actionMutation.mutate(action);
  }

  function addTodayStep(front: DissertationFront) {
    const title = (todayDrafts[front.id] || "").trim();
    if (!title) return;
    setTodayDrafts((current) => ({ ...current, [front.id]: "" }));
    mutate({ type: "add_step", frontId: front.id, title, dueDate: today });
  }

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
        <div className="dissertation-academic-date">
          <span>Defesa</span>
          <strong>{defenseCountdown}</strong>
        </div>
      </header>

      <div className="dissertation-academic-stats">
        <SmallStat label="Passos" value={`${stats.done}/${stats.total}`} />
        <SmallStat label="Hoje" value={`${doneToday}/${project.fronts.length}`} />
        <SmallStat label="Com prazo" value={String(stats.withDates)} />
      </div>

      <section className="dissertation-today-panel">
        <div className="dissertation-section-title">
          <div>
            <p>Hoje</p>
            <h3>Um passinho por frente</h3>
          </div>
          <span>{formatBrazilianDate(today)}</span>
        </div>
        <div className="dissertation-today-grid">
          {project.fronts.map((front) => (
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
          {project.fronts.map((front) => (
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
  const progress = frontProgressPercent(front);
  const openSteps = front.steps.filter((step) => !step.done);
  const doneSteps = front.steps.filter((step) => step.done);

  return (
    <article className="dissertation-front-card" style={{ "--front-color": front.color } as CSSProperties}>
      <header>
        <div>
          <span>{front.icon}</span>
          <div>
            <h3>{front.title}</h3>
            <p>{front.targetDate ? `${formatRelativeDeadline(front.targetDate)} · ${formatBrazilianDate(front.targetDate)}` : "sem prazo"}</p>
          </div>
        </div>
        <strong>{progress}%</strong>
      </header>

      <div className="dissertation-front-meter"><span style={{ width: `${progress}%` }} /></div>

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
  return (
    <div className={`dissertation-step-row ${step.done ? "done" : ""} ${compact ? "compact" : ""}`}>
      <button
        type="button"
        className={`task-check ${step.done ? "checked" : ""}`}
        aria-label={step.done ? "Marcar como pendente" : "Marcar como feito"}
        onClick={() => mutate({ type: "update_step", frontId: front.id, stepId: step.id, done: !step.done })}
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
          onBlur={(event) => mutate({ type: "update_step", frontId: front.id, stepId: step.id, dueDate: event.target.value || null })}
        />
      ) : step.dueDate ? (
        <span>{formatRelativeDeadline(step.dueDate)}</span>
      ) : null}
      {!compact ? (
        <button type="button" onClick={() => mutate({ type: "delete_step", frontId: front.id, stepId: step.id })}>Delete</button>
      ) : null}
    </div>
  );
}

function DeadlineList({ deadlines, today }: { deadlines: DissertationDeadline[]; today: string }) {
  if (deadlines.length === 0) {
    return <p className="dissertation-empty">Nenhum prazo próximo.</p>;
  }

  return (
    <div className="dissertation-deadline-list-simple">
      {deadlines.map((item) => (
        <article key={item.id} className={item.date < today ? "overdue" : ""}>
          <span>{item.frontIcon}</span>
          <div>
            <strong>{item.title}</strong>
            <p>{item.frontTitle}</p>
          </div>
          <em>{formatRelativeDeadline(item.date, today)}</em>
        </article>
      ))}
    </div>
  );
}
