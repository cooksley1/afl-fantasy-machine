import { db } from "../db";
import { players } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

const TEAM_NAME_MAP: Record<string, string> = {
  "Adelaide": "Adelaide",
  "Brisbane Lions": "Brisbane Lions",
  "Carlton": "Carlton",
  "Collingwood": "Collingwood",
  "Essendon": "Essendon",
  "Fremantle": "Fremantle",
  "Geelong": "Geelong",
  "Gold Coast": "Gold Coast",
  "Greater Western Sydney": "GWS Giants",
  "Hawthorn": "Hawthorn",
  "Melbourne": "Melbourne",
  "North Melbourne": "North Melbourne",
  "Port Adelaide": "Port Adelaide",
  "Richmond": "Richmond",
  "St Kilda": "St Kilda",
  "Sydney": "Sydney",
  "West Coast": "West Coast",
  "Western Bulldogs": "Western Bulldogs",
};

interface AflTablesPlayerSeason {
  name: string;
  team: string;
  season: number;
  gamesPlayed: number;
  kicks: number;
  marks: number;
  handballs: number;
  disposals: number;
  disposalAvg: number;
  goals: number;
  behinds: number;
  hitouts: number;
  tackles: number;
  rebound50s: number;
  inside50s: number;
  clearances: number;
  clangers: number;
  freesFor: number;
  freesAgainst: number;
  brownlowVotes: number;
  contestedPossessions: number;
  uncontestedPossessions: number;
  contestedMarks: number;
  marksInside50: number;
  onePercenters: number;
  bounces: number;
  goalAssists: number;
  timeOnGround: number;
  playerUrl: string;
}

function parseNum(val: string): number {
  const cleaned = val.replace(/&nbsp;/g, "").trim();
  if (!cleaned || cleaned === "-") return 0;
  return parseFloat(cleaned) || 0;
}

function parsePlayerName(rawName: string): string {
  const parts = rawName.split(",").map(s => s.trim());
  if (parts.length === 2) {
    return `${parts[1]} ${parts[0]}`;
  }
  return rawName.trim();
}

async function fetchSeasonStats(year: number): Promise<AflTablesPlayerSeason[]> {
  const url = `https://afltables.com/afl/stats/${year}.html`;
  console.log(`[AflTables] Fetching ${year} season stats...`);

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`AflTables returned ${response.status} for ${year}`);
  }
  const html = await response.text();

  const teamHeaderRegex = /<th colspan=28><a href="[^"]+">([^<]+)<\/a>/g;
  const teamPositions: { name: string; idx: number }[] = [];
  let teamMatch;
  while ((teamMatch = teamHeaderRegex.exec(html)) !== null) {
    teamPositions.push({ name: teamMatch[1], idx: teamMatch.index });
  }

  const results: AflTablesPlayerSeason[] = [];

  for (let i = 0; i < teamPositions.length; i++) {
    const teamName = teamPositions[i].name;
    const mappedTeam = TEAM_NAME_MAP[teamName] || teamName;
    const sectionStart = teamPositions[i].idx;
    const sectionEnd = i < teamPositions.length - 1
      ? teamPositions[i + 1].idx
      : html.length;
    const section = html.substring(sectionStart, sectionEnd);

    const rowRegex = /<tr><td[^>]*>\d+<\/td><td><a href="([^"]+)">([^<]+)<\/a><\/td>((?:<td[^>]*>[^<]*<\/td>)*)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(section)) !== null) {
      const playerUrl = rowMatch[1];
      const rawName = rowMatch[2];
      const cellsHtml = rowMatch[3];

      const cellRegex = /<td[^>]*>([^<]*)<\/td>/g;
      const values: string[] = [];
      let cellMatch;
      while ((cellMatch = cellRegex.exec(cellsHtml)) !== null) {
        values.push(cellMatch[1]);
      }

      if (values.length < 25) continue;

      const fullName = parsePlayerName(rawName);

      results.push({
        name: fullName,
        team: mappedTeam,
        season: year,
        gamesPlayed: parseNum(values[0]),
        kicks: parseNum(values[1]),
        marks: parseNum(values[2]),
        handballs: parseNum(values[3]),
        disposals: parseNum(values[4]),
        disposalAvg: parseNum(values[5]),
        goals: parseNum(values[6]),
        behinds: parseNum(values[7]),
        hitouts: parseNum(values[8]),
        tackles: parseNum(values[9]),
        rebound50s: parseNum(values[10]),
        inside50s: parseNum(values[11]),
        clearances: parseNum(values[12]),
        clangers: parseNum(values[13]),
        freesFor: parseNum(values[14]),
        freesAgainst: parseNum(values[15]),
        brownlowVotes: parseNum(values[16]),
        contestedPossessions: parseNum(values[17]),
        uncontestedPossessions: parseNum(values[18]),
        contestedMarks: parseNum(values[19]),
        marksInside50: parseNum(values[20]),
        onePercenters: parseNum(values[21]),
        bounces: parseNum(values[22]),
        goalAssists: parseNum(values[23]),
        timeOnGround: parseNum(values[24]),
        playerUrl,
      });
    }
  }

  console.log(`[AflTables] Parsed ${results.length} players from ${year} across ${teamPositions.length} teams`);
  return results;
}

