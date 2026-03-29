import { db } from "./db";
import { players, modelWeights, weeklyStats, leagueSettings } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
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

export interface StandardPlayerUpdate {
  playerId?: number;
  aflFantasyId?: number;
  name: string;
  team?: string;
  position?: string;
  dualPosition?: string | null;
  price?: number;
  avgScore?: number;
  last3Avg?: number;
  last5Avg?: number;
  gamesPlayed?: number;
  ownedByPercent?: number;
  ppm?: number;
  cbaPercent?: number;
  maxScore?: number;
  breakEven?: number;
  source: string;
}

function logSyncError(source: string, context: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[${source}] ${context}: ${msg}`);
}

function logSyncResult(source: string, updated: number, added: number, extra?: string): void {
  const parts = [`Updated ${updated} players`];
  if (added > 0) parts.push(`added ${added} new players`);
  if (extra) parts.push(extra);
  console.log(`[${source}] ${parts.join(", ")}`);
}

function logSyncFieldWarning(source: string, playerName: string, field: string, value: unknown): void {
  console.warn(`[${source}] ${playerName}: unexpected ${field} value: ${JSON.stringify(value)}`);
}

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

const DFS_TEAM_MAP: Record<string, string> = {
  "ADE": "Adelaide", "BRL": "Brisbane Lions", "CAR": "Carlton", "COL": "Collingwood",
  "ESS": "Essendon", "FRE": "Fremantle", "GEE": "Geelong", "GCS": "Gold Coast",
  "GWS": "GWS Giants", "HAW": "Hawthorn", "MEL": "Melbourne", "NTH": "North Melbourne",
  "PTA": "Port Adelaide", "RIC": "Richmond", "STK": "St Kilda", "SYD": "Sydney",
  "WCE": "West Coast", "WBD": "Western Bulldogs",
};

function parseDfsPosition(pos: string): { primary: string; dual: string | null } {
  if (!pos) return { primary: "MID", dual: null };
  const parts = pos.split("/").map(p => p.trim().toUpperCase());
  const validPositions = ["DEF", "MID", "RUC", "FWD"];
  const primary = validPositions.includes(parts[0]) ? parts[0] : "MID";
  const dual = parts.length > 1 && validPositions.includes(parts[1]) ? parts[1] : null;
  return { primary, dual };
}

interface AflFantasyPlayer {
  id: number;
  first_name: string;
  last_name: string;
  squad_id: number;
  cost: number;
  status: string;
  positions: number[];
  dob?: string;
  stats: {
    prices?: Record<string, number>;
    scores?: Record<string, number>;
    games_played?: number;
    total_points?: number;
    avg_points?: number;
    last_3_avg?: number;
    last_5_avg?: number;
    owned_by?: number;
    high_score?: number;
    low_score?: number;
    career_avg?: number;
    tog?: number;
    proj_avg?: number;
  };
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

async function fetchAflFantasyPlayers(): Promise<AflFantasyPlayer[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const res = await fetch("https://fantasy.afl.com.au/data/afl/players.json", {
    headers: { "Accept-Encoding": "gzip, deflate" },
    signal: controller.signal,
  });
  clearTimeout(timeout);
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const data: AflFantasyPlayer[] = await res.json();
  return data;
}

function normalizeSurname(name: string): string {
  const parts = name.toLowerCase().replace(/[''`\-]/g, "").replace(/\s+/g, " ").trim().split(" ");
  return parts[parts.length - 1];
}

function stripSuffix(name: string): string {
  return name.replace(/\s+(jr|sr|ii|iii|iv|jnr|snr)\.?$/i, "").trim();
}

