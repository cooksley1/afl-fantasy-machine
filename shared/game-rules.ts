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

export const AFL_2026_FIXTURES: Record<number, Record<string, { opponent: string; venue: string; time: string }>> = {
  1: {
    "Richmond": { opponent: "Adelaide", venue: "MCG", time: "Thu 7:25pm" },
    "Adelaide": { opponent: "Richmond", venue: "MCG", time: "Thu 7:25pm" },
    "Western Bulldogs": { opponent: "Carlton", venue: "Marvel Stadium", time: "Fri 7:40pm" },
    "Carlton": { opponent: "Western Bulldogs", venue: "Marvel Stadium", time: "Fri 7:40pm" },
    "Hawthorn": { opponent: "GWS Giants", venue: "MCG", time: "Sat 1:45pm" },
    "GWS Giants": { opponent: "Hawthorn", venue: "MCG", time: "Sat 1:45pm" },
    "Gold Coast": { opponent: "Essendon", venue: "People First Stadium", time: "Sat 4:35pm" },
    "Essendon": { opponent: "Gold Coast", venue: "People First Stadium", time: "Sat 4:35pm" },
    "Brisbane Lions": { opponent: "Melbourne", venue: "Gabba", time: "Sat 7:25pm" },
    "Melbourne": { opponent: "Brisbane Lions", venue: "Gabba", time: "Sat 7:25pm" },
    "St Kilda": { opponent: "Collingwood", venue: "Marvel Stadium", time: "Sat 7:25pm" },
    "Collingwood": { opponent: "St Kilda", venue: "Marvel Stadium", time: "Sat 7:25pm" },
    "Fremantle": { opponent: "North Melbourne", venue: "Optus Stadium", time: "Sat 8:10pm" },
    "North Melbourne": { opponent: "Fremantle", venue: "Optus Stadium", time: "Sat 8:10pm" },
    "Sydney": { opponent: "West Coast", venue: "SCG", time: "Sun 1:10pm" },
    "West Coast": { opponent: "Sydney", venue: "SCG", time: "Sun 1:10pm" },
    "Port Adelaide": { opponent: "Geelong", venue: "Adelaide Oval", time: "Sun 3:20pm" },
    "Geelong": { opponent: "Port Adelaide", venue: "Adelaide Oval", time: "Sun 3:20pm" },
  },
};

export function getFixtureForTeam(team: string, round: number): { opponent: string; venue: string; time: string } | null {
  return AFL_2026_FIXTURES[round]?.[team] || null;
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