function estimateFantasyScore(stats: AflTablesPlayerSeason): number {
  if (stats.gamesPlayed === 0) return 0;
  const totalFantasy =
    stats.kicks * 3 +
    stats.handballs * 2 +
    stats.marks * 3 +
    stats.tackles * 4 +
    stats.goals * 6 +
    stats.behinds * 1 +
    stats.hitouts * 1 -
    stats.freesAgainst * 3;
  return Math.round((totalFantasy / stats.gamesPlayed) * 10) / 10;
}

async function matchPlayerToDb(
  aflPlayer: AflTablesPlayerSeason,
  allDbPlayers?: { id: number; name: string; team: string }[],
): Promise<number | null> {
  const nameParts = aflPlayer.name.split(" ");
  const surname = nameParts[nameParts.length - 1];
  if (surname.length < 2) return null;

  const candidates = await db
    .select({ id: players.id, name: players.name, team: players.team })
    .from(players)
    .where(
      sql`${players.name} ILIKE ${"%" + surname + "%"} AND ${players.team} = ${aflPlayer.team}`,
    );

  if (candidates.length === 0) {
    if (allDbPlayers) {
      const firstName = nameParts[0].toLowerCase();
      const surnameBase = surname.toLowerCase().replace(/[ck]$/, "");
      const fuzzy = allDbPlayers.filter(p => {
        if (p.team !== aflPlayer.team) return false;
        const pParts = p.name.split(" ");
        const pSurname = pParts[pParts.length - 1].toLowerCase();
        const pSurnameBase = pSurname.replace(/[ck]$/, "");
        const pFirst = pParts[0].toLowerCase();
        return pSurnameBase === surnameBase && pFirst === firstName;
      });
      if (fuzzy.length === 1) return fuzzy[0].id;
    }
    return null;
  }

  const exact = candidates.find(
    (c) => c.name.toLowerCase() === aflPlayer.name.toLowerCase(),
  );
  if (exact) return exact.id;

  const firstName = nameParts[0];
  const firstMatch = candidates.find(
    (c) =>
      c.name.split(" ")[0].toLowerCase() === firstName.toLowerCase() &&
      c.name.split(" ").pop()?.toLowerCase() === surname.toLowerCase(),
  );
  if (firstMatch) return firstMatch.id;

  if (candidates.length === 1) {
    const cSurname = candidates[0].name.split(" ").pop()?.toLowerCase();
    if (cSurname === surname.toLowerCase()) return candidates[0].id;
  }

  return null;
}

