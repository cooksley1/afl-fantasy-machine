import { db } from "../db";
import { fixtures } from "@shared/schema";
import { eq } from "drizzle-orm";

const UA = "AFL-Fantasy-Machine/1.0 (replit.app; afl-fantasy-advisor)";

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
