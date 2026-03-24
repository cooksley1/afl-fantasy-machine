import { db } from "../db";
import { players, weeklyStats, teamContext } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

const BASE_URL = "https://www.wheeloratings.com/src/match_stats/table_data";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

const WHEELO_TEAM_MAP: Record<string, string> = {
  "Adelaide": "Adelaide",
  "Brisbane": "Brisbane Lions",
  "Brisbane Lions": "Brisbane Lions",
  "Carlton": "Carlton",
  "Collingwood": "Collingwood",
  "Essendon": "Essendon",
  "Fremantle": "Fremantle",
  "Geelong": "Geelong",
  "Gold Coast": "Gold Coast",
  "Greater Western Sydney": "GWS Giants",
  "GWS Giants": "GWS Giants",
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

interface WheeloRoundData {
  Data: Array<Record<string, any[]>>;
  TeamData: Array<Record<string, any[]>>;
  Matches: Array<Record<string, any[]>>;
  Summary: Array<{ Season: string; RoundNumber: number; RoundName: string }>;
}

interface WheeloSeasonData {
  RoundId: string | string[];
  RoundNumber: number | number[];
  RoundName: string | string[];
}

function normalizeForMatch(name: string): string {
  return name.toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/-/g, " ")
    .trim();
}

export async function fetchAvailableRounds(year: number = new Date().getFullYear()): Promise<{ roundId: string; roundNumber: number; roundName: string }[]> {
  try {
    const res = await fetch(`${BASE_URL}/${year}.json`, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return [];

    const data: WheeloSeasonData = await res.json();

    const roundIds = Array.isArray(data.RoundId) ? data.RoundId : [data.RoundId];
    const roundNumbers = Array.isArray(data.RoundNumber) ? data.RoundNumber : [data.RoundNumber];
    const roundNames = Array.isArray(data.RoundName) ? data.RoundName : [data.RoundName];

    return roundIds.map((id, i) => ({
      roundId: id,
      roundNumber: roundNumbers[i],
      roundName: roundNames[i],
    }));
  } catch (e: any) {
    console.error("[Wheelo] Error fetching available rounds:", e.message);
    return [];
  }
}

export async function syncWheeloRound(roundId: string, ourRound: number): Promise<{ playerUpdated: number; playerAdded: number; teamUpdated: number }> {
  let playerUpdated = 0;
  let playerAdded = 0;
  let teamUpdated = 0;

  try {
    const res = await fetch(`${BASE_URL}/${roundId}.json`, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) {
      console.error(`[Wheelo] Round ${roundId} returned ${res.status}`);
      return { playerUpdated, playerAdded, teamUpdated };
    }

    const data: WheeloRoundData = await res.json();
    const playerData = data.Data[0];
    const teamData = data.TeamData[0];
    const matchesData = data.Matches[0];

    if (!playerData?.Player) {
      console.log(`[Wheelo] No player data for round ${roundId}`);
      return { playerUpdated, playerAdded, teamUpdated };
    }

    const playerCount = playerData.Player.length;
    console.log(`[Wheelo] Round ${roundId} (${data.Summary[0].RoundName}): ${playerCount} player rows`);

    const allDbPlayers = await db.select().from(players);

    const nameTeamMap = new Map<string, typeof allDbPlayers[0]>();
    const lastNameTeamMap = new Map<string, typeof allDbPlayers[0][]>();

    for (const p of allDbPlayers) {
      const normName = normalizeForMatch(p.name);
      nameTeamMap.set(`${normName}|${p.team}`, p);

      const parts = p.name.split(" ");
      const surname = parts[parts.length - 1].toLowerCase();
      const key = `${surname}|${p.team}`;
      if (!lastNameTeamMap.has(key)) lastNameTeamMap.set(key, []);
      lastNameTeamMap.get(key)!.push(p);
    }

    const matchOpponents = new Map<string, { home: string; away: string }>();
    if (matchesData?.MatchId) {
      for (let i = 0; i < matchesData.MatchId.length; i++) {
        const matchId = matchesData.MatchId[i];
        const home = WHEELO_TEAM_MAP[matchesData.HomeTeam[i]] || matchesData.HomeTeam[i];
        const away = WHEELO_TEAM_MAP[matchesData.AwayTeam[i]] || matchesData.AwayTeam[i];
        matchOpponents.set(matchId, { home, away });
      }
    }

    const existingStats = await db.select()
      .from(weeklyStats)
      .where(eq(weeklyStats.round, ourRound));
    const existingByPlayerId = new Map(existingStats.map(s => [s.playerId, s]));

    let matched = 0;
    let unmatched = 0;

    for (let i = 0; i < playerCount; i++) {
      const wheeloName = playerData.Player[i];
      const wheeloTeam = WHEELO_TEAM_MAP[playerData.Team[i]] || playerData.Team[i];
      const matchId = playerData.MatchId[i];

      let dbPlayer: typeof allDbPlayers[0] | undefined;

      dbPlayer = nameTeamMap.get(`${normalizeForMatch(wheeloName)}|${wheeloTeam}`);

      if (!dbPlayer) {
        const parts = wheeloName.split(" ");
        const surname = parts[parts.length - 1].toLowerCase();
        const initial = parts[0]?.[0]?.toLowerCase() || "";
        const candidates = lastNameTeamMap.get(`${surname}|${wheeloTeam}`) || [];
        if (candidates.length === 1) {
          dbPlayer = candidates[0];
        } else if (candidates.length > 1) {
          dbPlayer = candidates.find(c =>
            c.name.split(" ")[0][0].toLowerCase() === initial
          );
        }
      }

      if (!dbPlayer) {
        unmatched++;
        continue;
      }

      matched++;

      const matchInfo = matchOpponents.get(matchId);
      const opponent = matchInfo
        ? (wheeloTeam === matchInfo.home ? matchInfo.away : matchInfo.home)
        : null;

      const rawScore = playerData.DreamTeamPoints?.[i];
      if (rawScore == null) continue;
      const fantasyScore = rawScore;
      const tog = playerData.TimeOnGround?.[i] ?? null;
      const cba = playerData.CentreBounceAttendancePercentage?.[i] ?? null;

      const statsData: any = {
        fantasyScore,
        timeOnGroundPercent: tog,
        centreBounceAttendancePercent: cba,
        kickCount: playerData.Kicks?.[i] ?? null,
        handballCount: playerData.Handballs?.[i] ?? null,
        markCount: playerData.Marks?.[i] ?? null,
        tackleCount: playerData.Tackles?.[i] ?? null,
        hitouts: playerData.Hitouts?.[i] ?? null,
        goalsKicked: playerData.Goals?.[i] ?? null,
        behindsKicked: playerData.Behinds?.[i] ?? null,
        inside50s: playerData.Inside50s?.[i] ?? null,
        contestedPossessions: playerData.ContestedPossessions?.[i] ?? null,
        disposalEfficiency: playerData.DisposalEfficiency?.[i] ?? null,
        metresGained: playerData.MetresGained?.[i] != null ? Math.round(playerData.MetresGained[i]) : null,
        clearances: playerData.TotalClearances?.[i] ?? null,
        scoreInvolvements: playerData.ScoreInvolvements?.[i] ?? null,
        pressureActs: playerData.PressureActs?.[i] ?? null,
        contestedMarks: playerData.ContestedMarks?.[i] ?? null,
        interceptMarks: playerData.InterceptMarks?.[i] ?? null,
        groundBallGets: playerData.GroundBallGets?.[i] ?? null,
        ratingPoints: playerData.RatingPoints?.[i] ?? null,
      };

      if (opponent) {
        statsData.opponent = opponent;
      }

      const existing = existingByPlayerId.get(dbPlayer.id);

      if (existing) {
        await db.update(weeklyStats)
          .set(statsData)
          .where(eq(weeklyStats.id, existing.id));
        playerUpdated++;
      } else {
        await db.insert(weeklyStats).values({
          playerId: dbPlayer.id,
          round: ourRound,
          opponent: opponent || null,
          ...statsData,
        });
        playerAdded++;
      }
    }

    if (unmatched > 0) {
      console.log(`[Wheelo] ${matched} matched, ${unmatched} unmatched players`);
    }

    if (teamData?.Team) {
      const teamCount = teamData.Team.length;
      const matchIds = [...new Set(teamData.MatchId as string[])];

      for (const mid of matchIds) {
        const matchInfo = matchOpponents.get(mid);
        if (!matchInfo) continue;

        for (let i = 0; i < teamCount; i++) {
          if (teamData.MatchId[i] !== mid) continue;

          const team = WHEELO_TEAM_MAP[teamData.Team[i]] || teamData.Team[i];
          const opponent = team === matchInfo.home ? matchInfo.away : matchInfo.home;

          const fantasyPtsScored = teamData.DreamTeamPoints?.[i] ?? null;

          const opponentIdx = Array.from({ length: teamCount }, (_, j) => j)
            .find(j => teamData.MatchId[j] === mid &&
              (WHEELO_TEAM_MAP[teamData.Team[j]] || teamData.Team[j]) === opponent);

          const fantasyPtsConceded = opponentIdx != null
            ? (teamData.DreamTeamPoints?.[opponentIdx] ?? null)
            : null;

          const tcData: any = {
            team,
            round: ourRound,
            disposalCount: teamData.Disposals?.[i] ?? null,
            clearanceCount: teamData.TotalClearances?.[i] ?? null,
            fantasyPointsScored: fantasyPtsScored,
            fantasyPointsConceded: fantasyPtsConceded,
            metresGained: teamData.MetresGained?.[i] != null ? Math.round(teamData.MetresGained[i]) : null,
            inside50s: teamData.Inside50s?.[i] ?? null,
            tackleCount: teamData.Tackles?.[i] ?? null,
            hitouts: teamData.Hitouts?.[i] ?? null,
            ratingPoints: teamData.RatingPoints?.[i] ?? null,
          };

          if (teamData.ContestedPossessions?.[i] != null && teamData.Disposals?.[i]) {
            tcData.contestedPossessionRate = teamData.ContestedPossessions[i] / teamData.Disposals[i];
          }

          const existingTc = await db.select()
            .from(teamContext)
            .where(and(eq(teamContext.team, team), eq(teamContext.round, ourRound)))
            .limit(1);

          if (existingTc.length > 0) {
            await db.update(teamContext).set(tcData).where(eq(teamContext.id, existingTc[0].id));
          } else {
            await db.insert(teamContext).values(tcData);
          }
          teamUpdated++;
        }
      }
    }
  } catch (e: any) {
    console.error("[Wheelo] Error syncing round:", e.message);
  }

  return { playerUpdated, playerAdded, teamUpdated };
}

export async function syncWheeloRatings(): Promise<{ totalPlayerUpdated: number; totalPlayerAdded: number; totalTeamUpdated: number; roundsSynced: number }> {
  let totalPlayerUpdated = 0;
  let totalPlayerAdded = 0;
  let totalTeamUpdated = 0;
  let roundsSynced = 0;

  try {
    const year = new Date().getFullYear();
    const rounds = await fetchAvailableRounds(year);
    if (rounds.length === 0) {
      console.log("[Wheelo] No rounds available");
      return { totalPlayerUpdated, totalPlayerAdded, totalTeamUpdated, roundsSynced };
    }

    console.log(`[Wheelo] Found ${rounds.length} rounds for ${year}`);

    for (const round of rounds) {
      const ourRound = round.roundNumber;

      const result = await syncWheeloRound(round.roundId, ourRound);
      totalPlayerUpdated += result.playerUpdated;
      totalPlayerAdded += result.playerAdded;
      totalTeamUpdated += result.teamUpdated;

      if (result.playerUpdated > 0 || result.playerAdded > 0) {
        roundsSynced++;
        console.log(`[Wheelo] Round ${ourRound}: ${result.playerUpdated} updated, ${result.playerAdded} added, ${result.teamUpdated} team rows`);
      }
    }

    console.log(`[Wheelo] Sync complete: ${roundsSynced} rounds, ${totalPlayerUpdated} player updates, ${totalPlayerAdded} player inserts, ${totalTeamUpdated} team updates`);
  } catch (e: any) {
    console.error("[Wheelo] syncWheeloRatings error:", e.message);
  }

  return { totalPlayerUpdated, totalPlayerAdded, totalTeamUpdated, roundsSynced };
}
