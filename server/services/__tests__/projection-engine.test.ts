import { describe, it, expect } from "vitest";
import {
  normalCDF,
  bayesianAdjustedAvg,
  calcProjectedFloor,
  calcProjectedCeiling,
  calcVolatilityScore,
  calcCaptainProbability,
  calcConsistencyRating,
  calcTradeEV,
  calcTradeRankingScore,
  calcTradeConfidence,
  calcBlendedProjection,
  classifyCashGeneration,
  isDebutantCandidate,
  generateRecentScores,
  generateAge,
  generateYearsExperience,
  generateDurabilityScore,
  generateInjuryRiskScore,
  getDefaultWeights,
  buildWeightConfig,
  type WeightConfig,
} from "../projection-engine";

const w = getDefaultWeights();

describe("normalCDF", () => {
  it("returns 0.5 for z=0", () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 3);
  });

  it("returns ~0.8413 for z=1", () => {
    expect(normalCDF(1)).toBeCloseTo(0.8413, 3);
  });

  it("returns ~0.1587 for z=-1", () => {
    expect(normalCDF(-1)).toBeCloseTo(0.1587, 3);
  });

  it("returns ~0.9772 for z=2", () => {
    expect(normalCDF(2)).toBeCloseTo(0.9772, 3);
  });

  it("returns close to 1 for large positive z", () => {
    expect(normalCDF(4)).toBeGreaterThan(0.999);
  });

  it("returns close to 0 for large negative z", () => {
    expect(normalCDF(-4)).toBeLessThan(0.001);
  });
});

describe("bayesianAdjustedAvg", () => {
  it("weights recent form more heavily with defaults", () => {
    const result = bayesianAdjustedAvg(110, 105, 100, w);
    expect(result).toBeGreaterThan(105);
  });

  it("returns exact average when all inputs are equal", () => {
    const result = bayesianAdjustedAvg(100, 100, 100, w);
    expect(result).toBeCloseTo(100, 1);
  });

  it("handles upward trending player", () => {
    const result = bayesianAdjustedAvg(120, 110, 100, w);
    expect(result).toBeGreaterThan(110);
  });

  it("handles downward trending player", () => {
    const result = bayesianAdjustedAvg(80, 90, 100, w);
    expect(result).toBeLessThan(90);
  });

  it("respects custom weights", () => {
    const customW: WeightConfig = { ...w, bayesian_last2_weight: 0.9, bayesian_prev3_weight: 0.1 };
    const defaultResult = bayesianAdjustedAvg(120, 100, 100, w);
    const customResult = bayesianAdjustedAvg(120, 100, 100, customW);
    expect(customResult).toBeGreaterThan(defaultResult);
  });
});

describe("calcProjectedFloor", () => {
  it("calculates floor as proj - 1.0*volatility by default", () => {
    expect(calcProjectedFloor(100, 20, w)).toBe(80);
  });

  it("never goes below 10", () => {
    expect(calcProjectedFloor(15, 20, w)).toBe(10);
  });

  it("respects custom sigma multiplier", () => {
    const customW: WeightConfig = { ...w, floor_sigma_multiplier: 1.5 };
    expect(calcProjectedFloor(100, 20, customW)).toBe(70);
  });

  it("returns projected score when volatility is 0", () => {
    expect(calcProjectedFloor(100, 0, w)).toBe(100);
  });
});

describe("calcProjectedCeiling", () => {
  it("calculates ceiling as proj + 1.3*volatility by default", () => {
    expect(calcProjectedCeiling(100, 20, w)).toBe(126);
  });

  it("respects custom sigma multiplier", () => {
    const customW: WeightConfig = { ...w, ceiling_sigma_multiplier: 2.0 };
    expect(calcProjectedCeiling(100, 20, customW)).toBe(140);
  });

  it("returns projected score when volatility is 0", () => {
    expect(calcProjectedCeiling(100, 0, w)).toBe(100);
  });
});

