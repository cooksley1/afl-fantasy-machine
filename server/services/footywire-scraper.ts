import { db } from "../db";
import { players } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const FOOTYWIRE_URL = "https://www.footywire.com/afl/footy/dream_team_prices";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TEAM_ALIASES: Record<string, string> = {
  "Power": "Port Adelaide", "Crows": "Adelaide", "Lions": "Brisbane Lions",
  "Blues": "Carlton", "Magpies": "Collingwood", "Bombers": "Essendon",
  "Dockers": "Fremantle", "Cats": "Geelong", "Suns": "Gold Coast",
  "Giants": "GWS Giants", "Hawks": "Hawthorn", "Demons": "Melbourne",
  "Kangaroos": "North Melbourne", "Tigers": "Richmond", "Saints": "St Kilda",
  "Swans": "Sydney", "Eagles": "West Coast", "Bulldogs": "Western Bulldogs",
};

interface FootywirePlayer {
  fullName: string;
  shortName: string;
  team: string;
  aflFantasyPrice: number;
  aflFantasyChange: number;
}

function parseFootywireRow(rawNameHtml: string, cells: string[]): FootywirePlayer | null {
  if (cells.length < 3) return null;

  const priceStr = cells[1];
  const changeStr = cells[2];

  const priceMatch = priceStr.match(/\$([\d,]+)/);
  if (!priceMatch) return null;
  const price = parseInt(priceMatch[1].replace(/,/g, ""));
  if (price <= 0) return null;

  const changeMatch = changeStr.match(/([+-])\$([\d,]+)/);
  const change = changeMatch
    ? (changeMatch[1] === "+" ? 1 : -1) * parseInt(changeMatch[2].replace(/,/g, ""))
    : 0;

  const spanMatch = rawNameHtml.match(/<span[^>]*class="hiddenspan"[^>]*>([^<]+)<\/span>/);
  const fullName = spanMatch ? spanMatch[1].trim() : "";
  if (fullName.length < 3) return null;

  const cleanedNameCell = cells[0];
  const teamOrder = [
    "Brisbane Lions", "GWS Giants", "North Melbourne", "Western Bulldogs",
    "West Coast", "Gold Coast", "Port Adelaide", "St Kilda",
    "Adelaide", "Carlton", "Collingwood", "Essendon", "Fremantle",
    "Geelong", "Hawthorn", "Melbourne", "Richmond", "Sydney",
    "Power", "Crows", "Lions", "Blues", "Magpies", "Bombers",
    "Dockers", "Cats", "Suns", "Giants", "Hawks", "Demons",
    "Kangaroos", "Tigers", "Saints", "Swans", "Eagles", "Bulldogs",
  ];

  let team = "";
  for (const t of teamOrder) {
    if (cleanedNameCell.includes(t)) {
      team = TEAM_ALIASES[t] || t;
      break;
    }
  }

  if (!team) return null;

  return { fullName, shortName: fullName, team, aflFantasyPrice: price, aflFantasyChange: change };
}

async function matchFootywireToPlayer(fwPlayer: FootywirePlayer): Promise<number | null> {
  const surname = fwPlayer.fullName.split(" ").pop() || "";
  if (surname.length < 2) return null;

  const candidates = await db.select({ id: players.id, name: players.name, price: players.price })
    .from(players)
    .where(sql`${players.name} ILIKE ${"%" + surname + "%"} AND ${players.team} = ${fwPlayer.team}`);

  if (candidates.length === 1) return candidates[0].id;

  if (candidates.length > 1) {
    const firstName = fwPlayer.fullName.split(" ")[0];
    const exact = candidates.find(c => c.name.toLowerCase() === fwPlayer.fullName.toLowerCase());
    if (exact) return exact.id;

    const startsWith = candidates.find(c => c.name.split(" ")[0].toLowerCase() === firstName.toLowerCase());
    if (startsWith) return startsWith.id;

    const priceMatch = candidates.find(c => Math.abs(c.price - fwPlayer.aflFantasyPrice) < 5000);
    if (priceMatch) return priceMatch.id;
  }

  return null;
}

export async function fetchFootywireData(): Promise<{
  fetched: number;
  matched: number;
  updated: number;
  priceUpdates: number;
  unmatched: string[];
}> {
  console.log("[Footywire] Fetching player price data...");

  const response = await fetch(FOOTYWIRE_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`Footywire returned ${response.status}`);
  }
  const html = await response.text();

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch;
  const fwPlayers: FootywirePlayer[] = [];

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const rawCells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      rawCells.push(cellMatch[1]);
    }
    if (rawCells.length >= 3) {
      const rawNameHtml = rawCells[0];
      const cells = rawCells.map(c => c.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim());
      const parsed = parseFootywireRow(rawNameHtml, cells);
      if (parsed) fwPlayers.push(parsed);
    }
  }

  console.log(`[Footywire] Parsed ${fwPlayers.length} players`);

  let matched = 0;
  let updated = 0;
  let priceUpdates = 0;
  const unmatched: string[] = [];

  for (const fwp of fwPlayers) {
    const playerId = await matchFootywireToPlayer(fwp);
    if (!playerId) {
      unmatched.push(`${fwp.fullName} (${fwp.team})`);
      continue;
    }
    matched++;

    const updates: Record<string, any> = {};

    if (fwp.aflFantasyPrice > 0) {
      const [current] = await db.select({ price: players.price }).from(players).where(eq(players.id, playerId));
      if (current && Math.abs(current.price - fwp.aflFantasyPrice) >= 1000) {
        updates.price = fwp.aflFantasyPrice;
        priceUpdates++;
      }
    }
    if (fwp.aflFantasyChange !== 0) {
      updates.priceChange = fwp.aflFantasyChange;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(players).set(updates).where(eq(players.id, playerId));
      updated++;
    }
  }

  console.log(`[Footywire] Matched ${matched}/${fwPlayers.length}, updated ${updated}, price changes ${priceUpdates}, unmatched ${unmatched.length}`);

  return { fetched: fwPlayers.length, matched, updated, priceUpdates, unmatched };
}
