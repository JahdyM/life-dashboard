import {
  BookOpen,
  FlaskConical,
  Leaf,
  PenLine,
  Sparkles,
  SunMoon,
  Telescope,
} from "lucide-react";
import { getWordOfTheDay } from "@/lib/wordOfDay";

function TagIcon({ tag }: { tag: string }) {
  const normalized = tag.toLowerCase();
  if (
    normalized.includes("astronomy") ||
    normalized.includes("space") ||
    normalized.includes("astrophysics")
  ) {
    return <Telescope size={14} />;
  }
  if (normalized.includes("earth") || normalized.includes("nature") || normalized.includes("planetary")) {
    return <Leaf size={14} />;
  }
  if (
    normalized.includes("physics") ||
    normalized.includes("research") ||
    normalized.includes("science") ||
    normalized.includes("engineering") ||
    normalized.includes("math")
  ) {
    return <FlaskConical size={14} />;
  }
  if (normalized.includes("writing")) return <PenLine size={14} />;
  if (normalized.includes("faith")) return <SunMoon size={14} />;
  if (normalized.includes("feelings")) return <Sparkles size={14} />;
  return <BookOpen size={14} />;
}

export default async function WordOfDayWidget({ dateIso }: { dateIso?: string }) {
  const payload = await getWordOfTheDay(dateIso);
  const item = payload.item;

  return (
    <article className="study-widget-card study-widget-card-space" aria-label="Research word of the day">
      <header className="study-widget-head">
        <p className="study-widget-kicker">Research word</p>
        <span className="study-widget-tag">
          <TagIcon tag={item.tag} />
          {item.tag}
        </span>
      </header>

      <div className="study-widget-main">
        <h3>{item.word}</h3>
        <p className="study-widget-pronunciation">{item.pronunciation || ""}</p>
        <p className="study-widget-meaning">{item.meaning}</p>
        <p className="study-widget-example">{item.example}</p>
      </div>

      <footer className="study-widget-footer">
        <span>{payload.source === "science_api" ? "Live science API" : "Fallback set"}</span>
        <span>{payload.poolSize} terms</span>
      </footer>
    </article>
  );
}