describe("calcVolatilityScore", () => {
  it("returns 0 for perfect consistency (stdDev=0)", () => {
    expect(calcVolatilityScore(0, 100, w)).toBe(0);
  });

  it("returns max for avg=0", () => {
    expect(calcVolatilityScore(10, 0, w)).toBe(w.volatility_max);
  });

  it("caps at max volatility", () => {
    expect(calcVolatilityScore(100, 50, w)).toBe(w.volatility_max);
  });

  it("scales linearly with CV", () => {
    const low = calcVolatilityScore(10, 100, w);
    const high = calcVolatilityScore(20, 100, w);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeCloseTo(low * 2, 1);
  });

  it("respects custom scale factor", () => {
    const customW: WeightConfig = { ...w, volatility_scale_factor: 80 };
    const defaultResult = calcVolatilityScore(10, 100, w);
    const customResult = calcVolatilityScore(10, 100, customW);
    expect(customResult).toBeCloseTo(defaultResult * 2, 1);
  });
});

describe("calcCaptainProbability", () => {
  it("returns high probability when projection well above threshold", () => {
    const prob = calcCaptainProbability(140, 15, w);
    expect(prob).toBeGreaterThan(0.9);
  });

  it("returns low probability when projection well below threshold", () => {
    const prob = calcCaptainProbability(80, 15, w);
    expect(prob).toBeLessThan(0.01);
  });

  it("returns ~0.5 when projection equals threshold", () => {
    const prob = calcCaptainProbability(120, 15, w);
    expect(prob).toBeCloseTo(0.5, 1);
  });

  it("returns 1.0 when volatility is 0 and score >= threshold", () => {
    expect(calcCaptainProbability(130, 0, w)).toBe(1.0);
  });

  it("returns 0.0 when volatility is 0 and score < threshold", () => {
    expect(calcCaptainProbability(110, 0, w)).toBe(0.0);
  });

  it("higher volatility increases probability for below-threshold scores", () => {
    const lowVol = calcCaptainProbability(110, 5, w);
    const highVol = calcCaptainProbability(110, 20, w);
    expect(highVol).toBeGreaterThan(lowVol);
  });

  it("respects custom captain threshold", () => {
    const customW: WeightConfig = { ...w, captain_threshold: 100 };
    const defaultProb = calcCaptainProbability(110, 15, w);
    const customProb = calcCaptainProbability(110, 15, customW);
    expect(customProb).toBeGreaterThan(defaultProb);
  });
});

describe("calcConsistencyRating", () => {
  it("returns 0 for empty scores", () => {
    expect(calcConsistencyRating([], 100, w)).toBe(0);
  });

  it("returns 0 for avg <= 0", () => {
    expect(calcConsistencyRating([50, 60], 0, w)).toBe(0);
  });

  it("returns high rating for consistent high scorer", () => {
    const scores = [108, 112, 110, 109, 111, 110];
    const rating = calcConsistencyRating(scores, 110, w);
    expect(rating).toBeGreaterThan(8);
  });

  it("returns low rating for inconsistent scorer", () => {
    const scores = [40, 150, 60, 130, 45, 140];
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const rating = calcConsistencyRating(scores, avg, w);
    expect(rating).toBeLessThan(7);
  });

  it("is bounded between 1 and 10", () => {
    const highRating = calcConsistencyRating([100, 100, 100], 100, w);
    const lowRating = calcConsistencyRating([20, 180, 30, 170], 100, w);
    expect(highRating).toBeLessThanOrEqual(10);
    expect(highRating).toBeGreaterThanOrEqual(1);
    expect(lowRating).toBeLessThanOrEqual(10);
    expect(lowRating).toBeGreaterThanOrEqual(1);
  });

  it("respects custom weights", () => {
    const scores = [100, 100, 100];
    const customW: WeightConfig = { ...w, consistency_cv_weight: 0.9, consistency_avg_weight: 0.1 };
    const defaultRating = calcConsistencyRating(scores, 100, w);
    const customRating = calcConsistencyRating(scores, 100, customW);
    expect(customRating).not.toBe(defaultRating);
  });
});

