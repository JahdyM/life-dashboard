import { BookOpen, FlaskConical, Leaf, PenLine, Sparkles, SunMoon } from "lucide-react";
import { getWordOfTheDay } from "@/lib/wordOfDay";

function TagIcon({ tag }: { tag: string }) {
  if (tag === "science") return <FlaskConical size={14} />;
  if (tag === "nature") return <Leaf size={14} />;
  if (tag === "writing") return <PenLine size={14} />;
  if (tag === "faith") return <SunMoon size={14} />;
  if (tag === "feelings") return <Sparkles size={14} />;
  return <BookOpen size={14} />;
}

export default function WordOfDayWidget({ dateIso }: { dateIso?: string }) {
  const item = getWordOfTheDay(dateIso);

  return (
    <article className="study-widget-card" aria-label="Word of the day">
      <header className="study-widget-head">
        <p className="study-widget-kicker">Word of the day</p>
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
    </article>
  );
}

