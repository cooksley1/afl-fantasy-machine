import OpenAI from "openai";
import { storage } from "./storage";
import type { Player, PlayerWithTeamInfo, InsertIntelReport } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function buildPlayerSummary(players: Player[]): string {
  return players.map(p => 
    `${p.name} (${p.team}, ${p.position}) - Avg: ${p.avgScore?.toFixed(1)}, L3: ${p.last3Avg?.toFixed(1)}, L5: ${p.last5Avg?.toFixed(1)}, Price: $${(p.price/1000).toFixed(0)}K, Form: ${p.formTrend}, Own%: ${p.ownedByPercent?.toFixed(0)}%, Bye: R${p.byeRound}${p.injuryStatus ? `, INJURY: ${p.injuryStatus}` : ''}, Next: vs ${p.nextOpponent}`
  ).join('\n');
}

function buildTeamSummary(team: PlayerWithTeamInfo[]): string {
  return team.map(p =>
    `${p.name} (${p.team}, ${p.fieldPosition}) - Avg: ${p.avgScore?.toFixed(1)}, L3: ${p.last3Avg?.toFixed(1)}, Form: ${p.formTrend}, Price: $${(p.price/1000).toFixed(0)}K${p.isCaptain ? ' [CAPTAIN]' : ''}${p.isViceCaptain ? ' [VC]' : ''}${p.isOnField ? '' : ' [BENCH]'}`
  ).join('\n');
}

export async function generateIntelReports(): Promise<void> {
  const allPlayers = await storage.getAllPlayers();
  const myTeam = await storage.getMyTeam();
  const settings = await storage.getSettings();

  const playerData = buildPlayerSummary(allPlayers);
  const teamData = buildTeamSummary(myTeam);

  const systemPrompt = `You are an expert AFL Fantasy analyst. You have deep knowledge of Australian Football League fantasy football strategy including SuperCoach and AFL Fantasy formats. You analyze player data, form, injuries, positions, conditions, tactics, and historical trends to provide actionable intelligence.

Your analysis should cover these key areas:
1. INJURIES & TEAM CHANGES - Players who are injured, dropped, rested, or have changed positions
2. CASH COWS - Cheap players with high scoring potential who are making money (price rises)
3. CAPTAIN PICKS - Best captain options considering form, matchups, and captain loophole strategies
4. BYE STRATEGY - How to manage bye rounds to maintain competitive scores
5. POINTS OF DIFFERENCE (POD) - Low-owned players who could give a scoring edge over opponents
6. BREAKOUT PLAYERS - Players whose form suggests they're about to break out
7. PREMIUM TRADES - Which premium players to target or avoid based on form
8. GROUND & CONDITIONS - How different grounds and weather conditions affect certain players
9. TACTICAL INSIGHTS - Positional switches, role changes, and tactical trends
10. HISTORICAL PATTERNS - Scoring patterns based on matchup history

Be specific with player names from the data provided. Focus on actionable advice.`;

  const userPrompt = `Analyze the following AFL Fantasy data and generate strategic intelligence reports.

CURRENT ROUND: ${settings.currentRound}
TRADES REMAINING: ${settings.tradesRemaining}
SALARY CAP REMAINING: $${((settings.salaryCap - myTeam.reduce((s, p) => s + p.price, 0)) / 1000).toFixed(0)}K

MY TEAM:
${teamData}

ALL AVAILABLE PLAYERS:
${playerData}

Generate a comprehensive analysis in the following JSON format. Return ONLY valid JSON, no markdown:
{
  "reports": [
    {
      "category": "injuries" | "cash_cows" | "captain_picks" | "bye_strategy" | "pod_players" | "breakout" | "premium_trades" | "ground_conditions" | "tactical" | "historical",
      "title": "Short descriptive title",
      "content": "Detailed analysis with specific player recommendations and reasoning",
      "priority": "high" | "medium" | "low",
      "playerNames": "Comma-separated player names mentioned",
      "actionable": true/false
    }
  ]
}

Generate 8-12 reports covering the most important strategic insights. Focus on what will help win this week AND long-term.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    const parsed = JSON.parse(content);
    const reports = parsed.reports || [];

    if (reports.length === 0) {
      throw new Error("AI returned no intelligence reports");
    }

    await storage.clearIntelReports();

    for (const report of reports) {
      await storage.createIntelReport({
        category: report.category || "tactical",
        title: report.title || "Analysis",
        content: report.content || "",
        priority: report.priority || "medium",
        playerNames: report.playerNames || null,
        source: "ai_analysis",
        actionable: report.actionable ?? false,
      });
    }
  } catch (error: any) {
    console.error("Intel generation error:", error.message);
    throw error;
  }
}

export async function generateAITradeRecommendations(): Promise<void> {
  const allPlayers = await storage.getAllPlayers();
  const myTeam = await storage.getMyTeam();
  const settings = await storage.getSettings();

  if (myTeam.length === 0) {
    throw new Error("Add players to your team first");
  }

  const teamPlayerIds = new Set(myTeam.map(p => p.id));
  const availablePlayers = allPlayers.filter(p => !teamPlayerIds.has(p.id));
  const teamData = buildTeamSummary(myTeam);
  const availableData = buildPlayerSummary(availablePlayers);

  const prompt = `You are an expert AFL Fantasy trade advisor. Analyze my team and available players to recommend the best trades.

CURRENT ROUND: ${settings.currentRound}
TRADES REMAINING: ${settings.tradesRemaining}
SALARY CAP REMAINING: $${((settings.salaryCap - myTeam.reduce((s, p) => s + p.price, 0)) / 1000).toFixed(0)}K

MY TEAM:
${teamData}

AVAILABLE PLAYERS:
${availableData}

Consider these factors:
- Player form (last 3 and 5 game averages vs season average)
- Upcoming opponent difficulty
- Bye round coverage (avoid trading in players with upcoming byes)
- Price trajectory (target players likely to rise in price)
- Position balance and bench coverage
- Captain loophole strategies (having a good VC with early game)
- Points of difference vs highly-owned players
- Injury risks and durability
- Cash cow potential for cheaper players
- Historical scoring patterns and ceiling scores

Return ONLY valid JSON:
{
  "trades": [
    {
      "playerOutName": "exact player name from my team",
      "playerInName": "exact player name from available",
      "reason": "detailed reasoning covering form, matchups, strategy",
      "confidence": 0.0-1.0,
      "category": "upgrade" | "downgrade" | "sideways" | "cash_cow"
    }
  ]
}

Recommend 5-8 trades, ranked by confidence. Focus on trades that will maximize weekly score and long-term value.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    const parsed = JSON.parse(content);
    const trades = parsed.trades || [];

    if (trades.length === 0) {
      throw new Error("AI returned no trade recommendations");
    }

    await storage.clearTradeRecommendations();

    for (const trade of trades) {
      const playerOut = myTeam.find(p => p.name === trade.playerOutName);
      const playerIn = availablePlayers.find(p => p.name === trade.playerInName);

      if (playerOut && playerIn) {
        await storage.createTradeRecommendation({
          playerOutId: playerOut.id,
          playerInId: playerIn.id,
          reason: trade.reason || "AI recommendation based on form analysis",
          confidence: Math.min(Math.max(trade.confidence || 0.5, 0), 1),
          priceChange: playerIn.price - playerOut.price,
          scoreDifference: (playerIn.avgScore || 0) - (playerOut.avgScore || 0),
        });
      }
    }
  } catch (error: any) {
    console.error("AI trade recommendation error:", error.message);
    throw error;
  }
}
