import { db } from "../db";
import { players, weeklyStats, leagueSettings, myTeamPlayers } from "@shared/schema";
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

export async function getLiveRoundData(round?: number): Promise<LiveRoundData> {
  const settings = await db.select().from(leagueSettings).limit(1);
  const currentRound = round != null ? round : (settings[0]?.currentRound ?? 0);

  const matches = await fetchMatchStatuses(currentRound);

  const myTeamResult = await db
    .select()
    .from(myTeamPlayers)
    .innerJoin(players, eq(myTeamPlayers.playerId, players.id));

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
  round: number
): Promise<LivePlayerScore[]> {
  const allMatchPlayers = await db
    .select()
    .from(players)
    .where(
      inArray(players.team, [homeTeam, awayTeam])
    );

  const myTeamResult = await db
    .select()
    .from(myTeamPlayers)
    .innerJoin(players, eq(myTeamPlayers.playerId, players.id));

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
  const titleMatch = html.match(/<TITLE>[^:]*:\s*(.+?)\s+(?:defeats|drew with)\s+(.+?)\s+at\s+.+?Round\s+(\d+)/i);
  if (!titleMatch) return null;

  const team1Name = titleMatch[1].trim();
  const team2Name = titleMatch[2].trim();
  const round = parseInt(titleMatch[3]);

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

export async function fetchAndStorePlayerScores(round: number): Promise<{ fetched: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let fetched = 0;
  let updated = 0;

  try {
    const year = new Date().getFullYear();
    const matchIds = await fetchFootywireMatchIds(year);

    if (matchIds.length === 0) {
      errors.push("No matches found on Footywire for this season");
      return { fetched: 0, updated: 0, errors };
    }

    const allDbPlayers = await db.select().from(players);
    const nameMap = new Map(allDbPlayers.map(p => [p.name.toLowerCase(), p]));
    const lastNameMap = new Map<string, typeof allDbPlayers[0][]>();
    for (const p of allDbPlayers) {
      const parts = p.name.split(" ");
      const lastName = parts[parts.length - 1].toLowerCase();
      if (!lastNameMap.has(lastName)) lastNameMap.set(lastName, []);
      lastNameMap.get(lastName)!.push(p);
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

    if (fetched === 0) {
      errors.push(`No completed matches found on Footywire for round ${round}. Stats may not be available yet.`);
    } else {
      console.log(`[LiveScores] Footywire: Fetched ${fetched} player stats, updated ${updated} in DB for round ${round}`);
    }
  } catch (e: any) {
    errors.push(`Fetch error: ${e.message}`);
    console.error("[LiveScores] fetchAndStorePlayerScores error:", e.message);
  }

  return { fetched, updated, errors };
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