export async function syncAflFantasyIds(): Promise<number> {
  try {
    const aflPlayers = await fetchAflFantasyPlayers();
    console.log(`[AflFantasySync] Fetched ${aflPlayers.length} players from AFL Fantasy API`);

    const dbPlayers = await db.select({ id: players.id, name: players.name, team: players.team, aflFantasyId: players.aflFantasyId }).from(players);
    const playersNeedingId = dbPlayers.filter(p => !p.aflFantasyId);

    if (playersNeedingId.length === 0) {
      console.log(`[AflFantasySync] All ${dbPlayers.length} players already have AFL Fantasy IDs`);
      return 0;
    }

    const aflByNameTeam = new Map<string, number>();
    const aflByName = new Map<string, number>();
    const aflBySurnameTeam = new Map<string, { id: number; fullName: string }[]>();
    for (const ap of aflPlayers) {
      const fullName = `${ap.first_name} ${ap.last_name}`;
      const normName = normalizeNameForMatch(fullName);
      const team = AFL_FANTASY_SQUAD_MAP[ap.squad_id] || "";
      aflByNameTeam.set(`${normName}|${team}`, ap.id);
      if (!aflByName.has(normName)) {
        aflByName.set(normName, ap.id);
      }
      const surname = normalizeSurname(fullName);
      const surnameKey = `${surname}|${team}`;
      if (!aflBySurnameTeam.has(surnameKey)) aflBySurnameTeam.set(surnameKey, []);
      aflBySurnameTeam.get(surnameKey)!.push({ id: ap.id, fullName: normName });
    }

    let matched = 0;
    const unmatched: string[] = [];
    for (const dbPlayer of playersNeedingId) {
      const normName = normalizeNameForMatch(dbPlayer.name);
      let aflId = aflByNameTeam.get(`${normName}|${dbPlayer.team}`);

      if (!aflId) {
        const strippedName = normalizeNameForMatch(stripSuffix(dbPlayer.name));
        aflId = aflByNameTeam.get(`${strippedName}|${dbPlayer.team}`) || aflByName.get(strippedName);
      }

      if (!aflId) {
        aflId = aflByName.get(normName);
      }

      if (!aflId) {
        const surname = normalizeSurname(dbPlayer.name);
        const dbFirst = normalizeNameForMatch(dbPlayer.name).split(" ")[0];
        const surnameMatches = aflBySurnameTeam.get(`${surname}|${dbPlayer.team}`);
        if (surnameMatches && surnameMatches.length === 1) {
          const aflFirst = surnameMatches[0].fullName.split(" ")[0];
          if (aflFirst[0] === dbFirst[0]) {
            aflId = surnameMatches[0].id;
          }
        }
      }

      if (aflId) {
        await db.update(players).set({ aflFantasyId: aflId }).where(eq(players.id, dbPlayer.id));
        matched++;
      } else {
        unmatched.push(`${dbPlayer.name} (${dbPlayer.team})`);
      }
    }

    console.log(`[AflFantasySync] Matched ${matched}/${playersNeedingId.length} players with AFL Fantasy IDs`);
    if (unmatched.length > 0 && unmatched.length <= 30) {
      console.log(`[AflFantasySync] Unmatched: ${unmatched.join(", ")}`);
    } else if (unmatched.length > 30) {
      console.log(`[AflFantasySync] ${unmatched.length} unmatched players (not in AFL Fantasy)`);
    }
    return matched;
  } catch (err: any) {
    console.log(`[AflFantasySync] Failed to fetch AFL Fantasy API: ${err.message}`);
    return 0;
  }
}

const AFL_FANTASY_POSITION_MAP: Record<number, string> = {
  1: "DEF", 2: "MID", 3: "RUC", 4: "FWD",
};

