import {
  BookOpen,
  FlaskConical,
  Leaf,
  PenLine,
  Sparkles,
  SunMoon,
  Telescope,
} from "lucide-react";
import { getWordOfTheDay, getWordPoolSize } from "@/lib/wordOfDay";

function TagIcon({ tag }: { tag: string }) {
  if (tag === "astronomy" || tag === "astrophysics" || tag === "space systems") {
    return <Telescope size={14} />;
  }
  if (tag === "planetary science" || tag === "earth observation") return <Leaf size={14} />;
  if (tag === "physics" || tag === "materials" || tag === "research" || tag === "mathematics") {
    return <FlaskConical size={14} />;
  }
  if (tag === "nature") return <Leaf size={14} />;
  if (tag === "writing") return <PenLine size={14} />;
  if (tag === "faith") return <SunMoon size={14} />;
  if (tag === "feelings") return <Sparkles size={14} />;
  return <BookOpen size={14} />;
}

export default function WordOfDayWidget({ dateIso }: { dateIso?: string }) {
  const item = getWordOfTheDay(dateIso);
  const poolSize = getWordPoolSize();

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
        <p className="study-widget-pronunciation">{item.pronunciation}</p>
        <p className="study-widget-meaning">{item.meaning}</p>
        <p className="study-widget-example">{item.example}</p>
      </div>

      <footer className="study-widget-footer">
        <span>Scientific lexicon</span>
        <span>{poolSize} terms</span>
      </footer>
    </article>
  );
}
