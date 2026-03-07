import { db } from "./db";
import { players, modelWeights } from "@shared/schema";
import { eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildWeightConfig,
  getDefaultWeightEntries,
  getCachedWeights,
  calcConsistencyRating,
  calcVolatilityScore,
  calcProjectedFloor,
  calcProjectedCeiling,
  calcCaptainProbability,
  bayesianAdjustedAvg,
  calcBlendedProjection,
  calcMultiplierProjection,
  classifyCashGeneration,
  isDebutantCandidate,
  generateRecentScores,
  generateAge,
  generateYearsExperience,
  generateDurabilityScore,
  generateInjuryRiskScore,
  calcTradeEV,
  calcBreakoutScore,
  calcTagRisk,
  calcIsExpectedTagger,
} from "./services/projection-engine";

interface RealPlayer {
  name: string;
  team: string;
  salary: number;
  owned: number;
  position: string;
  dualPosition: string | null;
  games: number;
  avgPoints: number;
  maxScore: number;
  cbaPercent: number;
  ppm: number;
  regAvg: number;
  l5Avg: number;
  prev2024: number;
  prev2023: number;
}

const BYE_ROUNDS: Record<string, number> = {
  "Adelaide": 12, "Brisbane Lions": 15, "Carlton": 13, "Collingwood": 13,
  "Essendon": 13, "Fremantle": 15, "Geelong": 14, "Gold Coast": 12,
  "GWS Giants": 13, "Hawthorn": 14, "Melbourne": 13, "North Melbourne": 12,
  "Port Adelaide": 12, "Richmond": 13, "St Kilda": 12, "Sydney": 15,
  "West Coast": 15, "Western Bulldogs": 14,
};

const TEAM_VENUES: Record<string, string> = {
  "Adelaide": "Adelaide Oval", "Brisbane Lions": "The Gabba", "Carlton": "MCG",
  "Collingwood": "MCG", "Essendon": "Marvel Stadium", "Fremantle": "Optus Stadium",
  "Geelong": "GMHBA Stadium", "Gold Coast": "People First Stadium",
  "GWS Giants": "GIANTS Stadium", "Hawthorn": "MCG", "Melbourne": "MCG",
  "North Melbourne": "Marvel Stadium", "Port Adelaide": "Adelaide Oval",
  "Richmond": "MCG", "St Kilda": "Marvel Stadium", "Sydney": "SCG",
  "West Coast": "Optus Stadium", "Western Bulldogs": "Marvel Stadium",
};

interface AflFantasyPlayer {
  id: number;
  first_name: string;
  last_name: string;
  squad_id: number;
}

const AFL_FANTASY_SQUAD_MAP: Record<number, string> = {
  10: "Adelaide", 20: "Brisbane Lions", 30: "Carlton", 40: "Collingwood",
  50: "Essendon", 60: "Fremantle", 70: "Geelong", 1000: "Gold Coast",
  1010: "GWS Giants", 80: "Hawthorn", 90: "Melbourne", 100: "North Melbourne",
  110: "Port Adelaide", 120: "Richmond", 130: "St Kilda", 160: "Sydney",
  150: "West Coast", 140: "Western Bulldogs",
};

