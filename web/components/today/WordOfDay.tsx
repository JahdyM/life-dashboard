export default async function WordOfDay() {
  const res = await fetch("https://zenquotes.io/api/today", {
    next: { revalidate: 86400 },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const item = Array.isArray(data) ? data[0] : null;
  if (!item?.q || !item?.a) return null;

  return (
    <article className="today-panel">
      <div className="today-panel-head compact">
        <h2>Word of the Day</h2>
      </div>
      <blockquote style={{ margin: "12px 0 0", padding: 0, borderLeft: "none" }}>
        <p style={{ fontStyle: "italic", lineHeight: 1.5, margin: "0 0 8px", color: "var(--text-main)" }}>
          &ldquo;{item.q}&rdquo;
        </p>
        <cite style={{ fontSize: "0.8rem", color: "var(--text-soft,#888)", fontStyle: "normal" }}>
          — {item.a}
        </cite>
      </blockquote>
    </article>
  );
}
