import { db } from "../db";
import { players, fixtures, myTeamPlayers, seasonPlans, leagueSettings } from "@shared/schema";
import type { Player, SeasonPlan } from "@shared/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { AFL_FANTASY_CLASSIC_2026, getSeasonPhase, getTradesForRound } from "../../shared/game-rules";

const SALARY_CAP = AFL_FANTASY_CLASSIC_2026.salaryCap;
const POSITION_REQS = AFL_FANTASY_CLASSIC_2026.squad.positions;
const BYE_ROUNDS = AFL_FANTASY_CLASSIC_2026.byeRounds;

export interface SquadPlayer {
  id: number;
  name: string;
  team: string;
  position: string;
  fieldPosition: string;
  isOnField: boolean;
  avgScore: number;
  price: number;
  breakEven: number | null;
  byeRound: number | null;
  ppm: number | null;
  role: string;
}

export interface WeeklyPlan {
  round: number;
  phase: string;
  phaseName: string;
  projectedTeamScore: number;
  recommendedCaptain: { id: number; name: string; team: string; avgScore: number; reasoning: string } | null;
  recommendedViceCaptain: { id: number; name: string; team: string; avgScore: number; reasoning: string } | null;
  trades: Array<{
    playerOut: { id: number; name: string; team: string; position: string; avgScore: number; price: number; breakEven: number | null };
    playerIn: { id: number; name: string; team: string; position: string; avgScore: number; price: number; breakEven: number | null; ppm: number | null; owned: number };
    reasoning: string;
    pointsGain: number;
    cashImpact: number;
  }>;
  structureNotes: string[];
  squad: SquadPlayer[];
  keyMetrics: {
    teamValue: number;
    cashInBank: number;
    byeCoverage: { r12: number; r13: number; r14: number };
    premiumCount: number;
    rookieCount: number;
    projectedRank: string;
  };
  flags: string[];
}