export async function fetchAflTablesHistoricalData(
  years: number[] = [2024, 2025],
): Promise<{
  fetched: number;
  matched: number;
  updated: number;
  unmatched: string[];
}> {
  console.log(`[AflTables] Starting historical data fetch for seasons: ${years.join(", ")}`);

  const allStats: AflTablesPlayerSeason[] = [];
  for (const year of years) {
    try {
      const seasonStats = await fetchSeasonStats(year);
      allStats.push(...seasonStats);
    } catch (err: any) {
      console.log(`[AflTables] Failed to fetch ${year}: ${err.message}`);
    }
  }

  const playerMap = new Map<string, AflTablesPlayerSeason[]>();
  for (const stat of allStats) {
    const key = `${stat.name}|${stat.team}`;
    const existing = playerMap.get(key) || [];
    existing.push(stat);
    playerMap.set(key, existing);
  }

  const allDbPlayers = await db
    .select({ id: players.id, name: players.name, team: players.team })
    .from(players);

  let matched = 0;
  let updated = 0;
  const unmatched: string[] = [];

  for (const [key, seasons] of playerMap.entries()) {
    const latest = seasons.sort((a, b) => b.season - a.season)[0];
    const playerId = await matchPlayerToDb(latest, allDbPlayers);

    if (!playerId) {
      if (latest.gamesPlayed >= 10) {
        unmatched.push(`${latest.name} (${latest.team}, ${latest.gamesPlayed}gm)`);
      }
      continue;
    }

    matched++;

    const totalGames = seasons.reduce((sum, s) => sum + s.gamesPlayed, 0);
    const totalDisposals = seasons.reduce((sum, s) => sum + s.disposals, 0);
    const totalGoals = seasons.reduce((sum, s) => sum + s.goals, 0);
    const totalTackles = seasons.reduce((sum, s) => sum + s.tackles, 0);
    const totalClearances = seasons.reduce((sum, s) => sum + s.clearances, 0);
    const totalMarks = seasons.reduce((sum, s) => sum + s.marks, 0);

    const latestAvgTog = latest.timeOnGround;
    const latestEstFantasy = estimateFantasyScore(latest);

    const histDisposalAvg = totalGames > 0 ? Math.round((totalDisposals / totalGames) * 10) / 10 : 0;
    const histGoalsPerGame = totalGames > 0 ? Math.round((totalGoals / totalGames) * 100) / 100 : 0;
    const histTacklesPerGame = totalGames > 0 ? Math.round((totalTackles / totalGames) * 10) / 10 : 0;
    const histClearancesPerGame = totalGames > 0 ? Math.round((totalClearances / totalGames) * 10) / 10 : 0;
    const histMarksPerGame = totalGames > 0 ? Math.round((totalMarks / totalGames) * 10) / 10 : 0;

    const uniqueSeasons = new Set(seasons.map(s => s.season)).size;
    const durability = totalGames > 0
      ? Math.min(1.0, Math.round((totalGames / (uniqueSeasons * 23)) * 100) / 100)
      : 0;

    const updates: Record<string, any> = {};

    const currentPlayer = await db
      .select({
        gamesPlayed: players.gamesPlayed,
        avgTog: players.avgTog,
        avgScore: players.avgScore,
        durabilityScore: players.durabilityScore,
        yearsExperience: players.yearsExperience,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .then(rows => rows[0]);

    if (!currentPlayer) continue;

    if ((currentPlayer.gamesPlayed || 0) === 0 && totalGames > 0) {
      updates.gamesPlayed = totalGames;
    }

    if (!currentPlayer.avgTog && latestAvgTog > 0) {
      updates.avgTog = latestAvgTog;
    }

    if ((currentPlayer.avgScore || 0) === 0 && latestEstFantasy > 0) {
      updates.avgScore = latestEstFantasy;
    }

    if (!currentPlayer.durabilityScore && durability > 0) {
      updates.durabilityScore = durability;
    }

    if (!currentPlayer.yearsExperience) {
      updates.yearsExperience = uniqueSeasons;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(players).set(updates).where(eq(players.id, playerId));
      updated++;
    }
  }

  console.log(
    `[AflTables] Matched ${matched}/${playerMap.size} unique players, updated ${updated}, unmatched ${unmatched.length}`,
  );
  if (unmatched.length > 0 && unmatched.length <= 20) {
    console.log(`[AflTables] Unmatched (10+ games): ${unmatched.join(", ")}`);
  }

  return { fetched: allStats.length, matched, updated, unmatched };
}
