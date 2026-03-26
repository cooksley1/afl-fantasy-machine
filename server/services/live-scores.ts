import { db } from "../db";
import { players, weeklyStats, leagueSettings, myTeamPlayers, fixtures, leagueOpponents } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

const UA = "AFL-Fantasy-Machine/1.0 (replit.app; afl-fantasy-advisor)";

export interface MatchStatus {
  id: number;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  date: string;
  localTime: string;
  homeScore: number | null;
  awayScore: number | null;
  complete: number;
  winner: string | null;
  timeStr: string | null;
  roundName: string;
}

export interface LivePlayerScore {
  playerId: number;
  playerName: string;
  team: string;
  position: string;
  fantasyScore: number;
  kicks: number;
  handballs: number;
  marks: number;
  tackles: number;
  hitouts: number;
  goals: number;
  behinds: number;
  freesAgainst: number;
  disposals: number;
  isOnMyTeam: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  effectiveScore: number;
  timeOnGround: number | null;
  matchStatus: string;
  aflFantasyId: number | null;
}

export interface LiveRoundData {
  round: number;
  matches: MatchStatus[];
  myTeamScores: LivePlayerScore[];
  totalTeamScore: number;
  projectedTeamScore: number;
  lastUpdated: string;
}

function calcFantasyScore(stats: {
  kicks?: number;
  handballs?: number;
  marks?: number;
  tackles?: number;
  hitouts?: number;
  goals?: number;
  behinds?: number;
  freesAgainst?: number;
}): number {
  return (
    (stats.kicks || 0) * 3 +
    (stats.handballs || 0) * 2 +
    (stats.marks || 0) * 3 +
    (stats.tackles || 0) * 4 +
    (stats.hitouts || 0) * 1 +
    (stats.goals || 0) * 6 +
    (stats.behinds || 0) * 1 -
    (stats.freesAgainst || 0) * 3
  );
}

