"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activeRaidCount,
  collectUpcomingDeadlines,
  formatBrazilianDate,
  formatRelativeDeadline,
  governanceStatusLabel,
  impactLabel,
  listProgressPercent,
  priorityLabel,
  projectProgressPercent,
  projectStatusLabel,
  raidKindLabel,
  statusLabel,
  type DissertationDecision,
  type DissertationAction,
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
} from "@/lib/dissertation";

type DissertationResponse = { project: DissertationProject };

type ViewKey = "overview" | "workstreams" | "governance" | "assets";

const projectStatuses: ProjectStatus[] = ["on_track", "at_risk", "blocked", "complete"];
const taskStatuses: TaskStatus[] = ["todo", "doing", "blocked", "done"];
const priorities: TaskPriority[] = ["low", "medium", "high"];
const raidKinds: RaidKind[] = ["risk", "assumption", "issue", "dependency"];
const impacts: ImpactLevel[] = ["low", "medium", "high"];
const governanceStatuses: GovernanceItemStatus[] = ["open", "monitoring", "resolved"];

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

function cleanNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function splitCsv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function projectStats(project: DissertationProject) {
  const tasks = project.lists.flatMap((list) => list.tasks);
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const highPriority = tasks.filter((task) => task.priority === "high" && task.status !== "done").length;
  const hours = tasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);
  return { total, done, blocked, highPriority, hours };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function DissertationClient({ initialProject }: { initialProject: DissertationProject }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewKey>("overview");
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>({});
  const [workstreamDraft, setWorkstreamDraft] = useState({ title: "", code: "WS" });
  const [milestoneDraft, setMilestoneDraft] = useState({ title: "", date: "" });
  const [raidDraft, setRaidDraft] = useState({ kind: "risk" as RaidKind, title: "", owner: "", impact: "medium" as ImpactLevel });
  const [decisionDraft, setDecisionDraft] = useState({ title: "", owner: "" });
  const [stakeholderDraft, setStakeholderDraft] = useState({ name: "", role: "" });
  const [documentDraft, setDocumentDraft] = useState({ title: "", docType: "Manuscript", url: "" });
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
      window.setTimeout(() => setNotice(null), 1400);
    },
    onError: () => setNotice("Could not save"),
  });

  const project = projectQuery.data;
  const stats = useMemo(() => projectStats(project), [project]);
  const deadlines = useMemo(() => collectUpcomingDeadlines(project, 60).slice(0, 8), [project]);
  const activeRaid = activeRaidCount(project);
  const nextMilestone = project.milestones.find((milestone) => !milestone.done) || null;

  function mutate(action: DissertationAction) {
    actionMutation.mutate(action);
  }

  function addTask(listId: string) {
    const title = (taskDrafts[listId] || "").trim();
    if (!title) return;
    setTaskDrafts((current) => ({ ...current, [listId]: "" }));
    mutate({ type: "add_task", listId, title, priority: "medium" });
  }

  function addWorkstream() {
    const title = workstreamDraft.title.trim();
    if (!title) return;
    mutate({ type: "add_list", title, emoji: workstreamDraft.code.trim() || "WS" });
    setWorkstreamDraft({ title: "", code: "WS" });
  }

  function addMilestone() {
    const title = milestoneDraft.title.trim();
    if (!title || !milestoneDraft.date) return;
    mutate({ type: "add_milestone", title, date: milestoneDraft.date });
    setMilestoneDraft({ title: "", date: "" });
  }

  function addRaid() {
    const title = raidDraft.title.trim();
    if (!title) return;
    mutate({ type: "add_raid", ...raidDraft, title });
    setRaidDraft({ kind: "risk", title: "", owner: "", impact: "medium" });
  }

  function addDecision() {
    const title = decisionDraft.title.trim();
    if (!title) return;
    mutate({ type: "add_decision", title, owner: decisionDraft.owner, date: todayIso() });
    setDecisionDraft({ title: "", owner: "" });
  }

  function addStakeholder() {
    const name = stakeholderDraft.name.trim();
    if (!name) return;
    mutate({ type: "add_stakeholder", name, role: stakeholderDraft.role });
    setStakeholderDraft({ name: "", role: "" });
  }

  function addDocument() {
    const title = documentDraft.title.trim();
    if (!title) return;
    mutate({ type: "add_document", title, docType: documentDraft.docType, url: documentDraft.url });
    setDocumentDraft({ title: "", docType: "Manuscript", url: "" });
  }

  return (
    <section className="dissertation-control" aria-label="Dissertation Project Control Center">
      <header className="dissertation-control-hero">
        <div>
          <p className="dissertation-control-kicker">Project Control Center</p>
          <h2>{project.title}</h2>
          <p>{project.subtitle}</p>
        </div>
        <div className={`dissertation-exec-status ${project.status}`}>
          <span>Overall status</span>
          <select value={project.status} onChange={(event) => mutate({ type: "update_meta", status: event.target.value as ProjectStatus })}>
            {projectStatuses.map((status) => <option key={status} value={status}>{projectStatusLabel(status)}</option>)}
          </select>
        </div>
      </header>

      <nav className="dissertation-control-tabs" aria-label="Dissertation sections">
        {[
          ["overview", "Overview"],
          ["workstreams", "Workstreams"],
          ["governance", "Governance"],
          ["assets", "Assets"],
        ].map(([key, label]) => (
          <button key={key} type="button" className={view === key ? "active" : ""} onClick={() => setView(key as ViewKey)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="dissertation-exec-grid">
        <ExecCard label="Progress" value={`${projectProgressPercent(project)}%`} hint={`${stats.done}/${stats.total} tasks`} />
        <ExecCard label="Next milestone" value={nextMilestone ? nextMilestone.title : "None"} hint={nextMilestone ? formatRelativeDeadline(nextMilestone.date) : "add one"} />
        <ExecCard label="Open RAID" value={String(activeRaid)} hint="risks / issues / deps" />
        <ExecCard label="High priority" value={String(stats.highPriority)} hint="open critical work" />
      </div>

      {view === "overview" ? (
        <OverviewView
          project={project}
          deadlines={deadlines}
          milestoneDraft={milestoneDraft}
          setMilestoneDraft={setMilestoneDraft}
          addMilestone={addMilestone}
          mutate={mutate}
        />
      ) : null}

      {view === "workstreams" ? (
        <WorkstreamsView
          project={project}
          taskDrafts={taskDrafts}
          setTaskDrafts={setTaskDrafts}
          workstreamDraft={workstreamDraft}
          setWorkstreamDraft={setWorkstreamDraft}
          addTask={addTask}
          addWorkstream={addWorkstream}
          mutate={mutate}
        />
      ) : null}

      {view === "governance" ? (
        <GovernanceView
          project={project}
          raidDraft={raidDraft}
          setRaidDraft={setRaidDraft}
          decisionDraft={decisionDraft}
          setDecisionDraft={setDecisionDraft}
          addRaid={addRaid}
          addDecision={addDecision}
          mutate={mutate}
        />
      ) : null}

      {view === "assets" ? (
        <AssetsView
          project={project}
          stakeholderDraft={stakeholderDraft}
          setStakeholderDraft={setStakeholderDraft}
          documentDraft={documentDraft}
          setDocumentDraft={setDocumentDraft}
          addStakeholder={addStakeholder}
          addDocument={addDocument}
          mutate={mutate}
        />
      ) : null}

      <div className="dissertation-sync-state" aria-live="polite">
        {notice || (projectQuery.isFetching || actionMutation.isPending ? "Syncing..." : "")}
      </div>
    </section>
  );
}

function ExecCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="dissertation-exec-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function OverviewView({
  project,
  deadlines,
  milestoneDraft,
  setMilestoneDraft,
  addMilestone,
  mutate,
}: {
  project: DissertationProject;
  deadlines: ReturnType<typeof collectUpcomingDeadlines>;
  milestoneDraft: { title: string; date: string };
  setMilestoneDraft: Dispatch<SetStateAction<{ title: string; date: string }>>;
  addMilestone: () => void;
  mutate: (action: DissertationAction) => void;
}) {
  return (
    <div className="dissertation-board-grid">
      <section className="dissertation-corporate-card wide">
        <div className="dissertation-section-head">
          <div><span>01</span><h3>Executive summary</h3></div>
        </div>
        <div className="dissertation-meta-grid">
          <label><span>Current phase</span><input defaultValue={project.currentPhase} onBlur={(event) => mutate({ type: "update_meta", currentPhase: event.target.value })} /></label>
          <label><span>Weekly focus</span><input defaultValue={project.weeklyFocus} onBlur={(event) => mutate({ type: "update_meta", weeklyFocus: event.target.value })} /></label>
          <label><span>Next review</span><input type="date" defaultValue={project.nextReviewDate || ""} onBlur={(event) => mutate({ type: "update_meta", nextReviewDate: event.target.value || null })} /></label>
          <label><span>Defense</span><input type="date" defaultValue={project.defenseDate || ""} onBlur={(event) => mutate({ type: "update_meta", defenseDate: event.target.value || null })} /></label>
        </div>
      </section>

      <section className="dissertation-corporate-card">
        <div className="dissertation-section-head"><div><span>02</span><h3>Project charter</h3></div></div>
        <CorporateTextarea label="Objective" value={project.charter.objective} onSave={(objective) => mutate({ type: "update_meta", charter: { objective } })} />
        <CorporateTextarea label="Scope" value={project.charter.scope} onSave={(scope) => mutate({ type: "update_meta", charter: { scope } })} />
        <CorporateTextarea label="Success criteria" value={project.charter.successCriteria} onSave={(successCriteria) => mutate({ type: "update_meta", charter: { successCriteria } })} />
      </section>

      <section className="dissertation-corporate-card">
        <div className="dissertation-section-head"><div><span>03</span><h3>Weekly status</h3></div></div>
        <CorporateTextarea label="Summary" value={project.weeklyStatus.summary} onSave={(summary) => mutate({ type: "update_meta", weeklyStatus: { summary } })} />
        <CorporateTextarea label="Wins" value={project.weeklyStatus.wins} onSave={(wins) => mutate({ type: "update_meta", weeklyStatus: { wins } })} />
        <CorporateTextarea label="Blockers" value={project.weeklyStatus.blockers} onSave={(blockers) => mutate({ type: "update_meta", weeklyStatus: { blockers } })} />
        <CorporateTextarea label="Next focus" value={project.weeklyStatus.nextFocus} onSave={(nextFocus) => mutate({ type: "update_meta", weeklyStatus: { nextFocus } })} />
      </section>

      <section className="dissertation-corporate-card">
        <div className="dissertation-section-head"><div><span>04</span><h3>Roadmap</h3></div></div>
        <div className="dissertation-inline-form two">
          <input placeholder="Milestone" value={milestoneDraft.title} onChange={(event) => setMilestoneDraft((current) => ({ ...current, title: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") addMilestone(); }} />
          <input type="date" value={milestoneDraft.date} onChange={(event) => setMilestoneDraft((current) => ({ ...current, date: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") addMilestone(); }} />
        </div>
        <div className="dissertation-timeline">
          {project.milestones.length === 0 ? <p className="dissertation-empty">No milestones yet.</p> : project.milestones.map((milestone) => (
            <MilestoneItem key={milestone.id} milestone={milestone} mutate={mutate} />
          ))}
        </div>
      </section>

      <section className="dissertation-corporate-card">
        <div className="dissertation-section-head"><div><span>05</span><h3>Upcoming deadlines</h3></div></div>
        <div className="dissertation-deadline-table">
          {deadlines.length === 0 ? <p className="dissertation-empty">No upcoming deadlines.</p> : deadlines.map((item) => (
            <div key={`${item.kind}-${item.id}`}>
              <strong>{item.title}</strong>
              <span>{item.listTitle || item.kind}</span>
              <em>{formatRelativeDeadline(item.date)}</em>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function WorkstreamsView({
  project,
  taskDrafts,
  setTaskDrafts,
  workstreamDraft,
  setWorkstreamDraft,
  addTask,
  addWorkstream,
  mutate,
}: {
  project: DissertationProject;
  taskDrafts: Record<string, string>;
  setTaskDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  workstreamDraft: { title: string; code: string };
  setWorkstreamDraft: Dispatch<SetStateAction<{ title: string; code: string }>>;
  addTask: (listId: string) => void;
  addWorkstream: () => void;
  mutate: (action: DissertationAction) => void;
}) {
  return (
    <section className="dissertation-corporate-card wide">
      <div className="dissertation-section-head">
        <div><span>WS</span><h3>Workstreams and deliverables</h3></div>
        <div className="dissertation-inline-form compact">
          <input className="code" value={workstreamDraft.code} onChange={(event) => setWorkstreamDraft((current) => ({ ...current, code: event.target.value }))} />
          <input placeholder="New workstream" value={workstreamDraft.title} onChange={(event) => setWorkstreamDraft((current) => ({ ...current, title: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") addWorkstream(); }} />
        </div>
      </div>
      <div className="dissertation-workstream-grid">
        {project.lists.map((list) => (
          <article key={list.id} className="dissertation-workstream-card" style={{ borderTopColor: list.color }}>
            <header>
              <div><span>{list.emoji}</span><h4>{list.title}</h4></div>
              <strong>{listProgressPercent(list)}%</strong>
            </header>
            <div className="dissertation-workstream-meter"><span style={{ width: `${listProgressPercent(list)}%`, background: list.color }} /></div>
            <div className="dissertation-workstream-fields">
              <input defaultValue={list.title} onBlur={(event) => event.target.value.trim() && event.target.value !== list.title && mutate({ type: "update_list", listId: list.id, title: event.target.value })} />
              <input type="date" defaultValue={list.targetDate || ""} onBlur={(event) => mutate({ type: "update_list", listId: list.id, targetDate: event.target.value || null })} />
              <input placeholder="Phases, comma separated" defaultValue={list.phasesSuggested.join(", ")} onBlur={(event) => mutate({ type: "update_list", listId: list.id, phasesSuggested: splitCsv(event.target.value) })} />
            </div>
            <div className="dissertation-inline-form">
              <input placeholder="Add deliverable + Enter" value={taskDrafts[list.id] || ""} onChange={(event) => setTaskDrafts((current) => ({ ...current, [list.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") addTask(list.id); }} />
            </div>
            <div className="dissertation-task-table">
              {list.tasks.length === 0 ? <p className="dissertation-empty">No deliverables.</p> : list.tasks.map((task) => <TaskLine key={task.id} list={list} task={task} project={project} mutate={mutate} />)}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function GovernanceView({
  project,
  raidDraft,
  setRaidDraft,
  decisionDraft,
  setDecisionDraft,
  addRaid,
  addDecision,
  mutate,
}: {
  project: DissertationProject;
  raidDraft: { kind: RaidKind; title: string; owner: string; impact: ImpactLevel };
  setRaidDraft: Dispatch<SetStateAction<{ kind: RaidKind; title: string; owner: string; impact: ImpactLevel }>>;
  decisionDraft: { title: string; owner: string };
  setDecisionDraft: Dispatch<SetStateAction<{ title: string; owner: string }>>;
  addRaid: () => void;
  addDecision: () => void;
  mutate: (action: DissertationAction) => void;
}) {
  return (
    <div className="dissertation-board-grid">
      <section className="dissertation-corporate-card wide">
        <div className="dissertation-section-head"><div><span>RAID</span><h3>Risks, assumptions, issues, dependencies</h3></div></div>
        <div className="dissertation-inline-form raid">
          <select value={raidDraft.kind} onChange={(event) => setRaidDraft((current) => ({ ...current, kind: event.target.value as RaidKind }))}>{raidKinds.map((kind) => <option key={kind} value={kind}>{raidKindLabel(kind)}</option>)}</select>
          <input placeholder="Item + Enter" value={raidDraft.title} onChange={(event) => setRaidDraft((current) => ({ ...current, title: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") addRaid(); }} />
          <input placeholder="Owner" value={raidDraft.owner} onChange={(event) => setRaidDraft((current) => ({ ...current, owner: event.target.value }))} />
          <select value={raidDraft.impact} onChange={(event) => setRaidDraft((current) => ({ ...current, impact: event.target.value as ImpactLevel }))}>{impacts.map((impact) => <option key={impact} value={impact}>{impactLabel(impact)}</option>)}</select>
        </div>
        <div className="dissertation-data-table raid-table">
          {project.raid.length === 0 ? <p className="dissertation-empty">No RAID items.</p> : project.raid.map((item) => <RaidRow key={item.id} item={item} mutate={mutate} />)}
        </div>
      </section>

      <section className="dissertation-corporate-card wide">
        <div className="dissertation-section-head"><div><span>DEC</span><h3>Decision log</h3></div></div>
        <div className="dissertation-inline-form two">
          <input placeholder="Decision + Enter" value={decisionDraft.title} onChange={(event) => setDecisionDraft((current) => ({ ...current, title: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") addDecision(); }} />
          <input placeholder="Owner" value={decisionDraft.owner} onChange={(event) => setDecisionDraft((current) => ({ ...current, owner: event.target.value }))} />
        </div>
        <div className="dissertation-data-table">
          {project.decisions.length === 0 ? <p className="dissertation-empty">No decisions recorded.</p> : project.decisions.map((item) => <DecisionRow key={item.id} item={item} mutate={mutate} />)}
        </div>
      </section>
    </div>
  );
}

function AssetsView({
  project,
  stakeholderDraft,
  setStakeholderDraft,
  documentDraft,
  setDocumentDraft,
  addStakeholder,
  addDocument,
  mutate,
}: {
  project: DissertationProject;
  stakeholderDraft: { name: string; role: string };
  setStakeholderDraft: Dispatch<SetStateAction<{ name: string; role: string }>>;
  documentDraft: { title: string; docType: string; url: string };
  setDocumentDraft: Dispatch<SetStateAction<{ title: string; docType: string; url: string }>>;
  addStakeholder: () => void;
  addDocument: () => void;
  mutate: (action: DissertationAction) => void;
}) {
  return (
    <div className="dissertation-board-grid">
      <section className="dissertation-corporate-card">
        <div className="dissertation-section-head"><div><span>ORG</span><h3>Stakeholders</h3></div></div>
        <div className="dissertation-inline-form two">
          <input placeholder="Name + Enter" value={stakeholderDraft.name} onChange={(event) => setStakeholderDraft((current) => ({ ...current, name: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") addStakeholder(); }} />
          <input placeholder="Role" value={stakeholderDraft.role} onChange={(event) => setStakeholderDraft((current) => ({ ...current, role: event.target.value }))} />
        </div>
        <div className="dissertation-data-table">
          {project.stakeholders.map((item) => <StakeholderRow key={item.id} item={item} mutate={mutate} />)}
        </div>
      </section>

      <section className="dissertation-corporate-card">
        <div className="dissertation-section-head"><div><span>DOC</span><h3>Document hub</h3></div></div>
        <div className="dissertation-inline-form two">
          <input placeholder="Document + Enter" value={documentDraft.title} onChange={(event) => setDocumentDraft((current) => ({ ...current, title: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") addDocument(); }} />
          <input placeholder="URL" value={documentDraft.url} onChange={(event) => setDocumentDraft((current) => ({ ...current, url: event.target.value }))} />
        </div>
        <div className="dissertation-data-table">
          {project.documents.length === 0 ? <p className="dissertation-empty">No documents yet.</p> : project.documents.map((item) => <DocumentRow key={item.id} item={item} mutate={mutate} />)}
        </div>
      </section>

      <section className="dissertation-corporate-card wide">
        <div className="dissertation-section-head"><div><span>NOTES</span><h3>General notes</h3></div></div>
        <CorporateTextarea label="Notes" value={project.generalNotes} onSave={(generalNotes) => mutate({ type: "update_meta", generalNotes })} />
      </section>
    </div>
  );
}

function CorporateTextarea({ label, value, onSave }: { label: string; value: string; onSave: (value: string) => void }) {
  return (
    <label className="dissertation-corporate-textarea">
      <span>{label}</span>
      <textarea defaultValue={value} onBlur={(event) => event.target.value !== value && onSave(event.target.value)} />
    </label>
  );
}

function MilestoneItem({ milestone, mutate }: { milestone: DissertationMilestone; mutate: (action: DissertationAction) => void }) {
  return (
    <div className={`dissertation-timeline-item ${milestone.done ? "done" : ""}`}>
      <button type="button" className={`task-check ${milestone.done ? "checked" : ""}`} onClick={() => mutate({ type: "update_milestone", id: milestone.id, done: !milestone.done })} aria-label="Toggle milestone" />
      <input defaultValue={milestone.title} onBlur={(event) => event.target.value.trim() && event.target.value !== milestone.title && mutate({ type: "update_milestone", id: milestone.id, title: event.target.value })} />
      <input type="date" defaultValue={milestone.date} onBlur={(event) => event.target.value && event.target.value !== milestone.date && mutate({ type: "update_milestone", id: milestone.id, date: event.target.value })} />
      <button type="button" onClick={() => mutate({ type: "delete_milestone", id: milestone.id })}>Delete</button>
    </div>
  );
}

function TaskLine({ list, task, project, mutate }: { list: DissertationList; task: DissertationTask; project: DissertationProject; mutate: (action: DissertationAction) => void }) {
  return (
    <div className={`dissertation-task-line ${task.status}`}>
      <button type="button" className={`task-check ${task.status === "done" ? "checked" : ""}`} onClick={() => mutate({ type: "toggle_task_status", listId: list.id, taskId: task.id, status: task.status === "done" ? "todo" : "done" })} aria-label="Toggle task" />
      <input className="title" defaultValue={task.title} onBlur={(event) => event.target.value.trim() && event.target.value !== task.title && mutate({ type: "update_task", listId: list.id, taskId: task.id, title: event.target.value })} />
      <select value={task.status} onChange={(event) => mutate({ type: "update_task", listId: list.id, taskId: task.id, status: event.target.value as TaskStatus })}>{taskStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select>
      <select value={task.priority} onChange={(event) => mutate({ type: "update_task", listId: list.id, taskId: task.id, priority: event.target.value as TaskPriority })}>{priorities.map((priority) => <option key={priority} value={priority}>{priorityLabel(priority)}</option>)}</select>
      <input type="date" defaultValue={task.dueDate || ""} onBlur={(event) => mutate({ type: "update_task", listId: list.id, taskId: task.id, dueDate: event.target.value || null })} />
      <input className="hours" inputMode="decimal" defaultValue={task.estimatedHours ?? ""} onBlur={(event) => mutate({ type: "update_task", listId: list.id, taskId: task.id, estimatedHours: cleanNumber(event.target.value) })} />
      <select value={list.id} onChange={(event) => mutate({ type: "move_task", taskId: task.id, fromListId: list.id, toListId: event.target.value })}>{project.lists.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
      <button type="button" onClick={() => mutate({ type: "delete_task", listId: list.id, taskId: task.id })}>Delete</button>
    </div>
  );
}

function RaidRow({ item, mutate }: { item: DissertationRaidItem; mutate: (action: DissertationAction) => void }) {
  return (
    <div className={`dissertation-data-row ${item.impact}`}>
      <span>{raidKindLabel(item.kind)}</span>
      <input defaultValue={item.title} onBlur={(event) => event.target.value.trim() && event.target.value !== item.title && mutate({ type: "update_raid", id: item.id, title: event.target.value })} />
      <input defaultValue={item.owner} placeholder="Owner" onBlur={(event) => event.target.value !== item.owner && mutate({ type: "update_raid", id: item.id, owner: event.target.value })} />
      <select value={item.impact} onChange={(event) => mutate({ type: "update_raid", id: item.id, impact: event.target.value as ImpactLevel })}>{impacts.map((impact) => <option key={impact} value={impact}>{impactLabel(impact)}</option>)}</select>
      <select value={item.status} onChange={(event) => mutate({ type: "update_raid", id: item.id, status: event.target.value as GovernanceItemStatus })}>{governanceStatuses.map((status) => <option key={status} value={status}>{governanceStatusLabel(status)}</option>)}</select>
      <button type="button" onClick={() => mutate({ type: "delete_raid", id: item.id })}>Delete</button>
    </div>
  );
}

function DecisionRow({ item, mutate }: { item: DissertationDecision; mutate: (action: DissertationAction) => void }) {
  return (
    <div className="dissertation-data-row decision">
      <input defaultValue={item.title} onBlur={(event) => event.target.value.trim() && event.target.value !== item.title && mutate({ type: "update_decision", id: item.id, title: event.target.value })} />
      <input defaultValue={item.owner} placeholder="Owner" onBlur={(event) => event.target.value !== item.owner && mutate({ type: "update_decision", id: item.id, owner: event.target.value })} />
      <input type="date" defaultValue={item.date} onBlur={(event) => event.target.value && event.target.value !== item.date && mutate({ type: "update_decision", id: item.id, date: event.target.value })} />
      <input defaultValue={item.rationale} placeholder="Rationale" onBlur={(event) => event.target.value !== item.rationale && mutate({ type: "update_decision", id: item.id, rationale: event.target.value })} />
      <button type="button" onClick={() => mutate({ type: "delete_decision", id: item.id })}>Delete</button>
    </div>
  );
}

function StakeholderRow({ item, mutate }: { item: DissertationStakeholder; mutate: (action: DissertationAction) => void }) {
  return (
    <div className="dissertation-data-row stakeholder">
      <input defaultValue={item.name} onBlur={(event) => event.target.value.trim() && event.target.value !== item.name && mutate({ type: "update_stakeholder", id: item.id, name: event.target.value })} />
      <input defaultValue={item.role} placeholder="Role" onBlur={(event) => event.target.value !== item.role && mutate({ type: "update_stakeholder", id: item.id, role: event.target.value })} />
      <input defaultValue={item.email} placeholder="Email" onBlur={(event) => event.target.value !== item.email && mutate({ type: "update_stakeholder", id: item.id, email: event.target.value })} />
      <button type="button" onClick={() => mutate({ type: "delete_stakeholder", id: item.id })}>Delete</button>
    </div>
  );
}

function DocumentRow({ item, mutate }: { item: DissertationDocument; mutate: (action: DissertationAction) => void }) {
  return (
    <div className="dissertation-data-row document">
      <input defaultValue={item.title} onBlur={(event) => event.target.value.trim() && event.target.value !== item.title && mutate({ type: "update_document", id: item.id, title: event.target.value })} />
      <input defaultValue={item.type} placeholder="Type" onBlur={(event) => event.target.value !== item.type && mutate({ type: "update_document", id: item.id, docType: event.target.value })} />
      <input defaultValue={item.version} placeholder="Version" onBlur={(event) => event.target.value !== item.version && mutate({ type: "update_document", id: item.id, version: event.target.value })} />
      <input defaultValue={item.url} placeholder="URL" onBlur={(event) => event.target.value !== item.url && mutate({ type: "update_document", id: item.id, url: event.target.value })} />
      <button type="button" onClick={() => mutate({ type: "delete_document", id: item.id })}>Delete</button>
    </div>
  );
}
