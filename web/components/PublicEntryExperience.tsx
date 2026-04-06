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
            <h2>See the day before you commit to it.</h2>
          </div>
          {showActions ? (
            <div className="today-actions">
              <Link href="/signin?callbackUrl=%2Ftoday" className="page-link primary">
                Sign in to continue
              </Link>
              <Link href="/" className="page-link">
                Back home
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
            <h2>Emotional context</h2>
          </div>
        </div>
        <div className="today-mood-card">
          <p className="today-mood-value">
            <span>🕊️</span>
            Peace
          </p>
          <p className="today-panel-copy">
            A quick note keeps the dashboard human, not mechanical.
          </p>
        </div>
      </article>

      <article className="today-panel">
        <div className="today-panel-head compact">
          <div>
            <p className="panel-kicker">Completed</p>
            <h2>Proof of progress</h2>
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
            <h2>Scratchpad</h2>
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
            <p className="panel-kicker">Shared rhythm</p>
            <h2>Couple-aware without being noisy</h2>
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
          <p className="page-intro-eyebrow">Today preview</p>
          <h2>The product promise should be visible before login.</h2>
          <p className="page-intro-copy">
            This preview shows the kind of calm, high-signal daily surface you get after
            signing in: next actions, completed work, emotional context, notes, and shared
            rhythm in one place.
          </p>
        </section>
        <PublicTodayPreviewGrid />
      </div>
    );
  }

  return (
    <div className="landing-shell">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-kicker">Private life operating system</p>
          <h1>Start the day with a calm, clear picture of what matters.</h1>
          <p className="landing-description">
            Life Dashboard keeps tasks, habits, mood, shared rhythm, and daily notes in one
            deliberate place. You understand the product in seconds, then sign in only when
            you are ready to make it yours.
          </p>
          <div className="landing-actions">
            <Link href="/today" className="page-link primary">
              Preview today flow
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
          <p className="panel-kicker">Useful first</p>
          <h2>Today comes before everything else.</h2>
          <p>
            The product leads with what to do now, not with settings, dashboards, or raw
            analytics.
          </p>
        </article>
        <article className="landing-pillar">
          <p className="panel-kicker">Private and intentional</p>
          <h2>Authentication continues the experience.</h2>
          <p>
            Sign-in exists to unlock personal data, not to explain the product from
            scratch.
          </p>
        </article>
        <article className="landing-pillar">
          <p className="panel-kicker">Calm by design</p>
          <h2>One place for rhythm, not noise.</h2>
          <p>
            Habits, tasks, mood, and couple context stay visible without competing for
            attention.
          </p>
        </article>
      </section>
    </div>
  );
}
