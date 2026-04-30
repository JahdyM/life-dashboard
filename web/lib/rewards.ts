export type RewardsState = {
  points: number;
  streakFreezes: number;
  freezeCost: number;
  canUseMorningGrace: boolean;
  morningGraceDate: string | null;
};