export function loadRealPlayers(): RealPlayer[] {
  const filePath = join(process.cwd(), "server", "real-players-2026.json");
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function normalizeNameForMatch(name: string): string {
  return name.toLowerCase().replace(/[''`\-]/g, "").replace(/\s+/g, " ").trim();
}

export async function syncAflFantasyIds(): Promise<number> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch("https://fantasy.afl.com.au/data/afl/players.json", {
      headers: { "Accept-Encoding": "gzip, deflate" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.log(`[AflFantasySync] API returned ${res.status}, skipping photo sync`);
      return 0;
    }
    const aflPlayers: AflFantasyPlayer[] = await res.json();
    console.log(`[AflFantasySync] Fetched ${aflPlayers.length} players from AFL Fantasy API`);

    const dbPlayers = await db.select({ id: players.id, name: players.name, team: players.team, aflFantasyId: players.aflFantasyId }).from(players);
    const playersNeedingId = dbPlayers.filter(p => !p.aflFantasyId);

    if (playersNeedingId.length === 0) {
      console.log(`[AflFantasySync] All ${dbPlayers.length} players already have AFL Fantasy IDs`);
      return 0;
    }

    const aflByNameTeam = new Map<string, number>();
    const aflByName = new Map<string, number>();
    for (const ap of aflPlayers) {
      const fullName = `${ap.first_name} ${ap.last_name}`;
      const normName = normalizeNameForMatch(fullName);
      const team = AFL_FANTASY_SQUAD_MAP[ap.squad_id] || "";
      aflByNameTeam.set(`${normName}|${team}`, ap.id);
      if (!aflByName.has(normName)) {
        aflByName.set(normName, ap.id);
      }
    }

    let matched = 0;
    for (const dbPlayer of playersNeedingId) {
      const normName = normalizeNameForMatch(dbPlayer.name);
      let aflId = aflByNameTeam.get(`${normName}|${dbPlayer.team}`);
      if (!aflId) {
        aflId = aflByName.get(normName);
      }
      if (aflId) {
        await db.update(players).set({ aflFantasyId: aflId }).where(eq(players.id, dbPlayer.id));
        matched++;
      }
    }

    console.log(`[AflFantasySync] Matched ${matched}/${playersNeedingId.length} players with AFL Fantasy IDs`);
    return matched;
  } catch (err: any) {
    console.log(`[AflFantasySync] Failed to fetch AFL Fantasy API: ${err.message}`);
    return 0;
  }
}

function deriveFormTrend(l5Avg: number, regAvg: number): string {
  const diff = l5Avg - regAvg;
  if (diff > 3) return "up";
  if (diff < -3) return "down";
  return "stable";
}

function deriveBreakEven(salary: number, avgPoints: number): number {
  const salaryPerPoint = salary / Math.max(avgPoints, 1);
  const leagueAvgSPP = 5500;
  return Math.round(salary / leagueAvgSPP);
}

function deriveLast3Avg(avgPoints: number, l5Avg: number): number {
  const diff = l5Avg - avgPoints;
  return Math.round((l5Avg + diff * 0.6) * 10) / 10;
}

export async function expandPlayerDatabase(): Promise<number> {
  const existingPlayers = await db.select().from(players);
  const existingNames = new Set(existingPlayers.map(p => p.name));

  const realPlayers = loadRealPlayers();
  const realPlayerMap = new Map(realPlayers.map(rp => [rp.name, rp]));

  let reconciled = 0;
  for (const existing of existingPlayers) {
    const real = realPlayerMap.get(existing.name);
    if (!real) continue;
    if (existing.price !== real.salary || existing.avgScore !== real.avgPoints || existing.startingPrice !== real.salary) {
      const l3Avg = deriveLast3Avg(real.avgPoints, real.l5Avg);
      const formTrend = deriveFormTrend(real.l5Avg, real.regAvg);
      const breakEven = deriveBreakEven(real.salary, real.avgPoints);
      const byeRound = BYE_ROUNDS[real.team] || 12;
      await db.update(players)
        .set({
          price: real.salary,
          startingPrice: real.salary,
          avgScore: real.avgPoints,
          last3Avg: l3Avg,
          last5Avg: real.l5Avg,
          seasonTotal: Math.round(real.avgPoints * real.games),
          gamesPlayed: real.games,
          ownedByPercent: real.owned,
          formTrend,
          projectedScore: real.regAvg,
          breakEven,
          ceilingScore: Math.round(real.maxScore),
          byeRound,
          position: real.position,
          dualPosition: real.dualPosition || null,
          team: real.team,
        })
        .where(eq(players.id, existing.id));
      reconciled++;
    }
  }
  if (reconciled > 0) {
    console.log(`[ExpandPlayers] Reconciled ${reconciled} players with real-players-2026.json data`);
  }

  const newPlayers = realPlayers.filter(p => !existingNames.has(p.name));

  if (newPlayers.length === 0 && reconciled === 0) {
    console.log(`[ExpandPlayers] All ${realPlayers.length} real players already in database (${existingPlayers.length} total)`);
    return 0;
  }
  if (newPlayers.length === 0) {
    return reconciled;
  }

  let added = 0;
  for (const rp of newPlayers) {
    const l3Avg = deriveLast3Avg(rp.avgPoints, rp.l5Avg);
    const formTrend = deriveFormTrend(rp.l5Avg, rp.regAvg);
    const breakEven = deriveBreakEven(rp.salary, rp.avgPoints);
    const byeRound = BYE_ROUNDS[rp.team] || 12;
    const venue = TEAM_VENUES[rp.team] || "TBC";

    await db.insert(players).values({
      name: rp.name,
      team: rp.team,
      position: rp.position,
      dualPosition: rp.dualPosition || null,
      price: rp.salary,
      startingPrice: rp.salary,
      avgScore: rp.avgPoints,
      last3Avg: l3Avg,
      last5Avg: rp.l5Avg,
      seasonTotal: Math.round(rp.avgPoints * rp.games),
      gamesPlayed: rp.games,
      ownedByPercent: rp.owned,
      formTrend,
      nextOpponent: null,
      byeRound,
      venue,
      gameTime: null,
      projectedScore: rp.regAvg,
      priceChange: 0,
      breakEven,
      ceilingScore: Math.round(rp.maxScore),
    });
    added++;
  }

  console.log(`[ExpandPlayers] Added ${added} players from real-players-2026.json (${existingPlayers.length + added} total)`);
  return added;
}

export async function seedModelWeights(): Promise<void> {
  const existing = await db.select().from(modelWeights);
  if (existing.length > 0) {
    buildWeightConfig(existing);
    console.log(`[ModelWeights] Loaded ${existing.length} weights from database`);
    return;
  }

  const defaults = getDefaultWeightEntries();
  for (const entry of defaults) {
    await db.insert(modelWeights).values(entry);
  }
  const loaded = await db.select().from(modelWeights);
  buildWeightConfig(loaded);
  console.log(`[ModelWeights] Seeded ${defaults.length} default weights`);
}

export async function populateConsistencyData(): Promise<number> {
  const allPlayers = await db.select().from(players);
  const w = getCachedWeights();

  const needsUpdate = allPlayers.filter(p => p.consistencyRating === null);
  const needsDebutReeval = allPlayers.filter(p =>
    p.consistencyRating !== null && !p.isDebutant && p.price <= 250000
  );

  for (const p of needsDebutReeval) {
    const { isCandidate, probability } = isDebutantCandidate(p.price, w);
    if (isCandidate && Math.random() < probability) {
      const debutRound = Math.floor(Math.random() * 10) + 1;
      const avg = p.avgScore || 0;
      const be = p.breakEven || 0;
      const cashGenPotential = p.price <= 300000 && avg > 0 ? classifyCashGeneration(avg, be, w) : null;
      await db.update(players)
        .set({ isDebutant: true, debutRound, cashGenPotential })
        .where(eq(players.id, p.id));
    }
  }

  const { positionConcessions: pcTable } = await import("@shared/schema");
  const concessions = await db.select().from(pcTable);
  const concessionMap = new Map<string, number>();
  const positionTotals: Record<string, { sum: number; count: number }> = {};
  for (const c of concessions) {
    concessionMap.set(`${c.team}:${c.position}`, c.avgPointsConceded || 0);
    if (!positionTotals[c.position]) positionTotals[c.position] = { sum: 0, count: 0 };
    positionTotals[c.position].sum += c.avgPointsConceded || 0;
    positionTotals[c.position].count++;
  }
  const leagueAvgByPos: Record<string, number> = {};
  for (const [pos, totals] of Object.entries(positionTotals)) {
    leagueAvgByPos[pos] = totals.count > 0 ? totals.sum / totals.count : 80;
  }

  const needsAdvancedUpdate = allPlayers.filter(p => p.volatilityScore === null || p.captainProbability === null);
  for (const p of needsAdvancedUpdate) {
    const avg = p.avgScore || 50;
    const stdDev = p.scoreStdDev || 15;
    const proj = p.projectedScore || avg;
    const bayesianProj = bayesianAdjustedAvg(p.last3Avg || avg, p.last5Avg || avg, avg, w);
    const blendedProj = calcBlendedProjection(proj, bayesianProj, w);

    const opponentConceded = p.nextOpponent ? (concessionMap.get(`${p.nextOpponent}:${p.position}`) ?? null) : null;
    const leagueAvg = leagueAvgByPos[p.position] ?? null;
    const { adjustedScore: adjustedProj } = calcMultiplierProjection(
      blendedProj, avg, p.last3Avg, p.last5Avg, opponentConceded, leagueAvg
    );

    const volatility = calcVolatilityScore(stdDev, avg, w);
    const floor = calcProjectedFloor(adjustedProj, stdDev, w);
    const ceiling = calcProjectedCeiling(adjustedProj, stdDev, w);
    const captainProb = calcCaptainProbability(adjustedProj, stdDev, w);

    const age = p.age || generateAge(p.price, avg);
    const yearsExperience = p.yearsExperience || generateYearsExperience(age);
    const durabilityScore = p.durabilityScore || generateDurabilityScore(age, p.injuryStatus);
    const injuryRiskScore = p.injuryRiskScore || generateInjuryRiskScore(durabilityScore, age, p.injuryStatus);
    const startingPrice = p.startingPrice || p.price;

    await db.update(players)
      .set({
        projectedScore: adjustedProj,
        projectedFloor: floor,
        ceilingScore: ceiling,
        volatilityScore: volatility,
        captainProbability: captainProb,
        age,
        yearsExperience,
        durabilityScore,
        injuryRiskScore,
        startingPrice,
      })
      .where(eq(players.id, p.id));
  }

  const allPlayersForBreakout = await db.select().from(players);
  let breakoutUpdated = 0;
  for (const p of allPlayersForBreakout) {
    const bScore = calcBreakoutScore({
      formTrend: p.formTrend,
      last3Avg: p.last3Avg || 0,
      avgScore: p.avgScore || 0,
      age: p.age,
    });
    if (bScore !== p.breakoutScore) {
      await db.update(players).set({ breakoutScore: bScore }).where(eq(players.id, p.id));
      breakoutUpdated++;
    }
  }
  if (breakoutUpdated > 0) {
    console.log(`[ExpandPlayers] Updated breakout scores for ${breakoutUpdated} players`);
  }

  let tagUpdated = 0;
  for (const p of allPlayersForBreakout) {
    const tagInput = {
      avgScore: p.avgScore || 0,
      position: p.position,
      dualPosition: p.dualPosition,
      ownedByPercent: p.ownedByPercent || 0,
      captainProbability: p.captainProbability,
      price: p.price,
      last3Avg: p.last3Avg || 0,
      formTrend: p.formTrend,
    };
    const tRisk = calcTagRisk(tagInput);
    const isTagger = calcIsExpectedTagger(tagInput);
    if (tRisk !== p.tagRisk || isTagger !== p.isExpectedTagger) {
      await db.update(players).set({ tagRisk: tRisk, isExpectedTagger: isTagger }).where(eq(players.id, p.id));
      tagUpdated++;
    }
  }
  if (tagUpdated > 0) {
    console.log(`[ExpandPlayers] Updated tag risk/tagger data for ${tagUpdated} players`);
  }

  if (needsUpdate.length === 0) {
    if (needsAdvancedUpdate.length > 0) {
      console.log(`[ExpandPlayers] Updated advanced metrics for ${needsAdvancedUpdate.length} players`);
    }
    return needsDebutReeval.length > 0 ? needsDebutReeval.length : needsAdvancedUpdate.length;
  }

  let updated = 0;
  for (const p of needsUpdate) {
    const avg = p.avgScore || 50;
    const price = p.price;

    let baseStdDev: number;
    if (avg >= 100) baseStdDev = 8 + Math.random() * 18;
    else if (avg >= 80) baseStdDev = 10 + Math.random() * 20;
    else if (avg >= 60) baseStdDev = 12 + Math.random() * 22;
    else baseStdDev = 15 + Math.random() * 25;

    if (Math.random() < 0.15) baseStdDev *= 0.5;
    if (Math.random() < 0.1) baseStdDev *= 1.6;

    const scores = generateRecentScores(avg, baseStdDev);
    const consistencyRating = calcConsistencyRating(scores, avg, w);
    const actualStdDev = Math.round(Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length) * 10) / 10;

    const { isCandidate, probability } = isDebutantCandidate(price, w);
    const isDebutant = isCandidate && Math.random() < probability;
    const debutRound = isDebutant ? Math.floor(Math.random() * 10) + 1 : null;

    const be = p.breakEven || 0;
    const cashGenPotential = price <= 300000 && avg > 0 ? classifyCashGeneration(avg, be, w) : null;

    const proj = p.projectedScore || avg;
    const bayesianProj = bayesianAdjustedAvg(p.last3Avg || avg, p.last5Avg || avg, avg, w);
    const blendedProj = calcBlendedProjection(proj, bayesianProj, w);

    const opponentConceded = p.nextOpponent ? (concessionMap.get(`${p.nextOpponent}:${p.position}`) ?? null) : null;
    const leagueAvg = leagueAvgByPos[p.position] ?? null;
    const { adjustedScore: adjustedProj } = calcMultiplierProjection(
      blendedProj, avg, p.last3Avg, p.last5Avg, opponentConceded, leagueAvg
    );

    const volatility = calcVolatilityScore(actualStdDev, avg, w);
    const floor = calcProjectedFloor(adjustedProj, actualStdDev, w);
    const ceiling = calcProjectedCeiling(adjustedProj, actualStdDev, w);
    const captainProb = calcCaptainProbability(adjustedProj, actualStdDev, w);

    const age = generateAge(price, avg);
    const yearsExperience = generateYearsExperience(age);
    const durabilityScore = generateDurabilityScore(age, p.injuryStatus);
    const injuryRiskScore = generateInjuryRiskScore(durabilityScore, age, p.injuryStatus);

    await db.update(players)
      .set({
        consistencyRating,
        scoreStdDev: actualStdDev,
        recentScores: scores.join(','),
        isDebutant,
        debutRound,
        cashGenPotential,
        projectedScore: adjustedProj,
        projectedFloor: floor,
        ceilingScore: ceiling,
        volatilityScore: volatility,
        captainProbability: captainProb,
        age,
        yearsExperience,
        durabilityScore,
        injuryRiskScore,
        startingPrice: price,
      })
      .where(eq(players.id, p.id));
    updated++;
  }

  console.log(`[ExpandPlayers] Populated consistency + advanced data for ${updated} players`);

  return updated;
}

const AFL_TEAMS = [
  "Adelaide", "Brisbane Lions", "Carlton", "Collingwood", "Essendon",
  "Fremantle", "Geelong", "Gold Coast", "GWS Giants", "Hawthorn",
  "Melbourne", "North Melbourne", "Port Adelaide", "Richmond",
  "St Kilda", "Sydney", "West Coast", "Western Bulldogs"
];
const POSITIONS = ["DEF", "MID", "RUC", "FWD"];

export async function populateBaselineData(): Promise<void> {
  const { positionConcessions, teamContext } = await import("@shared/schema");

  const existingPC = await db.select().from(positionConcessions);
  if (existingPC.length === 0) {
    for (const team of AFL_TEAMS) {
      for (const pos of POSITIONS) {
        const base = pos === "MID" ? 85 : pos === "DEF" ? 78 : pos === "RUC" ? 90 : 75;
        const avgConceded = base + (Math.random() * 20 - 10);
        const stdDev = 12 + Math.random() * 10;
        await db.insert(positionConcessions).values({
          team,
          position: pos,
          avgPointsConceded: Math.round(avgConceded * 10) / 10,
          stdDevConceded: Math.round(stdDev * 10) / 10,
        });
      }
    }
    console.log(`[ExpandPlayers] Populated position concessions for ${AFL_TEAMS.length} teams`);
  }

  const existingTC = await db.select().from(teamContext);
  if (existingTC.length === 0) {
    for (const team of AFL_TEAMS) {
      const disposals = 350 + Math.floor(Math.random() * 80);
      const clearances = 30 + Math.floor(Math.random() * 15);
      const contestedRate = 0.3 + Math.random() * 0.15;
      const pace = 0.85 + Math.random() * 0.3;
      const scored = 1400 + Math.floor(Math.random() * 400);
      const conceded = 1400 + Math.floor(Math.random() * 400);
      await db.insert(teamContext).values({
        team,
        round: 1,
        disposalCount: disposals,
        clearanceCount: clearances,
        contestedPossessionRate: Math.round(contestedRate * 100) / 100,
        paceFactor: Math.round(pace * 100) / 100,
        fantasyPointsScored: scored,
        fantasyPointsConceded: conceded,
      });
    }
    console.log(`[ExpandPlayers] Populated team context for ${AFL_TEAMS.length} teams`);
  }
}

export { calcTradeEV, calcCaptainProbability, bayesianAdjustedAvg, calcVolatilityScore };
