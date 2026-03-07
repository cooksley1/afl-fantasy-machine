import { db } from "../db";
import { teamTagProfiles, tagMatchupHistory, players, weeklyStats, tagPredictionOutcomes } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const KNOWN_TAG_PROFILES: {
  team: string;
  usesTaggers: boolean;
  tagFrequency: number;
  primaryTagger: string | null;
  secondaryTagger: string | null;
  notes: string | null;
}[] = [
  { team: "Adelaide", usesTaggers: true, tagFrequency: 0.4, primaryTagger: "Ben Keays", secondaryTagger: null, notes: "Use tag selectively, mainly against top midfielders. Keays plays a run-with role when deployed." },
  { team: "Brisbane Lions", usesTaggers: true, tagFrequency: 0.35, primaryTagger: "Jarrod Berry", secondaryTagger: null, notes: "Berry plays a loose tag / run-with role. Brisbane prefer a team-based approach but will tag elite mids." },
  { team: "Carlton", usesTaggers: true, tagFrequency: 0.75, primaryTagger: "Ed Curnow", secondaryTagger: "Sam Walsh", notes: "Curnow is one of the AFL's most prolific taggers. Consistently deployed against the opposition's best midfielder. Walsh occasionally shares the role." },
  { team: "Collingwood", usesTaggers: false, tagFrequency: 0.1, primaryTagger: null, secondaryTagger: null, notes: "Collingwood rarely use a dedicated tagger. Prefer zone-based defensive structures." },
  { team: "Essendon", usesTaggers: true, tagFrequency: 0.3, primaryTagger: "Sam Durham", secondaryTagger: null, notes: "Durham plays a shutdown role selectively. Essendon use tagging more strategically than consistently." },
  { team: "Fremantle", usesTaggers: true, tagFrequency: 0.45, primaryTagger: "Ryan Leno", secondaryTagger: "Hayden Young", notes: "Leno has emerged as their primary tagger since 2025. Young occasionally plays a run-with role." },
  { team: "Geelong", usesTaggers: true, tagFrequency: 0.65, primaryTagger: "Mark O'Connor", secondaryTagger: null, notes: "O'Connor is a prolific tagger. Regularly deployed against top midfielders. Strong tagging culture under Chris Scott." },
  { team: "Gold Coast", usesTaggers: false, tagFrequency: 0.15, primaryTagger: null, secondaryTagger: null, notes: "Gold Coast rarely use a dedicated tagger. Prefer a free-flowing midfield approach." },
  { team: "GWS Giants", usesTaggers: true, tagFrequency: 0.35, primaryTagger: "Jacob Hopper", secondaryTagger: null, notes: "Hopper plays a run-with role in certain matchups. GWS tag selectively against top opposition mids." },
  { team: "Hawthorn", usesTaggers: true, tagFrequency: 0.5, primaryTagger: "Blake Hardwick", secondaryTagger: "Conor Nash", notes: "Hardwick is deployed as a tagger in key games. Nash also plays a defensive mid/tag role at times." },
  { team: "Melbourne", usesTaggers: true, tagFrequency: 0.6, primaryTagger: "James Jordon", secondaryTagger: null, notes: "Jordon is the primary tagger. Melbourne have a strong tagging tradition, especially since 2021." },
  { team: "North Melbourne", usesTaggers: false, tagFrequency: 0.15, primaryTagger: null, secondaryTagger: null, notes: "North Melbourne rarely use a dedicated tagger in their rebuild phase." },
  { team: "Port Adelaide", usesTaggers: false, tagFrequency: 0.1, primaryTagger: null, secondaryTagger: null, notes: "Port Adelaide prefer a team-based pressure approach rather than dedicated tagging." },
  { team: "Richmond", usesTaggers: true, tagFrequency: 0.4, primaryTagger: "Hugo Ralphsmith", secondaryTagger: null, notes: "Richmond deploy a run-with player selectively, especially in big games." },
  { team: "St Kilda", usesTaggers: true, tagFrequency: 0.7, primaryTagger: "Marcus Windhager", secondaryTagger: null, notes: "Windhager is one of the competition's most dedicated taggers. Regularly deployed against the number one midfielder." },
  { team: "Sydney", usesTaggers: false, tagFrequency: 0.1, primaryTagger: null, secondaryTagger: null, notes: "Sydney rarely use a dedicated tagger. Rely on system-based defense." },
  { team: "West Coast", usesTaggers: true, tagFrequency: 0.35, primaryTagger: "Liam Duggan", secondaryTagger: null, notes: "Duggan plays a run-with role. West Coast use tagging selectively." },
  { team: "Western Bulldogs", usesTaggers: false, tagFrequency: 0.15, primaryTagger: null, secondaryTagger: null, notes: "Western Bulldogs prefer an offensive, free-flowing midfield approach." },
];

