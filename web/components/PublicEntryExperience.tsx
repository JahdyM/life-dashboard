import Link from "next/link";

type PublicEntryExperienceProps = {
  mode: "home" | "today";
};

const previewTasks = [
  {
    title: "Bible reading",
    meta: "07:10 · 20 min",
    state: "Done",
    variant: "done",
  },
  {
    title: "Workout",
    meta: "08:00 · 30 min",
    state: "Now",
    variant: "now",
  },
  {
    title: "Deep work block",
    meta: "09:00 · 90 min",
    state: "Pending",
    variant: "pending",
  },
];

const previewCompleted = [
  "Inbox zero · 12 min",
  "Daily text · 8 min",
  "Couple check-in note · 5 min",
];

const previewStreaks = [
  "Bible reading · 12d shared",
  "Workout · 6d shared",
  "Family worship · 4d shared",
];

function PublicTodayPreviewGrid({ showActions = true }: { showActions?: boolean }) {
  return (
    <section className="today-grid">
      <article className="today-panel today-panel-hero">
        <div className="today-panel-head">
          <div>
            <p className="panel-kicker">Preview</p>
            <h2>See today first.</h2>
          </div>
          {showActions ? (
            <div className="today-actions">
              <Link href="/signin?callbackUrl=%2Ftoday" className="page-link primary">
                Sign in
              </Link>
              <Link href="/" className="page-link">
                Home
              </Link>
            </div>
          ) : null}
        </div>

        <ul className="today-task-list">
          {previewTasks.map((task) => (
            <li key={task.title} className="today-task-item">
              <div>
                <p className="today-task-title">{task.title}</p>
                <p className="today-task-meta">{task.meta}</p>
              </div>
              <span className={`today-task-state ${task.variant}`}>{task.state}</span>
            </li>
          ))}
        </ul>
      </article>

      <article className="today-panel">
        <div className="today-panel-head compact">
          <div>
            <p className="panel-kicker">Mood</p>
            <h2>Mood</h2>
          </div>
        </div>
        <div className="today-mood-card">
          <p className="today-mood-value">
            <span>🕊️</span>
            Peace
          </p>
          <p className="today-panel-copy">A quick note keeps context.</p>
        </div>
      </article>

      <article className="today-panel">
        <div className="today-panel-head compact">
          <div>
            <p className="panel-kicker">Completed</p>
            <h2>Done</h2>
          </div>
        </div>
        <ul className="today-compact-list">
          {previewCompleted.map((item) => (
            <li key={item}>
              <span>{item.split(" · ")[0]}</span>
              <small>{item.split(" · ")[1]}</small>
            </li>
          ))}
        </ul>
      </article>

      <article className="today-panel">
        <div className="today-panel-head compact">
          <div>
            <p className="panel-kicker">Notes</p>
            <h2>Notes</h2>
          </div>
        </div>
        <p className="today-note-preview">
          Prepare meeting illustration.
          {"\n"}
          Text Guilherme after lunch.
          {"\n"}
          Move reading block earlier if energy drops.
        </p>
      </article>

      <article className="today-panel today-panel-wide">
        <div className="today-panel-head compact">
          <div>
            <p className="panel-kicker">Shared</p>
            <h2>Shared</h2>
          </div>
        </div>
        <div className="today-streak-list">
          {previewStreaks.map((item) => (
            <div key={item} className="today-streak-item">
              <div>
                <strong>{item.split(" · ")[0]}</strong>
                <p>{item.split(" · ")[1]}</p>
              </div>
              <span className="today-task-state quiet">Preview</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

export default function PublicEntryExperience({
  mode,
}: PublicEntryExperienceProps) {
  if (mode === "today") {
    return (
      <div className="route-stack">
        <section className="page-intro">
          <p className="page-intro-eyebrow">Preview</p>
          <h2>See the shape of the day.</h2>
          <p className="page-intro-copy">Preview the layout before sign-in.</p>
        </section>
        <PublicTodayPreviewGrid />
      </div>
    );
  }

  return (
    <div className="landing-shell">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-kicker">Private dashboard</p>
          <h1>See what matters today.</h1>
          <p className="landing-description">Tasks, habits, mood, notes, shared rhythm.</p>
          <div className="landing-actions">
            <Link href="/today" className="page-link primary">
              Preview
            </Link>
            <Link href="/signin?callbackUrl=%2Ftoday" className="page-link">
              Sign in
            </Link>
          </div>
        </div>

        <div className="landing-preview">
          <div className="landing-preview-bar">
            <span>Life Dashboard</span>
            <span>Today preview</span>
          </div>
          <PublicTodayPreviewGrid showActions={false} />
        </div>
      </section>

      <section className="landing-pillars">
        <article className="landing-pillar">
          <p className="panel-kicker">Today first</p>
          <h2>Start with now.</h2>
          <p>Lead with action.</p>
        </article>
        <article className="landing-pillar">
          <p className="panel-kicker">Private</p>
          <h2>Sign in when ready.</h2>
          <p>Unlock your data.</p>
        </article>
        <article className="landing-pillar">
          <p className="panel-kicker">Calm</p>
          <h2>Less noise.</h2>
          <p>One place for rhythm.</p>
        </article>
      </section>
    </div>
  );
}
