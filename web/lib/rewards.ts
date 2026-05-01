// Client-facing shape — must stay in sync with lib/server/rewards.ts RewardsState
export type RewardsState = {
  points: number;
  streakFreezes: number;
  freezeCost: number;
  canUseMorningGrace: boolean;
  morningGraceDate: string | null;
  pointsTable: {
    morningCheckin: number;
    eveningCheckin: number;
    fullDayBonus: number;
    sharedHabit: number;
    customHabit: number;
    taskShort: number;
    taskMedium: number;
    taskDeep: number;
  };
};