const KNOWN_TAG_MATCHUPS: {
  round: number;
  season: number;
  taggerTeam: string;
  taggerName: string;
  targetName: string;
  targetTeam: string;
  targetNormalAvg: number;
  targetTaggedScore: number;
  source: string;
}[] = [
  { round: 1, season: 2025, taggerTeam: "Carlton", taggerName: "Ed Curnow", targetName: "Marcus Bontempelli", targetTeam: "Western Bulldogs", targetNormalAvg: 110, targetTaggedScore: 72, source: "Historical — Curnow regularly tags Bont" },
  { round: 5, season: 2025, taggerTeam: "Geelong", taggerName: "Mark O'Connor", targetName: "Christian Petracca", targetTeam: "Melbourne", targetNormalAvg: 105, targetTaggedScore: 68, source: "Historical — O'Connor vs Petracca" },
  { round: 3, season: 2025, taggerTeam: "St Kilda", taggerName: "Marcus Windhager", targetName: "Andrew Brayshaw", targetTeam: "Fremantle", targetNormalAvg: 108, targetTaggedScore: 78, source: "Historical — Windhager regular tag assignment" },
  { round: 7, season: 2025, taggerTeam: "Melbourne", taggerName: "James Jordon", targetName: "Lachie Neale", targetTeam: "Brisbane Lions", targetNormalAvg: 112, targetTaggedScore: 82, source: "Historical — Jordon vs Neale" },
  { round: 2, season: 2025, taggerTeam: "Carlton", taggerName: "Ed Curnow", targetName: "Zak Butters", targetTeam: "Port Adelaide", targetNormalAvg: 100, targetTaggedScore: 65, source: "Historical — Curnow shutdown Butters" },
  { round: 8, season: 2025, taggerTeam: "Geelong", taggerName: "Mark O'Connor", targetName: "Marcus Bontempelli", targetTeam: "Western Bulldogs", targetNormalAvg: 110, targetTaggedScore: 75, source: "Historical — O'Connor vs Bont" },
  { round: 4, season: 2025, taggerTeam: "St Kilda", taggerName: "Marcus Windhager", targetName: "Clayton Oliver", targetTeam: "Melbourne", targetNormalAvg: 95, targetTaggedScore: 58, source: "Historical — Windhager vs Oliver" },
  { round: 6, season: 2025, taggerTeam: "Hawthorn", taggerName: "Blake Hardwick", targetName: "Lachie Neale", targetTeam: "Brisbane Lions", targetNormalAvg: 112, targetTaggedScore: 85, source: "Historical — Hardwick deployed vs Neale" },
  { round: 10, season: 2025, taggerTeam: "Melbourne", taggerName: "James Jordon", targetName: "Patrick Cripps", targetTeam: "Carlton", targetNormalAvg: 105, targetTaggedScore: 80, source: "Historical — Jordon vs Cripps" },
  { round: 9, season: 2025, taggerTeam: "Carlton", taggerName: "Ed Curnow", targetName: "Harry Sheezel", targetTeam: "North Melbourne", targetNormalAvg: 108, targetTaggedScore: 70, source: "Historical — Curnow vs Sheezel" },
  { round: 11, season: 2025, taggerTeam: "Fremantle", taggerName: "Ryan Leno", targetName: "Tim Taranto", targetTeam: "Richmond", targetNormalAvg: 98, targetTaggedScore: 72, source: "Historical — Leno in run-with role" },
  { round: 12, season: 2025, taggerTeam: "St Kilda", taggerName: "Marcus Windhager", targetName: "Marcus Bontempelli", targetTeam: "Western Bulldogs", targetNormalAvg: 110, targetTaggedScore: 70, source: "Historical — Windhager vs Bont" },
  { round: 14, season: 2025, taggerTeam: "Geelong", taggerName: "Mark O'Connor", targetName: "Patrick Cripps", targetTeam: "Carlton", targetNormalAvg: 105, targetTaggedScore: 78, source: "Historical — O'Connor vs Cripps" },
  { round: 15, season: 2025, taggerTeam: "Hawthorn", taggerName: "Blake Hardwick", targetName: "Christian Petracca", targetTeam: "Melbourne", targetNormalAvg: 105, targetTaggedScore: 74, source: "Historical — Hardwick vs Petracca" },
  { round: 3, season: 2024, taggerTeam: "Carlton", taggerName: "Ed Curnow", targetName: "Marcus Bontempelli", targetTeam: "Western Bulldogs", targetNormalAvg: 108, targetTaggedScore: 68, source: "Historical 2024" },
  { round: 6, season: 2024, taggerTeam: "St Kilda", taggerName: "Marcus Windhager", targetName: "Lachie Neale", targetTeam: "Brisbane Lions", targetNormalAvg: 110, targetTaggedScore: 75, source: "Historical 2024" },
  { round: 9, season: 2024, taggerTeam: "Geelong", taggerName: "Mark O'Connor", targetName: "Andrew Brayshaw", targetTeam: "Fremantle", targetNormalAvg: 108, targetTaggedScore: 80, source: "Historical 2024" },
  { round: 12, season: 2024, taggerTeam: "Melbourne", taggerName: "James Jordon", targetName: "Jack Macrae", targetTeam: "Western Bulldogs", targetNormalAvg: 100, targetTaggedScore: 70, source: "Historical 2024" },
];

