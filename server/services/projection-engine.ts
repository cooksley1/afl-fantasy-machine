import type { ModelWeight } from "@shared/schema";

export interface WeightConfig {
  bayesian_last2_weight: number;
  bayesian_prev3_weight: number;
  floor_sigma_multiplier: number;
  ceiling_sigma_multiplier: number;
  volatility_scale_factor: number;
  volatility_max: number;
  captain_threshold: number;
  consistency_cv_weight: number;
  consistency_avg_weight: number;
  consistency_avg_baseline: number;
  trade_ev_proj_multiplier: number;
  trade_ev_vol_penalty: number;
  trade_ev_cashgen_multiplier: number;
  trade_rank_last3_weight: number;
  trade_rank_avg_weight: number;
  trade_rank_form_weight: number;
  confidence_base: number;
  confidence_ev_strong_threshold: number;
  confidence_ev_strong_bonus: number;
  confidence_ev_moderate_threshold: number;
  confidence_ev_moderate_bonus: number;
  confidence_ev_weak_bonus: number;
  confidence_form_strong_threshold: number;
  confidence_form_strong_bonus: number;
  confidence_form_weak_threshold: number;
  confidence_form_weak_bonus: number;
  confidence_trend_up_bonus: number;
  confidence_trend_down_bonus: number;
  confidence_injury_bonus: number;
  confidence_dpp_bonus: number;
  confidence_max: number;
  projection_blend_base: number;
  projection_blend_bayesian: number;
  debutant_base_price_threshold: number;
  debutant_rookie_price_threshold: number;
  debutant_base_price_chance: number;
  debutant_rookie_price_chance: number;
  cashgen_elite_threshold: number;
  cashgen_high_threshold: number;
  cashgen_medium_threshold: number;
}

const DEFAULT_WEIGHTS: WeightConfig = {
  bayesian_last2_weight: 0.6,
  bayesian_prev3_weight: 0.4,
  floor_sigma_multiplier: 1.0,
  ceiling_sigma_multiplier: 1.3,
  volatility_scale_factor: 40,
  volatility_max: 10,
  captain_threshold: 120,
  consistency_cv_weight: 0.6,
  consistency_avg_weight: 0.4,
  consistency_avg_baseline: 110,
  trade_ev_proj_multiplier: 3,
  trade_ev_vol_penalty: 0.5,
  trade_ev_cashgen_multiplier: 0.2,
  trade_rank_last3_weight: 0.4,
  trade_rank_avg_weight: 0.3,
  trade_rank_form_weight: 0.3,
  confidence_base: 0.5,
  confidence_ev_strong_threshold: 30,
  confidence_ev_strong_bonus: 0.25,
  confidence_ev_moderate_threshold: 15,
  confidence_ev_moderate_bonus: 0.15,
  confidence_ev_weak_bonus: 0.05,
  confidence_form_strong_threshold: 15,
  confidence_form_strong_bonus: 0.1,
  confidence_form_weak_threshold: 5,
  confidence_form_weak_bonus: 0.05,
  confidence_trend_up_bonus: 0.05,
  confidence_trend_down_bonus: 0.05,
  confidence_injury_bonus: 0.1,
  confidence_dpp_bonus: 0.05,
  confidence_max: 0.95,
  projection_blend_base: 0.5,
  projection_blend_bayesian: 0.5,
  debutant_base_price_threshold: 150000,
  debutant_rookie_price_threshold: 250000,
  debutant_base_price_chance: 0.7,
  debutant_rookie_price_chance: 0.4,
  cashgen_elite_threshold: 30,
  cashgen_high_threshold: 20,
  cashgen_medium_threshold: 10,
};

let cachedWeights: WeightConfig | null = null;

export function buildWeightConfig(dbWeights: ModelWeight[]): WeightConfig {
  const config = { ...DEFAULT_WEIGHTS };
  for (const w of dbWeights) {
    if (w.key in config) {
      (config as any)[w.key] = w.value;
    }
  }
  cachedWeights = config;
  return config;
}

