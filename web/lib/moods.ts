export type MoodGroup =
  | "uplifting"
  | "steady"
  | "focused"
  | "reflective"
  | "low"
  | "heavy";

export type MoodDefinition = {
  key: string;
  label: string;
  emoji: string;
  color: string;
  group: MoodGroup;
  score: number;
  positive?: boolean;
  negative?: boolean;
  aliases?: string[];
};

export const MOOD_DEFINITIONS: MoodDefinition[] = [
  {
    key: "happy",
    label: "Happy",
    emoji: "😊",
    color: "#e5b95c",
    group: "uplifting",
    score: 96,
    positive: true,
    aliases: ["joy", "felicidade"],
  },
  {
    key: "content",
    label: "Content",
    emoji: "🙂",
    color: "#d4b06f",
    group: "uplifting",
    score: 88,
    positive: true,
  },
  {
    key: "satisfied",
    label: "Satisfied",
    emoji: "😌",
    color: "#c9a76b",
    group: "uplifting",
    score: 84,
    positive: true,
  },
  {
    key: "peaceful",
    label: "Peaceful",
    emoji: "🕊️",
    color: "#7aa7d6",
    group: "steady",
    score: 94,
    positive: true,
    aliases: ["peace", "paz"],
  },
  {
    key: "calm",
    label: "Calm",
    emoji: "🌿",
    color: "#77aa96",
    group: "steady",
    score: 82,
    positive: true,
  },
  {
    key: "grateful",
    label: "Grateful",
    emoji: "🙏",
    color: "#d2a86a",
    group: "uplifting",
    score: 90,
    positive: true,
  },
  {
    key: "hopeful",
    label: "Hopeful",
    emoji: "✨",
    color: "#9ab3d8",
    group: "uplifting",
    score: 86,
    positive: true,
  },
  {
    key: "focused",
    label: "Focused",
    emoji: "🎯",
    color: "#6ea2b8",
    group: "focused",
    score: 80,
    positive: true,
  },
  {
    key: "productive",
    label: "Productive",
    emoji: "⚙️",
    color: "#6f9980",
    group: "focused",
    score: 78,
    positive: true,
  },
  {
    key: "light",
    label: "Light",
    emoji: "🌤️",
    color: "#d5c77d",
    group: "uplifting",
    score: 76,
    positive: true,
  },
  {
    key: "neutral",
    label: "Neutral",
    emoji: "😐",
    color: "#969ea8",
    group: "steady",
    score: 60,
    aliases: ["neutro"],
  },
  {
    key: "reflective",
    label: "Reflective",
    emoji: "🤔",
    color: "#8e88b8",
    group: "reflective",
    score: 62,
  },
  {
    key: "tired",
    label: "Tired",
    emoji: "😴",
    color: "#7f8a99",
    group: "low",
    score: 48,
  },
  {
    key: "exhausted",
    label: "Exhausted",
    emoji: "🫠",
    color: "#6f7886",
    group: "low",
    score: 32,
    negative: true,
  },
  {
    key: "unmotivated",
    label: "Unmotivated",
    emoji: "🥀",
    color: "#7e7485",
    group: "low",
    score: 34,
    negative: true,
  },
  {
    key: "discouraged",
    label: "Discouraged",
    emoji: "☁️",
    color: "#8a7b8f",
    group: "low",
    score: 30,
    negative: true,
  },
  {
    key: "anxious",
    label: "Anxious",
    emoji: "😰",
    color: "#d7c46b",
    group: "heavy",
    score: 34,
    negative: true,
    aliases: ["anxiety", "ansiedade"],
  },
  {
    key: "overwhelmed",
    label: "Overwhelmed",
    emoji: "🌊",
    color: "#8ea1b4",
    group: "heavy",
    score: 28,
    negative: true,
  },
  {
    key: "confused",
    label: "Confused",
    emoji: "🌀",
    color: "#8c95ad",
    group: "reflective",
    score: 42,
  },
  {
    key: "lonely",
    label: "Lonely",
    emoji: "🫥",
    color: "#7d7392",
    group: "heavy",
    score: 28,
    negative: true,
  },
  {
    key: "sad",
    label: "Sad",
    emoji: "😢",
    color: "#6d88b1",
    group: "heavy",
    score: 26,
    negative: true,
  },
  {
    key: "frustrated",
    label: "Frustrated",
    emoji: "😣",
    color: "#b58973",
    group: "heavy",
    score: 24,
    negative: true,
  },
  {
    key: "afraid",
    label: "Afraid",
    emoji: "😟",
    color: "#b39d6d",
    group: "heavy",
    score: 22,
    negative: true,
    aliases: ["fear", "medo"],
  },
  {
    key: "irritated",
    label: "Irritated",
    emoji: "😠",
    color: "#c97866",
    group: "heavy",
    score: 18,
    negative: true,
    aliases: ["anger", "raiva"],
  },
  {
    key: "grief",
    label: "Grief",
    emoji: "🖤",
    color: "#51505d",
    group: "heavy",
    score: 12,
    negative: true,
  },
];

export const MOOD_PALETTE = MOOD_DEFINITIONS.map(({ key, label, emoji, color }) => ({
  key,
  label,
  emoji,
  color,
}));

const moodLookup = new Map<string, MoodDefinition>();

MOOD_DEFINITIONS.forEach((mood) => {
  moodLookup.set(mood.key, mood);
  mood.aliases?.forEach((alias) => {
    moodLookup.set(alias, mood);
  });
});

export function canonicalMoodKey(key?: string | null) {
  const normalized = String(key || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return moodLookup.get(normalized)?.key || normalized;
}

export function getMoodMeta(key?: string | null) {
  const canonical = canonicalMoodKey(key);
  if (!canonical) return null;
  return moodLookup.get(canonical) || null;
}

export function getMoodLabel(key?: string | null) {
  return getMoodMeta(key)?.label || null;
}

export function isMoodPositive(key?: string | null) {
  return Boolean(getMoodMeta(key)?.positive);
}

export function isMoodNegative(key?: string | null) {
  return Boolean(getMoodMeta(key)?.negative);
}

export function getMoodScore(key?: string | null) {
  return getMoodMeta(key)?.score ?? 55;
}
