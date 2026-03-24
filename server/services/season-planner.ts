import { db } from "../db";
import { players, fixtures, myTeamPlayers, seasonPlans, leagueSettings } from "@shared/schema";
import type { Player, SeasonPlan } from "@shared/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { AFL_FANTASY_CLASSIC_2026, getSeasonPhase, getTradesForRound } from "../../shared/game-rules";

const SALARY_CAP = AFL_FANTASY_CLASSIC_2026.salaryCap;
const POSITION_REQS = AFL_FANTASY_CLASSIC_2026.squad.positions;
const BYE_ROUNDS = [...AFL_FANTASY_CLASSIC_2026.earlyByeRounds, ...AFL_FANTASY_CLASSIC_2026.regularByeRounds];
const REGULAR_BYE_ROUNDS = AFL_FANTASY_CLASSIC_2026.regularByeRounds;
const EARLY_BYE_ROUNDS = AFL_FANTASY_CLASSIC_2026.earlyByeRounds;
const BEST_18_COUNT = AFL_FANTASY_CLASSIC_2026.best18.count;
const MAGIC_NUMBER = AFL_FANTASY_CLASSIC_2026.magicNumber;
const TOTAL_ROUNDS = 24;

const WINNER_BENCHMARKS: Record<number, { avgPerRound: number; seasonTotal: number; teamValue: Record<number, number>; premiums: Record<number, number>; label: string }> = {
  2024: {
    avgPerRound: 2285,
    seasonTotal: 54840,
    label: "2024 Winner",
    teamValue: { 0: 13200000, 5: 14800000, 10: 16200000, 15: 17500000, 20: 18100000, 24: 18250000 },
    premiums: { 0: 12, 5: 14, 10: 17, 15: 19, 20: 21, 24: 22 },
  },
  2023: {
    avgPerRound: 2240,
    seasonTotal: 53760,
    label: "2023 Winner",
    teamValue: { 0: 13100000, 5: 14600000, 10: 15900000, 15: 17200000, 20: 17900000, 24: 18200000 },
    premiums: { 0: 11, 5: 13, 10: 16, 15: 18, 20: 20, 24: 22 },
  },
  2022: {
    avgPerRound: 2195,
    seasonTotal: 52680,
    label: "2022 Winner",
    teamValue: { 0: 12900000, 5: 14400000, 10: 15700000, 15: 17000000, 20: 17800000, 24: 18100000 },
    premiums: { 0: 11, 5: 13, 10: 15, 15: 18, 20: 20, 24: 21 },
  },
};

function getWinnerBenchmarkAtRound(round: number): { avgScore: number; teamValue: number; premiums: number } {
  const years = Object.values(WINNER_BENCHMARKS);
  const avgScore = Math.round(years.reduce((s, y) => s + y.avgPerRound, 0) / years.length);
  const closestKey = (obj: Record<number, number>, r: number): number => {
    const keys = Object.keys(obj).map(Number).sort((a, b) => a - b);
    let best = keys[0];
    for (const k of keys) { if (k <= r) best = k; }
    return obj[best];
  };
  const teamValue = Math.round(years.reduce((s, y) => s + closestKey(y.teamValue, round), 0) / years.length);
  const premiums = Math.round(years.reduce((s, y) => s + closestKey(y.premiums, round), 0) / years.length);
  return { avgScore, teamValue, premiums };
}

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
  narrative: string;
  peakRound: number | null;
  peakPrice: number | null;
  ceilingScore: number | null;
  owned: number;
}

export interface TradeAlternative {
  id: number;
  name: string;
  team: string;
  avgScore: number;
  price: number;
  reason: string;
}

export interface WinnerComparison {
  winnerAvgScore: number;
  yourScore: number;
  scoreDiff: number;
  winnerTeamValue: number;
  yourTeamValue: number;
  valueDiff: number;
  winnerPremiums: number;
  yourPremiums: number;
  onTrack: boolean;
}

export interface ValidationItem {
  check: string;
  passed: boolean;
  detail: string;
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
    alternatives: TradeAlternative[];
    contingency: string;
  }>;
  structureNotes: string[];
  squad: SquadPlayer[];
  winnerComparison: WinnerComparison;
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
  playerNarratives: Array<{ id: number; name: string; narrative: string }>;
  weeklyPlans: WeeklyPlan[];
  totalProjectedScore: number;
  teamPlayerIds: number[];
  validation: ValidationItem[];
  winnerBenchmark: { avgTotal: number; avgPerRound: number };
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

