import { db } from "../db";
import { players, fixtures, myTeamPlayers, seasonPlans, leagueSettings } from "@shared/schema";
import type { Player, SeasonPlan } from "@shared/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { AFL_FANTASY_CLASSIC_2026, getSeasonPhase, getTradesForRound } from "../../shared/game-rules";

const SALARY_CAP = AFL_FANTASY_CLASSIC_2026.salaryCap;
const POSITION_REQS = AFL_FANTASY_CLASSIC_2026.squad.positions;
const BYE_ROUNDS = AFL_FANTASY_CLASSIC_2026.byeRounds;

export interface WeeklyPlan {
  round: number;
  phase: string;
  phaseName: string;
  projectedTeamScore: number;
  recommendedCaptain: { name: string; team: string; avgScore: number; reasoning: string } | null;
  recommendedViceCaptain: { name: string; team: string; avgScore: number; reasoning: string } | null;
  trades: Array<{
    playerOut: { name: string; team: string; position: string; avgScore: number; price: number };
    playerIn: { name: string; team: string; position: string; avgScore: number; price: number };
    reasoning: string;
    pointsGain: number;
    cashImpact: number;
  }>;
  structureNotes: string[];
  keyMetrics: {
    teamValue: number;
    cashInBank: number;
    byeCoverage: { r12: number; r13: number; r14: number };
    premiumCount: number;
    rookieCount: number;
  };
  flags: string[];
}

export interface SeasonPlanResult {
  overallStrategy: string;
  weeklyPlans: WeeklyPlan[];
  totalProjectedScore: number;
  teamPlayerIds: number[];
}

export interface OptimalTeamResult {
  teamPlayers: Array<Player & { fieldPosition: string; isOnField: boolean; reasoning: string }>;
  totalCost: number;
  remainingBudget: number;
  byeCoverage: { r12: number; r13: number; r14: number };
  strategy: string;
}

function getPlayerPrimaryPosition(player: Player): string {
  return player.position.split("/")[0];
}

function getPlayerPositions(player: Player): string[] {
  const positions = [player.position.split("/")[0]];
  if (player.dualPosition) {
    positions.push(player.dualPosition.split("/")[0]);
  }
  if (player.position.includes("/")) {
    positions.push(player.position.split("/")[1]);
  }
  return [...new Set(positions)];
}

function playerValue(p: Player): number {
  const avg = p.avgScore || 0;
  const price = p.price || 1;
  return (avg / price) * 100000;
}

function isPremium(p: Player): boolean {
  return (p.avgScore || 0) >= 95 && p.price >= 600000;
}

function isCashCow(p: Player): boolean {
  return p.price <= 350000 && (p.breakEven || 0) < (p.avgScore || 999);
}

function isRookie(p: Player): boolean {
  return p.price <= 350000;
}