export async function syncAflFantasyPrices(): Promise<{
  updated: number;
  added: number;
  priceChanges: Array<{ name: string; oldPrice: number; newPrice: number }>;
}> {
  const aflPlayers = await fetchAflFantasyPlayers();
  console.log(`[AflPriceSync] Fetched ${aflPlayers.length} players from AFL Fantasy API`);

  const aflById = new Map<number, AflFantasyPlayer>();
  const aflByName = new Map<string, AflFantasyPlayer>();
  for (const ap of aflPlayers) {
    aflById.set(ap.id, ap);
    const fullName = `${ap.first_name} ${ap.last_name}`;
    aflByName.set(normalizeNameForMatch(fullName), ap);
  }

  const dbPlayers = await db.select().from(players);
  const dbByAflId = new Map<number, boolean>();
  const dbByNormName = new Map<string, boolean>();
  for (const p of dbPlayers) {
    if (p.aflFantasyId) dbByAflId.set(p.aflFantasyId, true);
    dbByNormName.set(normalizeNameForMatch(p.name), true);
  }

  const maxRoundsInApi = Math.max(...aflPlayers.map(p => {
    const priceKeys = p.stats.prices ? Object.keys(p.stats.prices).map(Number) : [];
    return priceKeys.length;
  }));
  const settingsRow = await db.select().from(leagueSettings).limit(1);
  const currentRound = settingsRow[0]?.currentRound || 1;
  const isStaleSeasonData = maxRoundsInApi > currentRound + 3;
  if (isStaleSeasonData) {
    console.log(`[AflPriceSync] API has ${maxRoundsInApi} rounds of prices but current round is ${currentRound} — stale season data. Skipping price/stats updates.`);
  }

  let updated = 0;
  const priceChanges: Array<{ name: string; oldPrice: number; newPrice: number }> = [];

  for (const dbPlayer of dbPlayers) {
    let aflPlayer: AflFantasyPlayer | undefined;

    if (dbPlayer.aflFantasyId) {
      aflPlayer = aflById.get(dbPlayer.aflFantasyId);
    }
    if (!aflPlayer) {
      aflPlayer = aflByName.get(normalizeNameForMatch(dbPlayer.name));
    }

    if (aflPlayer && aflPlayer.cost > 0) {
      const updates: Record<string, any> = {};

      if (!isStaleSeasonData && Math.abs(aflPlayer.cost - dbPlayer.price) >= 1000) {
        updates.price = aflPlayer.cost;
        priceChanges.push({
          name: dbPlayer.name,
          oldPrice: dbPlayer.price,
          newPrice: aflPlayer.cost,
        });
      }

      if (!isStaleSeasonData) {
        const priceValues = aflPlayer.stats.prices ? Object.values(aflPlayer.stats.prices) : [];
        const hasVaryingPrices = new Set(priceValues).size > 1;
        const rd1Price = aflPlayer.stats.prices?.["1"];
        if (hasVaryingPrices && rd1Price && rd1Price > 0 && dbPlayer.startingPrice !== rd1Price) {
          updates.startingPrice = rd1Price;
        } else if (!dbPlayer.startingPrice) {
          updates.startingPrice = aflPlayer.cost;
        }
      } else if (!dbPlayer.startingPrice) {
        updates.startingPrice = aflPlayer.cost;
      }

      if (!dbPlayer.aflFantasyId && aflPlayer.id) {
        updates.aflFantasyId = aflPlayer.id;
      }

      if (aflPlayer.dob) {
        const dob = new Date(aflPlayer.dob);
        if (!isNaN(dob.getTime())) {
          const now = new Date();
          let calcAge = now.getFullYear() - dob.getFullYear();
          const mDiff = now.getMonth() - dob.getMonth();
          if (mDiff < 0 || (mDiff === 0 && now.getDate() < dob.getDate())) calcAge--;
          if (calcAge > 0 && calcAge !== dbPlayer.age) {
            updates.age = calcAge;
          }
        }
      }

      if (!isStaleSeasonData) {
        const s = aflPlayer.stats;
        if (s.games_played !== undefined && s.games_played > 0 && s.games_played !== dbPlayer.gamesPlayed) {
          updates.gamesPlayed = s.games_played;
        }
        if (s.avg_points !== undefined && s.avg_points > 0 && Math.abs(s.avg_points - (dbPlayer.avgScore || 0)) >= 0.5) {
          updates.avgScore = s.avg_points;
        }
        if (s.total_points !== undefined && s.total_points > 0 && s.total_points !== dbPlayer.seasonTotal) {
          updates.seasonTotal = s.total_points;
        }
        if (s.last_3_avg !== undefined && s.last_3_avg > 0 && s.last_3_avg !== (dbPlayer.last3Avg || 0)) {
          updates.last3Avg = s.last_3_avg;
        }
        if (s.last_5_avg !== undefined && s.last_5_avg > 0 && s.last_5_avg !== (dbPlayer.last5Avg || 0)) {
          updates.last5Avg = s.last_5_avg;
        }
        if (s.owned_by !== undefined && s.owned_by > 0 && Math.abs(s.owned_by - (dbPlayer.ownedByPercent || 0)) >= 0.1) {
          updates.ownedByPercent = s.owned_by;
        }
        if (s.high_score !== undefined && s.high_score > 0) {
          updates.ceilingScore = s.high_score;
        }
        if (s.tog !== undefined && s.tog > 0 && s.tog !== (dbPlayer.avgTog || 0)) {
          updates.avgTog = s.tog;
        }

        if (s.scores && Object.keys(s.scores).length > 0) {
          const roundKeys = Object.keys(s.scores).map(Number).sort((a, b) => a - b);
          const recentRounds = roundKeys.slice(-5);
          const recentScoresStr = recentRounds.map(r => s.scores![String(r)]).join(",");
          if (recentScoresStr && recentScoresStr !== (dbPlayer.recentScores || "")) {
            updates.recentScores = recentScoresStr;
          }
        }

        const currentPrice = updates.price || dbPlayer.price;
        const prevRoundPrices = aflPlayer.stats.prices ? Object.entries(aflPlayer.stats.prices) : [];
        if (prevRoundPrices.length >= 2) {
          const sorted = prevRoundPrices.map(([r, p]) => ({ r: Number(r), p })).sort((a, b) => a.r - b.r);
          const prevPrice = sorted[sorted.length - 2]?.p;
          if (prevPrice) {
            const roundChange = currentPrice - prevPrice;
            if (roundChange !== dbPlayer.priceChange) {
              updates.priceChange = roundChange;
            }
          }
        }
      }

      const aflTeam = AFL_FANTASY_SQUAD_MAP[aflPlayer.squad_id] || "";
      if (aflTeam && aflTeam !== dbPlayer.team) {
        updates.team = aflTeam;
        updates.byeRound = BYE_ROUNDS[aflTeam] || dbPlayer.byeRound;
        updates.venue = TEAM_VENUES[aflTeam] || dbPlayer.venue;
        console.log(`[AflPriceSync] Team change: ${dbPlayer.name} ${dbPlayer.team} → ${aflTeam}`);
      }

      const aflPrimaryPos = aflPlayer.positions.length > 0 ? (AFL_FANTASY_POSITION_MAP[aflPlayer.positions[0]] || null) : null;
      const aflDualPos = aflPlayer.positions.length > 1 ? (AFL_FANTASY_POSITION_MAP[aflPlayer.positions[1]] || null) : null;
      if (aflPrimaryPos && aflPrimaryPos !== dbPlayer.position) {
        updates.position = aflPrimaryPos;
      }
      if (aflDualPos !== (dbPlayer.dualPosition || null)) {
        updates.dualPosition = aflDualPos;
      }

      const aflStatus = aflPlayer.status;
      if (aflStatus === "injured") {
        if (!dbPlayer.injuryStatus || dbPlayer.injuryStatus === "") {
          updates.injuryStatus = "Injured";
        }
        updates.selectionStatus = "injured";
        updates.isNamedTeam = false;
      } else if (aflStatus === "not-playing") {
        if (dbPlayer.injuryStatus && dbPlayer.selectionStatus === "injured") {
          updates.injuryStatus = null;
        }
        updates.selectionStatus = "not-playing";
        updates.isNamedTeam = false;
      } else if (aflStatus === "playing") {
        if (!dbPlayer.injuryStatus) {
          updates.selectionStatus = "named";
          updates.isNamedTeam = true;
        }
      } else if (aflStatus === "medical_sub") {
        updates.selectionStatus = "medical_sub";
        updates.isNamedTeam = true;
        if (dbPlayer.injuryStatus) {
          updates.injuryStatus = null;
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.update(players).set(updates).where(eq(players.id, dbPlayer.id));
        updated++;
      }
    }
  }

  let added = 0;
  const newAflPlayers = aflPlayers.filter(ap => {
    if (ap.cost <= 0) return false;
    if (dbByAflId.has(ap.id)) return false;
    const normName = normalizeNameForMatch(`${ap.first_name} ${ap.last_name}`);
    if (dbByNormName.has(normName)) return false;
    return true;
  });

  for (const ap of newAflPlayers) {
    const fullName = `${ap.first_name} ${ap.last_name}`;
    const team = AFL_FANTASY_SQUAD_MAP[ap.squad_id] || "Unknown";
    const primaryPos = ap.positions.length > 0 ? (AFL_FANTASY_POSITION_MAP[ap.positions[0]] || "MID") : "MID";
    const dualPos = ap.positions.length > 1 ? (AFL_FANTASY_POSITION_MAP[ap.positions[1]] || null) : null;
    const byeRound = BYE_ROUNDS[team] || 12;
    const venue = TEAM_VENUES[team] || "TBC";
    const breakEven = deriveBreakEven(ap.cost, 0, 0, ap.cost);

    try {
      await db.insert(players).values({
        name: fullName,
        team,
        position: primaryPos,
        dualPosition: dualPos,
        price: ap.cost,
        startingPrice: ap.cost,
        avgScore: 0,
        last3Avg: 0,
        last5Avg: 0,
        seasonTotal: 0,
        gamesPlayed: 0,
        ownedByPercent: 0,
        formTrend: "stable",
        nextOpponent: null,
        byeRound,
        venue,
        gameTime: null,
        projectedScore: 0,
        priceChange: 0,
        breakEven,
        ceilingScore: 0,
        aflFantasyId: ap.id,
      });
      added++;
    } catch (err: any) {
      console.log(`[AflPriceSync] Failed to insert "${fullName}": ${err.message}`);
    }
  }

  console.log(`[AflPriceSync] Updated ${updated} players, ${priceChanges.length} price changes, ${added} new players added`);
  if (priceChanges.length > 0 && priceChanges.length <= 30) {
    for (const pc of priceChanges) {
      console.log(`  ${pc.name}: $${pc.oldPrice.toLocaleString()} → $${pc.newPrice.toLocaleString()}`);
    }
  }
  if (added > 0) {
    const addedNames = newAflPlayers.slice(0, 10).map(ap => `${ap.first_name} ${ap.last_name}`);
    console.log(`[AflPriceSync] New players: ${addedNames.join(", ")}${newAflPlayers.length > 10 ? ` +${newAflPlayers.length - 10} more` : ""}`);
  }

  return { updated, added, priceChanges };
}

export async function syncDfsAustralia(): Promise<{ updated: number; added: number }> {
  try {
    const excelMod = await import("exceljs");
    const ExcelJS = excelMod.default || excelMod;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch("https://dfsaustralia.com/wp-content/uploads/file-downloads/afl-fantasy-2026.xlsx", {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Encoding": "gzip, deflate" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`DFS Australia returned ${res.status}`);

    const buffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer));
    const sheet = workbook.worksheets[0];
    const data: any[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as any[];
      data.push(values.slice(1));
    });

    let headerRow = -1;
    for (let i = 0; i < 20; i++) {
      if (data[i] && data[i][0] === "Player") { headerRow = i; break; }
    }
    if (headerRow < 0) throw new Error("Could not find header row in DFS spreadsheet");

    interface DfsPlayer {
      name: string;
      aflFantasyId: number;
      team: string;
      salary: number;
      position: string;
      owned: number;
      gamesPlayed: number;
      avgScore: number;
      maxScore: number;
      cbaPercent: number;
      ppm: number;
      regAvg: number;
      l5Avg: number;
      prev2024: number;
      prev2023: number;
    }

    const dfsPlayers: DfsPlayer[] = [];
    for (let i = headerRow + 1; i < data.length; i++) {
      const r = data[i];
      if (!r || !r[0] || !r[3]) continue;
      const cdId = r[1] ? String(r[1]).replace("CD_I", "") : "";
      const aflId = parseInt(cdId) || 0;
      if (!aflId) continue;
      const teamAbbr = String(r[3]).trim();
      const team = DFS_TEAM_MAP[teamAbbr] || teamAbbr;
      dfsPlayers.push({
        name: String(r[0]).trim(),
        aflFantasyId: aflId,
        team,
        salary: parseInt(r[4]) || 0,
        position: String(r[6] || "MID").trim(),
        owned: parseFloat(r[5]) || 0,
        gamesPlayed: parseInt(r[7]) || 0,
        avgScore: parseFloat(r[8]) || 0,
        maxScore: parseInt(r[9]) || 0,
        cbaPercent: parseFloat(r[12]) || 0,
        ppm: parseFloat(r[13]) || 0,
        regAvg: parseFloat(r[14]) || 0,
        l5Avg: parseFloat(r[15]) || 0,
        prev2024: parseFloat(r[17]) || 0,
        prev2023: parseFloat(r[18]) || 0,
      });
    }

    console.log(`[DfsAustralia] Parsed ${dfsPlayers.length} players from spreadsheet`);

    const allDbPlayers = await db.select().from(players);
    const dbByAflId = new Map(allDbPlayers.filter(p => p.aflFantasyId).map(p => [p.aflFantasyId!, p]));
    const dbByName = new Map(allDbPlayers.map(p => [normalizeNameForMatch(p.name), p]));

    let updated = 0;
    let added = 0;

    for (const dp of dfsPlayers) {
      const { primary: primaryPos, dual: dualPos } = parseDfsPosition(dp.position);
      let dbPlayer = dbByAflId.get(dp.aflFantasyId) || dbByName.get(normalizeNameForMatch(dp.name));

      if (dbPlayer) {
        const updates: Record<string, any> = {};
        if (!dbPlayer.aflFantasyId) updates.aflFantasyId = dp.aflFantasyId;
        if (dp.team && dp.team !== dbPlayer.team) {
          updates.team = dp.team;
          updates.byeRound = BYE_ROUNDS[dp.team] || dbPlayer.byeRound;
          updates.venue = TEAM_VENUES[dp.team] || dbPlayer.venue;
        }
        if (primaryPos !== dbPlayer.position) updates.position = primaryPos;
        if (dualPos !== (dbPlayer.dualPosition || null)) updates.dualPosition = dualPos;
        if (dp.salary > 0 && Math.abs(dp.salary - dbPlayer.price) >= 1000) {
          updates.price = dp.salary;
        }
        if (dp.salary > 0 && !dbPlayer.startingPrice) {
          updates.startingPrice = dp.salary;
        }
        if (dp.owned > 0) updates.ownedByPercent = Math.round(dp.owned * 1000) / 10;
        if (dp.ppm > 0 && !dbPlayer.ppm) updates.ppm = dp.ppm;

        if (Object.keys(updates).length > 0) {
          await db.update(players).set(updates).where(eq(players.id, dbPlayer.id));
          updated++;
        }
      } else {
        const byeRound = BYE_ROUNDS[dp.team] || 12;
        const venue = TEAM_VENUES[dp.team] || "TBC";
        const be = deriveBreakEven(dp.salary, dp.avgScore, dp.gamesPlayed, dp.salary);
        try {
          await db.insert(players).values({
            name: dp.name,
            team: dp.team,
            position: primaryPos,
            dualPosition: dualPos,
            price: dp.salary,
            startingPrice: dp.salary,
            avgScore: dp.avgScore,
            last3Avg: dp.l5Avg || dp.avgScore,
            last5Avg: dp.l5Avg || dp.avgScore,
            seasonTotal: Math.round(dp.avgScore * dp.gamesPlayed),
            gamesPlayed: dp.gamesPlayed,
            ownedByPercent: Math.round(dp.owned * 1000) / 10,
            formTrend: deriveFormTrend(dp.l5Avg || dp.avgScore, dp.regAvg || dp.avgScore),
            nextOpponent: null,
            byeRound,
            venue,
            gameTime: null,
            projectedScore: dp.avgScore,
            priceChange: 0,
            breakEven: be,
            ceilingScore: dp.maxScore || 0,
            aflFantasyId: dp.aflFantasyId,
          });
          added++;
        } catch (err: any) {
          if (!err.message.includes("duplicate")) {
            logSyncError("DfsAustralia", `Failed to insert "${dp.name}"`, err);
          }
        }
      }
    }

    logSyncResult("DfsAustralia", updated, added);
    return { updated, added };
  } catch (err: any) {
    logSyncError("DfsAustralia", "Sync failed", err);
    return { updated: 0, added: 0 };
  }
}

