import { db } from "../db";
import { players, leagueSettings } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TEAM_ALIASES: Record<string, string> = {
  "Power": "Port Adelaide", "Crows": "Adelaide", "Lions": "Brisbane Lions",
  "Blues": "Carlton", "Magpies": "Collingwood", "Bombers": "Essendon",
  "Dockers": "Fremantle", "Cats": "Geelong", "Suns": "Gold Coast",
  "Giants": "GWS Giants", "Hawks": "Hawthorn", "Demons": "Melbourne",
  "Kangaroos": "North Melbourne", "Tigers": "Richmond", "Saints": "St Kilda",
  "Swans": "Sydney", "Eagles": "West Coast", "Bulldogs": "Western Bulldogs",
};

interface FootywirePlayer {
  name: string;
  team: string;
  currentPrice: number;
  roundPrice: number;
  roundScore: number;
}

function normalizeTeam(raw: string): string {
  const trimmed = raw.trim();
  return TEAM_ALIASES[trimmed] || trimmed;
}

function parseRoundPage(html: string): FootywirePlayer[] {
  const results: FootywirePlayer[] = [];
  const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) || [];

  let dataTable: string | null = null;
  for (const t of tables) {
    const rows = t.match(/<tr/gi) || [];
    if (rows.length > 50) { dataTable = t; break; }
  }
  if (!dataTable) return results;

  const allRows = dataTable.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  for (let r = 1; r < allRows.length; r++) {
    const cells = allRows[r].match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
    if (cells.length < 6) continue;

    const vals = cells.map(c => c.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());

    const name = vals[1]?.replace(/\s*(Injured|Suspended|Dropped)\s*/gi, "").trim() || "";
    const teamRaw = vals[2] || "";
    const currentPriceStr = vals[3] || "";
    const roundPriceStr = vals[4] || "";
    const roundScoreStr = vals[5] || "";

    if (!name || name.length < 3) continue;

    const currentPrice = parseInt(currentPriceStr.replace(/[^0-9]/g, "")) || 0;
    const roundPrice = parseInt(roundPriceStr.replace(/[^0-9]/g, "")) || 0;
    const roundScore = parseInt(roundScoreStr.replace(/[^0-9]/g, "")) || 0;

    if (currentPrice <= 0) continue;

    const team = normalizeTeam(teamRaw);
    if (!team) continue;

    results.push({ name, team, currentPrice, roundPrice, roundScore });
  }

  return results;
}

function normalizeNameForMatch(name: string): string {
  return name.toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/\bde \b/g, "de")
    .replace(/\bmc\b/g, "mc")
    .replace(/\bo['']?/g, "o")
    .trim();
}

export async function fetchFootywireData(): Promise<{
  fetched: number;
  matched: number;
  priceUpdates: number;
  unmatched: string[];
}> {
  const settingsRow = await db.select().from(leagueSettings).limit(1);
  const currentRound = settingsRow[0]?.currentRound || 1;

  const roundsToScrape = [];
  for (let r = 1; r <= currentRound; r++) {
    roundsToScrape.push(r);
  }

  console.log(`[Footywire] Scraping rounds ${roundsToScrape.join(",")} for current prices...`);

  const playerMap = new Map<string, FootywirePlayer>();

  for (const round of roundsToScrape) {
    const url = `https://www.footywire.com/afl/footy/dream_team_round?year=2026&round=${round}&p=&s=T`;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml",
        },
      });
      if (!response.ok) {
        console.log(`[Footywire] Round ${round} returned ${response.status}, skipping`);
        continue;
      }
      const html = await response.text();
      const roundPlayers = parseRoundPage(html);

      for (const p of roundPlayers) {
        const key = `${p.name.toLowerCase()}|${p.team}`;
        playerMap.set(key, p);
      }
      console.log(`[Footywire] Round ${round}: ${roundPlayers.length} players (cumulative: ${playerMap.size})`);

      if (round < roundsToScrape[roundsToScrape.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (err: any) {
      console.log(`[Footywire] Round ${round} error: ${err.message}`);
    }
  }

  const fwPlayers = Array.from(playerMap.values());
  console.log(`[Footywire] Total unique players: ${fwPlayers.length}`);

  if (fwPlayers.length < 50) {
    throw new Error(`Only ${fwPlayers.length} players scraped (expected 200+). Footywire may be blocking requests.`);
  }

  const dbPlayers = await db.select({
    id: players.id,
    name: players.name,
    team: players.team,
    price: players.price,
    startingPrice: players.startingPrice,
  }).from(players);

  const dbByNormNameTeam = new Map<string, typeof dbPlayers[0]>();
  const dbByNameTeam = new Map<string, typeof dbPlayers[0]>();
  const dbBySurnameTeam = new Map<string, typeof dbPlayers[0][]>();

  for (const p of dbPlayers) {
    const normKey = `${normalizeNameForMatch(p.name)}|${p.team}`;
    dbByNormNameTeam.set(normKey, p);
    const key = `${p.name.toLowerCase()}|${p.team}`;
    dbByNameTeam.set(key, p);

    const surname = normalizeNameForMatch(p.name.split(" ").pop() || "");
    const sKey = `${surname}|${p.team}`;
    if (!dbBySurnameTeam.has(sKey)) dbBySurnameTeam.set(sKey, []);
    dbBySurnameTeam.get(sKey)!.push(p);
  }

  let matched = 0;
  let priceUpdates = 0;
  const unmatched: string[] = [];
  const updates: Array<{ id: number; price: number; priceChange: number }> = [];

  for (const fwp of fwPlayers) {
    const normKey = `${normalizeNameForMatch(fwp.name)}|${fwp.team}`;
    let dbPlayer = dbByNormNameTeam.get(normKey);

    if (!dbPlayer) {
      const key = `${fwp.name.toLowerCase()}|${fwp.team}`;
      dbPlayer = dbByNameTeam.get(key);
    }

    if (!dbPlayer) {
      const surname = normalizeNameForMatch(fwp.name.split(" ").pop() || "");
      const sKey = `${surname}|${fwp.team}`;
      const candidates = dbBySurnameTeam.get(sKey) || [];
      if (candidates.length === 1) {
        dbPlayer = candidates[0];
      } else if (candidates.length > 1) {
        const firstName = normalizeNameForMatch(fwp.name.split(" ")[0]);
        dbPlayer = candidates.find(c => normalizeNameForMatch(c.name.split(" ")[0]) === firstName);
      }
    }

    if (!dbPlayer) {
      unmatched.push(`${fwp.name} (${fwp.team})`);
      continue;
    }

    matched++;

    if (Math.abs(dbPlayer.price - fwp.currentPrice) >= 1000) {
      const priceChange = fwp.currentPrice - (dbPlayer.startingPrice || fwp.currentPrice);
      updates.push({ id: dbPlayer.id, price: fwp.currentPrice, priceChange });
      priceUpdates++;
    }
  }

  for (const u of updates) {
    await db.update(players).set({
      price: u.price,
      priceChange: u.priceChange,
    }).where(eq(players.id, u.id));
  }

  if (unmatched.length > 0 && unmatched.length <= 20) {
    console.log(`[Footywire] Unmatched: ${unmatched.join(", ")}`);
  } else if (unmatched.length > 20) {
    console.log(`[Footywire] ${unmatched.length} unmatched players`);
  }

  console.log(`[Footywire] Matched ${matched}/${fwPlayers.length}, ${priceUpdates} price updates`);

  return { fetched: fwPlayers.length, matched, priceUpdates, unmatched };
}