export async function seedTagData(): Promise<void> {
  const existing = await db.select().from(teamTagProfiles);
  if (existing.length >= 18) {
    console.log("[TagIntel] Tag profiles already seeded");
    return;
  }

  if (existing.length > 0) {
    await db.delete(teamTagProfiles);
  }
  const existingHistory = await db.select().from(tagMatchupHistory);
  if (existingHistory.length > 0) {
    await db.delete(tagMatchupHistory);
  }

  for (const profile of KNOWN_TAG_PROFILES) {
    const playerMatch = profile.primaryTagger
      ? await db.select({ id: players.id }).from(players).where(eq(players.name, profile.primaryTagger)).limit(1)
      : [];

    await db.insert(teamTagProfiles).values({
      team: profile.team,
      usesTaggers: profile.usesTaggers,
      tagFrequency: profile.tagFrequency,
      primaryTagger: profile.primaryTagger,
      primaryTaggerPlayerId: playerMatch.length > 0 ? playerMatch[0].id : null,
      secondaryTagger: profile.secondaryTagger,
      notes: profile.notes,
      season: 2026,
    });
  }

  for (const m of KNOWN_TAG_MATCHUPS) {
    const targetMatch = await db.select({ id: players.id }).from(players).where(eq(players.name, m.targetName)).limit(1);
    await db.insert(tagMatchupHistory).values({
      round: m.round,
      season: m.season,
      taggerTeam: m.taggerTeam,
      taggerName: m.taggerName,
      targetName: m.targetName,
      targetTeam: m.targetTeam,
      targetPlayerId: targetMatch.length > 0 ? targetMatch[0].id : null,
      targetNormalAvg: m.targetNormalAvg,
      targetTaggedScore: m.targetTaggedScore,
      scoreImpact: m.targetNormalAvg - m.targetTaggedScore,
      source: m.source,
      confirmed: true,
    });
  }

  console.log(`[TagIntel] Seeded ${KNOWN_TAG_PROFILES.length} team tag profiles and ${KNOWN_TAG_MATCHUPS.length} historical matchups`);
}