function deriveFormTrend(l5Avg: number, regAvg: number): string {
  const diff = l5Avg - regAvg;
  if (diff > 3) return "up";
  if (diff < -3) return "down";
  return "stable";
}

function deriveBreakEven(salary: number, avgPoints: number, gamesPlayed: number = 0, startingPrice?: number): number {
  const MAGIC_NUMBER = 10490;
  const TOTAL_ROUNDS = 24;
  const effectiveStartPrice = startingPrice || salary;
  const initialBE = effectiveStartPrice / MAGIC_NUMBER;

  if (gamesPlayed <= 0 || avgPoints <= 0) {
    return Math.round(initialBE);
  }

  const remaining = TOTAL_ROUNDS - gamesPlayed;
  const factor = remaining / TOTAL_ROUNDS;
  return Math.round(initialBE + factor * (initialBE - avgPoints));
}

function deriveLast3Avg(avgPoints: number, l5Avg: number): number {
  const diff = l5Avg - avgPoints;
  return Math.round((l5Avg + diff * 0.6) * 10) / 10;
}

export async function repairPlayerData(): Promise<number> {
  const allPlayers = await db.select().from(players);
  let repaired = 0;

  for (const p of allPlayers) {
    const updates: Record<string, any> = {};

    if (!p.byeRound && p.team && BYE_ROUNDS[p.team]) {
      updates.byeRound = BYE_ROUNDS[p.team];
    }

    if (!p.venue && p.team && TEAM_VENUES[p.team]) {
      updates.venue = TEAM_VENUES[p.team];
    }

    if (!p.startingPrice && p.price) {
      updates.startingPrice = p.price;
    }

    if (p.gamesPlayed === 0 && p.recentScores && p.recentScores.length > 0) {
      updates.recentScores = '';
    }

    if (p.breakEven === null && p.price) {
      updates.breakEven = deriveBreakEven(p.price, p.avgScore || 0, p.gamesPlayed || 0, p.startingPrice || p.price);
    }

    if (Object.keys(updates).length > 0) {
      await db.update(players).set(updates).where(eq(players.id, p.id));
      repaired++;
    }
  }

  if (repaired > 0) {
    console.log(`[ExpandPlayers] Repaired core data for ${repaired} players`);
  }
  return repaired;
}

