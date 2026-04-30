export const EFFORT_LEVELS = ["low", "medium", "high"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export type EnergySettings = {
  lowEnergyMode: boolean;
  taskEffort: Record<string, EffortLevel>;
  habitEffort: Record<string, EffortLevel>;
};

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: "Light",
  medium: "Medium",
  high: "Deep",
};

export function isEffortLevel(value: unknown): value is EffortLevel {
  return EFFORT_LEVELS.includes(value as EffortLevel);
}