export interface TagWarning {
  playerId: number;
  playerName: string;
  team: string;
  position: string;
  avgScore: number;
  nextOpponent: string;
  opponentUsesTaggers: boolean;
  opponentTagFrequency: number;
  opponentTagger: string | null;
  timesTaggedHistorically: number;
  avgScoreWhenTagged: number | null;
  avgScoreImpact: number | null;
  isCaptain: boolean;
  isViceCaptain: boolean;
  riskLevel: "high" | "moderate" | "low";
  advice: string;
  evidence: string[];
}

export async function getTagWarningsForTeam(
  onFieldPlayers: {
    id: number;
    name: string;
    team: string;
    position: string;
    dualPosition?: string | null;
    avgScore: number | null;
    nextOpponent: string | null;
    isCaptain?: boolean;
    isViceCaptain?: boolean;
  }[]
): Promise<TagWarning[]> {
  const warnings: TagWarning[] = [];

  const allProfiles = await db.select().from(teamTagProfiles);
  const profileMap = new Map(allProfiles.map(p => [p.team, p]));

  const allHistory = await db.select().from(tagMatchupHistory);

  for (const player of onFieldPlayers) {
    if (!player.nextOpponent) continue;

    const isMid = player.position === "MID" || player.dualPosition === "MID";
    if (!isMid) continue;

    const opponentProfile = profileMap.get(player.nextOpponent);
    if (!opponentProfile || !opponentProfile.usesTaggers) continue;

    const allPlayerHistory = allHistory.filter(
      h => h.targetName === player.name || h.targetPlayerId === player.id
    );

    const sameTeamHistory = allPlayerHistory.filter(h => h.targetTeam === player.team);
    const diffTeamHistory = allPlayerHistory.filter(h => h.targetTeam !== player.team);
    const playerHistory = sameTeamHistory;

    const taggedByThisOpponent = sameTeamHistory.filter(
      h => h.taggerTeam === player.nextOpponent
    );

    const hasHistoricalEvidence = playerHistory.length > 0;
    const hasOpponentEvidence = taggedByThisOpponent.length > 0;
    const isHighFreqOpponent = opponentProfile.tagFrequency >= 0.5;
    const isEliteMid = (player.avgScore || 0) >= 95;

    if (!hasHistoricalEvidence && !isHighFreqOpponent) continue;
    if (!hasHistoricalEvidence && !isEliteMid) continue;

    const evidence: string[] = [];
    let avgScoreWhenTagged: number | null = null;
    let avgScoreImpact: number | null = null;

    if (hasHistoricalEvidence) {
      const taggedScores = playerHistory
        .filter(h => h.targetTaggedScore !== null)
        .map(h => h.targetTaggedScore!);
      if (taggedScores.length > 0) {
        avgScoreWhenTagged = Math.round(taggedScores.reduce((a, b) => a + b, 0) / taggedScores.length * 10) / 10;
        avgScoreImpact = Math.round(((player.avgScore || 0) - avgScoreWhenTagged) * 10) / 10;
      }

      evidence.push(`Tagged ${playerHistory.length} time(s) historically`);
      if (hasOpponentEvidence) {
        evidence.push(`Tagged by ${player.nextOpponent} ${taggedByThisOpponent.length} time(s) previously`);
      }
      if (avgScoreWhenTagged !== null) {
        evidence.push(`Averages ${avgScoreWhenTagged} when tagged (${avgScoreImpact! > 0 ? "-" : "+"}${Math.abs(avgScoreImpact!)} pts)`);
      }
    }

    if (diffTeamHistory.length > 0 && sameTeamHistory.length === 0) {
      evidence.push(`Previous tag history was at ${diffTeamHistory[0].targetTeam} (different team context)`);
    }

    if (opponentProfile.primaryTagger) {
      evidence.push(`${player.nextOpponent} use ${opponentProfile.primaryTagger} as primary tagger`);
    }
    evidence.push(`${player.nextOpponent} tag frequency: ${Math.round(opponentProfile.tagFrequency * 100)}% of games`);

    let riskLevel: "high" | "moderate" | "low" = "low";
    if (
      taggedByThisOpponent.length >= 2 ||
      (hasOpponentEvidence && isHighFreqOpponent) ||
      (isHighFreqOpponent && isEliteMid && playerHistory.length >= 3)
    ) {
      riskLevel = "high";
    } else if (
      hasOpponentEvidence ||
      (isHighFreqOpponent && isEliteMid) ||
      playerHistory.length >= 3
    ) {
      riskLevel = "moderate";
    }

    let advice = "";
    if (riskLevel === "high") {
      advice = player.isCaptain || player.isViceCaptain
        ? `High tag risk vs ${player.nextOpponent} — strongly consider captaincy alternatives`
        : `High tag risk vs ${player.nextOpponent} — expect reduced output`;
    } else if (riskLevel === "moderate") {
      advice = `Possible tag vs ${player.nextOpponent} — monitor pre-game reports for ${opponentProfile.primaryTagger || "tagger"} assignment`;
    } else {
      advice = `Low tag risk — ${player.nextOpponent} occasionally use a tagger`;
    }

    warnings.push({
      playerId: player.id,
      playerName: player.name,
      team: player.team,
      position: player.position,
      avgScore: player.avgScore || 0,
      nextOpponent: player.nextOpponent,
      opponentUsesTaggers: opponentProfile.usesTaggers,
      opponentTagFrequency: opponentProfile.tagFrequency,
      opponentTagger: opponentProfile.primaryTagger,
      timesTaggedHistorically: playerHistory.length,
      avgScoreWhenTagged,
      avgScoreImpact,
      isCaptain: player.isCaptain || false,
      isViceCaptain: player.isViceCaptain || false,
      riskLevel,
      advice,
      evidence,
    });
  }

  warnings.sort((a, b) => {
    const riskOrder = { high: 0, moderate: 1, low: 2 };
    return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
  });

  return warnings;
}

