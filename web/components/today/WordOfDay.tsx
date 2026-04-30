// Fetches Merriam-Webster Word of the Day via their public RSS feed.
// No API key required. Response cached 24 h server-side.
export default async function WordOfDay() {
  let word = "";
  let definition = "";
  let partOfSpeech = "";

  try {
    const res = await fetch("https://www.merriam-webster.com/wotd/feed/rss2", {
      next: { revalidate: 86400 },
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;

    const xml = await res.text();

    // First <item> block
    const itemBlock = xml.match(/<item>([\s\S]*?)<\/item>/)?.[1] ?? "";

    // Word — strip any CDATA wrappers
    const rawTitle =
      itemBlock.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ??
      itemBlock.match(/<title>([\s\S]*?)<\/title>/)?.[1] ??
      "";
    // M-W titles are just the word (e.g. "ephemeral")
    word = rawTitle.trim();

    // Description contains <p> blocks with functional label and short def
    const rawDesc =
      itemBlock.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ??
      itemBlock.match(/<description>([\s\S]*?)<\/description>/)?.[1] ??
      "";

    // Extract part of speech from <em class="...">noun</em> or similar
    partOfSpeech = rawDesc.match(/<em[^>]*>([a-z\s]+)<\/em>/i)?.[1]?.trim() ?? "";

    // Pull first sentence-like chunk from a <p> that contains a colon (definition pattern)
    const paragraphs = [...rawDesc.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim()
    );
    // Skip very short paragraphs; pick first one that looks like a definition (has letters)
    definition = paragraphs.find((p) => p.length > 30) ?? "";
  } catch {
    return null;
  }

  if (!word) return null;

  return (
    <article className="today-panel">
      <div className="today-panel-head compact">
        <h2>Word of the Day</h2>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: "1.2rem", fontWeight: 700, letterSpacing: "0.01em" }}>{word}</span>
          {partOfSpeech && (
            <span style={{ fontSize: "0.78rem", color: "var(--text-soft,#888)", fontStyle: "italic" }}>
              {partOfSpeech}
            </span>
          )}
          <a
            href={`https://www.merriam-webster.com/word-of-the-day`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: "0.72rem", color: "var(--text-soft,#888)", marginLeft: "auto" }}
          >
            M-W ↗
          </a>
        </div>
        {definition && (
          <p style={{ fontSize: "0.85rem", lineHeight: 1.55, margin: 0, color: "var(--text-main)" }}>
            {definition}
          </p>
        )}
      </div>
    </article>
  );
}