export function getDefaultWeights(): WeightConfig {
  return { ...DEFAULT_WEIGHTS };
}

export function getCachedWeights(): WeightConfig {
  return cachedWeights || { ...DEFAULT_WEIGHTS };
}

export function getDefaultWeightEntries(): Array<{ key: string; value: number; description: string; category: string }> {
  const entries: Array<{ key: string; value: number; description: string; category: string }> = [];
  const descriptions: Record<string, [string, string]> = {
    bayesian_last2_weight: ["Weight for last-2 game estimate in Bayesian projection", "projection"],
    bayesian_prev3_weight: ["Weight for previous-3 game estimate in Bayesian projection", "projection"],
    floor_sigma_multiplier: ["Standard deviations below projected score for floor", "projection"],
    ceiling_sigma_multiplier: ["Standard deviations above projected score for ceiling", "projection"],
    volatility_scale_factor: ["Scaling factor for CV-to-volatility conversion", "projection"],
    volatility_max: ["Maximum volatility score cap", "projection"],
    captain_threshold: ["Score threshold for captain probability calculation", "captain"],
    consistency_cv_weight: ["Weight for CV inverse in consistency rating", "consistency"],
    consistency_avg_weight: ["Weight for average factor in consistency rating", "consistency"],
    consistency_avg_baseline: ["Baseline average for consistency normalization", "consistency"],
    trade_ev_proj_multiplier: ["Multiplier for projection difference in Trade EV", "trade"],
    trade_ev_vol_penalty: ["Volatility penalty coefficient in Trade EV", "trade"],
    trade_ev_cashgen_multiplier: ["Cash generation value multiplier in Trade EV", "trade"],
    trade_rank_last3_weight: ["Weight for last-3 average in trade ranking", "trade"],
    trade_rank_avg_weight: ["Weight for season average in trade ranking", "trade"],
    trade_rank_form_weight: ["Weight for form trend in trade ranking", "trade"],
    confidence_base: ["Base confidence for trade recommendations", "trade"],
    confidence_ev_strong_threshold: ["Trade EV threshold for strong confidence boost", "trade"],
    confidence_ev_strong_bonus: ["Confidence bonus for strong Trade EV", "trade"],
    confidence_ev_moderate_threshold: ["Trade EV threshold for moderate confidence boost", "trade"],
    confidence_ev_moderate_bonus: ["Confidence bonus for moderate Trade EV", "trade"],
    confidence_ev_weak_bonus: ["Confidence bonus for weak positive Trade EV", "trade"],
    confidence_form_strong_threshold: ["Form difference threshold for strong confidence boost", "trade"],
    confidence_form_strong_bonus: ["Confidence bonus for strong form difference", "trade"],
    confidence_form_weak_threshold: ["Form difference threshold for weak confidence boost", "trade"],
    confidence_form_weak_bonus: ["Confidence bonus for weak form difference", "trade"],
    confidence_trend_up_bonus: ["Confidence bonus for upward-trending player in", "trade"],
    confidence_trend_down_bonus: ["Confidence bonus for downward-trending player out", "trade"],
    confidence_injury_bonus: ["Confidence bonus when trading out injured player", "trade"],
    confidence_dpp_bonus: ["Confidence bonus for dual-position player in", "trade"],
    confidence_max: ["Maximum confidence cap", "trade"],
    projection_blend_base: ["Weight for base projection in blended score", "projection"],
    projection_blend_bayesian: ["Weight for Bayesian projection in blended score", "projection"],
    debutant_base_price_threshold: ["Price threshold for high debutant probability", "debutant"],
    debutant_rookie_price_threshold: ["Price threshold for moderate debutant probability", "debutant"],
    debutant_base_price_chance: ["Debutant probability for base-price players", "debutant"],
    debutant_rookie_price_chance: ["Debutant probability for rookie-price players", "debutant"],
    cashgen_elite_threshold: ["Score-above-BE threshold for elite cash generation", "debutant"],
    cashgen_high_threshold: ["Score-above-BE threshold for high cash generation", "debutant"],
    cashgen_medium_threshold: ["Score-above-BE threshold for medium cash generation", "debutant"],
  };
  for (const [key, value] of Object.entries(DEFAULT_WEIGHTS)) {
    const [desc, cat] = descriptions[key] || ["", "general"];
    entries.push({ key, value: value as number, description: desc, category: cat });
  }
  return entries;
}

