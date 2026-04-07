export type WordOfDayItem = {
  word: string;
  pronunciation: string;
  meaning: string;
  example: string;
  tag: "books" | "science" | "feelings" | "faith" | "writing" | "nature" | "daily life";
};

const WORD_POOL: WordOfDayItem[] = [
  {
    word: "attune",
    pronunciation: "/uh-TOON/",
    meaning: "to bring into harmony with a rhythm or setting",
    example: "She attuned her plan to the quiet pace of the day.",
    tag: "daily life",
  },
  {
    word: "lucid",
    pronunciation: "/LOO-sid/",
    meaning: "clear in thought, expression, or understanding",
    example: "A short walk gave him a lucid view of what mattered next.",
    tag: "writing",
  },
  {
    word: "inquiry",
    pronunciation: "/in-KWAI-uh-ree/",
    meaning: "the act of asking, investigating, or exploring",
    example: "Her evening reading began as curiosity and became inquiry.",
    tag: "science",
  },
  {
    word: "steadfast",
    pronunciation: "/STED-fast/",
    meaning: "firm and consistent in purpose",
    example: "A steadfast routine carried the week when energy was low.",
    tag: "faith",
  },
  {
    word: "tender",
    pronunciation: "/TEN-der/",
    meaning: "gentle in feeling, tone, or care",
    example: "He kept a tender note to remember what the day taught.",
    tag: "feelings",
  },
  {
    word: "margin",
    pronunciation: "/MAR-jin/",
    meaning: "a small reserve of space, time, or capacity",
    example: "She left margin in the schedule for deep work and rest.",
    tag: "daily life",
  },
  {
    word: "annotate",
    pronunciation: "/AN-uh-tayt/",
    meaning: "to add brief notes that clarify or reflect",
    example: "He annotated the chapter with ideas for tomorrow.",
    tag: "books",
  },
  {
    word: "measured",
    pronunciation: "/MEH-zhurd/",
    meaning: "deliberate, calm, and not rushed",
    example: "A measured pace helped her finish without strain.",
    tag: "daily life",
  },
  {
    word: "orbit",
    pronunciation: "/OR-bit/",
    meaning: "a regular path around a center",
    example: "Daily rituals created an orbit around her priorities.",
    tag: "science",
  },
  {
    word: "verdant",
    pronunciation: "/VUR-dnt/",
    meaning: "fresh, green, and full of life",
    example: "After rain, the garden looked quietly verdant.",
    tag: "nature",
  },
];

function toDateKey(dateIso?: string) {
  const key = dateIso || new Date().toISOString().slice(0, 10);
  return key;
}

function dayNumberFromIso(dateIso: string) {
  const [yearText, monthText, dayText] = dateIso.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) return 0;
  const utc = Date.UTC(year, month - 1, day);
  return Math.floor(utc / 86_400_000);
}

export function getWordOfTheDay(dateIso?: string): WordOfDayItem {
  const key = toDateKey(dateIso);
  const dayNumber = dayNumberFromIso(key);
  const index = Math.abs(dayNumber) % WORD_POOL.length;
  return WORD_POOL[index];
}