export interface SeasonPlanResult {
  overallStrategy: string;
  startingSquad: SquadPlayer[];
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

function isMidPricer(p: Player): boolean {
  return p.price > 350000 && p.price < 600000;
}

function isCashCow(p: Player): boolean {
  return p.price <= 350000 && (p.breakEven || 0) < (p.avgScore || 999);
}

function isRookie(p: Player): boolean {
  return p.price <= 350000;
}

function playerRole(p: Player): string {
  if (isPremium(p)) return "Premium";
  if (isMidPricer(p)) return "Mid-Pricer";
  if (isCashCow(p)) return "Cash Cow";
  if (isRookie(p)) return "Rookie";
  return "Value";
}

function toSquadPlayer(p: Player, fieldPosition: string, isOnField: boolean): SquadPlayer {
  return {
    id: p.id,
    name: p.name,
    team: p.team,
    position: p.position,
    fieldPosition,
    isOnField,
    avgScore: p.avgScore || 0,
    price: p.price,
    breakEven: p.breakEven || null,
    byeRound: p.byeRound || null,
    ppm: p.ppm || null,
    role: playerRole(p),
  };
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

  const onFieldPremiums = selected.filter(p => p.isOnField && isPremium(p)).map(p => p.name);
  const benchCashCows = selected.filter(p => !p.isOnField && isRookie(p)).map(p => p.name);
  const strategy =
    `${premiumCount} premiums on-field: ${onFieldPremiums.slice(0, 8).join(", ")}${onFieldPremiums.length > 8 ? ` +${onFieldPremiums.length - 8} more` : ""}. ` +
    `${rookieCount} cash cows on bench: ${benchCashCows.slice(0, 6).join(", ")}${benchCashCows.length > 6 ? ` +${benchCashCows.length - 6} more` : ""}. ` +
    `Total cost $${(totalCost / 1000000).toFixed(2)}M of $${(SALARY_CAP / 1000000).toFixed(2)}M cap ($${((SALARY_CAP - totalCost) / 1000).toFixed(0)}k spare). ` +
    `Bye spread: R12(${byeCoverage.r12}), R13(${byeCoverage.r13}), R14(${byeCoverage.r14}).`;

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
      startingSquad: [],
      weeklyPlans: [],
      totalProjectedScore: 0,
      teamPlayerIds: [],
    };
  }

  const allPlayers = await db.select().from(players);
  const allFixtures = await db.select().from(fixtures);

  const startingSquad: SquadPlayer[] = teamPlayers.map(p => {
    const pos = getPlayerPrimaryPosition(p);
    return toSquadPlayer(p, pos, isPremium(p) || isMidPricer(p));
  });

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

    const roundFixtureMap = new Map<string, { opponent: string; time: string; venue: string }>();
    for (const f of roundFixtures) {
      roundFixtureMap.set(f.homeTeam, { opponent: f.awayTeam, time: f.localTime || "", venue: f.venue });
      roundFixtureMap.set(f.awayTeam, { opponent: f.homeTeam, time: f.localTime || "", venue: f.venue });
    }

    let captainReasoning = "";
    if (captain) {
      const fixture = roundFixtureMap.get(captain.team);
      captainReasoning = `Avg ${captain.avgScore}`;
      if (fixture) captainReasoning += `, plays ${fixture.opponent} at ${fixture.venue}`;
      if (captain.ppm) captainReasoning += `, ${captain.ppm} PPM`;
      if (captain.seasonCba) captainReasoning += `, ${captain.seasonCba}% CBA`;
      captainReasoning += ` — projected ${Math.round((captain.avgScore || 0) * 2)} doubled`;
    }

    let vcReasoning = "";
    if (viceCaptain) {
      const fixture = roundFixtureMap.get(viceCaptain.team);
      const isEarlyGame = fixture?.time && (fixture.time.includes("Thu") || fixture.time.includes("Fri"));
      vcReasoning = `Avg ${viceCaptain.avgScore}`;
      if (fixture) vcReasoning += `, plays ${fixture.opponent}`;
      if (isEarlyGame) vcReasoning += ` — LOOPHOLE: plays ${fixture?.time.split(" ")[0]} so you can see his score before locking captain`;
      if (viceCaptain.ppm) vcReasoning += `, ${viceCaptain.ppm} PPM`;
    }

    const trades: WeeklyPlan["trades"] = [];

    if (tradesAvailable > 0 && round >= 2) {
      const weakest = [...simulatedTeam]
        .sort((a, b) => {
          if (phaseInfo.phase === "launch" || phaseInfo.phase === "cash_gen") {
            const aIsCow = isCashCow(a);
            const bIsCow = isCashCow(b);
            const aPeaked = aIsCow && (a.avgScore || 0) < (a.breakEven || 0);
            const bPeaked = bIsCow && (b.avgScore || 0) < (b.breakEven || 0);
            if (aPeaked && !bPeaked) return -1;
            if (bPeaked && !aPeaked) return 1;
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

        const upgradeCandidates = allPlayers
          .filter(p =>
            !usedInIds.has(p.id) &&
            p.price <= budget &&
            getPlayerPositions(p).includes(outPos) &&
            (p.avgScore || 0) > (playerOut.avgScore || 0) &&
            p.selectionStatus !== "omitted" &&
            !p.injuryStatus?.toLowerCase().includes("season") &&
            !p.injuryStatus?.toLowerCase().includes("acl")
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
        const remainingRounds = 24 - round;

        let reasoning = "";
        if (phaseInfo.phase === "launch") {
          if (isCashCow(playerOut) && (playerOut.avgScore || 0) < (playerOut.breakEven || 0)) {
            reasoning = `${playerOut.name} has peaked — avg ${playerOut.avgScore} is below BE ${playerOut.breakEven}, losing value each week. ${playerIn.name} averages ${playerIn.avgScore} at $${(playerIn.price / 1000).toFixed(0)}k (value ratio: ${playerValue(playerIn).toFixed(1)}).`;
          } else {
            reasoning = `${playerOut.name} (avg ${playerOut.avgScore}) is your weakest ${outPos}. ${playerIn.name} scores +${pointsGain.toFixed(1)} pts/wk more at $${(playerIn.price / 1000).toFixed(0)}k.`;
          }
        } else if (phaseInfo.phase === "cash_gen") {
          reasoning = `Sell ${playerOut.name} ($${(playerOut.price / 1000).toFixed(0)}k, avg ${playerOut.avgScore}) to fund ${playerIn.name} ($${(playerIn.price / 1000).toFixed(0)}k, avg ${playerIn.avgScore}). Gains +${pointsGain.toFixed(1)} pts/wk = +${(pointsGain * remainingRounds).toFixed(0)} over remaining ${remainingRounds} rounds.`;
        } else if (phaseInfo.phase === "bye_warfare") {
          const inByeRound = playerIn.byeRound;
          reasoning = `${playerIn.name} (avg ${playerIn.avgScore}, bye R${inByeRound || "?"}) replaces ${playerOut.name} (avg ${playerOut.avgScore}). +${pointsGain.toFixed(1)} pts/wk while maintaining bye coverage.`;
        } else {
          reasoning = `Run home: ${playerIn.name} (avg ${playerIn.avgScore}) over ${playerOut.name} (avg ${playerOut.avgScore}). +${pointsGain.toFixed(1)} pts/wk x ${remainingRounds} rounds = +${(pointsGain * remainingRounds).toFixed(0)} projected season points. ${playerIn.ownedByPercent < 15 ? `Only ${playerIn.ownedByPercent}% owned — strong POD.` : ""}`;
        }

        trades.push({
          playerOut: { id: playerOut.id, name: playerOut.name, team: playerOut.team, position: outPos, avgScore: playerOut.avgScore || 0, price: playerOut.price, breakEven: playerOut.breakEven },
          playerIn: { id: playerIn.id, name: playerIn.name, team: playerIn.team, position: outPos, avgScore: playerIn.avgScore || 0, price: playerIn.price, breakEven: playerIn.breakEven, ppm: playerIn.ppm, owned: playerIn.ownedByPercent },
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
      const cows = simulatedTeam.filter(p => isCashCow(p));
      if (cows.length > 0) {
        const topCow = cows.sort((a, b) => ((b.avgScore || 0) - (b.breakEven || 0)) - ((a.avgScore || 0) - (a.breakEven || 0)))[0];
        structureNotes.push(`Best cash cow: ${topCow.name} (avg ${topCow.avgScore}, BE ${topCow.breakEven}, generating +$${Math.max(0, Math.round(((topCow.avgScore || 0) - (topCow.breakEven || 0)) * 1000))}k/wk)`);
      }
      const peaked = simulatedTeam.filter(p => isRookie(p) && (p.avgScore || 0) < (p.breakEven || 0));
      if (peaked.length > 0) {
        structureNotes.push(`Peaked rookies to sell: ${peaked.map(p => `${p.name} (avg ${p.avgScore} < BE ${p.breakEven})`).join(", ")}`);
      } else {
        structureNotes.push(`All ${cows.length} cash cows still growing — hold and let them generate value`);
      }
    } else if (phaseInfo.phase === "cash_gen") {
      const remainingRookies = simulatedTeam.filter(p => isRookie(p));
      if (remainingRookies.length > 0) {
        structureNotes.push(`Still holding ${remainingRookies.length} rookies: ${remainingRookies.map(p => p.name).join(", ")} — convert to premiums`);
      }
      structureNotes.push(`Target: ${premiumCount + Math.min(remainingRookies.length, 4)}+ premiums by R11 for bye warfare`);
    } else if (phaseInfo.phase === "bye_warfare") {
      const byeTeamCount = simulatedTeam.filter(p => p.byeRound === round).length;
      const byePlayers = simulatedTeam.filter(p => p.byeRound === round);
      if (isBye && byePlayers.length > 0) {
        structureNotes.push(`On bye: ${byePlayers.map(p => p.name).join(", ")} (${byePlayers.length} players)`);
        structureNotes.push(`Active squad: ${activePlayers.length} players — ${activePlayers.length >= 18 ? "full coverage" : "WARNING: need at least 18"}`);
      } else if (!isBye) {
        structureNotes.push(`Pre-bye prep: ensure coverage for R${BYE_ROUNDS.filter(r => r >= round).join(", R")}`);
      }
    } else {
      const topScorerNames = simulatedTeam.filter(p => isPremium(p)).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0)).slice(0, 5);
      structureNotes.push(`Core premiums: ${topScorerNames.map(p => `${p.name} (${p.avgScore})`).join(", ")}`);
      const pods = simulatedTeam.filter(p => p.ownedByPercent < 10 && (p.avgScore || 0) >= 80);
      if (pods.length > 0) {
        structureNotes.push(`PODs (low ownership): ${pods.map(p => `${p.name} (${p.avgScore} avg, ${p.ownedByPercent}% owned)`).join(", ")}`);
      }
    }

    const flags: string[] = [];
    if (isBye) {
      const byePlayers = simulatedTeam.filter(p => p.byeRound === round);
      flags.push(`BYE ROUND — ${byePlayers.length} players out: ${byePlayers.map(p => p.name).slice(0, 5).join(", ")}${byePlayers.length > 5 ? ` +${byePlayers.length - 5} more` : ""}`);
    }
    if (round === 1) flags.push("SEASON OPENER — No trades available, lock and load");
    if (activePlayers.length < 18 && isBye) flags.push(`WARNING: Only ${activePlayers.length} active players — need at least 18`);

    const vcIsLoophole = viceCaptain && roundFixtureMap.get(viceCaptain.team)?.time &&
      (roundFixtureMap.get(viceCaptain.team)!.time.includes("Thu") || roundFixtureMap.get(viceCaptain.team)!.time.includes("Fri"));
    if (vcIsLoophole) flags.push(`LOOPHOLE: ${viceCaptain!.name} plays ${roundFixtureMap.get(viceCaptain!.team)!.time} — set as VC, watch score, keep or swap to captain`);

    const avgPerRound = totalProjected > 0 && weeklyPlans.length > 0 ? totalProjected / weeklyPlans.length : projectedScore;
    const projectedRank = avgPerRound > 2200 ? "Top 100" : avgPerRound > 2000 ? "Top 1,000" : avgPerRound > 1800 ? "Top 10,000" : "Building";

    const squad: SquadPlayer[] = simulatedTeam.map(p => {
      const pos = getPlayerPrimaryPosition(p);
      return toSquadPlayer(p, pos, isPremium(p) || isMidPricer(p));
    });

    weeklyPlans.push({
      round,
      phase: phaseInfo.phase,
      phaseName: phaseInfo.name,
      projectedTeamScore: Math.round(projectedScore),
      recommendedCaptain: captain ? {
        id: captain.id,
        name: captain.name,
        team: captain.team,
        avgScore: captain.avgScore || 0,
        reasoning: captainReasoning,
      } : null,
      recommendedViceCaptain: viceCaptain ? {
        id: viceCaptain.id,
        name: viceCaptain.name,
        team: viceCaptain.team,
        avgScore: viceCaptain.avgScore || 0,
        reasoning: vcReasoning,
      } : null,
      trades,
      structureNotes,
      squad,
      keyMetrics: {
        teamValue,
        cashInBank: simulatedCash,
        byeCoverage,
        premiumCount,
        rookieCount,
        projectedRank,
      },
      flags,
    });

    totalProjected += Math.round(projectedScore);
  }

  const premiums = teamPlayers.filter(p => isPremium(p)).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  const cashCows = teamPlayers.filter(p => isCashCow(p)).sort((a, b) => ((b.avgScore || 0) - (b.breakEven || 0)) - ((a.avgScore || 0) - (a.breakEven || 0)));
  const midPricers = teamPlayers.filter(p => isMidPricer(p)).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  const avgRoundScore = weeklyPlans.length > 0 ? Math.round(totalProjected / weeklyPlans.length) : 0;

  const overallStrategy =
    `Your ${teamPlayers.length}-player squad is built around ${premiums.length} premiums` +
    (premiums.length > 0 ? ` led by ${premiums.slice(0, 3).map(p => `${p.name} (${p.avgScore})`).join(", ")}` : "") +
    `. ${cashCows.length} cash cows on bench` +
    (cashCows.length > 0 ? ` — best value: ${cashCows.slice(0, 3).map(p => `${p.name} (avg ${p.avgScore}, BE ${p.breakEven})`).join(", ")}` : "") +
    `. ${midPricers.length > 0 ? `${midPricers.length} mid-pricers to upgrade: ${midPricers.slice(0, 3).map(p => `${p.name} ($${(p.price / 1000).toFixed(0)}k)`).join(", ")}. ` : ""}` +
    `Avg ${avgRoundScore.toLocaleString()} pts/round, projected ${totalProjected.toLocaleString()} season total. ` +
    `Bye coverage: R12(${startingSquad.filter(p => p.byeRound === 12).length}), R13(${startingSquad.filter(p => p.byeRound === 13).length}), R14(${startingSquad.filter(p => p.byeRound === 14).length}).`;

  return {
    overallStrategy,
    startingSquad,
    weeklyPlans,
    totalProjectedScore: totalProjected,
    teamPlayerIds,
  };
}

export async function saveSeasonPlan(plan: SeasonPlanResult, currentRound: number): Promise<SeasonPlan> {
  await db.update(seasonPlans).set({ isActive: false }).where(eq(seasonPlans.isActive, true));

  const [saved] = await db.insert(seasonPlans).values({
    currentRound,
    teamSnapshot: JSON.stringify({ teamPlayerIds: plan.teamPlayerIds, startingSquad: plan.startingSquad }),
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
