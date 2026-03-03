export const AFL_FANTASY_CLASSIC_2026 = {
  competition: "AFL Fantasy Classic",
  season: 2026,

  squad: {
    totalPlayers: 30,
    onField: 22,
    bench: 8,
    emergencies: 4,
    positions: {
      DEF: { total: 8, onField: 6, bench: 2 },
      MID: { total: 10, onField: 8, bench: 2 },
      RUC: { total: 3, onField: 2, bench: 1 },
      FWD: { total: 8, onField: 6, bench: 2 },
      UTIL: { total: 1, onField: 1, bench: 0 },
    },
  },

  salaryCap: 18300000,
  magicNumber: 10490,

  trades: {
    perRound: 2,
    perByeRound: 3,
    startFromRound: 2,
  },

  byeRounds: [12, 13, 14],

  scoring: {
    kick: 3,
    handball: 2,
    mark: 3,
    tackle: 4,
    hitout: 1,
    goal: 6,
    behind: 1,
    freeKickFor: 3,
    freeKickAgainst: -3,
  },

  captainRules: {
    scoreDoubled: true,
    tog50Rule: true,
    tog50Description:
      "If captain plays less than 50% time on ground, vice-captain score doubles instead (if higher)",
  },

  pricing: {
    formula: "2025 average × magic number (10,490)",
    missedSeasonDiscount: 0.3,
    rookieFloor: 230000,
    rookieCeiling: 350000,
  },

  rounds: {
    total: 24,
    homeAndAway: 24,
    openingRound: 1,
  },

  features2026: [
    "50% TOG rule for captain scoring",
    "Triple Position Players (TPP) can gain 3rd position mid-season",
    "Enhanced DPP management and utility swaps",
  ],
} as const;

export function getTradesForRound(round: number): number {
  if (round < AFL_FANTASY_CLASSIC_2026.trades.startFromRound) return 0;
  if (AFL_FANTASY_CLASSIC_2026.byeRounds.includes(round)) return AFL_FANTASY_CLASSIC_2026.trades.perByeRound;
  return AFL_FANTASY_CLASSIC_2026.trades.perRound;
}

export function isByeRound(round: number): boolean {
  return AFL_FANTASY_CLASSIC_2026.byeRounds.includes(round);
}

export function getScoringBreakdown(): Array<{ action: string; points: number }> {
  const s = AFL_FANTASY_CLASSIC_2026.scoring;
  return [
    { action: "Kick", points: s.kick },
    { action: "Handball", points: s.handball },
    { action: "Mark", points: s.mark },
    { action: "Tackle", points: s.tackle },
    { action: "Hitout", points: s.hitout },
    { action: "Goal", points: s.goal },
    { action: "Behind", points: s.behind },
    { action: "Free Kick For", points: s.freeKickFor },
    { action: "Free Kick Against", points: s.freeKickAgainst },
  ];
}