export async function recordTagMatchup(data: {
  round: number;
  season: number;
  taggerTeam: string;
  taggerName: string;
  targetName: string;
  targetTeam: string;
  targetNormalAvg: number;
  targetTaggedScore: number;
  source: string;
}): Promise<void> {
  const targetMatch = await db.select({ id: players.id }).from(players).where(eq(players.name, data.targetName)).limit(1);

  await db.insert(tagMatchupHistory).values({
    round: data.round,
    season: data.season,
    taggerTeam: data.taggerTeam,
    taggerName: data.taggerName,
    targetName: data.targetName,
    targetTeam: data.targetTeam,
    targetPlayerId: targetMatch.length > 0 ? targetMatch[0].id : null,
    targetNormalAvg: data.targetNormalAvg,
    targetTaggedScore: data.targetTaggedScore,
    scoreImpact: data.targetNormalAvg - data.targetTaggedScore,
    source: data.source,
    confirmed: true,
  });
}

export async function saveTagPredictions(round: number, warnings: TagWarning[]): Promise<number> {
  const existing = await db.select().from(tagPredictionOutcomes)
    .where(and(eq(tagPredictionOutcomes.round, round), eq(tagPredictionOutcomes.season, 2026)));
  if (existing.length > 0) {
    return 0;
  }

  let saved = 0;
  for (const w of warnings) {
    await db.insert(tagPredictionOutcomes).values({
      round,
      season: 2026,
      playerId: w.playerId,
      playerName: w.playerName,
      team: w.team,
      opponent: w.nextOpponent,
      predictedRiskLevel: w.riskLevel,
      predictedTagger: w.opponentTagger,
      playerAvgAtTime: w.avgScore,
      predictedImpact: w.avgScoreImpact,
    });
    saved++;
  }
  console.log(`[TagIntel] Saved ${saved} tag predictions for round ${round}`);
  return saved;
}

