export type WordOfDayItem = {
  word: string;
  pronunciation: string;
  meaning: string;
  example: string;
  tag: string;
};

export type WordOfDayPayload = {
  item: WordOfDayItem;
  poolSize: number;
  source: "science_api" | "fallback";
};

type DatamuseItem = {
  word?: string;
  defs?: string[];
};

type DictionaryEntry = {
  phonetic?: string;
  phonetics?: Array<{ text?: string }>;
  meanings?: Array<{
    definitions?: Array<{ definition?: string; example?: string }>;
  }>;
};

type AbortSignalWithTimeout = typeof AbortSignal & {
  timeout?: (milliseconds: number) => AbortSignal;
};

function requestTimeoutSignal(milliseconds = 2500) {
  const abortSignal = AbortSignal as AbortSignalWithTimeout;
  return typeof abortSignal.timeout === "function" ? abortSignal.timeout(milliseconds) : undefined;
}

const FALLBACK_WORDS: WordOfDayItem[] = [
  {
    word: "spectroscopy",
    pronunciation: "/spek-TRAH-skuh-pee/",
    meaning: "analysis of matter through its interaction with light",
    example: "Spectroscopy revealed traces of water vapor.",
    tag: "science",
  },
  {
    word: "telemetry",
    pronunciation: "/tuh-LEM-uh-tree/",
    meaning: "measurements transmitted from remote instruments",
    example: "Telemetry confirmed all systems were stable.",
    tag: "space systems",
  },
  {
    word: "parallax",
    pronunciation: "/PAIR-uh-laks/",
    meaning: "apparent shift from a change in viewpoint",
    example: "Parallax helped estimate stellar distance.",
    tag: "astronomy",
  },
  {
    word: "regolith",
    pronunciation: "/REG-uh-lith/",
    meaning: "loose rock and dust over solid planetary surfaces",
    example: "The rover moved slowly across the regolith.",
    tag: "planetary science",
  },
  {
    word: "attenuation",
    pronunciation: "/uh-ten-yoo-AY-shun/",
    meaning: "gradual loss in intensity of a signal",
    example: "Cloud cover increased signal attenuation.",
    tag: "engineering",
  },
  {
    word: "orbit",
    pronunciation: "/OR-bit/",
    meaning: "curved path of one body around another",
    example: "The satellite completed one orbit every 95 minutes.",
    tag: "space systems",
  },
  {
    word: "inference",
    pronunciation: "/IN-fer-uhns/",
    meaning: "a conclusion derived from evidence and reasoning",
    example: "The inference matched the observed trend.",
    tag: "research",
  },
  {
    word: "hypothesis",
    pronunciation: "/hy-PAH-thuh-sis/",
    meaning: "proposed explanation tested by observation",
    example: "Each trial refined the working hypothesis.",
    tag: "research",
  },
  {
    word: "ephemeris",
    pronunciation: "/ih-FEM-er-is/",
    meaning: "table of predicted celestial positions over time",
    example: "The tracking update used a revised ephemeris.",
    tag: "astronomy",
  },
  {
    word: "ionosphere",
    pronunciation: "/eye-AH-nuh-sfeer/",
    meaning: "ionized upper-atmosphere layer affecting radio",
    example: "Solar activity disturbed the ionosphere overnight.",
    tag: "earth observation",
  },
];

function hashDate(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function resolveDateIso(dateIso?: string) {
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return dateIso;
  return new Date().toISOString().slice(0, 10);
}

function pickByDate<T>(items: T[], dateIso: string) {
  if (!items.length) return null;
  const index = hashDate(dateIso) % items.length;
  return items[index] || null;
}

function extractMeaning(definition: string | undefined) {
  if (!definition) return null;
  const [_pos, text] = definition.split("\t");
  return (text || definition).trim() || null;
}

function cleanWord(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z][a-z\-\s]{1,30}$/.test(normalized)) return null;
  return normalized;
}

async function fetchScienceWordPool() {
  const response = await fetch(
    "https://api.datamuse.com/words?topics=astronomy,space,physics,research,engineering,mathematics&max=260&md=d",
    {
      next: { revalidate: 60 * 60 * 12 },
      signal: requestTimeoutSignal(),
    }
  );

  if (!response.ok) {
    throw new Error("DATAMUSE_UNAVAILABLE");
  }

  const payload = (await response.json()) as DatamuseItem[];
  return payload
    .map((item) => {
      const word = cleanWord(item.word);
      if (!word) return null;
      const meaning = extractMeaning(item.defs?.[0]);
      return {
        word,
        pronunciation: "",
        meaning: meaning || "scientific term",
        example: "",
        tag: "science",
      } satisfies WordOfDayItem;
    })
    .filter((item): item is WordOfDayItem => Boolean(item));
}

async function enrichWithDictionary(item: WordOfDayItem) {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(item.word)}`,
      {
        next: { revalidate: 60 * 60 * 24 * 7 },
        signal: requestTimeoutSignal(1800),
      }
    );
    if (!response.ok) return item;

    const payload = (await response.json()) as DictionaryEntry[];
    const first = payload?.[0];
    if (!first) return item;

    const pronunciation =
      first.phonetic ||
      first.phonetics?.find((phonetic) => Boolean(phonetic.text))?.text ||
      item.pronunciation;

    const firstDefinition = first.meanings?.[0]?.definitions?.[0];
    const meaning = firstDefinition?.definition || item.meaning;
    const example =
      firstDefinition?.example ||
      `Today's term in context: ${item.word}.`;

    return {
      ...item,
      pronunciation: pronunciation ? `/${pronunciation.replaceAll("/", "")}/` : item.pronunciation,
      meaning,
      example,
    };
  } catch (_error) {
    return item;
  }
}

export async function getWordOfTheDay(
  dateIso?: string,
  variant = 0
): Promise<WordOfDayPayload> {
  const resolvedDate = resolveDateIso(dateIso);
  const selectionKey = `${resolvedDate}:${Math.max(0, Math.trunc(variant))}`;

  try {
    const apiPool = await fetchScienceWordPool();
    if (apiPool.length > 0) {
      const picked = pickByDate(apiPool, selectionKey) || apiPool[0];
      const enriched = await enrichWithDictionary(picked);
      return {
        item: {
          ...enriched,
          pronunciation: enriched.pronunciation || "",
          example: enriched.example || `Today's term in context: ${enriched.word}.`,
        },
        poolSize: apiPool.length,
        source: "science_api",
      };
    }
  } catch (_error) {
    // fall through to fallback list
  }

  const fallbackItem = pickByDate(FALLBACK_WORDS, selectionKey) || FALLBACK_WORDS[0];
  return {
    item: fallbackItem,
    poolSize: FALLBACK_WORDS.length,
    source: "fallback",
  };
}
