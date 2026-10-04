export type TrimRule = {
  key: string;
  /** Which end of the list carries the most relevant items. */
  keep: "first" | "last";
  /**
   * Keep at least this many items while the budget can still be met by
   * trimming other lists; if it cannot, the budget wins and the list can go
   * all the way to empty.
   */
  floor: number;
};

function isEmpty(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value as object).length === 0;
}

/** Drops values that cost tokens but say nothing. `false` and `0` are kept: they mean something. */
export function pruneEmpty(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(pruneEmpty);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, pruneEmpty(item)] as const)
        .filter(([, item]) => !isEmpty(item))
    );
  }
  return value;
}

/**
 * Serializable copy of `context` that fits `maxChars`. Lists are halved in the
 * order given by `rules` (least useful first) down to their floors; if that is
 * still too big, whole lists are dropped in the same order until it fits.
 * What was cut is reported under `contextTrimmed` so the model can say so
 * instead of silently working from a partial view.
 */
export function fitContextToBudget(
  context: Record<string, unknown>,
  maxChars: number,
  rules: TrimRule[]
): Record<string, unknown> {
  const size = (value: unknown) => JSON.stringify(pruneEmpty(value)).length;
  let current = context;
  const trimmed: Record<string, string> = {};

  const originalLengths = new Map<string, number>();
  const shrink = (key: string, keep: "first" | "last", floor: number) => {
    const value = current[key];
    if (!Array.isArray(value)) return;
    let list: unknown[] = value;
    if (!originalLengths.has(key)) originalLengths.set(key, list.length);
    while (list.length > floor && size(current) > maxChars) {
      const next = Math.max(floor, Math.floor(list.length / 2));
      list = keep === "first" ? list.slice(0, next) : list.slice(-next);
      current = { ...current, [key]: list };
    }
  };

  for (const { key, keep, floor } of rules) shrink(key, keep, floor);
  // The floors were a preference; the provider's limit is not.
  for (const { key, keep } of rules) shrink(key, keep, 0);

  for (const [key, original] of originalLengths) {
    const shown = (current[key] as unknown[]).length;
    if (shown < original) trimmed[key] = `${shown} of ${original} shown`;
  }

  const fitted = Object.keys(trimmed).length ? { ...current, contextTrimmed: trimmed } : current;
  return pruneEmpty(fitted) as Record<string, unknown>;
}
