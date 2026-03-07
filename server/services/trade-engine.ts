import type { Player, PlayerWithTeamInfo } from "@shared/schema";
import { AFL_FANTASY_CLASSIC_2026 } from "@shared/game-rules";
import {
  getCachedWeights,
  calcTradeEV,
  calcTradeConfidence,
  type WeightConfig,
} from "./projection-engine";

export interface TradeCandidate {
  playerOut: PlayerWithTeamInfo;
  playerIn: Player;
  category: string;
  urgency: string;
  tradeEv: number;
  confidence: number;
  scoreDiff: number;
  priceDiff: number;
  cashImpact: number;
  projectedImpact: number;
  reasons: string[];
}

interface TradeContext {
  currentRound: number;
  salaryCap: number;
  remainingSalary: number;
  isBye: boolean;
  isRound0: boolean;
  isEarlySeasons: boolean;
  teamPositionCounts: Record<string, number>;
  teamByeCounts: Record<number, number>;
  w: WeightConfig;
}

const POSITION_SCORING_TIERS: Record<string, number> = {
  MID: 100,
  RUC: 90,
  DEF: 85,
  FWD: 80,
};

function getPositionScoringPotential(pos: string): number {
  return POSITION_SCORING_TIERS[pos] || 80;
}

function estimatePriceChangePerWeek(player: Player): number {
  if (player.breakEven == null || player.avgScore == null) return 0;
  const scoreDiffFromBE = (player.avgScore) - player.breakEven;
  return scoreDiffFromBE * (AFL_FANTASY_CLASSIC_2026.pricing.missedSeasonDiscount > 0 ? 1800 : 1500);
}

function isLikelyFillIn(player: Player): boolean {
  if (!player.gamesPlayed) return false;
  if (player.isDebutant && player.gamesPlayed <= 3) return false;
  if (player.gamesPlayed < 5 && !player.isDebutant && player.price > 400000) return true;
  if (player.yearsExperience && player.yearsExperience >= 3 && player.gamesPlayed < 8 &&
      player.avgScore && player.avgScore < 65) return true;
  return false;
}

function isSetAndForget(player: Player): boolean {
  if (!player.avgScore || !player.consistencyRating) return false;
  if (player.avgScore >= 95 && player.consistencyRating >= 8 &&
      player.durabilityScore && player.durabilityScore >= 0.85 &&
      (!player.injuryRiskScore || player.injuryRiskScore < 0.15)) return true;
  if (player.avgScore >= 105 && player.consistencyRating >= 7.5) return true;
  return false;
}

function willBreakevenSurpassAverage(player: Player, weeksAhead: number = 3): boolean {
  if (player.breakEven == null || player.avgScore == null) return false;
  const beAboveAvg = player.breakEven - player.avgScore;
  if (beAboveAvg > 0) return true;
  if (player.formTrend === "down" && player.last3Avg && player.last3Avg < player.avgScore) {
    const decliningAvg = player.last3Avg;
    if (player.breakEven > decliningAvg) return true;
    const weeklyDecline = (player.avgScore - player.last3Avg) / 3;
    const futureAvg = decliningAvg - (weeklyDecline * weeksAhead);
    if (player.breakEven > futureAvg) return true;
  }
  if (player.priceChange < 0 && player.breakEven > (player.last3Avg || player.avgScore)) return true;
  return false;
}

function hasNegativeBreakeven(player: Player): boolean {
  return player.breakEven != null && player.breakEven < 0;
}

function estimateWeeksToCashPeak(player: Player): number {
  if (player.avgScore == null || player.breakEven == null) return 99;
  const diff = player.avgScore - player.breakEven;
  if (diff <= 0) return 99;
  const priceGainPerWeek = diff * 1800;
  const currentPriceFromStart = player.price - (player.startingPrice || player.price);
  const maxGain = (player.avgScore * AFL_FANTASY_CLASSIC_2026.magicNumber) - player.price;
  if (maxGain <= 0) return 0;
  return Math.ceil(maxGain / priceGainPerWeek);
}

function dppPositionUpgradeValue(player: Player): number {
  if (!player.dualPosition) return 0;
  const primary = getPositionScoringPotential(player.position);
  const secondary = getPositionScoringPotential(player.dualPosition);
  return Math.abs(primary - secondary);
}

function isGainingDPPBenefit(player: Player): boolean {
  if (!player.dualPosition) return false;
  const primaryTier = getPositionScoringPotential(player.position);
  const secondaryTier = getPositionScoringPotential(player.dualPosition);
  return secondaryTier > primaryTier;
}