describe("calcTradeEV", () => {
  it("returns positive EV for upgrade trade", () => {
    const ev = calcTradeEV(110, 90, 5, 5, 0, w);
    expect(ev).toBeGreaterThan(0);
  });

  it("returns negative EV for downgrade trade", () => {
    const ev = calcTradeEV(80, 100, 5, 5, 0, w);
    expect(ev).toBeLessThan(0);
  });

  it("penalizes high volatility incoming player", () => {
    const lowVol = calcTradeEV(100, 90, 3, 5, 0, w);
    const highVol = calcTradeEV(100, 90, 8, 5, 0, w);
    expect(lowVol).toBeGreaterThan(highVol);
  });

  it("rewards cash generation value", () => {
    const noCash = calcTradeEV(100, 90, 5, 5, 0, w);
    const withCash = calcTradeEV(100, 90, 5, 5, 40, w);
    expect(withCash).toBeGreaterThan(noCash);
  });

  it("respects custom multipliers", () => {
    const customW: WeightConfig = { ...w, trade_ev_proj_multiplier: 5 };
    const defaultEV = calcTradeEV(110, 90, 5, 5, 0, w);
    const customEV = calcTradeEV(110, 90, 5, 5, 0, customW);
    expect(customEV).toBeGreaterThan(defaultEV);
  });

  it("returns 0 for identical projections and volatilities", () => {
    const ev = calcTradeEV(100, 100, 5, 5, 0, w);
    expect(ev).toBe(0);
  });
});

describe("calcTradeRankingScore", () => {
  it("ranks upward trending players higher", () => {
    const upScore = calcTradeRankingScore(100, 95, "up", w);
    const downScore = calcTradeRankingScore(100, 95, "down", w);
    expect(upScore).toBeGreaterThan(downScore);
  });

  it("weights last3Avg more than avgScore", () => {
    const highL3 = calcTradeRankingScore(110, 90, "stable", w);
    const highAvg = calcTradeRankingScore(90, 110, "stable", w);
    expect(highL3).toBeGreaterThan(highAvg);
  });
});

describe("calcTradeConfidence", () => {
  it("starts at base confidence", () => {
    const conf = calcTradeConfidence(0, 0, "stable", "stable", false, false, w);
    expect(conf).toBe(w.confidence_base);
  });

  it("increases with high trade EV", () => {
    const lowEV = calcTradeConfidence(5, 0, "stable", "stable", false, false, w);
    const highEV = calcTradeConfidence(35, 0, "stable", "stable", false, false, w);
    expect(highEV).toBeGreaterThan(lowEV);
  });

  it("increases with form difference", () => {
    const lowForm = calcTradeConfidence(0, 3, "stable", "stable", false, false, w);
    const highForm = calcTradeConfidence(0, 20, "stable", "stable", false, false, w);
    expect(highForm).toBeGreaterThan(lowForm);
  });

  it("increases for upward trending player in", () => {
    const stable = calcTradeConfidence(0, 0, "stable", "stable", false, false, w);
    const trending = calcTradeConfidence(0, 0, "up", "stable", false, false, w);
    expect(trending).toBeGreaterThan(stable);
  });

  it("increases for downward trending player out", () => {
    const stable = calcTradeConfidence(0, 0, "stable", "stable", false, false, w);
    const trending = calcTradeConfidence(0, 0, "stable", "down", false, false, w);
    expect(trending).toBeGreaterThan(stable);
  });

  it("increases for injured player out", () => {
    const healthy = calcTradeConfidence(0, 0, "stable", "stable", false, false, w);
    const injured = calcTradeConfidence(0, 0, "stable", "stable", true, false, w);
    expect(injured).toBeGreaterThan(healthy);
  });

  it("increases for DPP player in", () => {
    const noDPP = calcTradeConfidence(0, 0, "stable", "stable", false, false, w);
    const withDPP = calcTradeConfidence(0, 0, "stable", "stable", false, true, w);
    expect(withDPP).toBeGreaterThan(noDPP);
  });

  it("caps at max confidence", () => {
    const conf = calcTradeConfidence(50, 30, "up", "down", true, true, w);
    expect(conf).toBe(w.confidence_max);
  });
});

describe("calcBlendedProjection", () => {
  it("blends two projections 50/50 by default", () => {
    const result = calcBlendedProjection(100, 110, w);
    expect(result).toBeCloseTo(105, 0);
  });

  it("respects custom blend weights", () => {
    const customW: WeightConfig = { ...w, projection_blend_base: 0.8, projection_blend_bayesian: 0.2 };
    const result = calcBlendedProjection(100, 120, customW);
    expect(result).toBeCloseTo(104, 0);
  });

  it("returns exact value when both inputs are equal", () => {
    expect(calcBlendedProjection(100, 100, w)).toBeCloseTo(100, 0);
  });
});