export async function fetchMatchStatuses(round?: number): Promise<MatchStatus[]> {
  try {
    const year = new Date().getFullYear();
    let url = `https://api.squiggle.com.au/?q=games;year=${year}`;
    if (round != null) url += `;round=${round}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      if (!res.ok) return [];
      const data = await res.json();
      const games = data.games || [];
      
      return games.map((g: any) => ({
        id: g.id,
        homeTeam: g.hteam,
        awayTeam: g.ateam,
        venue: g.venue,
        date: g.date,
        localTime: g.localtime || g.date,
        homeScore: g.hscore,
        awayScore: g.ascore,
        complete: g.complete,
        winner: g.winner,
        timeStr: g.timestr,
        roundName: g.roundname || `Round ${round}`,
      }));
    } catch {
      clearTimeout(timeout);
      return [];
    }
  } catch (e: any) {
    console.error("fetchMatchStatuses error:", e.message);
    return [];
  }
}

export async function getLiveRoundData(round?: number, userId?: string): Promise<LiveRoundData> {
  let currentRound = round ?? 0;
  if (userId) {
    const settings = await db.select().from(leagueSettings).where(eq(leagueSettings.userId, userId)).limit(1);
    if (!round && settings[0]) currentRound = settings[0].currentRound ?? 0;
  } else {
    const settings = await db.select().from(leagueSettings).limit(1);
    if (!round && settings[0]) currentRound = settings[0].currentRound ?? 0;
  }

  const matches = await fetchMatchStatuses(currentRound);

  const myTeamQuery = userId
    ? db.select().from(myTeamPlayers).where(eq(myTeamPlayers.userId, userId)).innerJoin(players, eq(myTeamPlayers.playerId, players.id))
    : db.select().from(myTeamPlayers).innerJoin(players, eq(myTeamPlayers.playerId, players.id));
  const myTeamResult = await myTeamQuery;

  const playerIds = myTeamResult.map((row) => row.my_team_players.playerId);
  
  let existingStats: any[] = [];
  if (playerIds.length > 0) {
    existingStats = await db
      .select()
      .from(weeklyStats)
      .where(
        and(
          inArray(weeklyStats.playerId, playerIds),
          eq(weeklyStats.round, currentRound)
        )
      );
  }

  const statsMap = new Map(existingStats.map((s: any) => [s.playerId, s]));

  const myTeamScores: LivePlayerScore[] = myTeamResult
    .map((row) => {
      const tp = row.my_team_players;
      const p = row.players;
      const stats = statsMap.get(p.id);
      const kicks = stats?.kickCount || 0;
      const handballs = stats?.handballCount || 0;
      const marks = stats?.markCount || 0;
      const tackles = stats?.tackleCount || 0;
      const hitouts = stats?.hitouts || 0;
      const goals = stats?.goalsKicked || 0;
      const behinds = stats?.behindsKicked || 0;
      const freesAgainst = stats?.freesAgainst || 0;

      const fantasyScore = stats?.fantasyScore || calcFantasyScore({
        kicks, handballs, marks, tackles, hitouts, goals, behinds, freesAgainst,
      });

      const isCaptain = tp.isCaptain || false;
      const isViceCaptain = tp.isViceCaptain || false;
      const effectiveScore = isCaptain ? fantasyScore * 2 : fantasyScore;

      const match = matches.find(
        (m) => m.homeTeam === p.team || m.awayTeam === p.team
      );
      let matchStatus = "upcoming";
      if (match) {
        if (match.complete === 100) matchStatus = "complete";
        else if (match.complete > 0) matchStatus = "live";
      }

      return {
        playerId: p.id,
        playerName: p.name,
        team: p.team,
        position: p.position,
        fantasyScore,
        kicks,
        handballs,
        marks,
        tackles,
        hitouts,
        goals,
        behinds,
        freesAgainst,
        disposals: kicks + handballs,
        isOnMyTeam: true,
        isCaptain,
        isViceCaptain,
        effectiveScore,
        timeOnGround: stats?.timeOnGroundPercent || null,
        matchStatus,
        aflFantasyId: p.aflFantasyId || null,
        isOnField: tp.isOnField ?? true,
        selectionStatus: p.selectionStatus || "selected",
        fieldPosition: tp.fieldPosition || p.position?.split("/")[0] || "MID",
      };
    });

  const onFieldScores = myTeamScores.filter((s) => {
    const row = myTeamResult.find((r) => r.my_team_players.playerId === s.playerId);
    return row?.my_team_players.isOnField;
  });

  const totalTeamScore = onFieldScores.reduce(
    (sum, s) => sum + s.effectiveScore,
    0
  );

  const projectedTeamScore = myTeamResult
    .filter((row) => row.my_team_players.isOnField)
    .reduce((sum: number, row) => {
      const p = row.players;
      const proj = p.projectedScore || p.avgScore || 0;
      const multiplier = row.my_team_players.isCaptain ? 2 : 1;
      return sum + proj * multiplier;
    }, 0);

  return {
    round: currentRound,
    matches,
    myTeamScores,
    totalTeamScore,
    projectedTeamScore,
    lastUpdated: new Date().toISOString(),
  };
}

export async function updatePlayerLiveStats(
  playerId: number,
  round: number,
  stats: {
    kicks?: number;
    handballs?: number;
    marks?: number;
    tackles?: number;
    hitouts?: number;
    goals?: number;
    behinds?: number;
    freesAgainst?: number;
    timeOnGround?: number;
  }
): Promise<{ fantasyScore: number }> {
  const fantasyScore = calcFantasyScore(stats);

  const existing = await db
    .select()
    .from(weeklyStats)
    .where(
      and(
        eq(weeklyStats.playerId, playerId),
        eq(weeklyStats.round, round)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(weeklyStats)
      .set({
        fantasyScore,
        kickCount: stats.kicks ?? existing[0].kickCount,
        handballCount: stats.handballs ?? existing[0].handballCount,
        markCount: stats.marks ?? existing[0].markCount,
        tackleCount: stats.tackles ?? existing[0].tackleCount,
        hitouts: stats.hitouts ?? existing[0].hitouts,
        goalsKicked: stats.goals ?? existing[0].goalsKicked,
        behindsKicked: stats.behinds ?? existing[0].behindsKicked,
        freesAgainst: stats.freesAgainst ?? existing[0].freesAgainst,
        timeOnGroundPercent: stats.timeOnGround ?? existing[0].timeOnGroundPercent,
      })
      .where(eq(weeklyStats.id, existing[0].id));
  } else {
    const player = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);

    await db.insert(weeklyStats).values({
      playerId,
      round,
      opponent: player[0]?.nextOpponent || null,
      venue: player[0]?.venue || null,
      fantasyScore,
      kickCount: stats.kicks || 0,
      handballCount: stats.handballs || 0,
      markCount: stats.marks || 0,
      tackleCount: stats.tackles || 0,
      hitouts: stats.hitouts || 0,
      goalsKicked: stats.goals || 0,
      behindsKicked: stats.behinds || 0,
      freesAgainst: stats.freesAgainst || 0,
      timeOnGroundPercent: stats.timeOnGround || null,
    });
  }

  return { fantasyScore };
}

const fetchInProgress = new Set<string>();

async function fetchMatchFromFootywire(homeTeam: string, awayTeam: string, round: number): Promise<void> {
  const key = `${homeTeam}-${awayTeam}-${round}`;
  if (fetchInProgress.has(key)) return;
  fetchInProgress.add(key);

  try {
    const year = new Date().getFullYear();
    const matchIds = await fetchFootywireMatchIds(year);

    const allDbPlayers = await db.select().from(players);
    const nameMap = new Map(allDbPlayers.map(p => [p.name.toLowerCase(), p]));
    const lastNameMap = new Map<string, typeof allDbPlayers[0][]>();
    for (const p of allDbPlayers) {
      const parts = p.name.split(" ");
      const ln = parts[parts.length - 1].toLowerCase();
      if (!lastNameMap.has(ln)) lastNameMap.set(ln, []);
      lastNameMap.get(ln)!.push(p);
    }

    for (const mid of matchIds) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`https://www.footywire.com/afl/footy/ft_match_statistics?mid=${mid}`, {
          headers: { "User-Agent": UA },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) continue;

        const html = await res.text();
        const parsed = parseFootywireMatchPage(html);
        if (!parsed) continue;
        if (parsed.round !== round) continue;

        const matchTeams = [parsed.team1.toLowerCase(), parsed.team2.toLowerCase()];
        const requestTeams = [homeTeam.toLowerCase(), awayTeam.toLowerCase()];
        if (!matchTeams.some(t => requestTeams.includes(t))) continue;

        let updated = 0;
        for (const fp of parsed.players) {
          let dbPlayer = nameMap.get(fp.name.toLowerCase());
          if (!dbPlayer) {
            const parts = fp.name.split(" ");
            const lastName = parts[parts.length - 1].toLowerCase();
            const candidates = lastNameMap.get(lastName) || [];
            if (candidates.length === 1) dbPlayer = candidates[0];
            else if (candidates.length > 1) {
              const firstName = parts[0].toLowerCase();
              dbPlayer = candidates.find(c => c.name.toLowerCase().startsWith(firstName));
            }
          }
          if (!dbPlayer) {
            const inferredPos = inferPosition(fp);
            try {
              const [newPlayer] = await db.insert(players).values({
                name: fp.name,
                team: fp.team,
                position: inferredPos,
                price: 200000,
                avgScore: fp.fantasyScore,
                last3Avg: fp.fantasyScore,
                last5Avg: fp.fantasyScore,
                gamesPlayed: 0,
                isDebutant: true,
                isNamedTeam: true,
              }).returning();
              dbPlayer = newPlayer;
              nameMap.set(fp.name.toLowerCase(), newPlayer);
              console.log(`[LiveScores] Auto-added missing player: ${fp.name} (${fp.team}, ${inferredPos})`);
            } catch { continue; }
          }
          const opponent = fp.team === parsed.team1 ? parsed.team2 : parsed.team1;
          await upsertPlayerStats(dbPlayer, round, fp, opponent);
          updated++;
        }
        console.log(`[LiveScores] Auto-populated ${updated} player stats for ${homeTeam} vs ${awayTeam} (round ${round})`);
        break;
      } catch { continue; }
    }
  } catch (e: any) {
    console.error(`[LiveScores] fetchMatchFromFootywire error:`, e.message);
  } finally {
    fetchInProgress.delete(key);
  }
}