function isLosingDPPValue(player: Player): boolean {
  if (!player.dualPosition) return false;
  const primaryTier = getPositionScoringPotential(player.position);
  const secondaryTier = getPositionScoringPotential(player.dualPosition);
  return primaryTier > secondaryTier && player.avgScore !== null && player.avgScore < primaryTier * 0.8;
}

function calcPriceTrajectory(player: Player, weeks: number = 4): number {
  if (player.breakEven == null || player.avgScore == null) return 0;
  const weeklyPriceChange = ((player.avgScore) - player.breakEven) * 1800;
  return weeklyPriceChange * weeks;
}

function isReducedTOGRisk(player: Player): boolean {
  if (!player.gamesPlayed || player.gamesPlayed < 3) return false;
  if (player.last3Avg && player.last5Avg && player.avgScore) {
    const recentDropRatio = player.last3Avg / player.avgScore;
    if (recentDropRatio < 0.75 && player.formTrend === "down") return true;
  }
  if (player.age && player.age >= 32 && player.formTrend === "down") return true;
  return false;
}

export function scoreTradeOut(
  p: PlayerWithTeamInfo,
  ctx: TradeContext
): { score: number; reasons: string[]; category: string } {
  let score = 0;
  const reasons: string[] = [];
  let category = "upgrade";

  if (p.injuryStatus) {
    score += 50;
    reasons.push(`Injured: ${p.injuryStatus}`);
    category = "urgent";
  }
  if (p.lateChange) {
    score += 45;
    reasons.push("Late change — may not play");
    category = "urgent";
  }
  if (!p.isNamedTeam) {
    score += 40;
    reasons.push("Not named in squad");
    category = "urgent";
  }

  const formDiff = (p.last3Avg || 0) - (p.avgScore || 0);
  if (formDiff < -15) {
    score += 35;
    reasons.push(`Form collapsed: L3 avg ${p.last3Avg?.toFixed(1)} vs season ${p.avgScore?.toFixed(1)}`);
  } else if (formDiff < -10) {
    score += 25;
    reasons.push(`Form declining: L3 avg ${p.last3Avg?.toFixed(1)} vs season ${p.avgScore?.toFixed(1)}`);
  } else if (formDiff < -5) {
    score += 12;
    reasons.push("Form dipping slightly");
  }
  if (p.formTrend === "down") score += 8;

  if (willBreakevenSurpassAverage(p) && !isSetAndForget(p)) {
    score += 30;
    const beAboveAvg = (p.breakEven || 0) - (p.avgScore || 0);
    if (beAboveAvg > 0) {
      reasons.push(`BE ${p.breakEven} already above avg ${p.avgScore?.toFixed(0)} — losing $${Math.abs(estimatePriceChangePerWeek(p)).toFixed(0)}/wk`);
    } else {
      reasons.push(`BE trending above avg — price will start dropping`);
    }
    if (category === "upgrade") category = "cash_gen";
  }

  if (p.breakEven && p.avgScore && p.breakEven > p.avgScore * 1.2 && !isSetAndForget(p)) {
    score += 25;
    const weeklyLoss = Math.abs(estimatePriceChangePerWeek(p));
    reasons.push(`BE ${p.breakEven} far above avg — bleeding $${weeklyLoss.toFixed(0)}/wk`);
  }

  if ((p.cashGenPotential === "elite" || p.cashGenPotential === "high") &&
      p.breakEven && p.avgScore && p.breakEven > p.avgScore) {
    score += 35;
    const priceGained = p.price - (p.startingPrice || p.price);
    reasons.push(`Cash cow peaked — gained $${(priceGained / 1000).toFixed(0)}K, sell before price drops`);
    category = "cash_gen";
  }

  if (isLikelyFillIn(p)) {
    score += 30;
    reasons.push("Likely fill-in player — position at risk when incumbent returns");
    if (category !== "urgent") category = "urgent";
  }

  if (isReducedTOGRisk(p)) {
    score += 20;
    reasons.push("Reduced TOG risk — scoring declining possibly due to role change or rotation");
  }

  if (p.dualPosition && isLosingDPPValue(p)) {
    score += 10;
    reasons.push(`Underperforming for ${p.position} — DPP value diminishing`);
  }

  if (p.price > 500000 && p.avgScore && p.avgScore < 70) {
    score += 20;
    reasons.push(`Overpriced at $${(p.price / 1000).toFixed(0)}K for avg ${p.avgScore.toFixed(1)}`);
  }

  if (ctx.isBye && p.byeRound === ctx.currentRound) {
    score += 15;
    reasons.push("On bye this round");
  }

  if (p.age && p.age >= 33 && p.formTrend !== "up") {
    score += 8;
    reasons.push("Veteran age — monitor for managed workload");
  }

  if (ctx.isRound0 || ctx.isEarlySeasons) {
    if (p.startingPrice && p.price <= p.startingPrice && p.avgScore && p.avgScore < 60 && !p.isDebutant) {
      score += 20;
      reasons.push("Preseason dud — not justifying selection price");
    }
    if (p.isDebutant && p.avgScore === 0 && (!p.isNamedTeam || p.gamesPlayed === 0)) {
      score += 30;
      reasons.push("Unproven rookie with no scores — swap for a named rookie playing R1");
      category = "cash_gen";
    }
  }

  if (p.avgScore === 0 && p.gamesPlayed === 0) {
    score += 20;
    reasons.push("Zero games played — not contributing to your score");
  }

  if (p.recentScores) {
    const scores = p.recentScores.split(",").map(Number).filter(n => !isNaN(n));
    if (scores.length >= 3) {
      const last3 = scores.slice(0, 3);
      const scoreDips = last3.filter(s => s < (p.avgScore || 0) * 0.7).length;
      if (scoreDips >= 2) {
        score += 15;
        reasons.push(`${scoreDips}/3 recent scores well below average`);
      }
    }
  }

  if (p.ownedByPercent && p.ownedByPercent > 50 && formDiff < -5) {
    score += 5;
    reasons.push(`Highly owned (${p.ownedByPercent.toFixed(0)}%) and dropping — mass sell incoming`);
  }

  return { score, reasons, category };
}

