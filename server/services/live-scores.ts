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
      const goals = 0;
      const behinds = 0;
      const freesAgainst = 0;

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
      timeOnGroundPercent: stats.timeOnGround || null,
    });
  }

  return { fantasyScore };
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
