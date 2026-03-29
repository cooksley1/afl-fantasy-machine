import { gatherIntelligence } from "./data-gatherer";
import { db } from "./db";
import { leagueSettings } from "@shared/schema";

let gatherInterval: NodeJS.Timeout | null = null;
let liveScoreInterval: NodeJS.Timeout | null = null;
let isGathering = false;
let isFetchingLive = false;
let isManualRefreshing = false;
let lastGatherTime: Date | null = null;
let lastLiveFetchTime: Date | null = null;
let gatherCount = 0;
let liveFetchCount = 0;

export interface SyncSourceStatus {
  lastSync: string | null;
  status: "idle" | "syncing" | "error";
  error?: string;
}

const syncSources: Record<string, SyncSourceStatus> = {
  aflFantasyPrices: { lastSync: null, status: "idle" },
  dfsAustralia: { lastSync: null, status: "idle" },
  liveScores: { lastSync: null, status: "idle" },
  wheelo: { lastSync: null, status: "idle" },
  fixtures: { lastSync: null, status: "idle" },
  injuryAndLineups: { lastSync: null, status: "idle" },
  intel: { lastSync: null, status: "idle" },
};

function markSync(source: string, status: "idle" | "syncing" | "error", error?: string) {
  if (!syncSources[source]) syncSources[source] = { lastSync: null, status: "idle" };
  syncSources[source].status = status;
  if (status === "idle") {
    syncSources[source].lastSync = new Date().toISOString();
    delete syncSources[source].error;
  }
  if (error) syncSources[source].error = error;
}

export function markSourceSynced(source: string) {
  markSync(source, "idle");
}

