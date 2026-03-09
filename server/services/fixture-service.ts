import { db } from "../db";
import { fixtures, players } from "@shared/schema";
import { eq } from "drizzle-orm";

const UA = "AFL-Fantasy-Machine/1.0 (replit.app; afl-fantasy-advisor)";

const SQUIGGLE_TO_APP_TEAM: Record<string, string> = {
  "Greater Western Sydney": "GWS Giants",
};

const APP_TO_SQUIGGLE_TEAM: Record<string, string> = {
  "GWS Giants": "Greater Western Sydney",
};

function normaliseTeamName(squiggleName: string): string {
  return SQUIGGLE_TO_APP_TEAM[squiggleName] || squiggleName;
}

const VENUE_SHORT: Record<string, string> = {
  "M.C.G.": "MCG",
  "S.C.G.": "SCG",
  "Docklands": "Marvel Stadium",
  "Carrara": "People First Stadium",
  "Kardinia Park": "GMHBA Stadium",
  "Sydney Showground": "Engie Stadium",
};

function normaliseVenue(v: string): string {
  return VENUE_SHORT[v] || v;
}

function formatGameTime(localtime: string): string {
  const parts = localtime.split(" ");
  if (parts.length < 2) return localtime;
  const datePart = parts[0];
  const timePart = parts[1];
  const [yearStr, monthStr, dayStr] = datePart.split("-");
  const [hourStr, minStr] = timePart.split(":");
  const dt = new Date(Date.UTC(+yearStr, +monthStr - 1, +dayStr));
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = days[dt.getUTCDay()];
  const hours = parseInt(hourStr, 10);
  const mins = parseInt(minStr, 10);
  const ampm = hours >= 12 ? "pm" : "am";
  const h12 = hours % 12 || 12;
  const timeStr = mins === 0 ? `${h12}${ampm}` : `${h12}:${mins.toString().padStart(2, "0")}${ampm}`;
  return `${day} ${timeStr}`;
}

interface SquiggleGame {
  id: number;
  round: number;
  roundname: string;
  hteam: string;
  ateam: string;
  venue: string;
  date: string;
  localtime: string;
  hscore: number | null;
  ascore: number | null;
  complete: number;
  winner: string | null;
  timestr: string | null;
  year: number;
}

export async function fetchAndStoreFixtures(year = 2026): Promise<number> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(
      `https://api.squiggle.com.au/?q=games;year=${year}`,
      {
        headers: { "User-Agent": UA },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[Fixtures] Squiggle API returned ${res.status}`);
      return 0;
    }

    const data = await res.json();
    const games: SquiggleGame[] = data.games || [];

    if (games.length === 0) {
      console.log("[Fixtures] No games returned from Squiggle");
      return 0;
    }

    let upserted = 0;
    for (const g of games) {
      if (!g.hteam || !g.ateam || !g.venue || !g.date) continue;

      const existing = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.squiggleId, g.id))
        .limit(1);

      const record = {
        round: g.round,
        roundName: g.roundname || (g.round === 0 ? "Opening Round" : `Round ${g.round}`),
        homeTeam: g.hteam,
        awayTeam: g.ateam,
        venue: g.venue,
        date: g.date,
        localTime: g.localtime || g.date,
        homeScore: g.hscore,
        awayScore: g.ascore,
        complete: g.complete ?? 0,
        winner: g.winner,
        timeStr: g.timestr,
        year: g.year || year,
        squiggleId: g.id,
      };

      if (existing.length > 0) {
        await db
          .update(fixtures)
          .set({
            homeTeam: record.homeTeam,
            awayTeam: record.awayTeam,
            venue: record.venue,
            date: record.date,
            localTime: record.localTime,
            homeScore: record.homeScore,
            awayScore: record.awayScore,
            complete: record.complete,
            winner: record.winner,
            timeStr: record.timeStr,
            roundName: record.roundName,
          })
          .where(eq(fixtures.squiggleId, g.id));
      } else {
        await db.insert(fixtures).values(record);
      }
      upserted++;
    }

    console.log(`[Fixtures] Stored/updated ${upserted} games for ${year}`);
    return upserted;
  } catch (e: any) {
    console.error("[Fixtures] Error fetching fixtures:", e.message);
    return 0;
  }
}

export async function syncPlayerFixtures(round: number, year = 2026): Promise<number> {
  try {
    const roundFixtures = await getFixturesByRound(round, year);
    if (roundFixtures.length === 0) {
      console.log(`[Fixtures] No fixtures found for round ${round}, skipping player sync`);
      return 0;
    }

    const teamFixtureMap = new Map<string, { opponent: string; venue: string; gameTime: string }>();
    for (const f of roundFixtures) {
      const homeTeam = normaliseTeamName(f.homeTeam);
      const awayTeam = normaliseTeamName(f.awayTeam);
      const venue = normaliseVenue(f.venue);
      const gameTime = formatGameTime(f.localTime || f.date);

      teamFixtureMap.set(homeTeam, { opponent: awayTeam, venue, gameTime });
      teamFixtureMap.set(awayTeam, { opponent: homeTeam, venue, gameTime });
    }

    const allPlayers = await db.select().from(players);
    let updated = 0;
    for (const p of allPlayers) {
      const fixture = teamFixtureMap.get(p.team);
      if (fixture) {
        await db.update(players).set({
          nextOpponent: fixture.opponent,
          venue: fixture.venue,
          gameTime: fixture.gameTime,
        }).where(eq(players.id, p.id));
        updated++;
      }
    }

    console.log(`[Fixtures] Synced ${updated} players with round ${round} fixture data (${teamFixtureMap.size} teams mapped)`);
    return updated;
  } catch (e: any) {
    console.error("[Fixtures] Error syncing player fixtures:", e.message);
    return 0;
  }
}

export async function getAllFixtures(year = 2026) {
  return db
    .select()
    .from(fixtures)
    .where(eq(fixtures.year, year))
    .orderBy(fixtures.round, fixtures.date);
}

export async function getFixturesByRound(round: number, year = 2026) {
  const all = await getAllFixtures(year);
  return all.filter((f) => f.round === round);
}

export function getRoundName(round: number): string {
  if (round === 0) return "Opening Round";
  if (round >= 25) {
    const finalsNames: Record<number, string> = {
      25: "Finals Week 1",
      26: "Semi-Finals",
      27: "Preliminary Finals",
      28: "Grand Final",
    };
    return finalsNames[round] || `Finals ${round}`;
  }
  return `Round ${round}`;
}