export async function getMatchPlayers(
  homeTeam: string,
  awayTeam: string,
  round: number,
  userId?: string
): Promise<LivePlayerScore[]> {
  const allMatchPlayers = await db
    .select()
    .from(players)
    .where(
      inArray(players.team, [homeTeam, awayTeam])
    );

  const myTeamQuery = userId
    ? db.select().from(myTeamPlayers).where(eq(myTeamPlayers.userId, userId)).innerJoin(players, eq(myTeamPlayers.playerId, players.id))
    : db.select().from(myTeamPlayers).innerJoin(players, eq(myTeamPlayers.playerId, players.id));
  const myTeamResult = await myTeamQuery;

  const myTeamMap = new Map(
    myTeamResult.map((row) => [
      row.my_team_players.playerId,
      row.my_team_players,
    ])
  );

  let playerIds = allMatchPlayers.map((p) => p.id);
  let existingStats: any[] = [];
  if (playerIds.length > 0) {
    existingStats = await db
      .select()
      .from(weeklyStats)
      .where(
        and(
          inArray(weeklyStats.playerId, playerIds),
          eq(weeklyStats.round, round)
        )
      );
  }

  if (existingStats.length === 0) {
    await fetchMatchFromFootywire(homeTeam, awayTeam, round);

    const { recalculatePlayerAverages } = await import("../expand-players");
    await recalculatePlayerAverages();

    const refreshedPlayers = await db.select().from(players)
      .where(inArray(players.team, [homeTeam, awayTeam]));
    const refreshedIds = refreshedPlayers.map(p => p.id);

    if (refreshedIds.length > 0) {
      existingStats = await db.select().from(weeklyStats)
        .where(and(inArray(weeklyStats.playerId, refreshedIds), eq(weeklyStats.round, round)));
    }

    if (refreshedPlayers.length > allMatchPlayers.length) {
      allMatchPlayers.length = 0;
      allMatchPlayers.push(...refreshedPlayers);
      playerIds = refreshedIds;
    }
  }

  const statsMap = new Map(existingStats.map((s: any) => [s.playerId, s]));

  return allMatchPlayers.map((p) => {
    const stats = statsMap.get(p.id);
    const tp = myTeamMap.get(p.id);
    const kicks = stats?.kickCount || 0;
    const handballs = stats?.handballCount || 0;
    const marks = stats?.markCount || 0;
    const tackles = stats?.tackleCount || 0;
    const hitouts = stats?.hitouts || 0;
    const goals = stats?.goalsKicked || 0;
    const behinds = stats?.behindsKicked || 0;
    const freesAgainst = stats?.freesAgainst || 0;

    const fantasyScore =
      stats?.fantasyScore ||
      calcFantasyScore({
        kicks,
        handballs,
        marks,
        tackles,
        hitouts,
        goals,
        behinds,
        freesAgainst,
      });

    const isCaptain = tp?.isCaptain || false;
    const isViceCaptain = tp?.isViceCaptain || false;
    const isOnMyTeam = !!tp;
    const effectiveScore = isCaptain ? fantasyScore * 2 : fantasyScore;

    return {
      playerId: p.id,
      playerName: p.name,
      team: p.team,
      position: p.position,
      fantasyScore,
      kicks,
      handballs,
      marks,
      tackles,
      hitouts,
      goals,
      behinds,
      freesAgainst,
      disposals: kicks + handballs,
      isOnMyTeam,
      isCaptain,
      isViceCaptain,
      effectiveScore,
      timeOnGround: stats?.timeOnGroundPercent || null,
      matchStatus: "upcoming",
      aflFantasyId: p.aflFantasyId || null,
    };
  });
}

async function fetchFootywireMatchIds(year: number): Promise<number[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://www.footywire.com/afl/footy/ft_match_list?year=${year}`, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const html = await res.text();
    const ids: number[] = [];
    const regex = /mid=(\d+)/g;
    let m;
    while ((m = regex.exec(html))) {
      const id = parseInt(m[1]);
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

interface FootywirePlayerStat {
  name: string;
  team: string;
  kicks: number;
  handballs: number;
  marks: number;
  goals: number;
  behinds: number;
  tackles: number;
  hitouts: number;
  freesAgainst: number;
  fantasyScore: number;
  inside50s: number;
  rebound50s: number;
}

function parseFootywireMatchPage(html: string): { round: number; team1: string; team2: string; players: FootywirePlayerStat[] } | null {
  let titleMatch = html.match(/<TITLE>[^:]*:\s*(.+?)\s+(?:defeats|drew with)\s+(.+?)\s+at\s+.+?Round\s+(\d+)/i);
  let round: number;
  if (titleMatch) {
    round = parseInt(titleMatch[3]);
  } else {
    titleMatch = html.match(/<TITLE>[^:]*:\s*(.+?)\s+(?:defeats|drew with)\s+(.+?)\s+at\s+.+?Opening\s+Round/i);
    if (!titleMatch) return null;
    round = 0;
  }

  const team1Name = titleMatch[1].trim();
  const team2Name = titleMatch[2].trim();

  const t1idx = html.indexOf('<a name=t1>');
  const t2idx = html.indexOf('<a name=t2>');

  const allPlayers: FootywirePlayerStat[] = [];
  const rowRegex = /title="([^"]+)">[^<]+<\/a>\s*<\/td>([\s\S]*?)(?=<\/tr>)/g;
  let m;
  while ((m = rowRegex.exec(html))) {
    const name = m[1];
    const team = (t2idx > 0 && m.index > t2idx) ? team2Name : team1Name;
    const cellsHtml = m[2];
    const vals: number[] = [];
    const cellRegex = /<td[^>]*class="statdata"[^>]*>([^<]*)<\/td>/g;
    let c;
    while ((c = cellRegex.exec(cellsHtml))) {
      vals.push(parseInt(c[1].trim()) || 0);
    }
    if (vals.length >= 15) {
      allPlayers.push({
        name,
        team,
        kicks: vals[0],
        handballs: vals[1],
        marks: vals[3],
        goals: vals[4],
        behinds: vals[5],
        tackles: vals[6],
        hitouts: vals[7],
        inside50s: vals[9] || 0,
        rebound50s: vals[12] || 0,
        freesAgainst: vals[14],
        fantasyScore: vals[15] || 0,
      });
    }
  }

  return { round, team1: team1Name, team2: team2Name, players: allPlayers };
}

async function upsertPlayerStats(
  dbPlayer: any,
  round: number,
  stats: FootywirePlayerStat,
  opponent: string | null
): Promise<void> {
  const existing = await db.select().from(weeklyStats)
    .where(and(eq(weeklyStats.playerId, dbPlayer.id), eq(weeklyStats.round, round)))
    .limit(1);

  const data = {
    fantasyScore: stats.fantasyScore || calcFantasyScore({
      kicks: stats.kicks, handballs: stats.handballs, marks: stats.marks,
      tackles: stats.tackles, hitouts: stats.hitouts, goals: stats.goals,
      behinds: stats.behinds, freesAgainst: stats.freesAgainst,
    }),
    kickCount: stats.kicks,
    handballCount: stats.handballs,
    markCount: stats.marks,
    tackleCount: stats.tackles,
    hitouts: stats.hitouts,
    goalsKicked: stats.goals,
    behindsKicked: stats.behinds,
    freesAgainst: stats.freesAgainst,
    inside50s: stats.inside50s,
    rebound50s: stats.rebound50s,
  };

  if (existing.length > 0) {
    await db.update(weeklyStats).set(data).where(eq(weeklyStats.id, existing[0].id));
  } else {
    await db.insert(weeklyStats).values({
      playerId: dbPlayer.id,
      round,
      opponent,
      ...data,
    });
  }
}