async function runGather() {
  if (isGathering) {
    console.log("[Scheduler] Gather already in progress, skipping");
    return;
  }
  isGathering = true;
  const startTime = Date.now();
  try {
    const [sysSettings] = await db.select().from(leagueSettings).limit(1);
    const currentRound = sysSettings?.currentRound || 1;

    const wave1 = await Promise.allSettled([
      (async () => {
        markSync("intel", "syncing");
        const result = await gatherIntelligence();
        markSync("intel", "idle");
        return result;
      })(),
      (async () => {
        markSync("aflFantasyPrices", "syncing");
        const { syncAflFantasyPrices } = await import("./expand-players");
        await syncAflFantasyPrices();
        markSync("aflFantasyPrices", "idle");
      })(),
      (async () => {
        markSync("injuryAndLineups", "syncing");
        const { syncAflInjuryList } = await import("./services/afl-injury-scraper");
        await syncAflInjuryList();
        const { syncTeamLineups } = await import("./services/afl-lineup-scraper");
        await syncTeamLineups(currentRound);
        markSync("injuryAndLineups", "idle");
      })(),
      (async () => {
        markSync("fixtures", "syncing");
        const { fetchAndStoreFixtures, syncPlayerFixtures } = await import("./services/fixture-service");
        await fetchAndStoreFixtures();
        await syncPlayerFixtures(currentRound);
        markSync("fixtures", "idle");
      })(),
    ]);

    for (const r of wave1) {
      if (r.status === "rejected") {
        console.log(`[Scheduler] Wave 1 error: ${r.reason?.message || r.reason}`);
      }
    }
    if (wave1[0].status === "rejected") markSync("intel", "error", wave1[0].reason?.message);
    if (wave1[1].status === "rejected") markSync("aflFantasyPrices", "error", wave1[1].reason?.message);
    if (wave1[2].status === "rejected") markSync("injuryAndLineups", "error", wave1[2].reason?.message);
    if (wave1[3].status === "rejected") markSync("fixtures", "error", wave1[3].reason?.message);

    const intelResult = wave1[0].status === "fulfilled" ? wave1[0].value : { fetched: 0, processed: 0 };
    lastGatherTime = new Date();
    gatherCount++;

    const wave2 = await Promise.allSettled([
      (async () => {
        markSync("dfsAustralia", "syncing");
        const { syncDfsAustralia } = await import("./expand-players");
        await syncDfsAustralia();
        markSync("dfsAustralia", "idle");
      })(),
      (async () => {
        markSync("liveScores", "syncing");
        const { fetchScoresForCompletedRounds, detectAndAdvanceRound, fetchAndStorePlayerScores, fetchMatchStatuses } = await import("./services/live-scores");
        const roundResult = await detectAndAdvanceRound();
        if (roundResult.advanced) {
          console.log(`[Scheduler] Round advanced from ${roundResult.previousRound} to ${roundResult.newRound}`);
        }
        const scoreResult = await fetchScoresForCompletedRounds();
        try {
          const currentMatches = await fetchMatchStatuses(currentRound);
          if (currentMatches.some(m => m.complete === 100)) {
            console.log(`[Scheduler] Fetching scores for current round ${currentRound} (has completed games)`);
            const currentResult = await fetchAndStorePlayerScores(currentRound, true);
            if (currentResult.updated > 0) {
              console.log(`[Scheduler] Updated ${currentResult.updated} player scores for current round ${currentRound}`);
            }
          }
        } catch (currentErr: any) {
          console.log(`[Scheduler] Current round score fetch: ${currentErr.message}`);
        }
        if (scoreResult.roundsProcessed > 0) {
          console.log(`[Scheduler] Updated scores for ${scoreResult.roundsProcessed} rounds`);
        }
        markSync("liveScores", "idle");
      })(),
      (async () => {
        markSync("wheelo", "syncing");
        const { syncWheeloRatings } = await import("./services/wheelo-scraper");
        await syncWheeloRatings();
        markSync("wheelo", "idle");
      })(),
    ]);

    for (const r of wave2) {
      if (r.status === "rejected") {
        console.log(`[Scheduler] Wave 2 error: ${r.reason?.message || r.reason}`);
      }
    }
    if (wave2[0].status === "rejected") markSync("dfsAustralia", "error", wave2[0].reason?.message);
    if (wave2[1].status === "rejected") markSync("liveScores", "error", wave2[1].reason?.message);
    if (wave2[2].status === "rejected") markSync("wheelo", "error", wave2[2].reason?.message);

    try {
      const { recalculatePlayerAverages } = await import("./expand-players");
      const recalcCount = await recalculatePlayerAverages();
      if (recalcCount > 0) {
        console.log(`[Scheduler] Recalculated averages for ${recalcCount} players`);
      }
    } catch (e: any) {
      console.log(`[Scheduler] Recalc averages error: ${e.message}`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Scheduler] Gather #${gatherCount} complete in ${duration}s: ${(intelResult as any).fetched} fetched, ${(intelResult as any).processed} processed`);
  } catch (e: any) {
    console.error("[Scheduler] Gather error:", e.message);
  } finally {
    isGathering = false;
  }
}

async function runLiveScoreFetch() {
  if (isFetchingLive) return;
  isFetchingLive = true;
  try {
    const { getActiveGameWindows, fetchAndStorePlayerScores } = await import("./services/live-scores");
    const { windows, hasActiveGames, suggestedPollInterval } = await getActiveGameWindows();

    const hasLiveGames = windows.some(w => w.status === "live");

    if (hasActiveGames || hasLiveGames) {
      const { db: database } = await import("./db");
      const { leagueSettings } = await import("@shared/schema");
      const [settings] = await database.select().from(leagueSettings).limit(1);
      const currentRound = settings?.currentRound || 1;

      const result = await fetchAndStorePlayerScores(currentRound);
      liveFetchCount++;
      lastLiveFetchTime = new Date();
      if (result.updated > 0) {
        console.log(`[LiveFetch] #${liveFetchCount}: Updated ${result.updated} player scores for round ${currentRound} (${windows.filter(w => w.status === "live").length} live games)`);
      }
    }

    if (liveScoreInterval) {
      const newInterval = hasLiveGames ? 60000 : suggestedPollInterval;
      clearInterval(liveScoreInterval);
      liveScoreInterval = setInterval(() => {
        runLiveScoreFetch();
      }, newInterval);
    }
  } catch (e: any) {
    console.error("[LiveFetch] Error:", e.message);
  } finally {
    isFetchingLive = false;
  }
}

export async function runManualRefresh(): Promise<{ success: boolean; duration: number; errors: string[] }> {
  if (isManualRefreshing || isGathering) {
    return { success: false, duration: 0, errors: ["A refresh is already in progress"] };
  }
  isManualRefreshing = true;
  const startTime = Date.now();
  const errors: string[] = [];

  try {
    const [sysSettings] = await db.select().from(leagueSettings).limit(1);
    const currentRound = sysSettings?.currentRound || 1;

    const wave1 = await Promise.allSettled([
      (async () => {
        markSync("aflFantasyPrices", "syncing");
        const { syncAflFantasyPrices } = await import("./expand-players");
        await syncAflFantasyPrices();
        markSync("aflFantasyPrices", "idle");
      })(),
      (async () => {
        markSync("injuryAndLineups", "syncing");
        const { syncAflInjuryList } = await import("./services/afl-injury-scraper");
        await syncAflInjuryList();
        const { syncTeamLineups } = await import("./services/afl-lineup-scraper");
        await syncTeamLineups(currentRound);
        markSync("injuryAndLineups", "idle");
      })(),
      (async () => {
        markSync("fixtures", "syncing");
        const { fetchAndStoreFixtures, syncPlayerFixtures } = await import("./services/fixture-service");
        await fetchAndStoreFixtures();
        await syncPlayerFixtures(currentRound);
        markSync("fixtures", "idle");
      })(),
    ]);

    if (wave1[0].status === "rejected") { markSync("aflFantasyPrices", "error", wave1[0].reason?.message); errors.push(`AFL Fantasy prices: ${wave1[0].reason?.message}`); }
    if (wave1[1].status === "rejected") { markSync("injuryAndLineups", "error", wave1[1].reason?.message); errors.push(`Injury/Lineups: ${wave1[1].reason?.message}`); }
    if (wave1[2].status === "rejected") { markSync("fixtures", "error", wave1[2].reason?.message); errors.push(`Fixtures: ${wave1[2].reason?.message}`); }

    const wave2 = await Promise.allSettled([
      (async () => {
        markSync("dfsAustralia", "syncing");
        const { syncDfsAustralia } = await import("./expand-players");
        await syncDfsAustralia();
        markSync("dfsAustralia", "idle");
      })(),
      (async () => {
        markSync("liveScores", "syncing");
        const { fetchScoresForCompletedRounds, detectAndAdvanceRound, fetchAndStorePlayerScores, fetchMatchStatuses } = await import("./services/live-scores");
        await detectAndAdvanceRound();
        const scoreResult = await fetchScoresForCompletedRounds();
        try {
          const curMatches = await fetchMatchStatuses(currentRound);
          if (curMatches.some(m => m.complete === 100)) {
            await fetchAndStorePlayerScores(currentRound, true);
          }
        } catch {}
        if (scoreResult.roundsProcessed > 0) {
          const { recalculatePlayerAverages } = await import("./expand-players");
          await recalculatePlayerAverages();
        }
        markSync("liveScores", "idle");
      })(),
      (async () => {
        markSync("wheelo", "syncing");
        const { syncWheeloRatings } = await import("./services/wheelo-scraper");
        await syncWheeloRatings();
        markSync("wheelo", "idle");
      })(),
    ]);

    if (wave2[0].status === "rejected") { markSync("dfsAustralia", "error", wave2[0].reason?.message); errors.push(`DFS Australia: ${wave2[0].reason?.message}`); }
    if (wave2[1].status === "rejected") { markSync("liveScores", "error", wave2[1].reason?.message); errors.push(`Live scores: ${wave2[1].reason?.message}`); }
    if (wave2[2].status === "rejected") { markSync("wheelo", "error", wave2[2].reason?.message); errors.push(`Wheelo: ${wave2[2].reason?.message}`); }

    try {
      const { recalculatePlayerAverages } = await import("./expand-players");
      await recalculatePlayerAverages();
    } catch (e: any) {
      errors.push(`Recalc averages: ${e.message}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Scheduler] Manual refresh complete in ${(duration / 1000).toFixed(1)}s, ${errors.length} errors`);
    return { success: errors.length === 0, duration, errors };
  } finally {
    isManualRefreshing = false;
  }
}

export function startScheduler() {
  if (gatherInterval !== null) {
    console.log("[Scheduler] Already running, skipping duplicate start");
    return;
  }

  console.log("[Scheduler] Starting intelligence gathering scheduler");
  console.log("[Scheduler] Will gather every 4 hours (daily cycle)");

  setTimeout(() => {
    runGather();
  }, 30000);

  gatherInterval = setInterval(() => {
    runGather();
  }, 4 * 60 * 60 * 1000);

  liveScoreInterval = setInterval(() => {
    runLiveScoreFetch();
  }, 2 * 60 * 1000);
}

export function stopScheduler() {
  if (gatherInterval) {
    clearInterval(gatherInterval);
    gatherInterval = null;
  }
  if (liveScoreInterval) {
    clearInterval(liveScoreInterval);
    liveScoreInterval = null;
  }
  console.log("[Scheduler] Stopped");
}

export function getSchedulerStatus() {
  return {
    isRunning: gatherInterval !== null,
    isGathering,
    isFetchingLive,
    isManualRefreshing,
    lastGatherTime: lastGatherTime?.toISOString() || null,
    lastLiveFetchTime: lastLiveFetchTime?.toISOString() || null,
    gatherCount,
    liveFetchCount,
    nextGatherIn: gatherInterval ? "~4 hours" : "stopped",
    sources: syncSources,
    serverStartTime: serverStartTime?.toISOString() || null,
  };
}

let serverStartTime: Date | null = null;
export function setServerStartTime() {
  serverStartTime = new Date();
}
