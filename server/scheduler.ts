import { gatherIntelligence } from "./data-gatherer";

let gatherInterval: NodeJS.Timeout | null = null;
let liveScoreInterval: NodeJS.Timeout | null = null;
let isGathering = false;
let isFetchingLive = false;
let lastGatherTime: Date | null = null;
let lastLiveFetchTime: Date | null = null;
let gatherCount = 0;
let liveFetchCount = 0;

async function runGather() {
  if (isGathering) {
    console.log("[Scheduler] Gather already in progress, skipping");
    return;
  }
  isGathering = true;
  try {
    const result = await gatherIntelligence();
    lastGatherTime = new Date();
    gatherCount++;
    console.log(`[Scheduler] Gather #${gatherCount} complete: ${result.fetched} fetched, ${result.processed} processed`);

    try {
      const { fetchDTLiveData } = await import("./services/dtlive-scraper");
      await fetchDTLiveData();
    } catch (e: any) {
      console.log(`[Scheduler] DTLive sync error: ${e.message}`);
    }

    try {
      const { fetchFootywireData } = await import("./services/footywire-scraper");
      await fetchFootywireData();
    } catch (e: any) {
      console.log(`[Scheduler] Footywire sync error: ${e.message}`);
    }

    try {
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
    } catch (e: any) {
      console.log(`[Scheduler] Score fetch error: ${e.message}`);
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
    const { windows, hasActiveGames } = await getActiveGameWindows();

    if (hasActiveGames) {
      const { db } = await import("./db");
      const { leagueSettings } = await import("@shared/schema");
      const [settings] = await db.select().from(leagueSettings).limit(1);
      const currentRound = settings?.currentRound || 1;

      const result = await fetchAndStorePlayerScores(currentRound);
      liveFetchCount++;
      lastLiveFetchTime = new Date();
      if (result.updated > 0) {
        console.log(`[LiveFetch] #${liveFetchCount}: Updated ${result.updated} player scores for round ${currentRound} (${windows.filter(w => w.status === "live").length} live games)`);
      }
    }
  } catch (e: any) {
    console.error("[LiveFetch] Error:", e.message);
  } finally {
    isFetchingLive = false;
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
    lastGatherTime: lastGatherTime?.toISOString() || null,
    lastLiveFetchTime: lastLiveFetchTime?.toISOString() || null,
    gatherCount,
    liveFetchCount,
    nextGatherIn: gatherInterval ? "~4 hours" : "stopped",
  };
}
