import { db } from "../db";
import { players } from "@shared/schema";
import { inArray } from "drizzle-orm";

const AFL_LINEUPS_URL = "https://www.afl.com.au/matches/team-lineups";

const AFL_API_MATCHES_URL = "https://aflapi.afl.com.au/afl/v2/matches";
const COMP_SEASON_ID = 85;
const COMPETITION_ID = 1;

const TEAM_NAME_MAP: Record<string, string> = {
  "Adelaide Crows": "Adelaide",
  "Brisbane Lions": "Brisbane Lions",
  "Carlton": "Carlton",
  "Collingwood": "Collingwood",
  "Essendon": "Essendon",
  "Fremantle": "Fremantle",
  "Geelong Cats": "Geelong",
  "Gold Coast SUNS": "Gold Coast",
  "GWS GIANTS": "GWS Giants",
  "Hawthorn": "Hawthorn",
  "Melbourne": "Melbourne",
  "North Melbourne": "North Melbourne",
  "Port Adelaide": "Port Adelaide",
  "Richmond": "Richmond",
  "St Kilda": "St Kilda",
  "Sydney Swans": "Sydney",
  "West Coast Eagles": "West Coast",
  "Western Bulldogs": "Western Bulldogs",
};

function normaliseTeamName(apiName: string): string {
  return TEAM_NAME_MAP[apiName] || apiName;
}

interface LineupMatch {
  homeTeam: string;
  awayTeam: string;
  date: string;
  venue: string;
  status: string;
}

interface LineupPlayer {
  name: string;
  team: string;
  position: string;
  isEmergency: boolean;
}

export interface TeamLineupData {
  round: number;
  matches: LineupMatch[];
  byeTeams: string[];
  announcedTeams: string[];
  pendingTeams: string[];
  players: LineupPlayer[];
  lastChecked: string;
}

async function fetchFromAflApi(roundNumber: number): Promise<TeamLineupData> {
  console.log(`[AflLineups] Fetching round ${roundNumber} match data from AFL API...`);

  const url = `${AFL_API_MATCHES_URL}?competitionId=${COMPETITION_ID}&compSeasonId=${COMP_SEASON_ID}&roundNumber=${roundNumber}&pageSize=50`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AFLFantasyMachine/1.0)",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`AFL API returned ${response.status}`);
  }

  const data = await response.json();
  const matches: LineupMatch[] = [];
  const byeTeams: string[] = [];
  const playingTeams = new Set<string>();

  if (data.matches?.length > 0) {
    const roundData = data.matches[0]?.round;
    if (roundData?.byes) {
      for (const bye of roundData.byes) {
        byeTeams.push(normaliseTeamName(bye.name));
      }
    }

    for (const m of data.matches) {
      const home = normaliseTeamName(m.home?.team?.name || "");
      const away = normaliseTeamName(m.away?.team?.name || "");
      playingTeams.add(home);
      playingTeams.add(away);

      matches.push({
        homeTeam: home,
        awayTeam: away,
        date: m.utcStartTime || "",
        venue: m.venue?.name || "",
        status: m.status || "",
      });
    }
  }

  return {
    round: roundNumber,
    matches,
    byeTeams,
    announcedTeams: [],
    pendingTeams: Array.from(playingTeams),
    players: [],
    lastChecked: new Date().toISOString(),
  };
}

async function scrapeLineupPage(): Promise<{ announcedTeams: string[]; playersByTeam: Map<string, LineupPlayer[]> }> {
  console.log("[AflLineups] Scraping AFL team lineups page...");

  const response = await fetch(AFL_LINEUPS_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    console.warn(`[AflLineups] Lineup page returned ${response.status}`);
    return { announcedTeams: [], playersByTeam: new Map() };
  }

  const html = await response.text();
  const announcedTeams: string[] = [];
  const playersByTeam = new Map<string, LineupPlayer[]>();

  const teamSections = html.match(/<div[^>]*class="[^"]*team-lineup-card[^"]*"[\s\S]*?(?=<div[^>]*class="[^"]*team-lineup-card|$)/gi) || [];

  for (const section of teamSections) {
    const teamMatch = section.match(/data-team-name="([^"]+)"/i) ||
      section.match(/<h[2-4][^>]*>([^<]+)<\/h[2-4]>/i);

    if (!teamMatch) continue;

    const rawTeamName = teamMatch[1].trim();
    const teamName = normaliseTeamName(rawTeamName);

    const playerMatches = section.match(/<span[^>]*class="[^"]*player-name[^"]*"[^>]*>([^<]+)<\/span>/gi) || [];
    if (playerMatches.length > 0) {
      announcedTeams.push(teamName);
      const teamPlayers: LineupPlayer[] = playerMatches.map(pm => {
        const name = pm.replace(/<[^>]*>/g, "").trim();
        return { name, team: teamName, position: "", isEmergency: false };
      });
      playersByTeam.set(teamName, teamPlayers);
    }
  }

  return { announcedTeams, playersByTeam };
}

export async function checkTeamLineupStatus(currentRound: number): Promise<TeamLineupData> {
  const apiData = await fetchFromAflApi(currentRound);

  try {
    const { announcedTeams } = await scrapeLineupPage();
    if (announcedTeams.length > 0) {
      apiData.announcedTeams = announcedTeams;
      apiData.pendingTeams = apiData.pendingTeams.filter(t => !announcedTeams.includes(t));
    }
  } catch (e: any) {
    console.warn("[AflLineups] Lineup page scrape failed, using DB fallback:", e.message);
  }

  if (apiData.announcedTeams.length === 0) {
    const playingTeams = [...apiData.pendingTeams];
    if (playingTeams.length > 0) {
      const allPlayers = await db.select({
        team: players.team,
        selectionStatus: players.selectionStatus,
      }).from(players).where(inArray(players.team, playingTeams));

      const teamStats = new Map<string, { named: number; total: number }>();
      for (const t of playingTeams) {
        teamStats.set(t, { named: 0, total: 0 });
      }

      for (const p of allPlayers) {
        const stat = teamStats.get(p.team);
        if (!stat) continue;
        stat.total++;
        if (p.selectionStatus === "named" || p.selectionStatus === "medical_sub" || p.selectionStatus === "emergency" || p.selectionStatus === "not-playing" || p.selectionStatus === "injured" || p.selectionStatus === "omitted") {
          stat.named++;
        }
      }

      for (const [team, stat] of teamStats) {
        const classifiedRatio = stat.named / Math.max(stat.total, 1);
        if (classifiedRatio > 0.8 && stat.named >= 21) {
          apiData.announcedTeams.push(team);
          apiData.pendingTeams = apiData.pendingTeams.filter(t => t !== team);
        }
      }
    }
  }

  console.log(
    `[AflLineups] Round ${currentRound}: ${apiData.announcedTeams.length} announced, ${apiData.pendingTeams.length} pending, ${apiData.byeTeams.length} bye`
  );

  return apiData;
}

export async function syncTeamLineups(currentRound: number): Promise<TeamLineupData> {
  return await checkTeamLineupStatus(currentRound);
}
