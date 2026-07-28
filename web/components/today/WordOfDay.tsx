import { getSetting } from "@/lib/server/settings";
import { getWordOfTheDay } from "@/lib/wordOfDay";

export default async function WordOfDay({
  userEmail,
  dateIso,
}: {
  userEmail: string;
  dateIso: string;
}) {
  const rawVariant = await getSetting(userEmail, `word_of_day_variant::${dateIso}`);
  const variant = Math.max(0, Number.parseInt(rawVariant || "0", 10) || 0);
  const { item, poolSize, source } = await getWordOfTheDay(dateIso, variant);

  return (
    <article className="today-panel">
      <div className="today-panel-head compact">
        <h2>Research word</h2>
        <span className="study-widget-tag">{item.tag}</span>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: "1.2rem", fontWeight: 700, letterSpacing: "0.01em" }}>
            {item.word}
          </span>
          {item.pronunciation ? (
            <span style={{ fontSize: "0.78rem", color: "var(--text-soft,#aaa)" }}>
              {item.pronunciation}
            </span>
          ) : null}
        </div>
        <p style={{ fontSize: "0.85rem", lineHeight: 1.55, margin: 0, color: "var(--text-main)" }}>
          {item.meaning}
        </p>
        <p style={{ fontSize: "0.78rem", lineHeight: 1.5, margin: "8px 0 0", color: "var(--text-soft,#aaa)" }}>
          {item.example}
        </p>
        <p style={{ fontSize: "0.68rem", margin: "10px 0 0", color: "var(--text-soft,#888)" }}>
          {source === "science_api" ? "Live science API" : "Offline set"} · {poolSize} terms
        </p>
      </div>
    </article>
  );
}