describe("classifyCashGeneration", () => {
  it("returns elite for score 40 above BE", () => {
    expect(classifyCashGeneration(80, 40, w)).toBe("elite");
  });

  it("returns high for score 25 above BE", () => {
    expect(classifyCashGeneration(75, 50, w)).toBe("high");
  });

  it("returns medium for score 15 above BE", () => {
    expect(classifyCashGeneration(65, 50, w)).toBe("medium");
  });

  it("returns low for score marginally above BE", () => {
    expect(classifyCashGeneration(55, 50, w)).toBe("low");
  });

  it("returns null when scoring at or below BE", () => {
    expect(classifyCashGeneration(50, 50, w)).toBeNull();
  });

  it("returns null when scoring below BE", () => {
    expect(classifyCashGeneration(40, 50, w)).toBeNull();
  });

  it("respects custom thresholds", () => {
    const customW: WeightConfig = { ...w, cashgen_elite_threshold: 50 };
    expect(classifyCashGeneration(80, 40, customW)).toBe("high");
    expect(classifyCashGeneration(100, 40, customW)).toBe("elite");
  });
});

describe("isDebutantCandidate", () => {
  it("returns high probability for base-price players", () => {
    const result = isDebutantCandidate(120000, w);
    expect(result.isCandidate).toBe(true);
    expect(result.probability).toBe(0.7);
  });

  it("returns moderate probability for rookie-price players", () => {
    const result = isDebutantCandidate(200000, w);
    expect(result.isCandidate).toBe(true);
    expect(result.probability).toBe(0.4);
  });

  it("returns false for premium players", () => {
    const result = isDebutantCandidate(500000, w);
    expect(result.isCandidate).toBe(false);
    expect(result.probability).toBe(0);
  });

  it("boundary: exact base price threshold", () => {
    const result = isDebutantCandidate(150000, w);
    expect(result.isCandidate).toBe(true);
    expect(result.probability).toBe(0.7);
  });

  it("respects custom thresholds", () => {
    const customW: WeightConfig = { ...w, debutant_base_price_threshold: 200000, debutant_base_price_chance: 0.9 };
    const result = isDebutantCandidate(180000, customW);
    expect(result.isCandidate).toBe(true);
    expect(result.probability).toBe(0.9);
  });
});

describe("generateRecentScores", () => {
  it("generates correct number of scores", () => {
    const scores = generateRecentScores(90, 15, 6);
    expect(scores).toHaveLength(6);
  });

  it("generates custom count", () => {
    const scores = generateRecentScores(90, 15, 10);
    expect(scores).toHaveLength(10);
  });

  it("all scores are within bounds [20, 180]", () => {
    const scores = generateRecentScores(100, 50, 100);
    scores.forEach(s => {
      expect(s).toBeGreaterThanOrEqual(20);
      expect(s).toBeLessThanOrEqual(180);
    });
  });

  it("scores are integers", () => {
    const scores = generateRecentScores(90, 15);
    scores.forEach(s => {
      expect(Number.isInteger(s)).toBe(true);
    });
  });

  it("average of many scores approximates the mean", () => {
    const scores = generateRecentScores(100, 10, 1000);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(avg).toBeCloseTo(100, -1);
  });
});

describe("generateAge", () => {
  it("returns young age for cheap players", () => {
    const ages = Array.from({ length: 50 }, () => generateAge(120000, 50));
    ages.forEach(a => {
      expect(a).toBeGreaterThanOrEqual(18);
      expect(a).toBeLessThanOrEqual(19);
    });
  });

  it("returns higher age for expensive high scorers", () => {
    const ages = Array.from({ length: 50 }, () => generateAge(600000, 110));
    ages.forEach(a => {
      expect(a).toBeGreaterThanOrEqual(24);
      expect(a).toBeLessThanOrEqual(29);
    });
  });
});