export async function evaluateTagOutcomes(round: number): Promise<{
  evaluated: number;
  accurate: number;
  inaccurate: number;
  results: { playerName: string; predicted: string; actualScore: number; wasImpacted: boolean }[];
}> {
  const predictions = await db.select().from(tagPredictionOutcomes)
    .where(and(
      eq(tagPredictionOutcomes.round, round),
      eq(tagPredictionOutcomes.season, 2026),
      sql`${tagPredictionOutcomes.evaluatedAt} IS NULL`
    ));

  const results: { playerName: string; predicted: string; actualScore: number; wasImpacted: boolean }[] = [];
  let accurate = 0;
  let inaccurate = 0;

  for (const pred of predictions) {
    const stats = await db.select().from(weeklyStats)
      .where(and(
        eq(weeklyStats.playerId, pred.playerId),
        eq(weeklyStats.round, round)
      ));

    if (stats.length === 0) continue;

    const actualScore = stats[0].fantasyScore || 0;
    const avgAtTime = pred.playerAvgAtTime || 0;
    const actualImpact = avgAtTime - actualScore;
    const scoredBelowAvg = actualScore < avgAtTime * 0.85;
    const wasLikelyTagged = scoredBelowAvg && actualImpact > 15;
    const predictionWasHighOrMod = pred.predictedRiskLevel === "high" || pred.predictedRiskLevel === "moderate";
    const outcomeAccurate = predictionWasHighOrMod ? wasLikelyTagged : !wasLikelyTagged;

    if (outcomeAccurate) accurate++;
    else inaccurate++;

    await db.update(tagPredictionOutcomes)
      .set({
        actualScore,
        actualImpact,
        wasActuallyTagged: wasLikelyTagged,
        outcomeAccurate,
        evaluatedAt: new Date(),
        notes: wasLikelyTagged
          ? `Scored ${actualScore} (avg ${avgAtTime}), likely tagged (-${actualImpact.toFixed(0)} pts)`
          : `Scored ${actualScore} (avg ${avgAtTime}), no significant tag impact`,
      })
      .where(eq(tagPredictionOutcomes.id, pred.id));

    results.push({
      playerName: pred.playerName,
      predicted: pred.predictedRiskLevel,
      actualScore,
      wasImpacted: wasLikelyTagged,
    });
  }

  console.log(`[TagIntel] Evaluated ${predictions.length} tag predictions for round ${round}: ${accurate} accurate, ${inaccurate} inaccurate`);
  return { evaluated: predictions.length, accurate, inaccurate, results };
}

export async function getTagAccuracyStats(): Promise<{
  totalPredictions: number;
  evaluated: number;
  accurate: number;
  inaccurate: number;
  accuracyRate: number;
  byRiskLevel: { level: string; total: number; accurate: number; rate: number }[];
}> {
  const all = await db.select().from(tagPredictionOutcomes);
  const evaluated = all.filter(p => p.evaluatedAt !== null);
  const accurate = evaluated.filter(p => p.outcomeAccurate === true);
  const inaccurate = evaluated.filter(p => p.outcomeAccurate === false);

  const byLevel = ["high", "moderate", "low"].map(level => {
    const levelPreds = evaluated.filter(p => p.predictedRiskLevel === level);
    const levelAccurate = levelPreds.filter(p => p.outcomeAccurate === true);
    return {
      level,
      total: levelPreds.length,
      accurate: levelAccurate.length,
      rate: levelPreds.length > 0 ? Math.round(levelAccurate.length / levelPreds.length * 100) : 0,
    };
  });

  return {
    totalPredictions: all.length,
    evaluated: evaluated.length,
    accurate: accurate.length,
    inaccurate: inaccurate.length,
    accuracyRate: evaluated.length > 0 ? Math.round(accurate.length / evaluated.length * 100) : 0,
    byRiskLevel: byLevel,
  };
}

export function extractTagMentionsFromText(text: string): {
  possibleTagger: string | null;
  possibleTarget: string | null;
  team: string | null;
} | null {
  const tagPatterns = [
    /(\w[\w\s'-]+?)\s+(?:will|to|set to|expected to)\s+(?:tag|run with|shut down|curb|limit|shadow)\s+(\w[\w\s'-]+)/i,
    /(\w[\w\s'-]+?)\s+(?:tagged|ran with|shadowed|shut down)\s+(\w[\w\s'-]+)/i,
    /tag(?:ging)?\s+(?:role|assignment|job)\s+(?:on|for|against)\s+(\w[\w\s'-]+)/i,
    /(\w[\w\s'-]+?)\s+(?:gets?|cop(?:s|ped)?|face(?:s|d)?|draw(?:s|n)?)\s+(?:a\s+)?tag/i,
  ];

  for (const pattern of tagPatterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        possibleTagger: match[1]?.trim() || null,
        possibleTarget: match[2]?.trim() || null,
        team: null,
      };
    }
  }
  return null;
}