export interface MultiplierFactors {
  matchupFactor: number;
  formFactor: number;
  togFactor: number;
  combined: number;
}

export function calcMultiplierProjection(
  baseProjection: number,
  avgScore: number,
  last3Avg: number | null,
  last5Avg: number | null,
  opponentAvgConceded: number | null,
  leagueAvgConceded: number | null,
): { adjustedScore: number; factors: MultiplierFactors } {
  let matchupFactor = 1.0;
  if (opponentAvgConceded != null && leagueAvgConceded != null && leagueAvgConceded > 0) {
    const rawMatchup = opponentAvgConceded / leagueAvgConceded;
    matchupFactor = 0.7 + (rawMatchup - 1.0) * 0.6 + 0.3;
    matchupFactor = Math.max(0.85, Math.min(1.20, matchupFactor));
  }

  let formFactor = 1.0;
  if (avgScore > 0) {
    const recentAvg = last3Avg ?? last5Avg ?? avgScore;
    const rawForm = recentAvg / avgScore;
    formFactor = Math.max(0.85, Math.min(1.20, rawForm));
  }

  const togFactor = 1.0;

  const combined = matchupFactor * formFactor * togFactor;
  const adjustedScore = Math.round(baseProjection * combined * 10) / 10;

  return {
    adjustedScore,
    factors: { matchupFactor, formFactor, togFactor, combined },
  };
}

export function calcValueGap(projectedAvg: number, price: number, magicNumber: number): number {
  if (magicNumber <= 0 || price <= 0) return 0;
  const priceImpliedAvg = price / magicNumber;
  return Math.round((projectedAvg - priceImpliedAvg) * 10) / 10;
}

export function calcSeasonTradeGain(projIn: number, projOut: number, remainingRounds: number): number {
  return Math.round((projIn - projOut) * remainingRounds * 10) / 10;
}

export function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

export function bayesianAdjustedAvg(last3Avg: number, last5Avg: number, _avgScore: number, w: WeightConfig = DEFAULT_WEIGHTS): number {
  const last2Estimate = last3Avg * 1.5 - last5Avg * 0.5;
  const prev3Estimate = (last5Avg * 5 - last3Avg * 3) / 2;
  return last2Estimate * w.bayesian_last2_weight + prev3Estimate * w.bayesian_prev3_weight;
}

export function calcProjectedFloor(projectedScore: number, volatility: number, w: WeightConfig = DEFAULT_WEIGHTS): number {
  return Math.round(Math.max(10, projectedScore - (w.floor_sigma_multiplier * volatility)));
}

export function calcProjectedCeiling(projectedScore: number, volatility: number, w: WeightConfig = DEFAULT_WEIGHTS): number {
  return Math.round(projectedScore + (w.ceiling_sigma_multiplier * volatility));
}

export function calcVolatilityScore(stdDev: number, avg: number, w: WeightConfig = DEFAULT_WEIGHTS): number {
  if (avg <= 0) return w.volatility_max;
  const cv = stdDev / avg;
  const raw = cv * w.volatility_scale_factor;
  return Math.round(Math.max(0, Math.min(w.volatility_max, raw)) * 10) / 10;
}

export function calcCaptainProbability(projectedScore: number, volatility: number, w: WeightConfig = DEFAULT_WEIGHTS): number {
  const threshold = w.captain_threshold;
  if (volatility <= 0) return projectedScore >= threshold ? 1.0 : 0.0;
  const z = (threshold - projectedScore) / volatility;
  return Math.round((1 - normalCDF(z)) * 1000) / 1000;
}