function isPremium(p: Player | { avgScore: number; price: number }): boolean {
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

function forecastPricePeak(p: Player): { peakRound: number | null; peakPrice: number | null } {
  const avg = p.avgScore || 0;
  const be = p.breakEven || 0;
  const startPrice = p.startingPrice || p.price;
  const gp = p.gamesPlayed || 0;

  if (avg <= be || !isRookie(p)) {
    return { peakRound: null, peakPrice: null };
  }

  const weeklyGain = Math.round((avg - be) * MAGIC_NUMBER / 1000) * 1000;
  const maxGrowthWeeks = Math.min(12, Math.ceil(350000 / Math.max(weeklyGain, 1)));
  const peakRound = Math.min(TOTAL_ROUNDS, gp + maxGrowthWeeks);
  const peakPrice = Math.min(
    startPrice + (weeklyGain * maxGrowthWeeks),
    900000
  );

  return { peakRound, peakPrice };
}

function generatePlayerNarrative(p: Player, allPlayers: Player[]): string {
  const avg = p.avgScore || 0;
  const be = p.breakEven || 0;
  const price = p.price;
  const pos = getPlayerPrimaryPosition(p);
  const gp = p.gamesPlayed || 0;
  const ceiling = p.ceilingScore || Math.round(avg * 1.3);
  const floor = p.projectedFloor || Math.round(avg * 0.7);
  const owned = p.ownedByPercent || 0;
  const cba = p.seasonCba;
  const ppm = p.ppm;
  const draftPedigree = p.isDebutant ? "debutant" : (p.yearsExperience || 0) <= 2 ? "second/third-year" : "established";
  const injuryRisk = p.injuryRiskScore || 0;
  const durability = p.durabilityScore || 0;
  const breakout = p.breakoutScore || 0;

  const posRank = allPlayers.filter(pp =>
    getPlayerPrimaryPosition(pp) === pos && (pp.avgScore || 0) > avg
  ).length + 1;

  const samePosAlts = allPlayers
    .filter(pp => getPlayerPrimaryPosition(pp) === pos && pp.id !== p.id && Math.abs(pp.price - price) < 100000 && (pp.avgScore || 0) >= avg * 0.85)
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
    .slice(0, 2);
  const altNames = samePosAlts.map(a => `${a.name} ($${(a.price / 1000).toFixed(0)}k, avg ${a.avgScore})`);

  if (isPremium(p)) {
    let narrative = `${p.name} is our #${posRank} ranked ${pos} with avg ${avg} and ceiling ${ceiling}. `;
    if (cba && cba > 50) narrative += `${cba}% CBA share locks in a high scoring floor. `;
    if (ppm && ppm > 0.8) narrative += `Efficient ${ppm} PPM — even a small TOG increase pushes him toward ${Math.round(avg * 1.1)}+. `;
    narrative += `At $${(price / 1000).toFixed(0)}k he's a season-long hold. `;
    if (owned > 60) narrative += `${owned}% owned so he won't be a POD but too consistent to leave out. `;
    else if (owned < 15) narrative += `Only ${owned}% owned — a genuine POD who can win you rankings. `;
    if (injuryRisk > 0.3) narrative += `Injury risk flagged (${(injuryRisk * 100).toFixed(0)}%) — if he misses, consider ${altNames[0] || "best available " + pos}. `;
    if (p.tagRisk && p.tagRisk > 0.3) narrative += `Tag risk ${(p.tagRisk * 100).toFixed(0)}% — could drop to floor ${floor} in tag games. `;
    return narrative.trim();
  }

  if (isCashCow(p)) {
    const peak = forecastPricePeak(p);
    const weeklyGain = Math.max(0, avg - be);
    const cashGenPerWeek = Math.round(weeklyGain * MAGIC_NUMBER / 1000) * 1000;
    let narrative = `${p.name} is a ${draftPedigree} ${pos} priced at $${(price / 1000).toFixed(0)}k with BE ${be}. `;
    narrative += `Averaging ${avg} (ceiling ${ceiling}), he generates ~$${(cashGenPerWeek / 1000).toFixed(0)}k/wk in price growth. `;
    if (peak.peakRound != null && peak.peakPrice != null) {
      narrative += `Expected to peak around R${peak.peakRound} at ~$${(peak.peakPrice / 1000).toFixed(0)}k (${Math.round((peak.peakPrice - price) / 1000)}k profit). `;
    }
    if (p.cashGenPotential === "elite") {
      narrative += `Rated ELITE cash generation — one of the best value plays available. `;
    }
    narrative += `At peak, we trade him to `;
    const targetBudget = (peak.peakPrice || price) + 200000;
    const upgradeTarget = allPlayers
      .filter(pp => getPlayerPrimaryPosition(pp) === pos && isPremium(pp) && pp.price <= targetBudget && pp.id !== p.id)
      .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))[0];
    if (upgradeTarget) {
      narrative += `a premium like ${upgradeTarget.name} ($${(upgradeTarget.price / 1000).toFixed(0)}k, avg ${upgradeTarget.avgScore}), or `;
    }
    narrative += `to a newer cash cow if one emerges. `;
    if (altNames.length > 0) narrative += `Alternatives at selection: ${altNames.join(", ")}. `;
    if (gp === 0) narrative += `Pre-season pick — monitor Round 1 to confirm he gets game time. `;
    return narrative.trim();
  }

  if (isMidPricer(p)) {
    let narrative = `${p.name} is a mid-pricer at $${(price / 1000).toFixed(0)}k averaging ${avg}. `;
    if (breakout > 0.6) {
      narrative += `Breakout score ${breakout.toFixed(2)} signals he could push into premium territory (95+). `;
      narrative += `If he hits ceiling ${ceiling} consistently, he's a long-term hold. `;
    } else {
      narrative += `Unlikely to become a premium — plan to upgrade him to a top scorer by R${Math.min(TOTAL_ROUNDS, 10)}. `;
    }
    if (cba && cba > 40) narrative += `${cba}% CBA share supports his scoring. `;
    narrative += `BE ${be} — ${avg > be ? `scoring above BE so generating value` : `scoring below BE, losing value each week`}. `;
    if (altNames.length > 0) narrative += `Could swap for: ${altNames.join(", ")}. `;
    return narrative.trim();
  }

  let narrative = `${p.name} is a ${pos} at $${(price / 1000).toFixed(0)}k, avg ${avg}. `;
  if (avg < be) narrative += `Scoring below BE ${be} — sell ASAP. `;
  else narrative += `BE ${be}, still generating some value. `;
  if (altNames.length > 0) narrative += `Alternatives: ${altNames.join(", ")}. `;
  return narrative.trim();
}

function toSquadPlayer(p: Player, fieldPosition: string, isOnField: boolean, narrativeCache?: Map<number, string>, allPlayers?: Player[]): SquadPlayer {
  const peak = forecastPricePeak(p);
  let narrative = "";
  if (narrativeCache) {
    if (!narrativeCache.has(p.id) && allPlayers) {
      narrativeCache.set(p.id, generatePlayerNarrative(p, allPlayers));
    }
    narrative = narrativeCache.get(p.id) || "";
  }
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
    narrative,
    peakRound: isRookie(p) ? peak.peakRound : null,
    peakPrice: isRookie(p) ? peak.peakPrice : null,
    ceilingScore: p.ceilingScore || null,
    owned: p.ownedByPercent || 0,
  };
}