export async function expandPlayerDatabase(): Promise<number> {
  const existingPlayers = await db.select().from(players);
  const existingNames = new Set(existingPlayers.map(p => p.name));

  const realPlayers = loadRealPlayers();
  const realPlayerMap = new Map(realPlayers.map(rp => [rp.name, rp]));

  const allWeeklyStats = await db.select({ playerId: weeklyStats.playerId }).from(weeklyStats);
  const playersWithStats = new Set(allWeeklyStats.map(s => s.playerId));

  let reconciled = 0;
  for (const existing of existingPlayers) {
    const real = realPlayerMap.get(existing.name);
    if (!real) continue;
    const needsPriceUpdate = existing.price !== real.salary;
    const hasLiveStats = playersWithStats.has(existing.id);
    const needsScoreUpdate = !hasLiveStats && existing.avgScore !== real.avgPoints;

    if (needsPriceUpdate || needsScoreUpdate) {
      const byeRound = BYE_ROUNDS[real.team] || 12;
      const updates: Record<string, any> = {
        price: real.salary,
        startingPrice: existing.startingPrice || real.salary,
        ownedByPercent: real.owned,
        projectedScore: real.regAvg,
        ceilingScore: Math.round(real.maxScore),
        byeRound,
        position: real.position,
        dualPosition: real.dualPosition || null,
        team: real.team,
        seasonCba: real.cbaPercent || null,
        ppm: real.ppm || null,
      };

      if (!hasLiveStats) {
        const l3Avg = deriveLast3Avg(real.avgPoints, real.l5Avg);
        const formTrend = deriveFormTrend(real.l5Avg, real.regAvg);
        const breakEven = deriveBreakEven(real.salary, real.avgPoints, real.games, real.salary);
        updates.avgScore = real.avgPoints;
        updates.last3Avg = l3Avg;
        updates.last5Avg = real.l5Avg;
        updates.seasonTotal = Math.round(real.avgPoints * real.games);
        updates.gamesPlayed = real.games;
        updates.formTrend = formTrend;
        updates.breakEven = breakEven;
      }

      await db.update(players).set(updates).where(eq(players.id, existing.id));
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
    const breakEven = deriveBreakEven(rp.salary, rp.avgPoints, rp.games, rp.salary);
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
      seasonCba: rp.cbaPercent || null,
      ppm: rp.ppm || null,
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

    const scores: number[] = [];
    const consistencyRating = avg >= 80 ? 0.85 : avg >= 60 ? 0.65 : 0.4;
    const actualStdDev = baseStdDev;

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

    const age = p.age || generateAge(price, avg);
    const yearsExperience = p.yearsExperience || generateYearsExperience(age);
    const durabilityScore = p.durabilityScore || generateDurabilityScore(age, p.injuryStatus);
    const injuryRiskScore = p.injuryRiskScore || generateInjuryRiskScore(durabilityScore, age, p.injuryStatus);

    await db.update(players)
      .set({
        consistencyRating,
        scoreStdDev: actualStdDev,
        recentScores: '',
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
        startingPrice: p.startingPrice || price,
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

export async function recalculatePlayerAverages(): Promise<number> {
  const allStats = await db.select({
    playerId: weeklyStats.playerId,
    round: weeklyStats.round,
    fantasyScore: weeklyStats.fantasyScore,
    timeOnGroundPercent: weeklyStats.timeOnGroundPercent,
    centreBounceAttendancePercent: weeklyStats.centreBounceAttendancePercent,
  }).from(weeklyStats).orderBy(weeklyStats.round);

  const byPlayer: Record<number, number[]> = {};
  const togByPlayer: Record<number, number[]> = {};
  const cbaByPlayer: Record<number, number[]> = {};
  for (const s of allStats) {
    if (s.fantasyScore === null || s.fantasyScore === undefined) continue;
    if (!byPlayer[s.playerId]) byPlayer[s.playerId] = [];
    byPlayer[s.playerId].push(s.fantasyScore);
    if (s.timeOnGroundPercent !== null && s.timeOnGroundPercent !== undefined) {
      if (!togByPlayer[s.playerId]) togByPlayer[s.playerId] = [];
      togByPlayer[s.playerId].push(s.timeOnGroundPercent);
    }
    if (s.centreBounceAttendancePercent !== null && s.centreBounceAttendancePercent !== undefined) {
      if (!cbaByPlayer[s.playerId]) cbaByPlayer[s.playerId] = [];
      cbaByPlayer[s.playerId].push(s.centreBounceAttendancePercent);
    }
  }

  const allPlayers = await db.select().from(players);
  let updated = 0;

  for (const p of allPlayers) {
    const scores = byPlayer[p.id];
    if (!scores || scores.length === 0) continue;

    const gamesPlayed = scores.length;
    const seasonTotal = scores.reduce((a, b) => a + b, 0);
    const avgScore = Math.round((seasonTotal / gamesPlayed) * 10) / 10;

    const last3Scores = scores.slice(-3);
    const last3Avg = Math.round((last3Scores.reduce((a, b) => a + b, 0) / last3Scores.length) * 10) / 10;

    const last5Scores = scores.slice(-5);
    const last5Avg = Math.round((last5Scores.reduce((a, b) => a + b, 0) / last5Scores.length) * 10) / 10;

    const ceilingScore = Math.max(...scores);
    const recentScoresStr = scores.slice(-5).join(",");

    const formTrend = deriveFormTrend(last5Avg, avgScore);

    const togScores = togByPlayer[p.id];
    const avgTog = togScores && togScores.length > 0
      ? Math.round((togScores.reduce((a, b) => a + b, 0) / togScores.length) * 10) / 10
      : p.avgTog;
    const cbaScores = cbaByPlayer[p.id];
    const seasonCba = cbaScores && cbaScores.length > 0
      ? Math.round((cbaScores.reduce((a, b) => a + b, 0) / cbaScores.length) * 10) / 10
      : p.seasonCba;
    const computedPpm = avgTog && avgTog > 0
      ? Math.round((avgScore / (avgTog * 0.01 * 120)) * 100) / 100
      : p.ppm;

    const POSITION_PRIORS: Record<string, number> = { DEF: 72, MID: 80, RUC: 85, FWD: 70 };
    const PRIOR_WEIGHT = 5;
    const posPrior = POSITION_PRIORS[p.position] ?? 75;
    const projectedScore = Math.round(
      ((gamesPlayed / (gamesPlayed + PRIOR_WEIGHT)) * avgScore +
      (PRIOR_WEIGHT / (gamesPlayed + PRIOR_WEIGHT)) * posPrior) * 10
    ) / 10;

    const breakEven = deriveBreakEven(p.price, avgScore, gamesPlayed, p.startingPrice || p.price);

    const needsUpdate =
      Math.abs((p.avgScore || 0) - avgScore) > 0.1 ||
      Math.abs((p.last3Avg || 0) - last3Avg) > 0.1 ||
      Math.abs((p.last5Avg || 0) - last5Avg) > 0.1 ||
      p.gamesPlayed !== gamesPlayed ||
      p.seasonTotal !== seasonTotal ||
      (p.ceilingScore || 0) !== ceilingScore ||
      (p.recentScores || "") !== recentScoresStr ||
      Math.abs((p.projectedScore || 0) - projectedScore) > 0.1 ||
      p.breakEven !== breakEven;

    if (needsUpdate) {
      await db.update(players).set({
        avgScore,
        last3Avg,
        last5Avg,
        gamesPlayed,
        seasonTotal,
        ceilingScore,
        recentScores: recentScoresStr,
        projectedScore,
        breakEven,
        formTrend,
        ...(avgTog !== null && avgTog !== undefined ? { avgTog } : {}),
        ...(seasonCba !== null && seasonCba !== undefined ? { seasonCba } : {}),
        ...(computedPpm !== null && computedPpm !== undefined ? { ppm: computedPpm } : {}),
      }).where(eq(players.id, p.id));
      updated++;
    }
  }

  const POSITION_PRIORS_GLOBAL: Record<string, number> = { DEF: 72, MID: 80, RUC: 85, FWD: 70 };
  const PRIOR_WEIGHT_GLOBAL = 5;
  const noStatsPlayers = allPlayers.filter(p =>
    p.gamesPlayed && p.gamesPlayed > 0 && p.avgScore && p.avgScore > 0 && !byPlayer[p.id]
  );
  let fallbackUpdated = 0;
  for (const p of noStatsPlayers) {
    const posPrior = POSITION_PRIORS_GLOBAL[p.position] ?? 75;
    const gp = p.gamesPlayed!;
    const avg = p.avgScore!;
    const proj = Math.round(
      ((gp / (gp + PRIOR_WEIGHT_GLOBAL)) * avg +
      (PRIOR_WEIGHT_GLOBAL / (gp + PRIOR_WEIGHT_GLOBAL)) * posPrior) * 10
    ) / 10;
    const be = deriveBreakEven(p.price, avg, gp, p.startingPrice || p.price);
    if (Math.abs((p.projectedScore || 0) - proj) > 0.1 || p.breakEven !== be) {
      await db.update(players).set({ projectedScore: proj, breakEven: be }).where(eq(players.id, p.id));
      fallbackUpdated++;
    }
  }

  if (updated > 0 || fallbackUpdated > 0) {
    console.log(`[ExpandPlayers] Recalculated averages for ${updated} players from weekly_stats, ${fallbackUpdated} from external data`);
  }
  return updated + fallbackUpdated;
}

export { calcTradeEV, calcCaptainProbability, bayesianAdjustedAvg, calcVolatilityScore };
