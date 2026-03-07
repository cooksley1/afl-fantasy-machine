import { db } from "../db";
import { players } from "@shared/schema";
import { sql, eq } from "drizzle-orm";

const BASE_URL = "https://fantasysports.win/break-evens.html";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TEAM_MAP: Record<string, string> = {
  "Adelaide": "Adelaide",
  "Brisbane": "Brisbane Lions",
  "Carlton": "Carlton",
  "Collingwood": "Collingwood",
  "Essendon": "Essendon",
  "Fremantle": "Fremantle",
  "Geelong": "Geelong",
  "Gold_Coast": "Gold Coast",
  "GWS": "GWS Giants",
  "Hawthorn": "Hawthorn",
  "Melbourne": "Melbourne",
  "North_Melbourne": "North Melbourne",
  "Port_Adelaide": "Port Adelaide",
  "Richmond": "Richmond",
  "St_Kilda": "St Kilda",
  "Sydney": "Sydney",
  "West_Coast_Eagles": "West Coast",
  "Western_Bulldogs": "Western Bulldogs",
};

interface FSPlayer {
  name: string;
  team: string;
  position: string;
  breakeven: number;
  adjustedBE: number;
  price: number;
}

function parseTeamFromIcon(iconSrc: string): string {
  const match = iconSrc.match(/images\/(.+?)(?:_icon)?\.\w+/);
  if (!match) return "";
  const key = match[1];
  return TEAM_MAP[key] || key.replace(/_/g, " ");
}

export async function fetchFantasySportsBEs(round: number = 24): Promise<{
  fetched: number;
  matched: number;
  updated: number;
}> {
  const url = `${BASE_URL}?display=0&round=${round}&submit=View`;
  console.log(`[FantasySports] Fetching BEs for round=${round}...`);

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`FantasySports returned ${response.status}`);
  }

  const html = await response.text();
  const rows = html.match(/<tr><td.*?<\/tr>/g) || [];
  console.log(`[FantasySports] Found ${rows.length} player rows`);

  const fsPlayers: FSPlayer[] = [];

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(m => m[1]);
    if (cells.length < 6) continue;

    const iconMatch = cells[0].match(/images\/(.+?\.\w+)/);
    const team = iconMatch ? parseTeamFromIcon(iconMatch[0]) : "";

    const nameMatch = cells[1].match(/data-sort="[^"]*">([^<]+)/);
    const rawName = nameMatch ? nameMatch[1].trim() : cells[1].replace(/<[^>]+>/g, "").trim();
    const name = rawName.replace(/\s+/g, " ").trim();

    if (!name || !team) continue;

    const position = cells[2]?.replace(/<[^>]+>/g, "").trim() || "";
    const col3 = parseInt(cells[3]?.replace(/<[^>]+>/g, "").trim()) || 0;
    const col4 = parseInt(cells[4]?.replace(/<[^>]+>/g, "").trim()) || 0;
    const price = parseInt(cells[5]?.replace(/<[^>]+>/g, "").trim()) || 0;

    fsPlayers.push({
      name,
      team,
      position,
      breakeven: col3,
      adjustedBE: col4,
      price,
    });
  }

  console.log(`[FantasySports] Parsed ${fsPlayers.length} players`);

  let matched = 0;
  let updated = 0;

  for (const fsp of fsPlayers) {
    const nameParts = fsp.name.split(" ");
    const surname = nameParts[nameParts.length - 1];

    const candidates = await db.select().from(players)
      .where(sql`${players.name} ILIKE ${"%" + surname + "%"} AND ${players.team} = ${fsp.team}`);

    let matchedPlayer = candidates.length === 1 ? candidates[0] : null;

    if (candidates.length > 1) {
      const firstName = nameParts[0];
      matchedPlayer = candidates.find(c => c.name.startsWith(firstName)) || null;
      if (!matchedPlayer) {
        matchedPlayer = candidates.find(c => Math.abs(c.price - fsp.price) < 5000) || null;
      }
    }

    if (!matchedPlayer) continue;
    matched++;

    const beToUse = fsp.breakeven !== 0 ? fsp.breakeven : fsp.adjustedBE;
    if (matchedPlayer.breakEven !== beToUse) {
      await db.update(players).set({ breakEven: beToUse }).where(eq(players.id, matchedPlayer.id));
      updated++;
    }
  }

  console.log(`[FantasySports] Matched ${matched}/${fsPlayers.length}, updated ${updated} BEs`);
  return { fetched: fsPlayers.length, matched, updated };
}