function validatePlan(result: SeasonPlanResult, allPlayers: Player[]): ValidationItem[] {
  const items: ValidationItem[] = [];

  items.push({
    check: "Squad Size",
    passed: result.startingSquad.length >= 28 && result.startingSquad.length <= 30,
    detail: `${result.startingSquad.length} players (need 28-30)`,
  });

  const totalCost = result.startingSquad.reduce((s, p) => s + p.price, 0);
  items.push({
    check: "Salary Cap",
    passed: totalCost <= SALARY_CAP,
    detail: `$${(totalCost / 1000000).toFixed(2)}M of $${(SALARY_CAP / 1000000).toFixed(2)}M cap`,
  });

  const posCounts: Record<string, number> = {};
  for (const p of result.startingSquad) {
    const pos = p.fieldPosition || p.position.split("/")[0];
    posCounts[pos] = (posCounts[pos] || 0) + 1;
  }
  const posCheck = (["DEF", "MID", "RUC", "FWD"] as const).every(pos => {
    const req = (POSITION_REQS as any)[pos]?.total || 0;
    return (posCounts[pos] || 0) >= req;
  });
  items.push({
    check: "Position Requirements",
    passed: posCheck,
    detail: `DEF:${posCounts["DEF"] || 0}/8 MID:${posCounts["MID"] || 0}/10 RUC:${posCounts["RUC"] || 0}/3 FWD:${posCounts["FWD"] || 0}/8`,
  });

  const ids = result.startingSquad.map(p => p.id);
  const uniqueIds = new Set(ids);
  items.push({
    check: "No Duplicate Players",
    passed: uniqueIds.size === ids.length,
    detail: uniqueIds.size === ids.length ? "All unique" : `${ids.length - uniqueIds.size} duplicates found`,
  });

  let totalTrades = 0;
  for (const wp of result.weeklyPlans) {
    const maxTrades = getTradesForRound(wp.round);
    const validTradeCount = wp.trades.length <= maxTrades;
    if (!validTradeCount) {
      items.push({
        check: `Trade Limit R${wp.round}`,
        passed: false,
        detail: `${wp.trades.length} trades planned but only ${maxTrades} allowed`,
      });
    }
    totalTrades += wp.trades.length;
  }
  items.push({
    check: "Total Trades",
    passed: true,
    detail: `${totalTrades} trades planned across ${result.weeklyPlans.length} rounds`,
  });

  const avgScore = result.weeklyPlans.length > 0
    ? result.totalProjectedScore / result.weeklyPlans.length
    : 0;
  items.push({
    check: "Score Rationality",
    passed: avgScore >= 1500 && avgScore <= 2500,
    detail: `Avg ${Math.round(avgScore)}/round (expected range: 1500-2500)`,
  });

  const injuredPlayers = result.startingSquad.filter(p => {
    const dbPlayer = allPlayers.find(pp => pp.id === p.id);
    return dbPlayer?.injuryStatus?.toLowerCase().includes("season") || dbPlayer?.injuryStatus?.toLowerCase().includes("acl");
  });
  items.push({
    check: "No Season-Ending Injuries",
    passed: injuredPlayers.length === 0,
    detail: injuredPlayers.length === 0 ? "All healthy" : `WARNING: ${injuredPlayers.map(p => p.name).join(", ")} have long-term injuries`,
  });

  const onFieldSquad = result.startingSquad.filter(p => p.isOnField !== false);
  const onFieldByeSpread: Record<number, number> = {};
  for (const p of onFieldSquad) {
    if (p.byeRound) {
      onFieldByeSpread[p.byeRound] = (onFieldByeSpread[p.byeRound] || 0) + 1;
    }
  }
  const onFieldCount = onFieldSquad.length;
  const regularByeDetail = REGULAR_BYE_ROUNDS.map(r => `R${r}: ${onFieldByeSpread[r] || 0} on bye, ${onFieldCount - (onFieldByeSpread[r] || 0)} active`).join(" | ");
  const earlyByeDetail = EARLY_BYE_ROUNDS.map(r => `R${r}: ${onFieldByeSpread[r] || 0} on bye, ${onFieldCount - (onFieldByeSpread[r] || 0)} active`).join(" | ");
  const regularByeBalanced = REGULAR_BYE_ROUNDS.every(r => (onFieldCount - (onFieldByeSpread[r] || 0)) >= BEST_18_COUNT);
  const earlyByeOk = EARLY_BYE_ROUNDS.every(r => (onFieldCount - (onFieldByeSpread[r] || 0)) >= BEST_18_COUNT);
  items.push({
    check: "Regular Bye Coverage (R12-14)",
    passed: regularByeBalanced,
    detail: `${regularByeDetail} — ${regularByeBalanced ? "balanced, 18+ active on-field each round (Best-18 applies, 3 trades available)" : "WARNING: fewer than 18 active on-field during a bye round — Best-18 scores will be impacted"}`,
  });
  items.push({
    check: "Early Bye Coverage (R2-4)",
    passed: earlyByeOk,
    detail: `${earlyByeDetail} — ${earlyByeOk ? "sufficient on-field coverage (Best-18 applies, 2 trades available)" : "WARNING: fewer than 18 active on-field during early byes — Best-18 scores will be impacted"}`,
  });

  return items;
}

