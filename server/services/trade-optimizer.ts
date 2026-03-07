import { db } from "../db";
import { players, weeklyStats, fixtures } from "@shared/schema";
import type { Player } from "@shared/schema";
import { eq, desc, inArray } from "drizzle-orm";

const CONFIG = {
  MAGIC_NUMBER: 10490,
  BREAKOUT_CBA_THRESHOLD: 15,
  IRONMAN_TOG: 82,
  BYE_TARGETS: { R1: 8, R2: 10, R3: 12 },
  HORIZON: 3,
  VC_SCORE_THRESHOLD: 110,
};

export interface TradeEvaluation {
  tradeEV: number;
  breakdown: {
    pointsEV: number;
    priceEV: number;
    strategicEV: number;
  };
  flags: {
    isLoopholeEnabler: boolean;
    isLoopholeRisk: boolean;
    isCbaBreakout: boolean;
    isByeRisk: boolean;
  };
  recommendation: string;
}

interface RecentStats {
  fantasyScore: number;
  cbaPercent: number | null;
  togPercent: number | null;
  round: number;
}

export async function evaluateTrade(
  candidateId: number,
  userTeamPlayerIds: number[],
  currentRound: number
): Promise<TradeEvaluation> {
  const candidate = await db.select().from(players).where(eq(players.id, candidateId)).limit(1);
  if (!candidate.length) throw new Error("Candidate player not found");
  const p = candidate[0];

  const recentStats = await db.select({
    fantasyScore: weeklyStats.fantasyScore,
    cbaPercent: weeklyStats.centreBounceAttendancePercent,
    togPercent: weeklyStats.timeOnGroundPercent,
    round: weeklyStats.round,
  })
    .from(weeklyStats)
    .where(eq(weeklyStats.playerId, candidateId))
    .orderBy(desc(weeklyStats.round))
    .limit(5);

  const teamPlayers = userTeamPlayerIds.length > 0
    ? await db.select().from(players).where(inArray(players.id, userTeamPlayerIds))
    : [];

  const teamFixtures = await db.select().from(fixtures)
    .where(eq(fixtures.round, currentRound + 1));

  const { pointsEV, isCbaBreakout } = calculatePointsEV(p, recentStats);
  const priceEV = calculatePriceEV(p);
  const { strategicEV, flags } = calculateStrategicEV(
    p,
    teamFixtures,
    teamPlayers,
    currentRound
  );

  const phaseWeight = currentRound < 12 ? 0.6 : 0.2;
  const finalEV = (pointsEV * (1 - phaseWeight)) + (priceEV * phaseWeight) + strategicEV;

  return {
    tradeEV: Math.round(finalEV * 10) / 10,
    breakdown: { pointsEV, priceEV, strategicEV },
    flags: { ...flags, isCbaBreakout },
    recommendation: generateAdvice(finalEV, { ...flags, isCbaBreakout }),
  };
}

function calculatePointsEV(p: Player, stats: RecentStats[]) {
  const recent3 = stats.slice(0, 3);
  const avgRecentCBA = recent3.length > 0
    ? recent3.reduce((acc, s) => acc + (s.cbaPercent || 0), 0) / recent3.length
    : p.seasonCba || 0;
  const cbaDelta = avgRecentCBA - (p.seasonCba || 0);

  const effectiveTog = p.avgTog || 80;
  const effectivePpm = p.ppm || ((p.avgScore || 0) / (effectiveTog * 0.01 * 120));
  const expectedTog = effectiveTog > CONFIG.IRONMAN_TOG ? effectiveTog : 78;
  let projectedScore = effectivePpm * (expectedTog * 0.01 * 120);

  let isCbaBreakout = false;
  if (cbaDelta > CONFIG.BREAKOUT_CBA_THRESHOLD) {
    projectedScore += 10;
    isCbaBreakout = true;
  }

  return { pointsEV: projectedScore * CONFIG.HORIZON, isCbaBreakout };
}

function calculateStrategicEV(
  p: Player,
  nextRoundFixtures: typeof fixtures.$inferSelect[],
  teamPlayers: Player[],
  round: number
) {
  let strategicEV = 0;
  const flags = { isLoopholeEnabler: false, isLoopholeRisk: false, isByeRisk: false };

  const nextGame = nextRoundFixtures.find(
    f => f.homeTeam === p.team || f.awayTeam === p.team
  );

  if (nextGame) {
    const gameDate = nextGame.date;
    const dayOfWeek = gameDate ? new Date(gameDate).getDay() : -1;
    const isEarly = dayOfWeek === 4 || dayOfWeek === 5;

    if (isEarly && (p.avgScore || 0) >= CONFIG.VC_SCORE_THRESHOLD) {
      strategicEV += 19;
      flags.isLoopholeEnabler = true;
    }
  }

  const playersOnSameBye = teamPlayers.filter(tp => tp.byeRound === p.byeRound).length;
  if (round > 8 && round < 16) {
    if (playersOnSameBye > 10) {
      strategicEV -= 30;
      flags.isByeRisk = true;
    }
  }

  return { strategicEV, flags };
}

function calculatePriceEV(p: Player): number {
  const expectedChange = ((p.avgScore || 0) - (p.breakEven || 0)) * 0.25;
  return (expectedChange / CONFIG.MAGIC_NUMBER) * 100;
}

function generateAdvice(
  ev: number,
  flags: { isLoopholeEnabler: boolean; isLoopholeRisk: boolean; isCbaBreakout: boolean; isByeRisk: boolean }
): string {
  if (flags.isLoopholeRisk) return "High Risk: This trade kills your VC loophole structure.";
  if (flags.isCbaBreakout) return "Elite Target: Recent CBA spikes suggest an imminent breakout.";
  if (flags.isByeRisk) return "Bye Risk: Too many players on the same bye round.";
  if (ev > 150) return "Strong Buy: High scoring uplift with positive cash trajectory.";
  if (ev > 80) return "Good Target: Solid uplift with acceptable structure impact.";
  if (ev > 30) return "Consider: Moderate improvement — weigh against other options.";
  return "Marginal: Consider alternative targets with better bye alignment.";
}