export function calcConsistencyRating(scores: number[], avg: number, w: WeightConfig = DEFAULT_WEIGHTS): number {
  if (scores.length === 0 || avg <= 0) return 0;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const cvInverse = 1 - (stdDev / avg);
  const avgFactor = Math.min(avg / w.consistency_avg_baseline, 1.0);
  const raw = (cvInverse * w.consistency_cv_weight + avgFactor * w.consistency_avg_weight) * 10;
  return Math.round(Math.max(1, Math.min(10, raw)) * 10) / 10;
}

export function calcTradeEV(projIn: number, projOut: number, volIn: number, volOut: number, cashGenValue: number, w: WeightConfig = DEFAULT_WEIGHTS): number {
  const projDiff = projIn - projOut;
  const volatilityPenalty = (volIn - volOut) * w.trade_ev_vol_penalty;
  const ev = (projDiff * w.trade_ev_proj_multiplier) - volatilityPenalty + (cashGenValue * w.trade_ev_cashgen_multiplier);
  return Math.round(ev * 10) / 10;
}

export function calcTradeRankingScore(last3Avg: number, avgScore: number, formTrend: string, w: WeightConfig = DEFAULT_WEIGHTS): number {
  const formTrendValue = formTrend === "up" ? 10 : formTrend === "down" ? -10 : 0;
  return last3Avg * w.trade_rank_last3_weight + avgScore * w.trade_rank_avg_weight + formTrendValue * w.trade_rank_form_weight;
}

export function calcTradeConfidence(
  tradeEv: number,
  formDiff: number,
  playerInTrend: string,
  playerOutTrend: string,
  playerOutInjured: boolean,
  playerInHasDPP: boolean,
  w: WeightConfig = DEFAULT_WEIGHTS
): number {
  let confidence = w.confidence_base;
  if (tradeEv > w.confidence_ev_strong_threshold) confidence += w.confidence_ev_strong_bonus;
  else if (tradeEv > w.confidence_ev_moderate_threshold) confidence += w.confidence_ev_moderate_bonus;
  else if (tradeEv > 0) confidence += w.confidence_ev_weak_bonus;
  if (formDiff > w.confidence_form_strong_threshold) confidence += w.confidence_form_strong_bonus;
  else if (formDiff > w.confidence_form_weak_threshold) confidence += w.confidence_form_weak_bonus;
  if (playerInTrend === "up") confidence += w.confidence_trend_up_bonus;
  if (playerOutTrend === "down") confidence += w.confidence_trend_down_bonus;
  if (playerOutInjured) confidence += w.confidence_injury_bonus;
  if (playerInHasDPP) confidence += w.confidence_dpp_bonus;
  return Math.min(confidence, w.confidence_max);
}

export function calcBlendedProjection(baseProjection: number, bayesianProjection: number, w: WeightConfig = DEFAULT_WEIGHTS): number {
  return Math.round((baseProjection * w.projection_blend_base + bayesianProjection * w.projection_blend_bayesian) * 10) / 10;
}

export function classifyCashGeneration(avgScore: number, breakEven: number, w: WeightConfig = DEFAULT_WEIGHTS): string | null {
  const scoringAboveBE = avgScore - breakEven;
  if (scoringAboveBE > w.cashgen_elite_threshold) return "elite";
  if (scoringAboveBE > w.cashgen_high_threshold) return "high";
  if (scoringAboveBE > w.cashgen_medium_threshold) return "medium";
  if (scoringAboveBE > 0) return "low";
  return null;
}

export function isDebutantCandidate(price: number, w: WeightConfig = DEFAULT_WEIGHTS): { isCandidate: boolean; probability: number } {
  if (price <= w.debutant_base_price_threshold) return { isCandidate: true, probability: w.debutant_base_price_chance };
  if (price <= w.debutant_rookie_price_threshold) return { isCandidate: true, probability: w.debutant_rookie_price_chance };
  return { isCandidate: false, probability: 0 };
}

export function generateRecentScores(avg: number, stdDev: number, count: number = 6): number[] {
  const scores: number[] = [];
  for (let i = 0; i < count; i++) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    const score = Math.round(avg + normal * stdDev);
    scores.push(Math.max(20, Math.min(180, score)));
  }
  return scores;
}