function inferPosition(stats: FootywirePlayerStat): string {
  if (stats.hitouts >= 10) return "RUC";
  if (stats.goals >= 3) return "FWD";
  if (stats.rebound50s >= 4 || (stats.kicks > stats.handballs * 2 && stats.inside50s < 3)) return "DEF";
  if (stats.inside50s >= 5 || stats.goals >= 2) return "FWD";
  return "MID";
}

async function fetchFromSquigglePlayerStats(round: number): Promise<{ fetched: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let fetched = 0;
  let updated = 0;

  try {
    const year = new Date().getFullYear();
    const url = `https://api.squiggle.com.au/?q=players;year=${year};round=${round}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      errors.push(`Squiggle player stats API returned ${res.status}`);
      return { fetched: 0, updated: 0, errors };
    }

    const data = await res.json();
    const squigglePlayers = data.players || [];
    if (squigglePlayers.length === 0) {
      errors.push(`No player stats available from Squiggle for round ${round}`);
      return { fetched: 0, updated: 0, errors };
    }

    const allDbPlayers = await db.select().from(players);
    const nameMap = new Map(allDbPlayers.map(p => [p.name.toLowerCase(), p]));
    const lastNameMap = new Map<string, typeof allDbPlayers[0][]>();
    for (const p of allDbPlayers) {
      const parts = p.name.split(" ");
      const ln = parts[parts.length - 1].toLowerCase();
      if (!lastNameMap.has(ln)) lastNameMap.set(ln, []);
      lastNameMap.get(ln)!.push(p);
    }

    for (const sp of squigglePlayers) {
      const playerName = `${sp.firstname || ""} ${sp.surname || ""}`.trim();
      if (!playerName) continue;

      let dbPlayer = nameMap.get(playerName.toLowerCase());
      if (!dbPlayer) {
        const surname = (sp.surname || "").toLowerCase();
        const candidates = lastNameMap.get(surname) || [];
        if (candidates.length === 1) dbPlayer = candidates[0];
        else if (candidates.length > 1) {
          const firstName = (sp.firstname || "").toLowerCase();
          dbPlayer = candidates.find(c => c.name.toLowerCase().startsWith(firstName));
        }
      }

      if (!dbPlayer) continue;

      const kicks = sp.kicks || 0;
      const handballs = sp.handballs || 0;
      const marks = sp.marks || 0;
      const tackles = sp.tackles || 0;
      const hitouts = sp.hitouts || 0;
      const goals = sp.goals || 0;
      const behinds = sp.behinds || 0;
      const freesAgainst = sp.freesagainst || 0;

      const fantasyScore = sp.dreamteampoints || calcFantasyScore({
        kicks, handballs, marks, tackles, hitouts, goals, behinds, freesAgainst,
      });

      const fpStat: FootywirePlayerStat = {
        name: playerName,
        team: sp.team || dbPlayer.team,
        kicks, handballs, marks, goals, behinds, tackles, hitouts,
        freesAgainst,
        fantasyScore,
        inside50s: sp.inside50s || 0,
        rebound50s: sp.rebound50s || 0,
      };

      await upsertPlayerStats(dbPlayer, round, fpStat, null);
      updated++;
      fetched++;
    }

    if (updated > 0) {
      console.log(`[LiveScores] Squiggle: Fetched ${fetched} player stats, updated ${updated} for round ${round}`);
    }
  } catch (e: any) {
    errors.push(`Squiggle fetch error: ${e.message}`);
    console.error("[LiveScores] Squiggle player stats error:", e.message);
  }

  return { fetched, updated, errors };
}

async function fetchFromDTLive(round: number): Promise<{ fetched: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let fetched = 0;
  let updated = 0;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch("https://dtlive.com.au/afl/dataview.php", {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      errors.push(`DTLive returned ${res.status}`);
      return { fetched, updated, errors };
    }

    const html = await res.text();
    const rowRegex = /<tr><td>[\s\S]*?<\/tr>/g;
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;

    const TEAM_MAP: Record<string, string> = {
      "ADE": "Adelaide", "BRL": "Brisbane Lions", "CAR": "Carlton",
      "COL": "Collingwood", "ESS": "Essendon", "FRE": "Fremantle",
      "GEE": "Geelong", "GCS": "Gold Coast", "GWS": "GWS Giants",
      "HAW": "Hawthorn", "MEL": "Melbourne", "NTH": "North Melbourne",
      "PTA": "Port Adelaide", "RIC": "Richmond", "STK": "St Kilda",
      "SYD": "Sydney", "WCE": "West Coast", "WBD": "Western Bulldogs",
    };

    const allDbPlayers = await db.select().from(players);
    const nameMap = new Map(allDbPlayers.map(p => [p.name.toLowerCase(), p]));
    const lastNameTeamMap = new Map<string, typeof allDbPlayers[0][]>();
    for (const p of allDbPlayers) {
      const parts = p.name.split(" ");
      const key = `${parts[parts.length - 1].toLowerCase()}|${p.team}`;
      if (!lastNameTeamMap.has(key)) lastNameTeamMap.set(key, []);
      lastNameTeamMap.get(key)!.push(p);
    }

    const existingStats = await db.select({ playerId: weeklyStats.playerId })
      .from(weeklyStats).where(eq(weeklyStats.round, round));
    const alreadyHasStats = new Set(existingStats.map(s => s.playerId));

    const roundCellIndex = 14 + round;

    let rowMatch;
    while ((rowMatch = rowRegex.exec(html))) {
      const cells: string[] = [];
      let tdMatch;
      const localTdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      while ((tdMatch = localTdRegex.exec(rowMatch[0]))) {
        cells.push(tdMatch[1].replace(/<[^>]+>/g, "").trim());
      }

      if (cells.length <= roundCellIndex) continue;
      const scoreStr = cells[roundCellIndex];
      if (!scoreStr || scoreStr === "-" || scoreStr === "") continue;
      const score = parseInt(scoreStr);
      if (isNaN(score)) continue;

      const teamMatch = rowMatch[0].match(/images\/(\w+)\.png/);
      const teamCode = teamMatch?.[1] || "";
      const team = TEAM_MAP[teamCode] || teamCode;
      const shortName = cells[1] || "";
      if (!shortName) continue;

      const nameParts = shortName.split(" ");
      const surname = nameParts[nameParts.length - 1].toLowerCase();
      const initial = nameParts[0]?.replace(".", "") || "";

      let dbPlayer: typeof allDbPlayers[0] | undefined;

      const teamCandidates = lastNameTeamMap.get(`${surname}|${team}`) || [];
      if (teamCandidates.length === 1) {
        dbPlayer = teamCandidates[0];
      } else if (teamCandidates.length > 1) {
        dbPlayer = teamCandidates.find(c => c.name.split(" ")[0].toLowerCase().startsWith(initial.toLowerCase()));
      }

      if (!dbPlayer) continue;
      if (alreadyHasStats.has(dbPlayer.id)) continue;

      await db.insert(weeklyStats).values({
        playerId: dbPlayer.id,
        round,
        opponent: null,
        fantasyScore: score,
        kickCount: 0,
        handballCount: 0,
        markCount: 0,
        tackleCount: 0,
        hitouts: 0,
        goalsKicked: 0,
        behindsKicked: 0,
        freesAgainst: 0,
      });

      alreadyHasStats.add(dbPlayer.id);
      fetched++;
      updated++;
    }

    if (updated > 0) {
      console.log(`[LiveScores] DTLive: Filled ${updated} player scores for round ${round}`);
    }
  } catch (e: any) {
    errors.push(`DTLive fetch error: ${e.message}`);
    console.error("[LiveScores] DTLive score fetch error:", e.message);
  }

  return { fetched, updated, errors };
}

const AFL_FANTASY_SQUAD_MAP_LIVE: Record<number, string> = {
  10: "Adelaide", 20: "Brisbane Lions", 30: "Carlton", 40: "Collingwood",
  50: "Essendon", 60: "Fremantle", 70: "Geelong", 1000: "Gold Coast",
  1010: "GWS Giants", 80: "Hawthorn", 90: "Melbourne", 100: "North Melbourne",
  110: "Port Adelaide", 120: "Richmond", 130: "St Kilda", 160: "Sydney",
  140: "West Coast", 150: "Western Bulldogs",
};

async function fetchFromAflFantasyApi(round: number): Promise<{ fetched: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let fetched = 0;
  let updated = 0;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch("https://fantasy.afl.com.au/data/afl/players.json", {
      headers: { "Accept-Encoding": "gzip, deflate" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      errors.push(`AFL Fantasy API returned ${res.status}`);
      return { fetched, updated, errors };
    }

    const aflPlayers: any[] = await res.json();
    if (!aflPlayers || aflPlayers.length === 0) {
      errors.push("AFL Fantasy API returned no players");
      return { fetched, updated, errors };
    }

    const roundKey = String(round);

    const allDbPlayers = await db.select().from(players);
    const aflIdMap = new Map<number, typeof allDbPlayers[0]>();
    const nameMap = new Map<string, typeof allDbPlayers[0]>();
    for (const p of allDbPlayers) {
      if (p.aflFantasyId) aflIdMap.set(p.aflFantasyId, p);
      nameMap.set(p.name.toLowerCase(), p);
    }

    let playersWithScores = 0;
    for (const ap of aflPlayers) {
      const scores = ap.stats?.scores;
      if (!scores) continue;

      const liveScore = scores[roundKey];
      if (liveScore == null) continue;

      playersWithScores++;

      let dbPlayer = aflIdMap.get(ap.id);
      if (!dbPlayer) {
        const fullName = `${ap.first_name} ${ap.last_name}`.trim().toLowerCase();
        dbPlayer = nameMap.get(fullName);
      }
      if (!dbPlayer) continue;

      const existing = await db.select().from(weeklyStats)
        .where(and(eq(weeklyStats.playerId, dbPlayer.id), eq(weeklyStats.round, round)))
        .limit(1);

      if (existing.length > 0) {
        if (existing[0].fantasyScore !== liveScore) {
          await db.update(weeklyStats).set({ fantasyScore: liveScore })
            .where(eq(weeklyStats.id, existing[0].id));
          updated++;
        }
      } else {
        await db.insert(weeklyStats).values({
          playerId: dbPlayer.id,
          round,
          opponent: dbPlayer.nextOpponent || null,
          fantasyScore: liveScore,
          kickCount: 0,
          handballCount: 0,
          markCount: 0,
          tackleCount: 0,
          hitouts: 0,
          goalsKicked: 0,
          behindsKicked: 0,
          freesAgainst: 0,
        });
        updated++;
      }
      fetched++;
    }

    if (fetched > 0) {
      console.log(`[LiveScores] AFL Fantasy API: ${fetched} players with round ${round} scores (${playersWithScores} had data), ${updated} DB updates`);
    }
  } catch (e: any) {
    errors.push(`AFL Fantasy API fetch error: ${e.message}`);
    console.error("[LiveScores] AFL Fantasy API live fetch error:", e.message);
  }

  return { fetched, updated, errors };
}

export async function fetchAndStorePlayerScores(round: number): Promise<{ fetched: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let fetched = 0;
  let updated = 0;

  try {
    const aflResult = await fetchFromAflFantasyApi(round);
    fetched += aflResult.fetched;
    updated += aflResult.updated;
    if (aflResult.errors.length > 0) {
      errors.push(...aflResult.errors);
    }

    const year = new Date().getFullYear();
    const matchIds = await fetchFootywireMatchIds(year);

    const allDbPlayers = await db.select().from(players);
    const nameMap = new Map(allDbPlayers.map(p => [p.name.toLowerCase(), p]));
    const lastNameMap = new Map<string, typeof allDbPlayers[0][]>();
    for (const p of allDbPlayers) {
      const parts = p.name.split(" ");
      const lastName = parts[parts.length - 1].toLowerCase();
      if (!lastNameMap.has(lastName)) lastNameMap.set(lastName, []);
      lastNameMap.get(lastName)!.push(p);
    }

    if (matchIds.length > 0) {
      for (const mid of matchIds) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const res = await fetch(`https://www.footywire.com/afl/footy/ft_match_statistics?mid=${mid}`, {
            headers: { "User-Agent": UA },
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!res.ok) continue;

          const html = await res.text();
          const parsed = parseFootywireMatchPage(html);
          if (!parsed) continue;
          if (parsed.round !== round) continue;

          fetched += parsed.players.length;

          for (const fp of parsed.players) {
            let dbPlayer = nameMap.get(fp.name.toLowerCase());

            if (!dbPlayer) {
              const parts = fp.name.split(" ");
              const lastName = parts[parts.length - 1].toLowerCase();
              const candidates = lastNameMap.get(lastName) || [];
              if (candidates.length === 1) {
                dbPlayer = candidates[0];
              } else if (candidates.length > 1) {
                const firstName = parts[0].toLowerCase();
                dbPlayer = candidates.find(c => c.name.toLowerCase().startsWith(firstName));
              }
            }

            if (!dbPlayer) {
              const inferredPosition = inferPosition(fp);
              try {
                const [newPlayer] = await db.insert(players).values({
                  name: fp.name,
                  team: fp.team,
                  position: inferredPosition,
                  price: 200000,
                  avgScore: fp.fantasyScore,
                  last3Avg: fp.fantasyScore,
                  last5Avg: fp.fantasyScore,
                  gamesPlayed: 0,
                  isDebutant: true,
                  isNamedTeam: true,
                }).returning();
                dbPlayer = newPlayer;
                nameMap.set(fp.name.toLowerCase(), newPlayer);
                const lnParts = fp.name.split(" ");
                const ln = lnParts[lnParts.length - 1].toLowerCase();
                if (!lastNameMap.has(ln)) lastNameMap.set(ln, []);
                lastNameMap.get(ln)!.push(newPlayer);
                console.log(`[LiveScores] Auto-added missing player: ${fp.name} (${fp.team}, ${inferredPosition})`);
              } catch (insertErr: any) {
                console.error(`[LiveScores] Failed to auto-add player ${fp.name}:`, insertErr.message);
                continue;
              }
            }

            const opponent = fp.team === parsed.team1 ? parsed.team2 : parsed.team1;
            await upsertPlayerStats(dbPlayer, round, fp, opponent);
            updated++;
          }
        } catch (matchErr: any) {
          console.error(`[LiveScores] Error fetching match ${mid}:`, matchErr.message);
        }
      }
    }

    if (fetched > 0) {
      console.log(`[LiveScores] Footywire: Fetched ${fetched} player stats, updated ${updated} in DB for round ${round}`);
    }

    console.log(`[LiveScores] Trying Squiggle player stats for round ${round} to fill gaps...`);
    const squiggleResult = await fetchFromSquigglePlayerStats(round);
    fetched += squiggleResult.fetched;
    updated += squiggleResult.updated;
    errors.push(...squiggleResult.errors);

    console.log(`[LiveScores] Trying DTLive scores for round ${round} to fill gaps...`);
    const dtliveResult = await fetchFromDTLive(round);
    fetched += dtliveResult.fetched;
    updated += dtliveResult.updated;

    if (fetched === 0 && errors.length === 0) {
      errors.push(`No player stats available for round ${round} from any source. The round may not have started yet.`);
    }
  } catch (e: any) {
    errors.push(`Fetch error: ${e.message}`);
    console.error("[LiveScores] fetchAndStorePlayerScores error:", e.message);
  }

  return { fetched, updated, errors };
}

