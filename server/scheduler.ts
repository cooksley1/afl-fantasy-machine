import { gatherIntelligence } from "./data-gatherer";

let gatherInterval: NodeJS.Timeout | null = null;
let isGathering = false;
let lastGatherTime: Date | null = null;
let gatherCount = 0;

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
      const { fetchScoresForCompletedRounds } = await import("./services/live-scores");
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
}

export function stopScheduler() {
  if (gatherInterval) {
    clearInterval(gatherInterval);
    gatherInterval = null;
    console.log("[Scheduler] Stopped");
  }
}

export function getSchedulerStatus() {
  return {
    isRunning: gatherInterval !== null,
    isGathering,
    lastGatherTime: lastGatherTime?.toISOString() || null,
    gatherCount,
    nextGatherIn: gatherInterval ? "~4 hours" : "stopped",
  };
}