export async function buildOptimalTeam(): Promise<OptimalTeamResult> {
  const allPlayers = await db.select().from(players);

  const viable = allPlayers.filter(p =>
    p.avgScore > 0 &&
    p.selectionStatus !== "omitted" &&
    !p.injuryStatus?.toLowerCase().includes("season") &&
    !p.injuryStatus?.toLowerCase().includes("acl")
  );

  const byPosition: Record<string, Player[]> = { DEF: [], MID: [], RUC: [], FWD: [] };
  for (const p of viable) {
    const primary = getPlayerPrimaryPosition(p);
    if (byPosition[primary]) {
      byPosition[primary].push(p);
    }
  }

  for (const pos of Object.keys(byPosition)) {
    byPosition[pos].sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  }

  const selected: Array<Player & { fieldPosition: string; isOnField: boolean; reasoning: string }> = [];
  const usedIds = new Set<number>();
  let totalCost = 0;

  function addPlayer(p: Player, position: string, isOnField: boolean, reasoning: string) {
    if (usedIds.has(p.id)) return false;
    if (totalCost + p.price > SALARY_CAP) return false;
    selected.push({ ...p, fieldPosition: position, isOnField, reasoning });
    usedIds.add(p.id);
    totalCost += p.price;
    return true;
  }

  const positionOrder: Array<{ pos: string; onField: number; bench: number }> = [
    { pos: "RUC", onField: POSITION_REQS.RUC.onField, bench: POSITION_REQS.RUC.bench },
    { pos: "MID", onField: POSITION_REQS.MID.onField, bench: POSITION_REQS.MID.bench },
    { pos: "DEF", onField: POSITION_REQS.DEF.onField, bench: POSITION_REQS.DEF.bench },
    { pos: "FWD", onField: POSITION_REQS.FWD.onField, bench: POSITION_REQS.FWD.bench },
  ];

  for (const { pos, onField } of positionOrder) {
    const pool = byPosition[pos] || [];
    const premiums = pool.filter(p => isPremium(p) && !usedIds.has(p.id));
    const midPricers = pool.filter(p => !isPremium(p) && !isRookie(p) && !usedIds.has(p.id))
      .sort((a, b) => playerValue(b) - playerValue(a));

    let filled = 0;
    for (const p of premiums) {
      if (filled >= onField) break;
      if (addPlayer(p, pos, true, `Premium ${pos} — avg ${p.avgScore}, top scorer at position`)) {
        filled++;
      }
    }
    for (const p of midPricers) {
      if (filled >= onField) break;
      if (addPlayer(p, pos, true, `Value ${pos} — avg ${p.avgScore}, strong value at $${(p.price / 1000).toFixed(0)}k`)) {
        filled++;
      }
    }
    for (const p of pool.filter(pp => !usedIds.has(pp.id))) {
      if (filled >= onField) break;
      if (addPlayer(p, pos, true, `${pos} fill — avg ${p.avgScore}`)) {
        filled++;
      }
    }
  }

  const utilCandidates = viable
    .filter(p => !usedIds.has(p.id))
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  for (const p of utilCandidates) {
    if (addPlayer(p, "UTIL", true, `Utility — best available scorer, avg ${p.avgScore}`)) break;
  }

  for (const { pos, bench } of positionOrder) {
    const pool = byPosition[pos] || [];
    const cashCows = pool.filter(p => isCashCow(p) && !usedIds.has(p.id))
      .sort((a, b) => {
        const aGrowth = (a.avgScore || 0) - (a.breakEven || 0);
        const bGrowth = (b.avgScore || 0) - (b.breakEven || 0);
        return bGrowth - aGrowth;
      });
    const fallback = pool.filter(p => isRookie(p) && !usedIds.has(p.id))
      .sort((a, b) => (a.price || 0) - (b.price || 0));

    let filled = 0;
    for (const p of cashCows) {
      if (filled >= bench) break;
      const growth = (p.avgScore || 0) - (p.breakEven || 0);
      if (addPlayer(p, pos, false, `Cash cow — BE ${p.breakEven}, avg ${p.avgScore}, growth +${growth.toFixed(0)}`)) {
        filled++;
      }
    }
    for (const p of fallback) {
      if (filled >= bench) break;
      if (addPlayer(p, pos, false, `Bench rookie — cheapest available at $${(p.price / 1000).toFixed(0)}k`)) {
        filled++;
      }
    }
    for (const p of pool.filter(pp => !usedIds.has(pp.id))) {
      if (filled >= bench) break;
      if (addPlayer(p, pos, false, `Bench fill — ${pos}`)) {
        filled++;
      }
    }
  }

  const positionCounts: Record<string, number> = {};
  for (const p of selected) {
    positionCounts[p.fieldPosition] = (positionCounts[p.fieldPosition] || 0) + 1;
  }
  for (const { pos } of positionOrder) {
    const required = (POSITION_REQS as any)[pos]?.total || 0;
    const have = positionCounts[pos] || 0;
    if (have < required) {
      const pool = (byPosition[pos] || []).filter(p => !usedIds.has(p.id))
        .sort((a, b) => (a.price || 0) - (b.price || 0));
      for (const p of pool) {
        if ((positionCounts[pos] || 0) >= required) break;
        if (addPlayer(p, pos, false, `Position fill — need ${required} ${pos}, cheapest available`)) {
          positionCounts[pos] = (positionCounts[pos] || 0) + 1;
        }
      }
    }
  }

  while (selected.length < 30 && viable.some(p => !usedIds.has(p.id))) {
    const remaining = viable.filter(p => !usedIds.has(p.id)).sort((a, b) => (a.price || 0) - (b.price || 0));
    if (remaining.length === 0) break;
    const p = remaining[0];
    const pos = getPlayerPrimaryPosition(p);
    addPlayer(p, pos, false, "Extra fill to reach 30 players");
  }

  const byeCoverage = { r12: 0, r13: 0, r14: 0 };
  for (const p of selected) {
    if (p.byeRound === 12) byeCoverage.r12++;
    else if (p.byeRound === 13) byeCoverage.r13++;
    else if (p.byeRound === 14) byeCoverage.r14++;
  }

  const premiumCount = selected.filter(p => isPremium(p)).length;
  const rookieCount = selected.filter(p => isRookie(p)).length;

  const strategy = `Optimal squad: ${premiumCount} premiums on-field, ${rookieCount} cash cows/rookies on bench. ` +
    `Total cost $${(totalCost / 1000000).toFixed(2)}M of $${(SALARY_CAP / 1000000).toFixed(2)}M cap. ` +
    `Bye spread: R12(${byeCoverage.r12}), R13(${byeCoverage.r13}), R14(${byeCoverage.r14}). ` +
    `Strategy: Premium-heavy on-field for immediate scoring, cheap bench for cash generation through early rounds.`;

  return {
    teamPlayers: selected,
    totalCost,
    remainingBudget: SALARY_CAP - totalCost,
    byeCoverage,
    strategy,
  };
}