export async function fetchScoresForCompletedRounds(): Promise<{ totalFetched: number; totalUpdated: number; roundsProcessed: number }> {
  let totalFetched = 0;
  let totalUpdated = 0;
  let roundsProcessed = 0;

  try {
    const completedRounds = new Set<number>();

    const settings = await db.select().from(leagueSettings).limit(1);
    const currentRound = settings[0]?.currentRound ?? 0;
    console.log(`[LiveScores] Current round is ${currentRound}, marking rounds 0-${currentRound - 1} as completed`);
    for (let r = 0; r < currentRound; r++) {
      completedRounds.add(r);
    }

    try {
      const matches = await fetchMatchStatuses();
      for (const m of matches) {
        if (m.complete === 100) {
          const roundNum = parseInt(m.roundName.replace(/\D/g, ""), 10);
          if (!isNaN(roundNum)) completedRounds.add(roundNum);
          else if (m.roundName.toLowerCase().includes("opening")) completedRounds.add(0);
        }
      }
    } catch {
    }

    if (completedRounds.size === 0) {
      console.log("[LiveScores] No completed rounds found to fetch scores for");
      return { totalFetched: 0, totalUpdated: 0, roundsProcessed: 0 };
    }

    const existingStatRounds = await db.selectDistinct({ round: weeklyStats.round }).from(weeklyStats);
    const roundsAlreadyFetched = new Set(existingStatRounds.map(r => r.round));

    for (const round of completedRounds) {
      if (roundsAlreadyFetched.has(round)) {
        continue;
      }

      console.log(`[LiveScores] Auto-fetching scores for completed round ${round} (first fetch)`);
      const result = await fetchAndStorePlayerScores(round);
      totalFetched += result.fetched;
      totalUpdated += result.updated;
      roundsProcessed++;

      if (result.errors.length > 0) {
        console.log(`[LiveScores] Round ${round} fetch errors: ${result.errors.join("; ")}`);
      }
    }

    if (roundsProcessed > 0) {
      console.log(`[LiveScores] Auto-fetched scores for ${roundsProcessed} rounds: ${totalFetched} fetched, ${totalUpdated} updated`);
    }
  } catch (e: any) {
    console.error("[LiveScores] fetchScoresForCompletedRounds error:", e.message);
  }

  return { totalFetched, totalUpdated, roundsProcessed };
}

