import { gatherIntelligence } from "./data-gatherer";

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
  dtLive: { lastSync: null, status: "idle" },
  footywire: { lastSync: null, status: "idle" },
  liveScores: { lastSync: null, status: "idle" },
  wheelo: { lastSync: null, status: "idle" },
  fixtures: { lastSync: null, status: "idle" },
  aflTables: { lastSync: null, status: "idle" },
  aflInjuryList: { lastSync: null, status: "idle" },
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
  try {
    markSync("intel", "syncing");
    const result = await gatherIntelligence();
    markSync("intel", "idle");
    lastGatherTime = new Date();
    gatherCount++;
    console.log(`[Scheduler] Gather #${gatherCount} complete: ${result.fetched} fetched, ${result.processed} processed`);

    try {
      markSync("dtLive", "syncing");
      const { fetchDTLiveData } = await import("./services/dtlive-scraper");
      await fetchDTLiveData();
      markSync("dtLive", "idle");
    } catch (e: any) {
      markSync("dtLive", "error", e.message);
      console.log(`[Scheduler] DTLive sync error: ${e.message}`);
    }

    try {
      markSync("footywire", "syncing");
      const { fetchFootywireData } = await import("./services/footywire-scraper");
      await fetchFootywireData();
      markSync("footywire", "idle");
    } catch (e: any) {
      markSync("footywire", "error", e.message);
      console.log(`[Scheduler] Footywire sync error: ${e.message}`);
    }

    try {
      markSync("dfsAustralia", "syncing");
      const { syncDfsAustralia } = await import("./expand-players");
      await syncDfsAustralia();
      markSync("dfsAustralia", "idle");
    } catch (e: any) {
      markSync("dfsAustralia", "error", e.message);
      console.log(`[Scheduler] DFS Australia sync error: ${e.message}`);
    }

    try {
      markSync("aflFantasyPrices", "syncing");
      const { syncAflFantasyPrices } = await import("./expand-players");
      await syncAflFantasyPrices();
      markSync("aflFantasyPrices", "idle");
    } catch (e: any) {
      markSync("aflFantasyPrices", "error", e.message);
      console.log(`[Scheduler] AFL Fantasy price sync error: ${e.message}`);
    }

    try {
      markSync("aflInjuryList", "syncing");
      const { syncAflInjuryList } = await import("./services/afl-injury-scraper");
      await syncAflInjuryList();
      markSync("aflInjuryList", "idle");
    } catch (e: any) {
      markSync("aflInjuryList", "error", e.message);
      console.log(`[Scheduler] AFL injury list sync error: ${e.message}`);
    }

    try {
      markSync("liveScores", "syncing");
      const { fetchScoresForCompletedRounds, detectAndAdvanceRound } = await import("./services/live-scores");
      const roundResult = await detectAndAdvanceRound();
      if (roundResult.advanced) {
        console.log(`[Scheduler] Round advanced from ${roundResult.previousRound} to ${roundResult.newRound}`);
      }
      const scoreResult = await fetchScoresForCompletedRounds();
      if (scoreResult.roundsProcessed > 0) {
        const { recalculatePlayerAverages } = await import("./expand-players");
        await recalculatePlayerAverages();
        console.log(`[Scheduler] Updated scores for ${scoreResult.roundsProcessed} rounds`);
      }
      markSync("liveScores", "idle");
    } catch (e: any) {
      markSync("liveScores", "error", e.message);
      console.log(`[Scheduler] Score fetch error: ${e.message}`);
    }

    try {
      markSync("wheelo", "syncing");
      const { syncWheeloRatings } = await import("./services/wheelo-scraper");
      await syncWheeloRatings();
      markSync("wheelo", "idle");
    } catch (e: any) {
      markSync("wheelo", "error", e.message);
      console.log(`[Scheduler] Wheelo sync error: ${e.message}`);
    }

    try {
      markSync("fixtures", "syncing");
      const { fetchAndStoreFixtures, syncPlayerFixtures } = await import("./services/fixture-service");
      await fetchAndStoreFixtures();
      const { db: database } = await import("./db");
      const { leagueSettings } = await import("@shared/schema");
      const [settings] = await database.select().from(leagueSettings).limit(1);
      if (settings?.currentRound) {
        await syncPlayerFixtures(settings.currentRound);
      }
      markSync("fixtures", "idle");
    } catch (e: any) {
      markSync("fixtures", "error", e.message);
      console.log(`[Scheduler] Fixtures sync error: ${e.message}`);
    }

    try {
      const { recalculatePlayerAverages } = await import("./expand-players");
      const recalcCount = await recalculatePlayerAverages();
      if (recalcCount > 0) {
        console.log(`[Scheduler] Recalculated averages for ${recalcCount} players from weekly_stats`);
      }
    } catch (e: any) {
      console.log(`[Scheduler] Recalc averages error: ${e.message}`);
    }
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
    try {
      markSync("dfsAustralia", "syncing");
      const { syncDfsAustralia } = await import("./expand-players");
      await syncDfsAustralia();
      markSync("dfsAustralia", "idle");
    } catch (e: any) {
      markSync("dfsAustralia", "error", e.message);
      errors.push(`DFS Australia: ${e.message}`);
    }

    try {
      markSync("dtLive", "syncing");
      const { fetchDTLiveData } = await import("./services/dtlive-scraper");
      await fetchDTLiveData();
      markSync("dtLive", "idle");
    } catch (e: any) {
      markSync("dtLive", "error", e.message);
      errors.push(`DTLive: ${e.message}`);
    }

    try {
      markSync("footywire", "syncing");
      const { fetchFootywireData } = await import("./services/footywire-scraper");
      await fetchFootywireData();
      markSync("footywire", "idle");
    } catch (e: any) {
      markSync("footywire", "error", e.message);
      errors.push(`Footywire: ${e.message}`);
    }

    try {
      markSync("aflFantasyPrices", "syncing");
      const { syncAflFantasyPrices } = await import("./expand-players");
      await syncAflFantasyPrices();
      markSync("aflFantasyPrices", "idle");
    } catch (e: any) {
      markSync("aflFantasyPrices", "error", e.message);
      errors.push(`AFL Fantasy prices: ${e.message}`);
    }

    try {
      markSync("liveScores", "syncing");
      const { fetchScoresForCompletedRounds, detectAndAdvanceRound } = await import("./services/live-scores");
      await detectAndAdvanceRound();
      const scoreResult = await fetchScoresForCompletedRounds();
      if (scoreResult.roundsProcessed > 0) {
        const { recalculatePlayerAverages } = await import("./expand-players");
        await recalculatePlayerAverages();
      }
      markSync("liveScores", "idle");
    } catch (e: any) {
      markSync("liveScores", "error", e.message);
      errors.push(`Live scores: ${e.message}`);
    }

    try {
      markSync("wheelo", "syncing");
      const { syncWheeloRatings } = await import("./services/wheelo-scraper");
      await syncWheeloRatings();
      markSync("wheelo", "idle");
    } catch (e: any) {
      markSync("wheelo", "error", e.message);
      errors.push(`Wheelo: ${e.message}`);
    }

    try {
      markSync("fixtures", "syncing");
      const { fetchAndStoreFixtures, syncPlayerFixtures } = await import("./services/fixture-service");
      await fetchAndStoreFixtures();
      const { db: database } = await import("./db");
      const { leagueSettings } = await import("@shared/schema");
      const [settings] = await database.select().from(leagueSettings).limit(1);
      if (settings?.currentRound) {
        await syncPlayerFixtures(settings.currentRound);
      }
      markSync("fixtures", "idle");
    } catch (e: any) {
      markSync("fixtures", "error", e.message);
      errors.push(`Fixtures: ${e.message}`);
    }

    try {
      markSync("aflInjuryList", "syncing");
      const { syncAflInjuryList } = await import("./services/afl-injury-scraper");
      await syncAflInjuryList();
      markSync("aflInjuryList", "idle");
    } catch (e: any) {
      markSync("aflInjuryList", "error", e.message);
      errors.push(`AFL injury list: ${e.message}`);
    }

    try {
      const { recalculatePlayerAverages } = await import("./expand-players");
      await recalculatePlayerAverages();
    } catch (e: any) {
      errors.push(`Recalc averages: ${e.message}`);
    }

    return { success: errors.length === 0, duration: Date.now() - startTime, errors };
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