export function scoreTradeIn(
  pIn: Player,
  pOut: PlayerWithTeamInfo,
  outCategory: string,
  ctx: TradeContext
): TradeCandidate | null {
  const projIn = pIn.projectedScore || pIn.avgScore || 0;
  const projOut = pOut.projectedScore || pOut.avgScore || 0;
  const scoreDiff = (pIn.avgScore || 0) - (pOut.avgScore || 0);
  const priceDiff = pIn.price - pOut.price;
  const cashImpact = -priceDiff;

  if (priceDiff > ctx.remainingSalary + 50000) return null;

  const volIn = pIn.volatilityScore || 5;
  const volOut = pOut.volatilityScore || 5;
  const cashGen = pIn.cashGenPotential === "elite" ? 40 : pIn.cashGenPotential === "high" ? 25 : pIn.cashGenPotential === "medium" ? 15 : 0;
  const tradeEv = calcTradeEV(projIn, projOut, volIn, volOut, cashGen, ctx.w);

  let category = outCategory;
  const reasons: string[] = [];
  let evBonus = 0;

  if (hasNegativeBreakeven(pIn) && pIn.isNamedTeam) {
    evBonus += 25;
    reasons.push(`Negative BE (${pIn.breakEven}) — guaranteed rapid price rise`);
    category = "cash_gen";
  }

  if (pIn.isDebutant && (pIn.cashGenPotential === "elite" || pIn.cashGenPotential === "high")) {
    evBonus += 20;
    category = "cash_gen";
    reasons.push(`Cash cow: ${pIn.cashGenPotential} generation potential`);
    if (pIn.breakEven && pIn.avgScore && pIn.avgScore > pIn.breakEven) {
      const weeklyGain = estimatePriceChangePerWeek(pIn);
      reasons.push(`Scoring ${((pIn.avgScore) - pIn.breakEven).toFixed(0)} above BE — +$${weeklyGain.toFixed(0)}/wk`);
    }
  } else if (pIn.breakEven && pIn.avgScore && pIn.avgScore > pIn.breakEven + 20) {
    evBonus += 10;
    const weeksToGo = estimateWeeksToCashPeak(pIn);
    if (weeksToGo > 0 && weeksToGo < 10) {
      reasons.push(`~${weeksToGo} weeks of price growth remaining`);
    }
  }

  const startingPrice = pIn.startingPrice || pIn.price;
  if (pIn.price < startingPrice * 0.9 && pIn.avgScore && pIn.avgScore > 0 &&
      pIn.formTrend === "up" && pIn.isNamedTeam) {
    evBonus += 15;
    reasons.push(`Underpriced at $${(pIn.price / 1000).toFixed(0)}K (started at $${(startingPrice / 1000).toFixed(0)}K) — bounce back potential`);
  }

  if (pIn.dualPosition) {
    const dppValue = dppPositionUpgradeValue(pIn);
    if (isGainingDPPBenefit(pIn)) {
      evBonus += 15;
      reasons.push(`DPP upgrade: plays ${pIn.position} but eligible as ${pIn.dualPosition} — natural scoring boost`);
    } else {
      reasons.push(`DPP flexibility: ${pIn.position}/${pIn.dualPosition}`);
      evBonus += 5;
    }
    if (dppValue > 10) {
      evBonus += 5;
    }
  }

  if (scoreDiff > 15) {
    reasons.push(`+${scoreDiff.toFixed(1)} pts/gm — significant upgrade`);
    if (category !== "urgent") category = "upgrade";
    evBonus += 10;
  } else if (scoreDiff > 5) {
    reasons.push(`+${scoreDiff.toFixed(1)} pts/gm upgrade`);
    if (category !== "urgent") category = "upgrade";
  } else if (scoreDiff > 0) {
    reasons.push(`+${scoreDiff.toFixed(1)} pts/gm improvement`);
  }

  if (priceDiff < -100000) {
    reasons.push(`Frees up $${Math.abs(priceDiff / 1000).toFixed(0)}K`);
    if (scoreDiff >= -5 && category !== "urgent") category = "cash_gen";
  } else if (priceDiff < -50000) {
    reasons.push(`Saves $${Math.abs(priceDiff / 1000).toFixed(0)}K`);
  }

  if (pIn.formTrend === "up") {
    reasons.push(`In hot form (L3: ${pIn.last3Avg?.toFixed(1)})`);
    evBonus += 5;
  }
  if (pIn.captainProbability && pIn.captainProbability > 0.2) {
    reasons.push(`Captain option: P(120+) ${(pIn.captainProbability * 100).toFixed(0)}%`);
    evBonus += pIn.captainProbability > 0.35 ? 10 : 5;
  }

  if (pIn.breakEven && pIn.avgScore && pIn.breakEven < pIn.avgScore * 0.8) {
    const trajectory = calcPriceTrajectory(pIn, 4);
    if (trajectory > 30000) {
      reasons.push(`BE ${pIn.breakEven} well below avg ${pIn.avgScore.toFixed(0)} — price rising ~$${(trajectory / 1000).toFixed(0)}K over 4 weeks`);
    }
  }

  if (pIn.consistencyRating && pIn.consistencyRating >= 8 && (pIn.avgScore || 0) >= 80) {
    reasons.push("Elite consistency — reliable scorer");
    evBonus += 5;
  }

  if (pIn.ownedByPercent !== null && pIn.ownedByPercent < 8 && (pIn.avgScore || 0) > 80) {
    reasons.push(`POD: only ${pIn.ownedByPercent.toFixed(0)}% owned — ranking differential`);
    evBonus += 8;
  }

  if (ctx.isBye) {
    if (pOut.byeRound === ctx.currentRound && pIn.byeRound !== ctx.currentRound) {
      reasons.push("Fixes bye coverage this round");
      evBonus += 10;
      if (category === "upgrade") category = "structure";
    }
    for (const byeRound of AFL_FANTASY_CLASSIC_2026.byeRounds) {
      if (pIn.byeRound !== byeRound && pOut.byeRound === byeRound) {
        const count = ctx.teamByeCounts[byeRound] || 0;
        if (count > 7) {
          reasons.push(`Reduces R${byeRound} bye exposure (${count} players)`);
          evBonus += 5;
        }
      }
    }
  }

  if (isSetAndForget(pIn) && !isSetAndForget(pOut)) {
    reasons.push("Set-and-forget quality — won't need trading again");
    evBonus += 8;
  }

  if (pIn.gamesPlayed >= 10 && pIn.durabilityScore && pIn.durabilityScore > 0.9 &&
      pOut.durabilityScore && pOut.durabilityScore < 0.7) {
    reasons.push("Much more durable — lower injury/miss risk");
    evBonus += 5;
  }

  if (ctx.isRound0 || ctx.isEarlySeasons) {
    if (pIn.isDebutant && pIn.isNamedTeam && pIn.price && pIn.price <= 300000) {
      evBonus += 15;
      reasons.push(`Named rookie at $${(pIn.price / 1000).toFixed(0)}K — likely cash cow from R1`);
      category = "cash_gen";
    }
    if (pIn.price && startingPrice && pIn.price < startingPrice * 0.85 &&
        pIn.avgScore && pIn.avgScore > 70 && pIn.formTrend !== "down") {
      evBonus += 10;
      reasons.push("Discounted premium — value pick for round 1");
    }
  }

  if (pIn.recentScores) {
    const scores = pIn.recentScores.split(",").map(Number).filter(n => !isNaN(n));
    if (scores.length >= 3) {
      const last3 = scores.slice(0, 3);
      const trending = last3[0] > last3[1] && last3[1] > last3[2];
      if (trending && last3[0] > (pIn.avgScore || 0)) {
        evBonus += 5;
        reasons.push(`Scores trending upward: ${last3.join(", ")}`);
      }
      const highScores = last3.filter(s => s > 100).length;
      if (highScores >= 2) {
        evBonus += 5;
        reasons.push(`${highScores}/3 recent tons — hot streak`);
      }
    }
  }

  if (pOut.dualPosition && pIn.position !== pOut.position) {
    const pOutFieldPos = pOut.isOnField ? pOut.fieldPosition : pOut.position;
    if (pOutFieldPos && pIn.position !== pOutFieldPos) {
      const posGain = getPositionScoringPotential(pIn.position) - getPositionScoringPotential(pOutFieldPos || pOut.position);
      if (posGain > 5) {
        evBonus += 8;
        reasons.push(`Moving to higher-scoring position (${pIn.position} > ${pOutFieldPos || pOut.position})`);
      }
    }
  }

  const adjustedTradeEv = tradeEv + evBonus;

  const formDiff = (pIn.last3Avg || 0) - (pOut.last3Avg || 0);
  const confidence = calcTradeConfidence(
    adjustedTradeEv, formDiff, pIn.formTrend, pOut.formTrend,
    !!pOut.injuryStatus, !!pIn.dualPosition, ctx.w
  );

  let urgency = "low";
  if (pOut.injuryStatus || pOut.lateChange || !pOut.isNamedTeam) urgency = "critical";
  else if (adjustedTradeEv > 50 || scoreDiff > 15 || (category === "urgent")) urgency = "critical";
  else if (adjustedTradeEv > 30 || scoreDiff > 10) urgency = "high";
  else if (adjustedTradeEv > 15 || scoreDiff > 3 || category === "cash_gen") urgency = "medium";

  const MIN_CONFIDENCE = 0.3;
  const MIN_EV = -15;
  if (confidence < MIN_CONFIDENCE && adjustedTradeEv < MIN_EV && category !== "urgent" && category !== "cash_gen") return null;
  if (reasons.length === 0) return null;

  return {
    playerOut: pOut, playerIn: pIn, category, urgency,
    tradeEv: adjustedTradeEv, confidence, scoreDiff, priceDiff, cashImpact,
    projectedImpact: scoreDiff, reasons,
  };
}

