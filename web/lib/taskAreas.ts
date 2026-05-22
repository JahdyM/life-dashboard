export type TaskAreaTag = {
  key: string;
  label: string;
  color: string;
};

export const DEFAULT_TASK_AREAS: TaskAreaTag[] = [
  { key: "jw", label: "JW", color: "#D7B56D" },
  { key: "mestrado", label: "Mestrado", color: "#8FB8D8" },
  { key: "casa", label: "Casa", color: "#C69C7B" },
  { key: "saude", label: "Saúde", color: "#90C9A3" },
  { key: "hobbies", label: "Hobbies", color: "#B9A0D8" },
  { key: "eu", label: "Eu", color: "#D995A6" },
  { key: "extras", label: "Extras", color: "#A9AEA5" },
];

const AREA_COLORS = [
  "#D7B56D",
  "#8FB8D8",
  "#C69C7B",
  "#90C9A3",
  "#B9A0D8",
  "#D995A6",
  "#A9AEA5",
  "#A7C7C2",
  "#D1A177",
];

export function normalizeTaskAreaKey(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function normalizeTaskAreaLabel(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 28);
}

export function normalizeTaskAreaColor(value: string | null | undefined, fallbackIndex = 0) {
  const clean = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) return clean;
  return AREA_COLORS[fallbackIndex % AREA_COLORS.length];
}

export function normalizeTaskAreas(items: TaskAreaTag[]) {
  const byKey = new Map<string, TaskAreaTag>();

  [...DEFAULT_TASK_AREAS, ...items].forEach((item, index) => {
    const label = normalizeTaskAreaLabel(item.label);
    const key = normalizeTaskAreaKey(item.key || label);
    if (!key || !label) return;
    byKey.set(key, {
      key,
      label,
      color: normalizeTaskAreaColor(item.color, index),
    });
  });

  return Array.from(byKey.values());
}

export function getTaskAreaMeta(areaKey: string | null | undefined, areas: TaskAreaTag[]) {
  if (!areaKey) return null;
  return normalizeTaskAreas(areas).find((area) => area.key === areaKey) || null;
}
