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
    },
    utility: {
      total: 1,
      onField: 0,
      bench: 1,
      description: "One bench position that can hold a DEF, MID, RUC or FWD. A player can be moved into Utility via substitutions or DPP/TPP swaps.",
    },
  },

  salaryCap: 18300000,
  magicNumber: 10490,

  trades: {
    perRound: 2,
    perEarlyByeRound: 2,
    perRegularByeRound: 3,
    startFromRound: 2,
  },

  earlyByeRounds: [2, 3, 4],
  regularByeRounds: [12, 13, 14],

  scoring: {
    kick: 3,
    handball: 2,
    mark: 3,
    tackle: 4,
    hitout: 1,
    goal: 6,
    behind: 1,
    freeKickFor: 1,
    freeKickAgainst: -3,
  },

  best18: {
    appliesTo: "both early and regular bye rounds",
    description: "During bye rounds, only the top 18 scoring on-field players count toward your total.",
    count: 18,
  },

  captainRules: {
    scoreDoubled: true,
    tog50Rule: true,
    tog50Description: "Players who reach or exceed 50% TOG always have their score count. Players below 50% TOG may be replaced by a higher-scoring emergency from the same position. If a Captain finishes below 50% TOG, the doubled score will be whichever is higher between the Captain and Vice-Captain.",
    emergenciesNeverDoubled: true,
  },

  togThreshold: {
    percent: 50,
    description: "Players below 50% Time On Ground may be replaced by a higher-scoring emergency from the same position. TOG values are supplied by Champion Data and are rounded (e.g. 49.75% is treated as 50%).",
  },

  pricing: {
    formula: "2025 average x magic number (10,490)",
    changesStartAfterRound: 1,
    openingRoundContributesToFirstPriceChange: true,
    recentPerformanceWeightedMoreHeavily: true,
    missedSeasonDiscount: 0.3,
    rookieFloor: 230000,
    rookieCeiling: 350000,
  },

  rounds: {
    total: 24,
    homeAndAway: 24,
    openingRound: {
      round: 0,
      countsAsFantasyRound: false,
      playersLock: false,
      scoresContribute: false,
      contributesToFirstPriceChange: true,
    },
  },

  leagues: {
    headToHead: {
      win: 4,
      tie: 2,
      loss: 0,
    },
    foes: {
      maxFoes: 50,
      description: "One-way comparison tool. You can add up to 50 Foes to track performance against.",
    },
  },

  positions: {
    spp: "Single Position Player",
    dpp: "Dual Position Player — once granted, remains for the entire season",
    tpp: "Triple Position Player — new for 2026. Once granted, remains for the entire season. Allows selection in any of three designated lines.",
  },

  lockouts: {
    type: "rolling",
    description: "Players lock at their real match start time. You may continue to trade and rearrange unlocked players.",
  },

  teamDeadline: {
    description: "A complete team of 30 players must be saved at least once before 7:00AM on the Saturday of the first Fantasy round.",
  },

  advancedTradeEditing: {
    description: "Coaches can revise previously saved trades, reverse moves, and use flexible multi-step editing tools. Rollback Team restores full team state to end of previous round (only available prior to any lockout commencing).",
    noPlayerTradedOutAndBackInSameRound: true,
  },

  features2026: [
    "50% TOG rule for captain scoring and emergency substitution",
    "Triple Position Players (TPP) can hold 3 positions for the entire season",
    "Advanced Trade-Editing with rollback capability",
    "Foes comparison feature (up to 50 rivals)",
    "Best-18 scoring applies to both early and regular bye rounds",
  ],
} as const;

export function getTradesForRound(round: number): number {
  if (round < AFL_FANTASY_CLASSIC_2026.trades.startFromRound) return 0;
  if (AFL_FANTASY_CLASSIC_2026.regularByeRounds.includes(round)) return AFL_FANTASY_CLASSIC_2026.trades.perRegularByeRound;
  if (AFL_FANTASY_CLASSIC_2026.earlyByeRounds.includes(round)) return AFL_FANTASY_CLASSIC_2026.trades.perEarlyByeRound;
  return AFL_FANTASY_CLASSIC_2026.trades.perRound;
}

export function isByeRound(round: number): boolean {
  return AFL_FANTASY_CLASSIC_2026.regularByeRounds.includes(round) ||
    AFL_FANTASY_CLASSIC_2026.earlyByeRounds.includes(round);
}

export function isEarlyByeRound(round: number): boolean {
  return AFL_FANTASY_CLASSIC_2026.earlyByeRounds.includes(round);
}

export function isRegularByeRound(round: number): boolean {
  return AFL_FANTASY_CLASSIC_2026.regularByeRounds.includes(round);
}

export function isBest18Round(round: number): boolean {
  return isByeRound(round);
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
      rounds: "R0-R5",
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
      rounds: "R6-R10",
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
      rounds: "R11-R15",
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
    rounds: "R16-R24",
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
