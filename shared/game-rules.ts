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

export type SeasonPhase = "launch" | "cash_gen" | "bye_warfare" | "run_home";

export interface SeasonPhaseInfo {
  phase: SeasonPhase;
  name: string;
  rounds: string;
  priorities: string[];
  tradeStrategy: string;
}

export function getSeasonPhase(round: number): SeasonPhaseInfo {
  if (round <= 5) {
    return {
      phase: "launch",
      name: "Team Launch",
      rounds: "R0–R5",
      priorities: [
        "Maximise cash generation from rookies",
        "Identify rookies who will actually play",
        "Target underpriced breakout players",
        "Avoid injured premiums",
        "Monitor role changes, TOG, CBA%",
      ],
      tradeStrategy: "Build structure — prioritise cash cows and value mid-pricers over sideways moves",
    };
  }
  if (round <= 10) {
    return {
      phase: "cash_gen",
      name: "Cash Generation",
      rounds: "R6–R10",
      priorities: [
        "Turn peaked cash cows into premiums",
        "Trade rookies when BE > projected score",
        "Accelerate upgrade cycle to premiums",
        "Target high-scoring unique players (PODs)",
      ],
      tradeStrategy: "Cash cow cycle — sell peaked rookies, buy premiums. Every trade must increase projected avg.",
    };
  }
  if (round <= 15) {
    return {
      phase: "bye_warfare",
      name: "Bye Round Warfare",
      rounds: "R11–R15",
      priorities: [
        "Ensure 18+ scoring players each bye week",
        "Use extra bye-round trades strategically",
        "Balance bye coverage across R12/R13/R14",
        "Avoid concentration on single bye round",
      ],
      tradeStrategy: "Bye survival — prioritise coverage over pure scoring upgrade. Use 3rd trade wisely.",
    };
  }
  return {
    phase: "run_home",
    name: "The Run Home",
    rounds: "R16–R24",
    priorities: [
      "Full premium team — no rookies on field",
      "Maximise captain scores every week",
      "Target unique high-scoring players for rank gains",
      "Avoid sideways trades — every trade must gain 150+ projected season points",
    ],
    tradeStrategy: "Variance optimisation — only trade for clear scoring upgrades or captain targets. No sideways.",
  };
}

export function getRemainingRounds(currentRound: number): number {
  return Math.max(0, AFL_FANTASY_CLASSIC_2026.rounds.total - currentRound);
}

export const AFL_2026_FIXTURES: Record<number, Record<string, { opponent: string; venue: string; time: string }>> = {
  0: {
    "Sydney": { opponent: "Carlton", venue: "SCG", time: "Thu 7:30pm" },
    "Carlton": { opponent: "Sydney", venue: "SCG", time: "Thu 7:30pm" },
    "Gold Coast": { opponent: "Geelong", venue: "People First Stadium", time: "Fri 7:05pm" },
    "Geelong": { opponent: "Gold Coast", venue: "People First Stadium", time: "Fri 7:05pm" },
    "GWS Giants": { opponent: "Hawthorn", venue: "Engie Stadium", time: "Sat 4:15pm" },
    "Hawthorn": { opponent: "GWS Giants", venue: "Engie Stadium", time: "Sat 4:15pm" },
    "Brisbane Lions": { opponent: "Western Bulldogs", venue: "Gabba", time: "Sat 6:35pm" },
    "Western Bulldogs": { opponent: "Brisbane Lions", venue: "Gabba", time: "Sat 6:35pm" },
    "St Kilda": { opponent: "Collingwood", venue: "MCG", time: "Sun 7:20pm" },
    "Collingwood": { opponent: "St Kilda", venue: "MCG", time: "Sun 7:20pm" },
  },
  1: {
    "Carlton": { opponent: "Richmond", venue: "MCG", time: "Thu 7:30pm" },
    "Richmond": { opponent: "Carlton", venue: "MCG", time: "Thu 7:30pm" },
    "Essendon": { opponent: "Hawthorn", venue: "MCG", time: "Fri 7:40pm" },
    "Hawthorn": { opponent: "Essendon", venue: "MCG", time: "Fri 7:40pm" },
    "Western Bulldogs": { opponent: "GWS Giants", venue: "Marvel Stadium", time: "Sat 1:15pm" },
    "GWS Giants": { opponent: "Western Bulldogs", venue: "Marvel Stadium", time: "Sat 1:15pm" },
    "Geelong": { opponent: "Fremantle", venue: "GMHBA Stadium", time: "Sat 4:15pm" },
    "Fremantle": { opponent: "Geelong", venue: "GMHBA Stadium", time: "Sat 4:15pm" },
    "Sydney": { opponent: "Brisbane Lions", venue: "SCG", time: "Sat 7:10pm" },
    "Brisbane Lions": { opponent: "Sydney", venue: "SCG", time: "Sat 7:10pm" },
    "Collingwood": { opponent: "Adelaide", venue: "MCG", time: "Sat 7:35pm" },
    "Adelaide": { opponent: "Collingwood", venue: "MCG", time: "Sat 7:35pm" },
    "North Melbourne": { opponent: "Port Adelaide", venue: "Marvel Stadium", time: "Sun 1:10pm" },
    "Port Adelaide": { opponent: "North Melbourne", venue: "Marvel Stadium", time: "Sun 1:10pm" },
    "Melbourne": { opponent: "St Kilda", venue: "MCG", time: "Sun 3:15pm" },
    "St Kilda": { opponent: "Melbourne", venue: "MCG", time: "Sun 3:15pm" },
    "Gold Coast": { opponent: "West Coast", venue: "People First Stadium", time: "Sun 5:10pm" },
    "West Coast": { opponent: "Gold Coast", venue: "People First Stadium", time: "Sun 5:10pm" },
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
