import { db } from "../db";
import { players } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const DTLIVE_URL = "https://dtlive.com.au/afl/dataview.php";

const TEAM_MAP: Record<string, string> = {
  "ADE": "Adelaide", "BRL": "Brisbane Lions", "CAR": "Carlton",
  "COL": "Collingwood", "ESS": "Essendon", "FRE": "Fremantle",
  "GEE": "Geelong", "GCS": "Gold Coast", "GWS": "GWS Giants",
  "HAW": "Hawthorn", "MEL": "Melbourne", "NTH": "North Melbourne",
  "PTA": "Port Adelaide", "RIC": "Richmond", "STK": "St Kilda",
  "SYD": "Sydney", "WCE": "West Coast", "WBD": "Western Bulldogs",
};

const POSITION_MAP: Record<string, string> = {
  "Def": "DEF", "Mid": "MID", "Ruc": "RUC", "Fwd": "FWD",
};

interface DTLivePlayer {
  name: string;
  fullName?: string;
  team: string;
  position: string;
  startingPrice: number;
  priceChange: number;
  currentPrice: number;
  ownership: number;
  gamesPlayed: number;
  average: number;
  lastScore: number;
  ppm: number;
  economy: number;
  breakeven: number | null;
  roundScores: (number | null)[];
}

function parsePlayerRow(html: string): DTLivePlayer | null {
  const tdRegex = /<td[^>]*>(.*?)<\/td>/g;
  const cells: string[] = [];
  let match;
  while ((match = tdRegex.exec(html)) !== null) {
    cells.push(match[1]);
  }

  if (cells.length < 14) return null;

  const teamMatch = cells[0].match(/images\/(\w+)\.png/);
  const teamCode = teamMatch?.[1] || "";
  const team = TEAM_MAP[teamCode] || teamCode;

  const nameMatch = cells[1].match(/>([^<]+)</);
  const shortName = nameMatch?.[1]?.trim() || "";
  if (!shortName) return null;

  const position = POSITION_MAP[cells[2]?.trim()] || cells[2]?.trim() || "MID";
  const startingPrice = parseFloat(cells[3]) || 0;
  const priceChange = parseFloat(cells[4]) || 0;
  const currentPrice = parseFloat(cells[5]) || 0;
  const ownership = parseFloat(cells[6]) || 0;
  const gamesPlayed = parseInt(cells[7]) || 0;
  const average = parseFloat(cells[8]) || 0;
  const lastScore = parseFloat(cells[9]) || 0;
  const ppm = parseFloat(cells[10]) || 0;
  const economy = parseFloat(cells[11]) || 0;

  const roundScores: (number | null)[] = [];
  for (let i = 14; i < cells.length; i++) {
    const scoreMatch = cells[i].match(/>(\d+)</);
    roundScores.push(scoreMatch ? parseInt(scoreMatch[1]) : null);
  }

  const beCell = cells[13] || "";
  const beMatch = beCell.match(/>([-\d]+)</);
  const breakeven = beMatch ? parseInt(beMatch[1]) : null;

  return {
    name: shortName,
    team,
    position,
    startingPrice,
    priceChange,
    currentPrice,
    ownership,
    gamesPlayed,
    average,
    lastScore,
    ppm,
    economy,
    breakeven,
    roundScores,
  };
}


function expandShortName(shortName: string): string[] {
  const parts = shortName.split(" ");
  if (parts.length < 2) return [shortName];

  const initial = parts[0];
  const surname = parts.slice(1).join(" ");

  return [
    surname,
    `${initial} ${surname}`,
    shortName,
  ];
}

async function matchDTLiveToPlayer(dtPlayer: DTLivePlayer): Promise<number | null> {
  const possibleNames = expandShortName(dtPlayer.name);
  const surname = possibleNames[0];

  const candidates = await db.select().from(players)
    .where(sql`${players.name} ILIKE ${'%' + surname + '%'} AND ${players.team} = ${dtPlayer.team}`);

  if (candidates.length === 1) return candidates[0].id;

  if (candidates.length > 1) {
    const initial = dtPlayer.name.split(" ")[0];
    for (const c of candidates) {
      const cFirstName = c.name.split(" ")[0];
      if (cFirstName.startsWith(initial.replace(".", ""))) return c.id;
    }
    const priceMatch = candidates.find(c => Math.abs(c.price - dtPlayer.currentPrice) < 5000);
    if (priceMatch) return priceMatch.id;
  }

  return null;
}

export async function fetchDTLiveData(): Promise<{
  fetched: number;
  matched: number;
  updated: number;
  unmatched: string[];
}> {
  console.log("[DTLive] Fetching player data...");

  const response = await fetch(DTLIVE_URL);
  if (!response.ok) {
    throw new Error(`DTLive returned ${response.status}`);
  }
  const html = await response.text();

  const rowRegex = /<tr><td>.*?<\/tr>/g;
  const rows: string[] = [];
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    rows.push(rowMatch[0]);
  }

  console.log(`[DTLive] Found ${rows.length} player rows`);

  const dtPlayers: DTLivePlayer[] = [];
  for (const row of rows) {
    const parsed = parsePlayerRow(row);
    if (parsed) dtPlayers.push(parsed);
  }

  console.log(`[DTLive] Parsed ${dtPlayers.length} players`);

  let matched = 0;
  let updated = 0;
  const unmatched: string[] = [];

  for (const dtp of dtPlayers) {
    const playerId = await matchDTLiveToPlayer(dtp);
    if (!playerId) {
      unmatched.push(`${dtp.name} (${dtp.team})`);
      continue;
    }
    matched++;

    const updates: Record<string, any> = {};

    if (dtp.currentPrice > 0) updates.price = dtp.currentPrice;
    if (dtp.startingPrice > 0 && !updates.startingPrice) updates.startingPrice = dtp.startingPrice;
    if (dtp.ownership >= 0) updates.ownedByPercent = dtp.ownership;
    if (dtp.priceChange !== undefined) updates.priceChange = dtp.priceChange;
    if (dtp.breakeven !== null) updates.breakEven = dtp.breakeven;

    if (Object.keys(updates).length > 0) {
      await db.update(players).set(updates).where(eq(players.id, playerId));
      updated++;
    }
  }

  console.log(`[DTLive] Matched ${matched}/${dtPlayers.length}, updated ${updated}, unmatched ${unmatched.length}`);
  if (unmatched.length > 0 && unmatched.length <= 20) {
    console.log(`[DTLive] Unmatched: ${unmatched.join(", ")}`);
  }

  return { fetched: dtPlayers.length, matched, updated, unmatched };
}