export interface BreakoutInput {
  formTrend: string;
  last3Avg: number;
  avgScore: number;
  age: number | null;
}

export function calcBreakoutScore(player: BreakoutInput): number {
  const { formTrend, last3Avg, avgScore, age } = player;

  let cbaProxy: number;
  if (formTrend === "up") cbaProxy = 0.7;
  else if (formTrend === "stable") cbaProxy = 0.4;
  else cbaProxy = 0.1;

  const togProxy = avgScore > 0 ? Math.max(0, Math.min(1, last3Avg / avgScore)) : 0.5;

  const disposalProxy = avgScore > 0 ? Math.max(0, Math.min(1, (last3Avg - avgScore) / avgScore)) : 0;

  let ageFactor = 0.6;
  if (age !== null && age >= 22 && age <= 25) ageFactor = 1.0;

  const score = (cbaProxy * 0.40) + (togProxy * 0.25) + (disposalProxy * 0.20) + (ageFactor * 0.15);
  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
}

export function generateAge(price: number, avgScore: number): number {
  if (price <= 150000) return 18 + Math.floor(Math.random() * 2);
  if (price <= 250000) return 19 + Math.floor(Math.random() * 3);
  if (price <= 400000) return 21 + Math.floor(Math.random() * 6);
  if (avgScore >= 100) return 24 + Math.floor(Math.random() * 6);
  return 22 + Math.floor(Math.random() * 8);
}

export function generateYearsExperience(age: number): number {
  return Math.max(0, age - 18 - Math.floor(Math.random() * 2));
}

export function generateDurabilityScore(age: number, injuryStatus: string | null): number {
  let base = 0.7 + Math.random() * 0.3;
  if (age >= 30) base -= 0.1;
  if (age >= 33) base -= 0.1;
  if (injuryStatus) base -= 0.15 + Math.random() * 0.15;
  return Math.round(Math.max(0.1, Math.min(1.0, base)) * 100) / 100;
}

export function generateInjuryRiskScore(durability: number, age: number, injuryStatus: string | null): number {
  let risk = 1 - durability;
  if (age >= 30) risk += 0.1;
  if (injuryStatus) risk += 0.2;
  risk += (Math.random() * 0.1 - 0.05);
  return Math.round(Math.max(0, Math.min(1.0, risk)) * 100) / 100;
}

export interface TagAssessmentInput {
  avgScore: number;
  position: string;
  dualPosition: string | null;
  ownedByPercent: number;
  captainProbability: number | null;
  price: number;
  last3Avg: number;
  formTrend: string;
}

export function calcTagRisk(player: TagAssessmentInput): number {
  let risk = 0;

  if (player.avgScore >= 110) risk += 0.35;
  else if (player.avgScore >= 100) risk += 0.25;
  else if (player.avgScore >= 90) risk += 0.12;
  else return 0;

  const isMid = player.position === "MID" || player.dualPosition === "MID";
  if (isMid) risk += 0.15;

  if ((player.captainProbability || 0) >= 0.3) risk += 0.15;
  else if ((player.captainProbability || 0) >= 0.15) risk += 0.08;

  if (player.ownedByPercent >= 25) risk += 0.1;
  else if (player.ownedByPercent >= 15) risk += 0.05;

  if (player.formTrend === "up" && player.last3Avg > player.avgScore * 1.1) risk += 0.1;

  if (player.price >= 900000) risk += 0.05;

  return Math.round(Math.min(1, risk) * 100) / 100;
}

export function calcIsExpectedTagger(player: TagAssessmentInput): boolean {
  const avg = player.avgScore;
  const isMid = player.position === "MID" || player.dualPosition === "MID";
  if (!isMid) return false;
  if (avg >= 85) return false;
  if (avg < 50 && avg > 0) return true;
  if (avg >= 50 && avg < 70 && player.price <= 500000) return true;
  return false;
}

export function calcTagScoreImpact(avgScore: number, tagRisk: number): number {
  const reductionPercent = tagRisk * 0.18;
  return Math.round(avgScore * reductionPercent * 10) / 10;
}