describe("generateYearsExperience", () => {
  it("returns non-negative experience", () => {
    const exp = generateYearsExperience(18);
    expect(exp).toBeGreaterThanOrEqual(0);
  });

  it("scales with age", () => {
    const youngExp = Array.from({ length: 50 }, () => generateYearsExperience(19));
    const oldExp = Array.from({ length: 50 }, () => generateYearsExperience(30));
    const avgYoung = youngExp.reduce((a, b) => a + b, 0) / youngExp.length;
    const avgOld = oldExp.reduce((a, b) => a + b, 0) / oldExp.length;
    expect(avgOld).toBeGreaterThan(avgYoung);
  });
});

describe("generateDurabilityScore", () => {
  it("returns value between 0.1 and 1.0", () => {
    for (let i = 0; i < 50; i++) {
      const score = generateDurabilityScore(25, null);
      expect(score).toBeGreaterThanOrEqual(0.1);
      expect(score).toBeLessThanOrEqual(1.0);
    }
  });

  it("penalizes older players", () => {
    const youngScores = Array.from({ length: 100 }, () => generateDurabilityScore(22, null));
    const oldScores = Array.from({ length: 100 }, () => generateDurabilityScore(34, null));
    const avgYoung = youngScores.reduce((a, b) => a + b, 0) / youngScores.length;
    const avgOld = oldScores.reduce((a, b) => a + b, 0) / oldScores.length;
    expect(avgYoung).toBeGreaterThan(avgOld);
  });

  it("penalizes injured players", () => {
    const healthyScores = Array.from({ length: 100 }, () => generateDurabilityScore(25, null));
    const injuredScores = Array.from({ length: 100 }, () => generateDurabilityScore(25, "Hamstring"));
    const avgHealthy = healthyScores.reduce((a, b) => a + b, 0) / healthyScores.length;
    const avgInjured = injuredScores.reduce((a, b) => a + b, 0) / injuredScores.length;
    expect(avgHealthy).toBeGreaterThan(avgInjured);
  });
});

describe("generateInjuryRiskScore", () => {
  it("returns value between 0 and 1", () => {
    for (let i = 0; i < 50; i++) {
      const score = generateInjuryRiskScore(0.85, 25, null);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1.0);
    }
  });

  it("inversely correlates with durability", () => {
    const highDurRisk = Array.from({ length: 100 }, () => generateInjuryRiskScore(0.95, 25, null));
    const lowDurRisk = Array.from({ length: 100 }, () => generateInjuryRiskScore(0.5, 25, null));
    const avgHighDur = highDurRisk.reduce((a, b) => a + b, 0) / highDurRisk.length;
    const avgLowDur = lowDurRisk.reduce((a, b) => a + b, 0) / lowDurRisk.length;
    expect(avgLowDur).toBeGreaterThan(avgHighDur);
  });

  it("increases for injured players", () => {
    const healthy = Array.from({ length: 100 }, () => generateInjuryRiskScore(0.8, 25, null));
    const injured = Array.from({ length: 100 }, () => generateInjuryRiskScore(0.8, 25, "ACL"));
    const avgHealthy = healthy.reduce((a, b) => a + b, 0) / healthy.length;
    const avgInjured = injured.reduce((a, b) => a + b, 0) / injured.length;
    expect(avgInjured).toBeGreaterThan(avgHealthy);
  });
});

describe("buildWeightConfig", () => {
  it("returns defaults when no DB weights provided", () => {
    const config = buildWeightConfig([]);
    expect(config.bayesian_last2_weight).toBe(0.6);
    expect(config.captain_threshold).toBe(120);
  });

  it("overrides specific weights from DB", () => {
    const dbWeights = [
      { id: 1, key: "captain_threshold", value: 130, description: null, category: "captain" },
      { id: 2, key: "bayesian_last2_weight", value: 0.7, description: null, category: "projection" },
    ];
    const config = buildWeightConfig(dbWeights);
    expect(config.captain_threshold).toBe(130);
    expect(config.bayesian_last2_weight).toBe(0.7);
    expect(config.floor_sigma_multiplier).toBe(1.0);
  });

  it("ignores unknown keys", () => {
    const dbWeights = [
      { id: 1, key: "unknown_key", value: 999, description: null, category: "other" },
    ];
    const config = buildWeightConfig(dbWeights);
    expect((config as any).unknown_key).toBeUndefined();
  });
});