export async function generateSeasonPlan(
  teamPlayerIds: number[],
  currentRound: number
): Promise<SeasonPlanResult> {
  const normalizedRound = Math.max(0, Math.min(24, currentRound));

  const teamPlayers = teamPlayerIds.length > 0
    ? await db.select().from(players).where(inArray(players.id, teamPlayerIds))
    : [];

  if (teamPlayers.length === 0) {
    return {
      overallStrategy: "No team found. Import or build a team to generate a season plan.",
      weeklyPlans: [],
      totalProjectedScore: 0,
      teamPlayerIds: [],
    };
  }

  const allPlayers = await db.select().from(players);
  const allFixtures = await db.select().from(fixtures);

  const weeklyPlans: WeeklyPlan[] = [];
  let simulatedTeam = [...teamPlayers];
  let simulatedCash = SALARY_CAP - simulatedTeam.reduce((sum, p) => sum + p.price, 0);
  let totalProjected = 0;

  for (let round = normalizedRound; round <= 24; round++) {
    const phaseInfo = getSeasonPhase(round);
    const tradesAvailable = getTradesForRound(round);
    const isBye = BYE_ROUNDS.includes(round);

    const roundFixtures = allFixtures.filter(f => f.round === round);

    const activePlayers = isBye
      ? simulatedTeam.filter(p => p.byeRound !== round)
      : [...simulatedTeam];

    const sortedByScore = [...activePlayers].sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
    const captain = sortedByScore[0] || null;
    const viceCaptain = sortedByScore[1] || null;

    const roundFixtureMap = new Map<string, { opponent: string; time: string }>();
    for (const f of roundFixtures) {
      roundFixtureMap.set(f.homeTeam, { opponent: f.awayTeam, time: f.localTime || "" });
      roundFixtureMap.set(f.awayTeam, { opponent: f.homeTeam, time: f.localTime || "" });
    }

    let captainReasoning = "";
    if (captain) {
      const fixture = roundFixtureMap.get(captain.team);
      captainReasoning = `Highest avg scorer (${captain.avgScore}) on your team`;
      if (fixture) captainReasoning += ` vs ${fixture.opponent}`;
      if (captain.ppm) captainReasoning += `, PPM: ${captain.ppm}`;
    }

    let vcReasoning = "";
    if (viceCaptain) {
      const fixture = roundFixtureMap.get(viceCaptain.team);
      const isEarlyGame = fixture?.time && (fixture.time.includes("Thu") || fixture.time.includes("Fri"));
      vcReasoning = `Second highest scorer (${viceCaptain.avgScore})`;
      if (fixture) vcReasoning += ` vs ${fixture.opponent}`;
      if (isEarlyGame) vcReasoning += " — LOOPHOLE ELIGIBLE (early game)";
    }

    const trades: WeeklyPlan["trades"] = [];

    if (tradesAvailable > 0 && round >= 2) {
      const weakest = [...simulatedTeam]
        .sort((a, b) => {
          if (phaseInfo.phase === "launch" || phaseInfo.phase === "cash_gen") {
            const aIsCow = isCashCow(a);
            const bIsCow = isCashCow(b);
            if (aIsCow && !bIsCow) {
              const aGrowth = (a.avgScore || 0) - (a.breakEven || 0);
              if (aGrowth < 0) return -1;
            }
            if (bIsCow && !aIsCow) {
              const bGrowth = (b.avgScore || 0) - (b.breakEven || 0);
              if (bGrowth < 0) return 1;
            }
          }
          return (a.avgScore || 0) - (b.avgScore || 0);
        });

      const usedOutIds = new Set<number>();
      const usedInIds = new Set(simulatedTeam.map(p => p.id));

      for (let t = 0; t < Math.min(tradesAvailable, 2); t++) {
        const playerOut = weakest.find(p => !usedOutIds.has(p.id));
        if (!playerOut) break;

        const outPos = getPlayerPrimaryPosition(playerOut);
        const budget = simulatedCash + playerOut.price;

        let upgradeCandidates = allPlayers
          .filter(p =>
            !usedInIds.has(p.id) &&
            p.price <= budget &&
            getPlayerPositions(p).includes(outPos) &&
            (p.avgScore || 0) > (playerOut.avgScore || 0) &&
            p.selectionStatus !== "omitted"
          )
          .sort((a, b) => {
            if (phaseInfo.phase === "launch") return playerValue(b) - playerValue(a);
            if (phaseInfo.phase === "cash_gen") return (b.avgScore || 0) - (a.avgScore || 0);
            if (phaseInfo.phase === "bye_warfare") {
              const aByeOk = !BYE_ROUNDS.includes(a.byeRound || 0) || a.byeRound !== round;
              const bByeOk = !BYE_ROUNDS.includes(b.byeRound || 0) || b.byeRound !== round;
              if (aByeOk && !bByeOk) return -1;
              if (bByeOk && !aByeOk) return 1;
              return (b.avgScore || 0) - (a.avgScore || 0);
            }
            return (b.avgScore || 0) - (a.avgScore || 0);
          });

        const playerIn = upgradeCandidates[0];
        if (!playerIn) break;

        const pointsGain = (playerIn.avgScore || 0) - (playerOut.avgScore || 0);
        const cashImpact = playerOut.price - playerIn.price;

        let reasoning = "";
        if (phaseInfo.phase === "launch") {
          if (isCashCow(playerOut) && (playerOut.avgScore || 0) < (playerOut.breakEven || 0)) {
            reasoning = `Peaked cash cow (avg ${playerOut.avgScore} < BE ${playerOut.breakEven}) → upgrade to ${playerIn.name} (avg ${playerIn.avgScore}, value ${playerValue(playerIn).toFixed(1)})`;
          } else {
            reasoning = `Upgrade: +${pointsGain.toFixed(1)} pts/week, improving ${outPos} stocks`;
          }
        } else if (phaseInfo.phase === "cash_gen") {
          reasoning = `Cash cow → premium cycle: sell ${playerOut.name} ($${(playerOut.price/1000).toFixed(0)}k) → buy ${playerIn.name} (avg ${playerIn.avgScore})`;
        } else if (phaseInfo.phase === "bye_warfare") {
          reasoning = `Bye coverage trade: +${pointsGain.toFixed(1)} pts, ensuring ${outPos} depth through byes`;
        } else {
          reasoning = `Run home upgrade: +${pointsGain.toFixed(1)} pts/week × ${24 - round} remaining rounds = +${(pointsGain * (24 - round)).toFixed(0)} projected season points`;
        }

        trades.push({
          playerOut: { name: playerOut.name, team: playerOut.team, position: outPos, avgScore: playerOut.avgScore || 0, price: playerOut.price },
          playerIn: { name: playerIn.name, team: playerIn.team, position: outPos, avgScore: playerIn.avgScore || 0, price: playerIn.price },
          reasoning,
          pointsGain,
          cashImpact,
        });

        usedOutIds.add(playerOut.id);
        usedInIds.add(playerIn.id);

        simulatedTeam = simulatedTeam.filter(p => p.id !== playerOut.id);
        simulatedTeam.push(playerIn);
        simulatedCash = simulatedCash + playerOut.price - playerIn.price;
      }
    }

    const onFieldCount = Math.min(22, activePlayers.length);
    const topScorers = sortedByScore.slice(0, onFieldCount);
    let projectedScore = topScorers.reduce((sum, p) => sum + (p.avgScore || 0), 0);
    if (captain) projectedScore += (captain.avgScore || 0);

    const byeCoverage = { r12: 0, r13: 0, r14: 0 };
    for (const p of simulatedTeam) {
      if (p.byeRound === 12) byeCoverage.r12++;
      else if (p.byeRound === 13) byeCoverage.r13++;
      else if (p.byeRound === 14) byeCoverage.r14++;
    }

    const teamValue = simulatedTeam.reduce((sum, p) => sum + p.price, 0);
    const premiumCount = simulatedTeam.filter(p => isPremium(p)).length;
    const rookieCount = simulatedTeam.filter(p => isRookie(p)).length;

    const structureNotes: string[] = [];
    if (phaseInfo.phase === "launch") {
      structureNotes.push(`Focus: ${phaseInfo.priorities[0]}`);
      if (rookieCount > 0) structureNotes.push(`${rookieCount} cash cows generating value on bench`);
    } else if (phaseInfo.phase === "cash_gen") {
      structureNotes.push(`Upgrade cycle: convert rookies → premiums`);
      structureNotes.push(`Target: ${premiumCount + 2}+ premiums by R11`);
    } else if (phaseInfo.phase === "bye_warfare") {
      const byeTeamCount = simulatedTeam.filter(p => p.byeRound === round).length;
      structureNotes.push(`Players on bye this round: ${byeTeamCount}`);
      structureNotes.push(`Active squad: ${activePlayers.length} players`);
    } else {
      structureNotes.push(`Full premium push: ${premiumCount} premiums`);
      structureNotes.push(`Every trade must gain 150+ projected season points`);
    }

    const flags: string[] = [];
    if (isBye) flags.push(`BYE ROUND — ${simulatedTeam.filter(p => p.byeRound === round).length} players on bye`);
    if (round === 1) flags.push("SEASON OPENER — No trades available");
    if (activePlayers.length < 18 && isBye) flags.push("WARNING: Less than 18 active players this round");
    if (phaseInfo.phase === "bye_warfare" && !isBye) flags.push("Pre-bye preparation round");

    const vcIsLoophole = viceCaptain && roundFixtureMap.get(viceCaptain.team)?.time &&
      (roundFixtureMap.get(viceCaptain.team)!.time.includes("Thu") || roundFixtureMap.get(viceCaptain.team)!.time.includes("Fri"));
    if (vcIsLoophole) flags.push("LOOPHOLE: VC plays early — can use as emergency captain");

    weeklyPlans.push({
      round,
      phase: phaseInfo.phase,
      phaseName: phaseInfo.name,
      projectedTeamScore: Math.round(projectedScore),
      recommendedCaptain: captain ? {
        name: captain.name,
        team: captain.team,
        avgScore: captain.avgScore || 0,
        reasoning: captainReasoning,
      } : null,
      recommendedViceCaptain: viceCaptain ? {
        name: viceCaptain.name,
        team: viceCaptain.team,
        avgScore: viceCaptain.avgScore || 0,
        reasoning: vcReasoning,
      } : null,
      trades,
      structureNotes,
      keyMetrics: {
        teamValue,
        cashInBank: simulatedCash,
        byeCoverage,
        premiumCount,
        rookieCount,
      },
      flags,
    });

    totalProjected += Math.round(projectedScore);
  }

  const premiumCount = teamPlayers.filter(p => isPremium(p)).length;
  const rookieCount = teamPlayers.filter(p => isRookie(p)).length;
  const overallStrategy =
    `Season strategy for ${teamPlayers.length}-player squad: ` +
    `${premiumCount} premiums, ${rookieCount} rookies/cash cows. ` +
    `Phase 1 (R0-5): Maximize cash generation from bench rookies while premium on-field players score consistently. ` +
    `Phase 2 (R6-10): Begin rookie-to-premium upgrade cycle — sell peaked cash cows, buy underpriced breakout players. ` +
    `Phase 3 (R11-15): Bye round warfare — ensure 18+ active players each bye week, use extra trades strategically. ` +
    `Phase 4 (R16-24): Full premium squad, maximize captain scores weekly, target unique high-scoring PODs for rank gains. ` +
    `Projected season total: ${totalProjected.toLocaleString()} points.`;

  return {
    overallStrategy,
    weeklyPlans,
    totalProjectedScore: totalProjected,
    teamPlayerIds,
  };
}

export async function saveSeasonPlan(plan: SeasonPlanResult, currentRound: number): Promise<SeasonPlan> {
  await db.update(seasonPlans).set({ isActive: false }).where(eq(seasonPlans.isActive, true));

  const [saved] = await db.insert(seasonPlans).values({
    currentRound,
    teamSnapshot: JSON.stringify(plan.teamPlayerIds),
    overallStrategy: plan.overallStrategy,
    weeklyPlans: JSON.stringify(plan.weeklyPlans),
    totalProjectedScore: plan.totalProjectedScore,
    isActive: true,
  }).returning();

  return saved;
}

export async function getActiveSeasonPlan(): Promise<SeasonPlan | null> {
  const [plan] = await db.select().from(seasonPlans)
    .where(eq(seasonPlans.isActive, true))
    .orderBy(desc(seasonPlans.generatedAt))
    .limit(1);
  return plan || null;
}