export async function buildOptimalTeam(options?: { excludePlayerIds?: Set<number>; variationSeed?: number }): Promise<OptimalTeamResult> {
  const allPlayers = await db.select().from(players);
  const excludeIds = options?.excludePlayerIds || new Set();
  const seed = options?.variationSeed ?? 0;

  const viable = allPlayers.filter(p =>
    p.avgScore > 0 &&
    p.selectionStatus !== "omitted" &&
    !p.injuryStatus?.toLowerCase().includes("season") &&
    !p.injuryStatus?.toLowerCase().includes("acl")
  );

  function seededScore(p: Player, index: number): number {
    if (seed === 0) return p.avgScore || 0;
    const hash = ((p.id * 2654435761 + seed) >>> 0) / 4294967296;
    const variance = 0.7 + hash * 0.6;
    return (p.avgScore || 0) * variance;
  }

  const byPosition: Record<string, Player[]> = { DEF: [], MID: [], RUC: [], FWD: [] };
  for (const p of viable) {
    const primary = getPlayerPrimaryPosition(p);
    if (byPosition[primary]) {
      byPosition[primary].push(p);
    }
  }

  for (const pos of Object.keys(byPosition)) {
    byPosition[pos].sort((a, b) => seededScore(b, 0) - seededScore(a, 0));
  }

  const selected: Array<Player & { fieldPosition: string; isOnField: boolean; reasoning: string }> = [];
  const usedIds = new Set<number>();
  let totalCost = 0;

  function addPlayer(p: Player, position: string, isOnField: boolean, reasoning: string) {
    if (usedIds.has(p.id)) return false;
    if (excludeIds.has(p.id)) return false;
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
      if (addPlayer(p, pos, true, `Premium ${pos} — avg ${p.avgScore}, top scorer at position`)) filled++;
    }
    for (const p of midPricers) {
      if (filled >= onField) break;
      if (addPlayer(p, pos, true, `Value ${pos} — avg ${p.avgScore}, strong value at $${(p.price / 1000).toFixed(0)}k`)) filled++;
    }
    for (const p of pool.filter(pp => !usedIds.has(pp.id))) {
      if (filled >= onField) break;
      if (addPlayer(p, pos, true, `${pos} fill — avg ${p.avgScore}`)) filled++;
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
      if (addPlayer(p, pos, false, `Cash cow — BE ${p.breakEven}, avg ${p.avgScore}, growth +${growth.toFixed(0)}`)) filled++;
    }
    for (const p of fallback) {
      if (filled >= bench) break;
      if (addPlayer(p, pos, false, `Bench rookie — cheapest available at $${(p.price / 1000).toFixed(0)}k`)) filled++;
    }
    for (const p of pool.filter(pp => !usedIds.has(pp.id))) {
      if (filled >= bench) break;
      if (addPlayer(p, pos, false, `Bench fill — ${pos}`)) filled++;
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

  while (selected.length < 30) {
    const remaining = viable.filter(p => !usedIds.has(p.id)).sort((a, b) => (a.price || 0) - (b.price || 0));
    if (remaining.length === 0) break;
    const p = remaining[0];
    const pos = getPlayerPrimaryPosition(p);
    if (!addPlayer(p, pos, false, "Extra fill to reach 30 players")) {
      break;
    }
  }

  if (totalCost > SALARY_CAP) {
    const benchByPrice = [...selected]
      .filter(p => !p.isOnField)
      .sort((a, b) => b.price - a.price);
    for (const expensive of benchByPrice) {
      if (totalCost <= SALARY_CAP) break;
      const idx = selected.indexOf(expensive);
      if (idx !== -1) {
        totalCost -= expensive.price;
        usedIds.delete(expensive.id);
        selected.splice(idx, 1);
      }
    }
    const cheapFills = viable.filter(p => !usedIds.has(p.id)).sort((a, b) => (a.price || 0) - (b.price || 0));
    for (const p of cheapFills) {
      if (selected.length >= 30) break;
      const pos = getPlayerPrimaryPosition(p);
      addPlayer(p, pos, false, "Budget-safe bench fill");
    }
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

export interface DreamTeamTradeStep {
  round: number;
  playerOut: { id: number; name: string; team: string; position: string; price: number; avgScore: number; weeklyGain: number; role: string };
  playerIn: { id: number; name: string; team: string; position: string; price: number; avgScore: number; role: string };
  cashRequired: number;
  projectedCashAvailable: number;
  reasoning: string;
}

export interface DreamTeamResult {
  dreamTeam: Array<Player & { fieldPosition: string; isOnField: boolean; reasoning: string }>;
  dreamTeamCost: number;
  startingTeam: Array<Player & { fieldPosition: string; isOnField: boolean; reasoning: string; isDreamPlayer: boolean }>;
  startingTeamCost: number;
  tradePath: DreamTeamTradeStep[];
  estimatedCompletionRound: number;
  summary: string;
}

export async function buildDreamTeamReverse(): Promise<DreamTeamResult> {
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
    if (byPosition[primary]) byPosition[primary].push(p);
  }
  for (const pos of Object.keys(byPosition)) {
    byPosition[pos].sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  }

  const dreamSelected: Array<Player & { fieldPosition: string; isOnField: boolean; reasoning: string }> = [];
  const dreamUsedIds = new Set<number>();

  function addDreamPlayer(p: Player, position: string, isOnField: boolean, reasoning: string) {
    if (dreamUsedIds.has(p.id)) return false;
    dreamSelected.push({ ...p, fieldPosition: position, isOnField, reasoning });
    dreamUsedIds.add(p.id);
    return true;
  }

  const positionOrder = [
    { pos: "RUC", onField: POSITION_REQS.RUC.onField, bench: POSITION_REQS.RUC.bench },
    { pos: "MID", onField: POSITION_REQS.MID.onField, bench: POSITION_REQS.MID.bench },
    { pos: "DEF", onField: POSITION_REQS.DEF.onField, bench: POSITION_REQS.DEF.bench },
    { pos: "FWD", onField: POSITION_REQS.FWD.onField, bench: POSITION_REQS.FWD.bench },
  ];

  for (const { pos, onField } of positionOrder) {
    const pool = byPosition[pos] || [];
    let filled = 0;
    for (const p of pool) {
      if (filled >= onField) break;
      if (addDreamPlayer(p, pos, true, `Best ${pos} — avg ${(p.avgScore || 0).toFixed(0)}, rank #${filled + 1}`)) filled++;
    }
  }

  const utilCandidates = viable
    .filter(p => !dreamUsedIds.has(p.id))
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  for (const p of utilCandidates) {
    if (addDreamPlayer(p, "UTIL", true, `Utility — best available scorer, avg ${(p.avgScore || 0).toFixed(0)}`)) break;
  }

  for (const { pos, bench } of positionOrder) {
    const pool = (byPosition[pos] || []).filter(p => !dreamUsedIds.has(p.id));
    let filled = 0;
    for (const p of pool) {
      if (filled >= bench) break;
      if (addDreamPlayer(p, pos, false, `Dream bench ${pos} — avg ${(p.avgScore || 0).toFixed(0)}`)) filled++;
    }
  }

  while (dreamSelected.length < 30) {
    const remaining = viable.filter(p => !dreamUsedIds.has(p.id)).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
    if (remaining.length === 0) break;
    const p = remaining[0];
    addDreamPlayer(p, getPlayerPrimaryPosition(p), false, "Fill to 30 players");
  }

  const dreamTeamCost = dreamSelected.reduce((s, p) => s + p.price, 0);

  const dreamOnField = dreamSelected.filter(p => p.isOnField);
  const dreamBench = dreamSelected.filter(p => !p.isOnField);

  const startingSelected: Array<Player & { fieldPosition: string; isOnField: boolean; reasoning: string; isDreamPlayer: boolean }> = [];
  const startUsedIds = new Set<number>();
  let startCost = 0;

  function addStartPlayer(p: Player, position: string, isOnField: boolean, reasoning: string, isDreamPlayer: boolean) {
    if (startUsedIds.has(p.id)) return false;
    if (startCost + p.price > SALARY_CAP) return false;
    startingSelected.push({ ...p, fieldPosition: position, isOnField, reasoning, isDreamPlayer });
    startUsedIds.add(p.id);
    startCost += p.price;
    return true;
  }

  const dreamOnFieldSorted = [...dreamOnField].sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  const affordableDreamPlayers: typeof dreamOnFieldSorted = [];
  const unaffordableDreamPlayers: typeof dreamOnFieldSorted = [];

  for (const dp of dreamOnFieldSorted) {
    if (startCost + dp.price <= SALARY_CAP) {
      affordableDreamPlayers.push(dp);
      addStartPlayer(dp, dp.fieldPosition, true, `Dream player — lock in from Round 1`, true);
    } else {
      unaffordableDreamPlayers.push(dp);
    }
  }

  const steppingStones: Array<{ dreamPlayer: typeof dreamOnFieldSorted[0]; steppingStone: Player; weeklyGain: number }> = [];

  for (const dp of unaffordableDreamPlayers) {
    const pos = dp.fieldPosition;
    const priceBudgetLeft = SALARY_CAP - startCost;
    const posPool = viable.filter(p =>
      !startUsedIds.has(p.id) &&
      !dreamUsedIds.has(p.id) &&
      getPlayerPrimaryPosition(p) === (pos === "UTIL" ? getPlayerPrimaryPosition(dp) : pos) &&
      p.price <= priceBudgetLeft
    );

    const cashGrowers = posPool
      .filter(p => (p.avgScore || 0) > (p.breakEven || 999))
      .sort((a, b) => {
        const aGrowth = ((a.avgScore || 0) - (a.breakEven || 0));
        const bGrowth = ((b.avgScore || 0) - (b.breakEven || 0));
        const aCombo = aGrowth * 0.6 + (a.avgScore || 0) * 0.4;
        const bCombo = bGrowth * 0.6 + (b.avgScore || 0) * 0.4;
        return bCombo - aCombo;
      });

    const bestStepping = cashGrowers[0] || posPool.sort((a, b) => (a.price || 0) - (b.price || 0))[0];
    if (bestStepping) {
      const weeklyGain = Math.round(((bestStepping.avgScore || 0) - (bestStepping.breakEven || 0)) * MAGIC_NUMBER / 1000) * 1000;
      if (addStartPlayer(bestStepping, pos, true, `Stepping stone for ${dp.name} — avg ${(bestStepping.avgScore || 0).toFixed(0)}, +$${(weeklyGain / 1000).toFixed(0)}k/wk growth`, false)) {
        steppingStones.push({ dreamPlayer: dp, steppingStone: bestStepping, weeklyGain: Math.max(weeklyGain, 0) });
      }
    }
  }

  for (const dp of dreamBench) {
    if (startUsedIds.has(dp.id)) continue;
    if (startCost + dp.price <= SALARY_CAP) {
      addStartPlayer(dp, dp.fieldPosition, false, `Dream bench player — lock in from Round 1`, true);
    }
  }

  const utilOnField = startingSelected.filter(p => p.fieldPosition === "UTIL").length;
  if (utilOnField < 1) {
    const utilPool = viable.filter(p => !startUsedIds.has(p.id))
      .sort((a, b) => {
        const aGrowth = ((a.avgScore || 0) - (a.breakEven || 0));
        const bGrowth = ((b.avgScore || 0) - (b.breakEven || 0));
        return bGrowth - aGrowth;
      });
    for (const p of utilPool) {
      if (addStartPlayer(p, "UTIL", true, `Utility fill — avg ${(p.avgScore || 0).toFixed(0)}`, false)) break;
    }
  }

  for (const { pos, onField } of positionOrder) {
    const currentOnField = startingSelected.filter(p => p.fieldPosition === pos && p.isOnField).length;
    if (currentOnField < onField) {
      const needed = onField - currentOnField;
      const pool = viable.filter(p => !startUsedIds.has(p.id) && getPlayerPrimaryPosition(p) === pos)
        .sort((a, b) => {
          const aGrowth = ((a.avgScore || 0) - (a.breakEven || 0));
          const bGrowth = ((b.avgScore || 0) - (b.breakEven || 0));
          return bGrowth - aGrowth;
        });
      let filled = 0;
      for (const p of pool) {
        if (filled >= needed) break;
        if (addStartPlayer(p, pos, true, `On-field backfill — avg ${(p.avgScore || 0).toFixed(0)}`, false)) filled++;
      }
    }
  }

  for (const { pos, bench } of positionOrder) {
    const posCount = startingSelected.filter(p => p.fieldPosition === pos).length;
    const required = ((POSITION_REQS as any)[pos]?.total || 0);
    if (posCount < required) {
      const needed = required - posCount;
      const pool = viable.filter(p =>
        !startUsedIds.has(p.id) &&
        getPlayerPrimaryPosition(p) === pos
      );
      const cashCows = pool.filter(p => isCashCow(p))
        .sort((a, b) => {
          const aGrowth = (a.avgScore || 0) - (a.breakEven || 0);
          const bGrowth = (b.avgScore || 0) - (b.breakEven || 0);
          return bGrowth - aGrowth;
        });
      const cheapest = pool.sort((a, b) => (a.price || 0) - (b.price || 0));

      let filled = 0;
      for (const p of cashCows) {
        if (filled >= needed) break;
        const wg = Math.round(((p.avgScore || 0) - (p.breakEven || 0)) * MAGIC_NUMBER / 1000) * 1000;
        if (addStartPlayer(p, pos, false, `Cash cow bench — +$${(wg / 1000).toFixed(0)}k/wk growth`, false)) filled++;
      }
      for (const p of cheapest) {
        if (filled >= needed) break;
        if (addStartPlayer(p, pos, false, `Budget bench fill — $${(p.price / 1000).toFixed(0)}k`, false)) filled++;
      }
    }
  }

  while (startingSelected.length < 30) {
    const remaining = viable.filter(p => !startUsedIds.has(p.id)).sort((a, b) => (a.price || 0) - (b.price || 0));
    if (remaining.length === 0) break;
    const p = remaining[0];
    const pos = getPlayerPrimaryPosition(p);
    if (!addStartPlayer(p, pos, false, "Budget fill to reach 30 players", false)) break;
  }

  const tradePath: DreamTeamTradeStep[] = [];
  let runningCash = SALARY_CAP - startCost;

  const sortedSteps = [...steppingStones].sort((a, b) => {
    const aCashNeeded = a.dreamPlayer.price - a.steppingStone.price;
    const bCashNeeded = b.dreamPlayer.price - b.steppingStone.price;
    return aCashNeeded - bCashNeeded;
  });

  let currentRound = 1;
  for (const step of sortedSteps) {
    const cashNeeded = step.dreamPlayer.price - step.steppingStone.price;
    const totalCashGen = startingSelected
      .filter(p => !p.isDreamPlayer && p.isOnField)
      .reduce((sum, p) => {
        const wg = Math.round(((p.avgScore || 0) - (p.breakEven || 0)) * MAGIC_NUMBER / 1000) * 1000;
        return sum + Math.max(wg, 0);
      }, 0);

    const benchCashGen = startingSelected
      .filter(p => !p.isDreamPlayer && !p.isOnField)
      .reduce((sum, p) => {
        const wg = Math.round(((p.avgScore || 0) - (p.breakEven || 0)) * MAGIC_NUMBER / 1000) * 1000;
        return sum + Math.max(wg, 0);
      }, 0);

    const weeklyCashGen = totalCashGen + benchCashGen;
    let roundsNeeded = weeklyCashGen > 0 ? Math.ceil(Math.max(0, cashNeeded - runningCash) / weeklyCashGen) : 99;
    const tradeRound = Math.max(currentRound + 1, currentRound + roundsNeeded);

    const projectedCash = runningCash + (weeklyCashGen * roundsNeeded);

    tradePath.push({
      round: Math.min(tradeRound, TOTAL_ROUNDS),
      playerOut: {
        id: step.steppingStone.id,
        name: step.steppingStone.name,
        team: step.steppingStone.team,
        position: step.steppingStone.position,
        price: step.steppingStone.price,
        avgScore: step.steppingStone.avgScore || 0,
        weeklyGain: step.weeklyGain,
        role: playerRole(step.steppingStone),
      },
      playerIn: {
        id: step.dreamPlayer.id,
        name: step.dreamPlayer.name,
        team: step.dreamPlayer.team,
        position: step.dreamPlayer.position,
        price: step.dreamPlayer.price,
        avgScore: step.dreamPlayer.avgScore || 0,
        role: "Premium",
      },
      cashRequired: cashNeeded,
      projectedCashAvailable: projectedCash,
      reasoning: `Upgrade ${step.steppingStone.name} (avg ${(step.steppingStone.avgScore || 0).toFixed(0)}) → ${step.dreamPlayer.name} (avg ${(step.dreamPlayer.avgScore || 0).toFixed(0)}). ` +
        `Need $${(cashNeeded / 1000).toFixed(0)}k. ${step.steppingStone.name} generates ~$${(step.weeklyGain / 1000).toFixed(0)}k/wk in price rises. ` +
        `Points gain: +${((step.dreamPlayer.avgScore || 0) - (step.steppingStone.avgScore || 0)).toFixed(0)} per round.`,
    });

    runningCash = Math.max(0, projectedCash - cashNeeded);
    currentRound = tradeRound;
  }

  const estimatedCompletionRound = tradePath.length > 0 ? tradePath[tradePath.length - 1].round : 1;
  const dreamOnFieldScore = dreamOnField.reduce((s, p) => s + (p.avgScore || 0), 0);
  const startOnFieldScore = startingSelected.filter(p => p.isOnField).reduce((s, p) => s + (p.avgScore || 0), 0);

  const summary = `Dream team costs $${(dreamTeamCost / 1000000).toFixed(2)}M (${((dreamTeamCost - SALARY_CAP) / 1000000).toFixed(2)}M over cap). ` +
    `Starting squad fits within $${(SALARY_CAP / 1000000).toFixed(2)}M cap at $${(startCost / 1000000).toFixed(2)}M. ` +
    `${affordableDreamPlayers.length} dream players locked in from Round 1, ${steppingStones.length} stepping stones to upgrade over ${estimatedCompletionRound} rounds. ` +
    `Starting projected score: ${startOnFieldScore.toFixed(0)} → Dream projected score: ${dreamOnFieldScore.toFixed(0)} (+${(dreamOnFieldScore - startOnFieldScore).toFixed(0)}).`;

  return {
    dreamTeam: dreamSelected,
    dreamTeamCost,
    startingTeam: startingSelected,
    startingTeamCost: startCost,
    tradePath,
    estimatedCompletionRound,
    summary,
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
      playerNarratives: [],
      weeklyPlans: [],
      totalProjectedScore: 0,
      teamPlayerIds: [],
      validation: [],
      winnerBenchmark: { avgTotal: 0, avgPerRound: 0 },
    };
  }

  const allPlayers = await db.select().from(players);
  const allFixtures = await db.select().from(fixtures);
  const narrativeCache = new Map<number, string>();

  const startingSquad: SquadPlayer[] = teamPlayers.map(p => {
    const pos = getPlayerPrimaryPosition(p);
    return toSquadPlayer(p, pos, isPremium(p) || isMidPricer(p), narrativeCache, allPlayers);
  });

  const playerNarratives = teamPlayers.map(p => ({
    id: p.id,
    name: p.name,
    narrative: narrativeCache.get(p.id) || generatePlayerNarrative(p, allPlayers),
  }));

  const weeklyPlans: WeeklyPlan[] = [];
  let simulatedTeam = [...teamPlayers];
  let simulatedCash = SALARY_CAP - simulatedTeam.reduce((sum, p) => sum + p.price, 0);
  let totalProjected = 0;

  for (let round = normalizedRound; round <= TOTAL_ROUNDS; round++) {
    const phaseInfo = getSeasonPhase(round);
    const tradesAvailable = getTradesForRound(round);
    const isBye = BYE_ROUNDS.includes(round);

    const roundFixtures = allFixtures.filter(f => f.round === round);

    const activePlayers = isBye
      ? simulatedTeam.filter(p => p.byeRound !== round)
      : [...simulatedTeam];

    const onFieldActive = activePlayers.filter(p => {
      const tp = simulatedTeam.find(sp => sp.id === p.id);
      return tp ? true : false;
    });
    const sortedByScore = [...onFieldActive].sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));

    const scoringPlayers = isBye
      ? sortedByScore.slice(0, BEST_18_COUNT)
      : sortedByScore;

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
            const aPeaked = isCashCow(a) && (a.avgScore || 0) < (a.breakEven || 0);
            const bPeaked = isCashCow(b) && (b.avgScore || 0) < (b.breakEven || 0);
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
        const remainingRounds = TOTAL_ROUNDS - round;

        const alternatives: TradeAlternative[] = upgradeCandidates.slice(1, 4).map(alt => ({
          id: alt.id,
          name: alt.name,
          team: alt.team,
          avgScore: alt.avgScore || 0,
          price: alt.price,
          reason: `Avg ${alt.avgScore}, $${(alt.price / 1000).toFixed(0)}k${alt.ownedByPercent < 10 ? ` (POD: ${alt.ownedByPercent}% owned)` : ""}${alt.breakoutScore && alt.breakoutScore > 0.6 ? " — breakout candidate" : ""}`,
        }));

        let reasoning = "";
        const outPeak = forecastPricePeak(playerOut);
        const inCeiling = playerIn.ceilingScore || Math.round((playerIn.avgScore || 0) * 1.3);

        if (phaseInfo.phase === "launch") {
          if (isCashCow(playerOut) && (playerOut.avgScore || 0) < (playerOut.breakEven || 0)) {
            reasoning = `${playerOut.name} has peaked — avg ${playerOut.avgScore} is below BE ${playerOut.breakEven}, losing ~$${Math.round(((playerOut.breakEven || 0) - (playerOut.avgScore || 0)) * MAGIC_NUMBER / 1000)}k/wk in value. ` +
              `${playerIn.name} averages ${playerIn.avgScore} with ceiling ${inCeiling} at $${(playerIn.price / 1000).toFixed(0)}k. `;
            if (isCashCow(playerIn)) {
              const inPeak = forecastPricePeak(playerIn);
              if (inPeak.peakRound != null) {
                reasoning += `Expected to peak R${inPeak.peakRound} at ~$${((inPeak.peakPrice || 0) / 1000).toFixed(0)}k — effectively recycling the cash cow slot. `;
              } else {
                reasoning += `Cash cow swap — generates value while scoring. `;
              }
            } else {
              reasoning += `Scoring upgrade of +${pointsGain.toFixed(1)} pts/wk = +${(pointsGain * remainingRounds).toFixed(0)} season points. `;
            }
          } else {
            reasoning = `${playerOut.name} (avg ${playerOut.avgScore}, $${(playerOut.price / 1000).toFixed(0)}k) is your lowest-scoring ${outPos}. ` +
              `${playerIn.name} (avg ${playerIn.avgScore}, ceiling ${inCeiling}) gains +${pointsGain.toFixed(1)} pts/wk. `;
            if (playerIn.seasonCba && playerIn.seasonCba > 50) reasoning += `${playerIn.seasonCba}% CBA share locks in a high floor. `;
          }
        } else if (phaseInfo.phase === "cash_gen") {
          reasoning = `Sell ${playerOut.name} ($${(playerOut.price / 1000).toFixed(0)}k, avg ${playerOut.avgScore}${isRookie(playerOut) && outPeak.peakRound != null ? `, peaked at R${outPeak.peakRound}` : ""}) → ` +
            `buy ${playerIn.name} ($${(playerIn.price / 1000).toFixed(0)}k, avg ${playerIn.avgScore}, ceiling ${inCeiling}). ` +
            `+${pointsGain.toFixed(1)} pts/wk × ${remainingRounds} rounds = +${(pointsGain * remainingRounds).toFixed(0)} projected season points. `;
          if (playerIn.ownedByPercent < 15) reasoning += `Only ${playerIn.ownedByPercent}% owned — genuine POD. `;
        } else if (phaseInfo.phase === "bye_warfare") {
          const inByeRound = playerIn.byeRound;
          const isEarlyBye = EARLY_BYE_ROUNDS.includes(round);
          const isRegBye = REGULAR_BYE_ROUNDS.includes(round);
          reasoning = `${playerIn.name} (avg ${playerIn.avgScore}, bye R${inByeRound || "?"}) replaces ${playerOut.name} (avg ${playerOut.avgScore}). ` +
            `+${pointsGain.toFixed(1)} pts/wk while maintaining bye coverage. `;
          if (isBye) {
            const activeCount = simulatedTeam.filter(p => p.byeRound !== round).length;
            reasoning += `Best-18 scoring applies — only top ${BEST_18_COUNT} on-field scores count. ${activeCount} active players this round. `;
            if (isRegBye) reasoning += `Regular bye: ${tradesAvailable} trades available (extra trade). `;
            else if (isEarlyBye) reasoning += `Early bye: ${tradesAvailable} trades available. `;
          }
        } else {
          reasoning = `Run home: ${playerIn.name} (avg ${playerIn.avgScore}, ceiling ${inCeiling}) over ${playerOut.name} (avg ${playerOut.avgScore}). ` +
            `+${pointsGain.toFixed(1)} pts/wk × ${remainingRounds} rounds = +${(pointsGain * remainingRounds).toFixed(0)} projected season points. `;
          if (playerIn.ownedByPercent < 15) reasoning += `Only ${playerIn.ownedByPercent}% owned — strong POD for rank gains. `;
          if (playerIn.captainProbability && playerIn.captainProbability > 0.1) reasoning += `${(playerIn.captainProbability * 100).toFixed(0)}% captain probability — potential for massive doubled scores. `;
        }

        let contingency = "";
        if (playerIn.injuryRiskScore && playerIn.injuryRiskScore > 0.2) {
          contingency = `${playerIn.name} has ${(playerIn.injuryRiskScore * 100).toFixed(0)}% injury risk. If unavailable, pivot to ${alternatives[0]?.name || "best available"} (avg ${alternatives[0]?.avgScore || "?"}).`;
        } else if (alternatives.length > 0) {
          contingency = `If ${playerIn.name} is unavailable or underperforms after 2 rounds, switch to ${alternatives[0].name} ($${(alternatives[0].price / 1000).toFixed(0)}k, avg ${alternatives[0].avgScore}).`;
        } else {
          contingency = `Limited alternatives at this price point — hold the trade if ${playerIn.name} is unavailable.`;
        }

        trades.push({
          playerOut: { id: playerOut.id, name: playerOut.name, team: playerOut.team, position: outPos, avgScore: playerOut.avgScore || 0, price: playerOut.price, breakEven: playerOut.breakEven },
          playerIn: { id: playerIn.id, name: playerIn.name, team: playerIn.team, position: outPos, avgScore: playerIn.avgScore || 0, price: playerIn.price, breakEven: playerIn.breakEven, ppm: playerIn.ppm, owned: playerIn.ownedByPercent },
          reasoning,
          pointsGain,
          cashImpact,
          alternatives,
          contingency,
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
        const topCow = [...cows].sort((a, b) => ((b.avgScore || 0) - (b.breakEven || 0)) - ((a.avgScore || 0) - (a.breakEven || 0)))[0];
        const weeklyGain = Math.round(((topCow.avgScore || 0) - (topCow.breakEven || 0)) * MAGIC_NUMBER / 1000) * 1000;
        const peak = forecastPricePeak(topCow);
        const peakStr = peak.peakRound != null ? `, peaks R${peak.peakRound} at ~$${((peak.peakPrice || 0) / 1000).toFixed(0)}k` : "";
        structureNotes.push(`Best cash cow: ${topCow.name} (avg ${topCow.avgScore}, BE ${topCow.breakEven}, +$${(weeklyGain / 1000).toFixed(0)}k/wk${peakStr})`);
      }
      const peaked = simulatedTeam.filter(p => isRookie(p) && (p.avgScore || 0) < (p.breakEven || 0));
      if (peaked.length > 0) {
        structureNotes.push(`Peaked rookies to sell: ${peaked.map(p => `${p.name} (avg ${p.avgScore} < BE ${p.breakEven}, losing ~$${Math.round(((p.breakEven || 0) - (p.avgScore || 0)) * MAGIC_NUMBER / 1000)}k/wk)`).join("; ")}`);
      } else if (cows.length > 0) {
        structureNotes.push(`All ${cows.length} cash cows still growing — hold them and let the value accumulate`);
      }
    } else if (phaseInfo.phase === "cash_gen") {
      const remainingRookies = simulatedTeam.filter(p => isRookie(p));
      if (remainingRookies.length > 0) {
        structureNotes.push(`Rookies to convert: ${remainingRookies.map(p => { const pk = forecastPricePeak(p); const peakInfo = pk.peakRound != null ? `peaks R${pk.peakRound}, ~$${((pk.peakPrice || 0) / 1000).toFixed(0)}k` : `$${(p.price / 1000).toFixed(0)}k`; return `${p.name} (${peakInfo})`; }).join("; ")}`);
      }
      structureNotes.push(`Target: ${premiumCount + Math.min(remainingRookies.length, 4)}+ premiums by R11 — winners average 18+ premiums by the byes`);
    } else if (phaseInfo.phase === "bye_warfare") {
      const byePlayers = simulatedTeam.filter(p => p.byeRound === round);
      if (isBye && byePlayers.length > 0) {
        structureNotes.push(`On bye: ${byePlayers.map(p => p.name).join(", ")} (${byePlayers.length} players)`);
        structureNotes.push(`Active squad: ${activePlayers.length} players — ${activePlayers.length >= 18 ? "full coverage, no worries" : "SHORT: need at least 18"}`);
      } else if (!isBye) {
        structureNotes.push(`Pre-bye prep: ensure coverage for R${BYE_ROUNDS.filter(r => r >= round).join(", R")}`);
      }
    } else {
      const topScorerNames = simulatedTeam.filter(p => isPremium(p)).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0)).slice(0, 5);
      structureNotes.push(`Core premiums: ${topScorerNames.map(p => `${p.name} (${p.avgScore})`).join(", ")}`);
      const pods = simulatedTeam.filter(p => p.ownedByPercent < 10 && (p.avgScore || 0) >= 80);
      if (pods.length > 0) {
        structureNotes.push(`PODs for rank gains: ${pods.map(p => `${p.name} (${p.avgScore} avg, ${p.ownedByPercent}% owned)`).join(", ")}`);
      }
      structureNotes.push(`Every trade from here must gain ${Math.round(150 / Math.max(1, TOTAL_ROUNDS - round))}+ pts/wk to be worth it`);
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

    const roundProjected = Math.round(projectedScore);
    const avgPerRound = totalProjected > 0 && weeklyPlans.length > 0 ? totalProjected / weeklyPlans.length : roundProjected;
    const projectedRank = avgPerRound > 2200 ? "Top 100" : avgPerRound > 2000 ? "Top 1,000" : avgPerRound > 1800 ? "Top 10,000" : "Building";

    const benchmark = getWinnerBenchmarkAtRound(round);
    const winnerComparison: WinnerComparison = {
      winnerAvgScore: benchmark.avgScore,
      yourScore: roundProjected,
      scoreDiff: roundProjected - benchmark.avgScore,
      winnerTeamValue: benchmark.teamValue,
      yourTeamValue: teamValue,
      valueDiff: teamValue - benchmark.teamValue,
      winnerPremiums: benchmark.premiums,
      yourPremiums: premiumCount,
      onTrack: roundProjected >= benchmark.avgScore * 0.9,
    };

    const squad: SquadPlayer[] = simulatedTeam.map(p => {
      const pos = getPlayerPrimaryPosition(p);
      return toSquadPlayer(p, pos, isPremium(p) || isMidPricer(p), narrativeCache, allPlayers);
    });

    weeklyPlans.push({
      round,
      phase: phaseInfo.phase,
      phaseName: phaseInfo.name,
      projectedTeamScore: roundProjected,
      recommendedCaptain: captain ? {
        id: captain.id, name: captain.name, team: captain.team,
        avgScore: captain.avgScore || 0, reasoning: captainReasoning,
      } : null,
      recommendedViceCaptain: viceCaptain ? {
        id: viceCaptain.id, name: viceCaptain.name, team: viceCaptain.team,
        avgScore: viceCaptain.avgScore || 0, reasoning: vcReasoning,
      } : null,
      trades,
      structureNotes,
      squad,
      winnerComparison,
      keyMetrics: {
        teamValue, cashInBank: simulatedCash, byeCoverage,
        premiumCount, rookieCount, projectedRank,
      },
      flags,
    });

    totalProjected += roundProjected;
  }

  const premiums = teamPlayers.filter(p => isPremium(p)).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  const cashCows = teamPlayers.filter(p => isCashCow(p)).sort((a, b) => ((b.avgScore || 0) - (b.breakEven || 0)) - ((a.avgScore || 0) - (a.breakEven || 0)));
  const midPricers = teamPlayers.filter(p => isMidPricer(p)).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  const avgRoundScore = weeklyPlans.length > 0 ? Math.round(totalProjected / weeklyPlans.length) : 0;
  const winnerAvg = Math.round(Object.values(WINNER_BENCHMARKS).reduce((s, y) => s + y.avgPerRound, 0) / Object.values(WINNER_BENCHMARKS).length);
  const winnerTotal = Math.round(Object.values(WINNER_BENCHMARKS).reduce((s, y) => s + y.seasonTotal, 0) / Object.values(WINNER_BENCHMARKS).length);

  const overallStrategy =
    `Your ${teamPlayers.length}-player squad is built around ${premiums.length} premiums` +
    (premiums.length > 0 ? ` led by ${premiums.slice(0, 3).map(p => `${p.name} (avg ${p.avgScore}, ceiling ${p.ceilingScore || "?"})`).join(", ")}` : "") +
    `. ${cashCows.length} cash cows on bench` +
    (cashCows.length > 0 ? ` — best value: ${cashCows.slice(0, 3).map(p => { const pk = forecastPricePeak(p); const peakInfo = pk.peakRound != null ? `, peaks R${pk.peakRound} at ~$${((pk.peakPrice || 0) / 1000).toFixed(0)}k` : ""; return `${p.name} (avg ${p.avgScore}, BE ${p.breakEven}${peakInfo})`; }).join("; ")}` : "") +
    `. ${midPricers.length > 0 ? `${midPricers.length} mid-pricers to upgrade: ${midPricers.slice(0, 3).map(p => `${p.name} ($${(p.price / 1000).toFixed(0)}k, avg ${p.avgScore})`).join(", ")}. ` : ""}` +
    `Projected ${avgRoundScore.toLocaleString()} pts/round (${totalProjected.toLocaleString()} season). ` +
    `Historical winners average ${winnerAvg.toLocaleString()}/round (${winnerTotal.toLocaleString()} total) — ` +
    `${avgRoundScore >= winnerAvg * 0.95 ? "you're on track" : avgRoundScore >= winnerAvg * 0.85 ? "within striking distance — need to nail trades" : "behind pace — aggressive upgrades needed"}.`;

  const result: SeasonPlanResult = {
    overallStrategy,
    startingSquad,
    playerNarratives,
    weeklyPlans,
    totalProjectedScore: totalProjected,
    teamPlayerIds,
    validation: [],
    winnerBenchmark: { avgTotal: winnerTotal, avgPerRound: winnerAvg },
  };

  result.validation = validatePlan(result, allPlayers);

  return result;
}

export async function saveSeasonPlan(plan: SeasonPlanResult, currentRound: number): Promise<SeasonPlan> {
  await db.update(seasonPlans).set({ isActive: false }).where(eq(seasonPlans.isActive, true));

  const [saved] = await db.insert(seasonPlans).values({
    currentRound,
    teamSnapshot: JSON.stringify({
      teamPlayerIds: plan.teamPlayerIds,
      startingSquad: plan.startingSquad,
      playerNarratives: plan.playerNarratives,
      validation: plan.validation,
      winnerBenchmark: plan.winnerBenchmark,
    }),
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