export function generateTradeRecommendations(
  myTeam: PlayerWithTeamInfo[],
  allPlayers: Player[],
  currentRound: number,
  salaryCap: number,
): TradeCandidate[] {
  const teamPlayerIds = new Set(myTeam.map((p) => p.id));
  const availablePlayers = allPlayers.filter(
    (p) => !teamPlayerIds.has(p.id) && !p.injuryStatus
  );

  const isBye = AFL_FANTASY_CLASSIC_2026.byeRounds.includes(currentRound);
  const isRound0 = currentRound === 0;
  const isEarlySeasons = currentRound <= 3;

  const w = getCachedWeights();
  const totalSalary = myTeam.reduce((s, p) => s + p.price, 0);
  const remainingSalary = salaryCap - totalSalary;

  const teamByeCounts: Record<number, number> = {};
  const teamPositionCounts: Record<string, number> = {};
  for (const p of myTeam.filter(pp => pp.isOnField)) {
    if (p.byeRound) {
      teamByeCounts[p.byeRound] = (teamByeCounts[p.byeRound] || 0) + 1;
    }
    teamPositionCounts[p.position] = (teamPositionCounts[p.position] || 0) + 1;
  }

  const ctx: TradeContext = {
    currentRound, salaryCap, remainingSalary, isBye, isRound0, isEarlySeasons,
    teamPositionCounts, teamByeCounts: teamByeCounts, w,
  };

  const scoredTeamPlayers = myTeam
    .filter(p => p.isOnField)
    .map(p => ({ player: p, ...scoreTradeOut(p, ctx) }))
    .sort((a, b) => b.score - a.score);

  const scoredBenchPlayers = myTeam
    .filter(p => !p.isOnField)
    .map(p => ({ player: p, ...scoreTradeOut(p, ctx) }))
    .sort((a, b) => b.score - a.score);

  const allScoredOuts = [...scoredTeamPlayers, ...scoredBenchPlayers];

  const worthTrading = allScoredOuts.filter(e => e.score >= 8);
  const outCandidates = worthTrading.length > 0
    ? worthTrading.slice(0, 12)
    : allScoredOuts.slice(0, 6);

  const candidates: TradeCandidate[] = [];

  for (const outEntry of outCandidates) {
    const pOut = outEntry.player;
    const posMatches = availablePlayers.filter(p =>
      p.position === pOut.position || p.dualPosition === pOut.position ||
      (pOut.dualPosition && (p.position === pOut.dualPosition || p.dualPosition === pOut.dualPosition))
    );

    const scored = posMatches
      .map(pIn => scoreTradeIn(pIn, pOut, outEntry.category, ctx))
      .filter((c): c is TradeCandidate => c !== null)
      .sort((a, b) => {
        if (a.urgency === "critical" && b.urgency !== "critical") return -1;
        if (b.urgency === "critical" && a.urgency !== "critical") return 1;
        return b.tradeEv - a.tradeEv;
      })
      .slice(0, 3);

    candidates.push(...scored);
  }

  if (isRound0 || isEarlySeasons) {
    const cashCows = availablePlayers
      .filter(p =>
        (p.isDebutant || p.price <= 350000) &&
        p.isNamedTeam &&
        (hasNegativeBreakeven(p) || (p.cashGenPotential === "elite" || p.cashGenPotential === "high"))
      )
      .sort((a, b) => {
        const aScore = (a.avgScore || 0) - (a.breakEven || 0) + (hasNegativeBreakeven(a) ? 50 : 0);
        const bScore = (b.avgScore || 0) - (b.breakEven || 0) + (hasNegativeBreakeven(b) ? 50 : 0);
        return bScore - aScore;
      })
      .slice(0, 5);

    const worstBench = myTeam
      .filter(p => !p.isOnField)
      .sort((a, b) => (a.avgScore || 0) - (b.avgScore || 0))
      .slice(0, 3);

    for (const cow of cashCows) {
      for (const benchPlayer of worstBench) {
        if (cow.position === benchPlayer.position || cow.dualPosition === benchPlayer.position ||
            (benchPlayer.dualPosition && (cow.position === benchPlayer.dualPosition))) {
          const existing = candidates.find(c => c.playerIn.id === cow.id && c.playerOut.id === benchPlayer.id);
          if (!existing) {
            const candidate = scoreTradeIn(cow, benchPlayer, "cash_gen", ctx);
            if (candidate) candidates.push(candidate);
          }
        }
      }
    }
  }

  const unique = new Map<string, TradeCandidate>();
  for (const c of candidates) {
    const key = `${c.playerOut.id}-${c.playerIn.id}`;
    const existing = unique.get(key);
    if (!existing || c.tradeEv > existing.tradeEv) {
      unique.set(key, c);
    }
  }

  const allUnique = Array.from(unique.values());

  const playerInCounts = new Map<number, number>();
  const playerOutCounts = new Map<number, number>();
  const sortedAll = allUnique.sort((a, b) => {
    const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const uDiff = (urgencyOrder[a.urgency] || 3) - (urgencyOrder[b.urgency] || 3);
    if (uDiff !== 0) return uDiff;
    return b.tradeEv - a.tradeEv;
  });

  const diversified: TradeCandidate[] = [];
  for (const c of sortedAll) {
    const inCount = playerInCounts.get(c.playerIn.id) || 0;
    const outCount = playerOutCounts.get(c.playerOut.id) || 0;
    if (inCount >= 2 || outCount >= 2) continue;
    diversified.push(c);
    playerInCounts.set(c.playerIn.id, inCount + 1);
    playerOutCounts.set(c.playerOut.id, outCount + 1);
  }

  return diversified
    .sort((a, b) => {
      const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const uDiff = (urgencyOrder[a.urgency] || 3) - (urgencyOrder[b.urgency] || 3);
      if (uDiff !== 0) return uDiff;
      return b.tradeEv - a.tradeEv;
    })
    .slice(0, 15);
}