export async function bulkUpdateLiveScores(
  round: number,
  scores: Array<{ playerId: number; fantasyScore: number }>
): Promise<{ updated: number }> {
  let updated = 0;
  for (const { playerId, fantasyScore } of scores) {
    const existing = await db
      .select()
      .from(weeklyStats)
      .where(
        and(
          eq(weeklyStats.playerId, playerId),
          eq(weeklyStats.round, round)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(weeklyStats)
        .set({ fantasyScore })
        .where(eq(weeklyStats.id, existing[0].id));
    } else {
      await db.insert(weeklyStats).values({
        playerId,
        round,
        fantasyScore,
      });
    }
    updated++;
  }
  return { updated };
}

export async function detectAndAdvanceRound(): Promise<{ previousRound: number; newRound: number; advanced: boolean }> {
  try {
    const year = new Date().getFullYear();
    const res = await fetch(`https://api.squiggle.com.au/?q=games;year=${year}`, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return { previousRound: 0, newRound: 0, advanced: false };
    const data = await res.json();
    const games = data.games || [];

    const completedRounds = new Set<number>();
    const allRounds = new Set<number>();

    for (const g of games) {
      const roundStr = (g.roundname || "").toLowerCase();
      let roundNum: number;
      if (roundStr.includes("opening")) {
        roundNum = 0;
      } else if (roundStr.startsWith("round ")) {
        roundNum = parseInt(roundStr.replace(/\D/g, ""), 10);
        if (isNaN(roundNum)) continue;
      } else {
        continue;
      }
      allRounds.add(roundNum);
      if (g.complete === 100) completedRounds.add(roundNum);
    }

    const roundsArray = Array.from(allRounds).sort((a, b) => a - b);
    let latestFullyCompleted = -1;
    for (const r of roundsArray) {
      const roundGames = games.filter((g: any) => {
        const rn = (g.roundname || "").toLowerCase();
        if (rn.includes("opening")) return r === 0;
        if (rn.startsWith("round ")) {
          const parsed = parseInt(rn.replace(/\D/g, ""), 10);
          return parsed === r;
        }
        return false;
      });
      const allComplete = roundGames.every((g: any) => g.complete === 100);
      if (allComplete && roundGames.length > 0) {
        latestFullyCompleted = r;
      } else {
        break;
      }
    }

    const nextRound = latestFullyCompleted + 1;

    const allSettings = await db.select().from(leagueSettings);
    let advanced = false;
    let previousRound = 0;
    let advancedCount = 0;

    for (const s of allSettings) {
      if (s.currentRound < nextRound) {
        previousRound = s.currentRound;
        await db.update(leagueSettings)
          .set({ currentRound: nextRound })
          .where(eq(leagueSettings.id, s.id));
        advanced = true;
        advancedCount++;
      }
    }

    if (advanced) {
      console.log(`[RoundAdvance] Advanced ${advancedCount} settings from round ${previousRound} to ${nextRound} (rounds 0-${latestFullyCompleted} fully completed)`);
    } else {
      const currentMax = allSettings.length > 0 ? Math.max(...allSettings.map(s => s.currentRound)) : 0;
      console.log(`[RoundAdvance] No advancement needed (settings already at round ${currentMax}, detected next round ${nextRound})`);
    }

    try {
      const { syncPlayerFixtures } = await import("./fixture-service");
      await syncPlayerFixtures(nextRound);
    } catch (e: any) {
      console.log(`[RoundAdvance] Fixture sync error: ${e.message}`);
    }

    return { previousRound, newRound: nextRound, advanced };
  } catch (e: any) {
    console.error("[RoundAdvance] Error detecting round:", e.message);
    return { previousRound: 0, newRound: 0, advanced: false };
  }
}

export interface ActiveGameWindow {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  status: "live" | "just_finished" | "upcoming_soon";
  complete: number;
  timeStr: string | null;
  minutesSinceEnd?: number;
  minutesUntilStart?: number;
  teamsInvolved: string[];
}

export async function getActiveGameWindows(round?: number): Promise<{
  windows: ActiveGameWindow[];
  hasActiveGames: boolean;
  suggestedPollInterval: number;
}> {
  try {
    const matches = await fetchMatchStatuses(round);
    const now = Date.now();
    const windows: ActiveGameWindow[] = [];

    for (const m of matches) {
      if (m.complete > 0 && m.complete < 100) {
        windows.push({
          matchId: m.id,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          venue: m.venue,
          status: "live",
          complete: m.complete,
          timeStr: m.timeStr,
          teamsInvolved: [m.homeTeam, m.awayTeam],
        });
      } else if (m.complete === 100) {
        const matchDate = new Date(m.localTime || m.date);
        const gameDurationMs = 3 * 60 * 60 * 1000;
        const estimatedEnd = matchDate.getTime() + gameDurationMs;
        const msSinceEnd = now - estimatedEnd;
        const minutesSinceEnd = Math.floor(msSinceEnd / 60000);

        if (minutesSinceEnd >= 0 && minutesSinceEnd <= 15) {
          windows.push({
            matchId: m.id,
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            venue: m.venue,
            status: "just_finished",
            complete: 100,
            timeStr: m.timeStr,
            minutesSinceEnd,
            teamsInvolved: [m.homeTeam, m.awayTeam],
          });
        }
      } else if (m.complete === 0) {
        const matchDate = new Date(m.localTime || m.date);
        const msUntilStart = matchDate.getTime() - now;
        const minutesUntilStart = Math.floor(msUntilStart / 60000);

        if (minutesUntilStart >= 0 && minutesUntilStart <= 30) {
          windows.push({
            matchId: m.id,
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            venue: m.venue,
            status: "upcoming_soon",
            complete: 0,
            timeStr: m.timeStr,
            minutesUntilStart,
            teamsInvolved: [m.homeTeam, m.awayTeam],
          });
        }
      }
    }

    const hasActiveGames = windows.some(w => w.status === "live" || w.status === "just_finished");
    const suggestedPollInterval = windows.some(w => w.status === "live") ? 30000 :
      windows.some(w => w.status === "just_finished") ? 45000 :
      windows.some(w => w.status === "upcoming_soon") ? 60000 : 120000;

    return { windows, hasActiveGames, suggestedPollInterval };
  } catch (e: any) {
    console.error("[ActiveWindows] Error:", e.message);
    return { windows: [], hasActiveGames: false, suggestedPollInterval: 120000 };
  }
}

export interface H2HPlayerScore {
  playerId: number;
  playerName: string;
  team: string;
  position: string;
  fieldPosition: string;
  fantasyScore: number;
  projectedScore: number;
  avgScore: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  effectiveScore: number;
  matchStatus: "live" | "complete" | "upcoming" | "bye" | "dnp";
  isOnField: boolean;
  opponent: string | null;
  kicks: number;
  handballs: number;
  marks: number;
  tackles: number;
  hitouts: number;
  goals: number;
  behinds: number;
  disposals: number;
  aflFantasyId: number | null;
  selectionStatus: string;
}

export interface H2HMatchupData {
  opponentName: string;
  leagueName: string;
  round: number;
  myTeam: H2HPlayerScore[];
  oppTeam: H2HPlayerScore[];
  myTotal: number;
  oppTotal: number;
  myProjected: number;
  oppProjected: number;
  myForecast: number;
  oppForecast: number;
  lastUpdated: string;
  hasActiveGames: boolean;
  suggestedPollInterval: number;
}

export async function getLiveH2HMatchup(
  userId: string,
  opponentId: number,
  round?: number
): Promise<H2HMatchupData | null> {
  const opponent = await db.select().from(leagueOpponents)
    .where(and(eq(leagueOpponents.userId, userId), eq(leagueOpponents.id, opponentId)))
    .limit(1);

  if (!opponent[0] || !opponent[0].playerData) return null;

  const settings = await db.select().from(leagueSettings)
    .where(eq(leagueSettings.userId, userId)).limit(1);
  const currentRound = round ?? settings[0]?.currentRound ?? 1;

  const matches = await fetchMatchStatuses(currentRound);
  const { hasActiveGames, suggestedPollInterval } = await getActiveGameWindows(currentRound);

  const getMatchStatus = (teamName: string): "live" | "complete" | "upcoming" | "bye" | "dnp" => {
    const match = matches.find(m => m.homeTeam === teamName || m.awayTeam === teamName);
    if (!match) return "bye";
    if (match.complete === 100) return "complete";
    if (match.complete > 0) return "live";
    return "upcoming";
  };

  const getOpponent = (teamName: string): string | null => {
    const match = matches.find(m => m.homeTeam === teamName || m.awayTeam === teamName);
    if (!match) return null;
    return match.homeTeam === teamName ? match.awayTeam : match.homeTeam;
  };

  const myTeamRows = await db.select().from(myTeamPlayers)
    .where(eq(myTeamPlayers.userId, userId))
    .innerJoin(players, eq(myTeamPlayers.playerId, players.id));

  const myPlayerIds = myTeamRows.map(r => r.my_team_players.playerId);
  let myStats: any[] = [];
  if (myPlayerIds.length > 0) {
    myStats = await db.select().from(weeklyStats)
      .where(and(inArray(weeklyStats.playerId, myPlayerIds), eq(weeklyStats.round, currentRound)));
  }
  const myStatsMap = new Map(myStats.map(s => [s.playerId, s]));

  let oppPlayers: Array<{
    playerId?: number; name: string; position: string;
    avgScore: number | null; price: number | null;
    isCaptain?: boolean; isViceCaptain?: boolean;
    isOnField?: boolean; fieldPosition?: string; team?: string;
  }>;
  try {
    oppPlayers = JSON.parse(opponent[0].playerData);
    if (!Array.isArray(oppPlayers)) return null;
  } catch {
    console.error("[H2H] Failed to parse opponent playerData");
    return null;
  }

  const oppPlayerIds = oppPlayers.filter(p => p.playerId).map(p => p.playerId!);
  let oppStats: any[] = [];
  if (oppPlayerIds.length > 0) {
    oppStats = await db.select().from(weeklyStats)
      .where(and(inArray(weeklyStats.playerId, oppPlayerIds), eq(weeklyStats.round, currentRound)));
  }
  const oppStatsMap = new Map(oppStats.map(s => [s.playerId, s]));

  const oppDbPlayers = oppPlayerIds.length > 0
    ? await db.select().from(players).where(inArray(players.id, oppPlayerIds))
    : [];
  const oppDbMap = new Map(oppDbPlayers.map(p => [p.id, p]));

  const buildScore = (
    p: any, stats: any, isCaptain: boolean, isViceCaptain: boolean,
    isOnField: boolean, fieldPos: string, isMyTeam: boolean
  ): H2HPlayerScore => {
    const kicks = stats?.kickCount || 0;
    const handballs = stats?.handballCount || 0;
    const marks = stats?.markCount || 0;
    const tackles = stats?.tackleCount || 0;
    const hitouts = stats?.hitouts || 0;
    const goals = stats?.goalsKicked || 0;
    const behinds = stats?.behindsKicked || 0;
    const fantasyScore = stats?.fantasyScore || 0;
    const effectiveScore = isCaptain ? fantasyScore * 2 : fantasyScore;
    const mStatus = getMatchStatus(p.team);
    const selStatus = p.selectionStatus || "selected";

    return {
      playerId: p.id,
      playerName: p.name,
      team: p.team,
      position: p.position,
      fieldPosition: fieldPos,
      fantasyScore,
      projectedScore: p.projectedScore || p.avgScore || 0,
      avgScore: p.avgScore || 0,
      isCaptain,
      isViceCaptain,
      effectiveScore,
      matchStatus: selStatus === "omitted" ? "dnp" : mStatus,
      isOnField,
      opponent: getOpponent(p.team),
      kicks, handballs, marks, tackles, hitouts, goals, behinds,
      disposals: kicks + handballs,
      aflFantasyId: p.aflFantasyId || null,
      selectionStatus: selStatus,
    };
  };

  const myTeam: H2HPlayerScore[] = myTeamRows.map(row => {
    const tp = row.my_team_players;
    const p = row.players;
    const stats = myStatsMap.get(p.id);
    return buildScore(
      p, stats,
      tp.isCaptain || false, tp.isViceCaptain || false,
      tp.isOnField ?? true,
      tp.fieldPosition || p.position?.split("/")[0] || "MID",
      true
    );
  });

  const oppTeam: H2HPlayerScore[] = oppPlayers.map(op => {
    const dbP = op.playerId ? oppDbMap.get(op.playerId) : null;
    const stats = op.playerId ? oppStatsMap.get(op.playerId) : null;
    const team = dbP?.team || op.team || "";
    const p = dbP || {
      id: op.playerId || 0,
      name: op.name,
      team,
      position: op.position,
      avgScore: op.avgScore || 0,
      projectedScore: op.avgScore || 0,
      aflFantasyId: null,
      selectionStatus: "selected",
    };
    return buildScore(
      p, stats,
      op.isCaptain || false, op.isViceCaptain || false,
      op.isOnField ?? true,
      op.fieldPosition || op.position?.split("/")[0] || "MID",
      false
    );
  });

  const myOnField = myTeam.filter(p => p.isOnField);
  const oppOnField = oppTeam.filter(p => p.isOnField);

  const myTotal = myOnField.reduce((s, p) => s + p.effectiveScore, 0);
  const oppTotal = oppOnField.reduce((s, p) => s + p.effectiveScore, 0);

  const calcForecast = (teamPlayers: H2HPlayerScore[]): number => {
    return teamPlayers.filter(p => p.isOnField).reduce((sum, p) => {
      const multiplier = p.isCaptain ? 2 : 1;
      if (p.matchStatus === "complete" || p.matchStatus === "live") {
        if (p.matchStatus === "live" && p.fantasyScore > 0) {
          const liveEstimate = p.fantasyScore * 1.1;
          return sum + Math.max(liveEstimate, p.avgScore) * multiplier;
        }
        return sum + p.effectiveScore;
      }
      if (p.matchStatus === "bye" || p.matchStatus === "dnp") return sum;
      return sum + (p.projectedScore || p.avgScore || 0) * multiplier;
    }, 0);
  };

  const myProjected = myOnField.reduce((s, p) => s + (p.projectedScore || p.avgScore || 0) * (p.isCaptain ? 2 : 1), 0);
  const oppProjected = oppOnField.reduce((s, p) => s + (p.projectedScore || p.avgScore || 0) * (p.isCaptain ? 2 : 1), 0);

  return {
    opponentName: opponent[0].opponentName,
    leagueName: opponent[0].leagueName,
    round: currentRound,
    myTeam,
    oppTeam,
    myTotal: Math.round(myTotal),
    oppTotal: Math.round(oppTotal),
    myProjected: Math.round(myProjected),
    oppProjected: Math.round(oppProjected),
    myForecast: Math.round(calcForecast(myTeam)),
    oppForecast: Math.round(calcForecast(oppTeam)),
    lastUpdated: new Date().toISOString(),
    hasActiveGames,
    suggestedPollInterval,
  };
}
