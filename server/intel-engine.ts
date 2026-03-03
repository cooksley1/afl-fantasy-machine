import OpenAI from "openai";
import { storage } from "./storage";
import type { Player, PlayerWithTeamInfo, InsertIntelReport } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function buildPlayerSummary(players: Player[]): string {
  return players.map(p => {
    const parts = [
      `${p.name} (${p.team}, ${p.position}${p.dualPosition ? '/' + p.dualPosition : ''})`,
      `Avg: ${p.avgScore?.toFixed(1)}, L3: ${p.last3Avg?.toFixed(1)}, L5: ${p.last5Avg?.toFixed(1)}`,
      `Price: $${(p.price/1000).toFixed(0)}K (${p.priceChange >= 0 ? '+' : ''}$${(p.priceChange/1000).toFixed(0)}K)`,
      `BE: ${p.breakEven ?? 'N/A'}, Proj: ${p.projectedScore?.toFixed(0) ?? 'N/A'}, Floor: ${p.projectedFloor?.toFixed(0) ?? 'N/A'}, Ceil: ${p.ceilingScore ?? 'N/A'}`,
      `Vol: ${p.volatilityScore?.toFixed(1) ?? 'N/A'}, P(120+): ${p.captainProbability ? (p.captainProbability * 100).toFixed(0) + '%' : 'N/A'}`,
      `Form: ${p.formTrend}, Own%: ${p.ownedByPercent?.toFixed(0)}%`,
      `Bye: R${p.byeRound}`,
      `Next: vs ${p.nextOpponent} @ ${p.venue || 'TBA'} (${p.gameTime || 'TBA'})`,
    ];
    if (p.age) parts.push(`Age: ${p.age}, Exp: ${p.yearsExperience ?? 0}yr`);
    if (p.durabilityScore) parts.push(`Durability: ${(p.durabilityScore * 100).toFixed(0)}%`);
    if (p.injuryRiskScore && p.injuryRiskScore > 0.3) parts.push(`InjuryRisk: ${(p.injuryRiskScore * 100).toFixed(0)}%`);
    if (p.injuryStatus) parts.push(`INJURY: ${p.injuryStatus}`);
    if (p.lateChange) parts.push('LATE CHANGE');
    if (!p.isNamedTeam) parts.push('NOT NAMED');
    return parts.join(' | ');
  }).join('\n');
}

function buildTeamSummary(team: PlayerWithTeamInfo[]): string {
  return team.map(p => {
    const parts = [
      `${p.name} (${p.team}, ${p.fieldPosition}${p.dualPosition ? ' DPP:' + p.dualPosition : ''})`,
      `Avg: ${p.avgScore?.toFixed(1)}, L3: ${p.last3Avg?.toFixed(1)}, Proj: ${p.projectedScore?.toFixed(0) ?? 'N/A'} (Floor: ${p.projectedFloor?.toFixed(0) ?? '?'}, Ceil: ${p.ceilingScore ?? '?'})`,
      `Form: ${p.formTrend}, Price: $${(p.price/1000).toFixed(0)}K`,
      `BE: ${p.breakEven ?? 'N/A'}, Vol: ${p.volatilityScore?.toFixed(1) ?? '?'}, P(120+): ${p.captainProbability ? (p.captainProbability * 100).toFixed(0) + '%' : '?'}`,
      `Game: ${p.gameTime || 'TBA'} @ ${p.venue || 'TBA'}`,
    ];
    if (p.isCaptain) parts.push('[CAPTAIN]');
    if (p.isViceCaptain) parts.push('[VC]');
    if (!p.isOnField) parts.push('[BENCH]');
    if (p.injuryStatus) parts.push(`INJURY: ${p.injuryStatus}`);
    if (p.lateChange) parts.push('LATE CHANGE');
    return parts.join(' | ');
  }).join('\n');
}

function getGameSlots(team: PlayerWithTeamInfo[]): string {
  const slots: Record<string, string[]> = {};
  for (const p of team) {
    const time = p.gameTime || 'Unknown';
    if (!slots[time]) slots[time] = [];
    slots[time].push(`${p.name}${p.isCaptain ? ' [C]' : ''}${p.isViceCaptain ? ' [VC]' : ''}`);
  }
  return Object.entries(slots)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, names]) => `${time}: ${names.join(', ')}`)
    .join('\n');
}

function getByeRoundBreakdown(team: PlayerWithTeamInfo[]): string {
  const byeGroups: Record<number, string[]> = {};
  for (const p of team) {
    const bye = p.byeRound ?? 0;
    if (!byeGroups[bye]) byeGroups[bye] = [];
    byeGroups[bye].push(p.name);
  }
  return Object.entries(byeGroups)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([round, names]) => `R${round}: ${names.join(', ')} (${names.length} players out)`)
    .join('\n');
}

function getDPPPlayers(players: Player[]): string {
  return players
    .filter(p => p.dualPosition)
    .map(p => `${p.name}: ${p.position}/${p.dualPosition} (${p.avgScore?.toFixed(1)} avg, $${(p.price/1000).toFixed(0)}K)`)
    .join('\n');
}

export async function generateIntelReports(): Promise<void> {
  const allPlayers = await storage.getAllPlayers();
  const myTeam = await storage.getMyTeam();
  const settings = await storage.getSettings();

  const playerData = buildPlayerSummary(allPlayers);
  const teamData = buildTeamSummary(myTeam);
  const gameSlots = getGameSlots(myTeam);
  const byeBreakdown = getByeRoundBreakdown(myTeam);
  const dppPlayers = getDPPPlayers(allPlayers);

  const systemPrompt = `You are an elite AFL Fantasy analyst with expertise in SuperCoach and AFL Fantasy formats. You combine statistical analysis with deep knowledge from AFL data sources including:
- Squiggle API data and Footywire stats
- The Traders (AFL.com.au) analysis
- AFL.com.au injury lists and team selections
- Club-specific news and positional changes
- Bureau of Meteorology ground conditions data
- Community sentiment from r/AFLFantasy, BigFooty forums
- Champion Data advanced metrics patterns
- Doctor Fantasy and The Keeper League analysis

KEY STRATEGIC CONCEPTS YOU MUST APPLY:

CAPTAIN LOOPHOLE / VC-C SWITCH STRATEGY:
AFL Fantasy uses a "rolling lockout" where players lock as their individual games begin. The Captain Loophole works by:
1. Set your Vice-Captain (VC) to a player in an EARLY game slot (e.g., Thursday/Friday)
2. If the VC scores above ~110-120, keep them as effective captain (their score doubles)
3. If the VC scores poorly, switch captaincy to a player in a LATER game slot (Saturday night/Sunday)
4. This requires having premium options across DIFFERENT game time slots
Decision tree: IF VC_score > 120 → keep VC as captain | IF VC_score 100-120 → assess captain matchup | IF VC_score < 100 → switch to captain in later game

DPP (DUAL POSITION PLAYERS):
Players with dual position eligibility (DEF/MID, MID/FWD, etc.) are extremely valuable because:
- They provide positional flexibility for team structure
- Can be moved to exploit favorable matchups
- Allow bench cover across multiple lines
- Often indicate a role change that leads to scoring upside

BREAK-EVEN ANALYSIS:
- Break-even (BE) = the score needed to maintain current price
- Scoring ABOVE BE = price rise (good for trading out later)
- Scoring BELOW BE = price drop (sell before they lose value)
- Low BE + high form = prime trade target (will make lots of money)
- High BE + poor form = sell candidate (about to lose value)

LATE CHANGES / TEAM SELECTION:
- Late changes happen 60 minutes before bounce-down
- Players marked as "late change" or "not named" are HIGH RISK
- If your captain/VC is a late change, you need an emergency plan
- Always have bench cover for late withdrawals

Be specific with player names from the data provided. Every report should contain actionable advice.`;

  const userPrompt = `Analyze the following AFL Fantasy data and generate strategic intelligence reports.

CURRENT ROUND: ${settings.currentRound}
TRADES REMAINING: ${settings.tradesRemaining}
SALARY CAP: $${(settings.salaryCap / 1000).toFixed(0)}K
SALARY CAP REMAINING: $${((settings.salaryCap - myTeam.reduce((s, p) => s + p.price, 0)) / 1000).toFixed(0)}K

MY TEAM:
${teamData}

GAME TIME SLOTS (for Captain Loophole analysis):
${gameSlots}

BYE ROUND BREAKDOWN:
${byeBreakdown}

DPP PLAYERS AVAILABLE:
${dppPlayers}

ALL AVAILABLE PLAYERS:
${playerData}

Generate a comprehensive analysis in the following JSON format. Return ONLY valid JSON, no markdown:
{
  "reports": [
    {
      "category": "injuries" | "cash_cows" | "captain_picks" | "bye_strategy" | "pod_players" | "breakout" | "premium_trades" | "ground_conditions" | "tactical" | "historical",
      "title": "Short descriptive title",
      "content": "Detailed analysis with specific player recommendations and reasoning. Include specific numbers, projections, and strategic rationale.",
      "priority": "high" | "medium" | "low",
      "playerNames": "Comma-separated player names mentioned",
      "actionable": true/false
    }
  ]
}

REQUIRED REPORTS (generate at least one for each):
1. CAPTAIN LOOPHOLE STRATEGY - Analyze game time slots. Which player should be VC (early game)? Which captain options are in later slots? Include the decision tree threshold (e.g., "If VC scores above X, keep; otherwise switch to Y").
2. BREAK-EVEN & PRICE MOVEMENT - Which players are about to rise/fall in price? Who should you trade before they lose value?
3. DPP EXPLOITATION - Which DPP players provide the best positional flexibility and value?
4. LATE CHANGE RISK - Flag any injury/selection concerns for my team players
5. BYE STRATEGY - With the bye breakdown shown, which rounds am I most exposed? What trades fix it?
6. POD PLAYS - Low ownership players with high ceiling who could be match-winners
7. CASH COW TARGETS - Cheap players scoring well above break-even (making money fast)
8. PREMIUM UPGRADES - Best premium targets based on form, ceiling, and upcoming fixtures
9. GROUND & CONDITIONS - Venue-specific advantages/disadvantages for my players
10. TACTICAL INSIGHTS - Role changes, positional switches, team structure optimization

Generate 10-14 reports. Prioritize the most impactful advice first.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 6000,
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
  const byeBreakdown = getByeRoundBreakdown(myTeam);

  const prompt = `You are an expert AFL Fantasy trade advisor combining statistical optimization with strategic game theory.

CURRENT ROUND: ${settings.currentRound}
TRADES REMAINING: ${settings.tradesRemaining}
SALARY CAP REMAINING: $${((settings.salaryCap - myTeam.reduce((s, p) => s + p.price, 0)) / 1000).toFixed(0)}K

MY TEAM:
${teamData}

BYE ROUND EXPOSURE:
${byeBreakdown}

AVAILABLE PLAYERS:
${availableData}

OPTIMIZATION FACTORS (weighted by importance):
1. BREAK-EVEN ARBITRAGE (HIGH): Target players with low BE + high form (will rise in price). Sell players with high BE + declining form (about to lose value). Price trajectory is critical for long-term team value.
2. FORM vs FIXTURE (HIGH): Prioritize players trending up (L3 > L5 > Avg) against favorable opponents. Avoid players trending down even if historically good.
3. DPP VALUE (HIGH): Players with dual position eligibility are more valuable - they provide structural flexibility. Flag DPP opportunities.
4. CAPTAIN LOOPHOLE COVERAGE (MEDIUM): Ensure team has premium options across different game time slots for VC/C switching strategy.
5. BYE ROUND BALANCE (MEDIUM): Avoid loading up on same-bye players. Spread exposure across bye rounds.
6. POINTS OF DIFFERENCE (MEDIUM): Low ownership (<20%) players with high ceiling scores provide edge over opponents.
7. CASH GENERATION (MEDIUM): For downgrades, target cheap players making money (low BE, scoring well) to generate cap space for later upgrades.
8. INJURY RISK (LOW-MEDIUM): Factor in managed workloads, soft tissue histories, and team selection risks.

Return ONLY valid JSON:
{
  "trades": [
    {
      "playerOutName": "exact player name from my team",
      "playerInName": "exact player name from available",
      "reason": "detailed reasoning covering form, matchups, BE analysis, DPP value, and strategic rationale",
      "confidence": 0.0-1.0,
      "category": "upgrade" | "downgrade" | "sideways" | "cash_cow"
    }
  ]
}

Recommend 5-8 trades, ranked by confidence. Include at least one cash cow downgrade and one premium upgrade.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 4000,
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

export async function analyzeTeamScreenshot(base64Image: string): Promise<{
  players: { name: string; position: string; score?: number }[];
  analysis: string;
  recommendations: { type: string; detail: string; priority: string }[];
  captainTip: string;
  tradeSuggestions: string[];
}> {
  const allPlayers = await storage.getAllPlayers();
  const playerNames = allPlayers.map(p => p.name).join(', ');

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert AFL Fantasy team analyzer. You analyze screenshots of AFL Fantasy teams (from SuperCoach or AFL Fantasy platforms) and provide strategic advice.

Known players in the database: ${playerNames}

When analyzing, identify:
1. Players visible in the screenshot (name, position, any visible scores/prices)
2. Team structure strengths and weaknesses
3. Captain/VC recommendations using the loophole strategy
4. Trade targets - who to trade in/out
5. DPP exploitation opportunities
6. Break-even and price movement concerns

If the image is not an AFL Fantasy screenshot, still provide helpful AFL Fantasy advice based on any football content visible, or explain what you see and offer general tips.

Return ONLY valid JSON.`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this AFL Fantasy team screenshot. Identify all players, assess the team structure, and provide actionable recommendations.

Return JSON:
{
  "players": [{"name": "Player Name", "position": "DEF/MID/RUC/FWD", "score": 0}],
  "analysis": "Overall team assessment - strengths, weaknesses, salary situation, structure",
  "recommendations": [{"type": "trade|captain|structure|cash_cow|upgrade", "detail": "Specific recommendation", "priority": "high|medium|low"}],
  "captainTip": "Best captain loophole strategy for this team",
  "tradeSuggestions": ["Trade suggestion 1", "Trade suggestion 2"]
}`
          },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "high" }
          }
        ]
      }
    ],
    temperature: 0.5,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI vision analysis");

  try {
    const parsed = JSON.parse(content);
    return {
      players: Array.isArray(parsed.players) ? parsed.players : [],
      analysis: parsed.analysis || "Analysis could not be completed.",
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      captainTip: parsed.captainTip || "",
      tradeSuggestions: Array.isArray(parsed.tradeSuggestions) ? parsed.tradeSuggestions : [],
    };
  } catch {
    throw new Error("Failed to parse AI analysis response");
  }
}

export async function generateCaptainAdvice(): Promise<{
  vcPick: { name: string; reason: string; gameTime: string; projectedScore: number };
  captainPick: { name: string; reason: string; gameTime: string; projectedScore: number };
  loopholeThreshold: number;
  decisionTree: string;
}> {
  const myTeam = await storage.getMyTeam();
  const onField = myTeam.filter(p => p.isOnField);

  const teamWithTimes = onField.map(p => ({
    name: p.name,
    gameTime: p.gameTime || 'Unknown',
    venue: p.venue || 'Unknown',
    avgScore: p.avgScore || 0,
    last3Avg: p.last3Avg || 0,
    projectedScore: p.projectedScore || p.avgScore || 0,
    projectedFloor: p.projectedFloor || 0,
    ceilingScore: p.ceilingScore || 0,
    volatilityScore: p.volatilityScore || 5,
    captainProbability: p.captainProbability || 0,
    opponent: p.nextOpponent || 'Unknown',
    position: p.fieldPosition,
  }));

  const prompt = `You are an AFL Fantasy captain loophole expert. Analyze my on-field team for the optimal VC/C strategy.

The Captain Loophole exploits rolling lockout: set VC on early-game player, if they score well keep their doubled score, otherwise switch captain to a late-game player.

MY ON-FIELD PLAYERS:
${teamWithTimes.map(p => `${p.name} (${p.position}) - Game: ${p.gameTime} @ ${p.venue} vs ${p.opponent} | Avg: ${p.avgScore.toFixed(1)}, L3: ${p.last3Avg.toFixed(1)}, Proj: ${p.projectedScore.toFixed(0)}, Floor: ${p.projectedFloor.toFixed(0)}, Ceil: ${p.ceilingScore}, Vol: ${p.volatilityScore.toFixed(1)}, P(120+): ${(p.captainProbability * 100).toFixed(0)}%`).join('\n')}

CAPTAIN PROBABILITY MODEL: Rank by P(score >= 120) using normal distribution, not by average. Higher probability = better captain pick.

Return ONLY valid JSON:
{
  "vcPick": { "name": "player name", "reason": "why they should be VC", "gameTime": "their game time", "projectedScore": 0 },
  "captainPick": { "name": "player name", "reason": "why they are the captain safety net", "gameTime": "their game time", "projectedScore": 0 },
  "loopholeThreshold": 110,
  "decisionTree": "IF VC scores > X → keep VC score doubled. IF VC scores Y-X → assess based on... IF VC scores < Y → switch to Captain."
}

The VC MUST play in an earlier game slot than the Captain pick. Choose the best VC from the earliest viable game and the best Captain from a later game.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");

  return JSON.parse(content);
}

export interface PlayerAdvice {
  name: string;
  playerId: number;
  action: "keep" | "trade" | "sell" | "buy" | "monitor" | "must_have";
  captaincy: "captain" | "vice_captain" | "loophole_vc" | "none";
  reasoning: string;
  formAnalysis: string;
  priceOutlook: string;
  riskLevel: "low" | "medium" | "high";
  priority: number;
}

export interface TeamAnalysisResult {
  overallRating: number;
  summary: string;
  strengthAreas: string[];
  weaknessAreas: string[];
  playerAdvice: PlayerAdvice[];
  urgentActions: string[];
  byeRiskSummary: string;
  captainStrategy: string;
}

export async function analyzeMyTeam(): Promise<TeamAnalysisResult> {
  const allPlayers = await storage.getAllPlayers();
  const myTeam = await storage.getMyTeam();
  const settings = await storage.getSettings();

  if (myTeam.length === 0) {
    throw new Error("Add players to your team first");
  }

  const teamData = buildTeamSummary(myTeam);
  const gameSlots = getGameSlots(myTeam);
  const byeBreakdown = getByeRoundBreakdown(myTeam);

  const teamPlayerIds = new Set(myTeam.map(p => p.id));
  const topAvailable = allPlayers
    .filter(p => !teamPlayerIds.has(p.id))
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
    .slice(0, 50);
  const availableData = buildPlayerSummary(topAvailable);

  const playerList = myTeam.map(p => `ID:${p.id} | ${p.name}`).join(', ');

  const prompt = `You are an elite AFL Fantasy analyst. Analyze my full team and provide a specific verdict on EVERY player. 

CURRENT ROUND: ${settings.currentRound}
TRADES REMAINING: ${settings.tradesRemaining}
SALARY CAP: $${(settings.salaryCap / 1000).toFixed(0)}K
SALARY REMAINING: $${((settings.salaryCap - myTeam.reduce((s, p) => s + p.price, 0)) / 1000).toFixed(0)}K

MY TEAM:
${teamData}

GAME TIME SLOTS:
${gameSlots}

BYE ROUND EXPOSURE:
${byeBreakdown}

TOP AVAILABLE PLAYERS (not on my team):
${availableData}

MY PLAYER IDs: ${playerList}

Return ONLY valid JSON:
{
  "overallRating": 1-10,
  "summary": "2-3 sentence team assessment",
  "strengthAreas": ["strength 1", "strength 2"],
  "weaknessAreas": ["weakness 1", "weakness 2"],
  "playerAdvice": [
    {
      "name": "exact player name",
      "playerId": player_id_number,
      "action": "keep" | "trade" | "sell" | "buy" | "monitor" | "must_have",
      "captaincy": "captain" | "vice_captain" | "loophole_vc" | "none",
      "reasoning": "Why this action - be specific with stats, matchups, form trends",
      "formAnalysis": "Recent form assessment with L3/L5/avg comparison",
      "priceOutlook": "Will price rise or fall? By how much? BE analysis",
      "riskLevel": "low" | "medium" | "high",
      "priority": 1-10 (10 = most urgent to act on)
    }
  ],
  "urgentActions": ["Most urgent action 1", "Most urgent action 2"],
  "byeRiskSummary": "Assessment of bye round exposure and what to do",
  "captainStrategy": "Who should be VC and C this week, with decision tree"
}

RULES:
- You MUST include advice for EVERY player on the team (${myTeam.length} players)
- Use the exact player IDs from the data provided
- "trade" means swap for someone better at similar price
- "sell" means downgrade for cash to fund upgrades elsewhere
- "must_have" means this player is elite and must be kept
- "monitor" means watch for one more week before deciding
- Be specific with replacement targets from the available players list
- Factor in bye rounds, DPP, break-even, form, fixtures, and ceiling`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an elite AFL Fantasy analyst providing comprehensive team analysis. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 6000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    const parsed = JSON.parse(content);
    return {
      overallRating: parsed.overallRating || 5,
      summary: parsed.summary || "Analysis complete.",
      strengthAreas: Array.isArray(parsed.strengthAreas) ? parsed.strengthAreas : [],
      weaknessAreas: Array.isArray(parsed.weaknessAreas) ? parsed.weaknessAreas : [],
      playerAdvice: Array.isArray(parsed.playerAdvice) ? parsed.playerAdvice : [],
      urgentActions: Array.isArray(parsed.urgentActions) ? parsed.urgentActions : [],
      byeRiskSummary: parsed.byeRiskSummary || "",
      captainStrategy: parsed.captainStrategy || "",
    };
  } catch (error: any) {
    console.error("Team analysis error:", error.message);
    throw error;
  }
}

export interface PlayerReport {
  overview: string;
  verdict: "keep" | "trade" | "sell" | "buy" | "monitor" | "must_have";
  verdictReasoning: string;
  formBreakdown: string;
  priceAnalysis: string;
  fixtureOutlook: string;
  captaincyCase: string;
  dppValue: string;
  comparisonPlayers: { name: string; reason: string }[];
  tradeTargets: { name: string; reason: string; direction: "in" | "out" }[];
  riskFactors: string[];
  keyStats: { label: string; value: string; trend: "up" | "down" | "stable" }[];
}

export async function generatePlayerReport(playerId: number): Promise<PlayerReport> {
  const player = await storage.getPlayer(playerId);
  if (!player) throw new Error("Player not found");

  const allPlayers = await storage.getAllPlayers();
  const myTeam = await storage.getMyTeam();
  const settings = await storage.getSettings();

  const isOnMyTeam = myTeam.some(p => p.id === playerId);
  const samePositionPlayers = allPlayers
    .filter(p => p.position === player.position && p.id !== player.id)
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
    .slice(0, 20);

  const playerDetail = buildPlayerSummary([player]);
  const comparisons = buildPlayerSummary(samePositionPlayers);
  const teamContext = myTeam.length > 0 ? buildTeamSummary(myTeam) : "No team selected";

  const prompt = `You are an elite AFL Fantasy analyst. Generate a comprehensive scouting report for this player.

PLAYER:
${playerDetail}

${isOnMyTeam ? "THIS PLAYER IS ON MY TEAM" : "THIS PLAYER IS NOT ON MY TEAM"}

MY TEAM:
${teamContext}

CURRENT ROUND: ${settings.currentRound}
TRADES REMAINING: ${settings.tradesRemaining}

TOP ${player.position} PLAYERS FOR COMPARISON:
${comparisons}

Return ONLY valid JSON:
{
  "overview": "2-3 sentence player assessment covering role, scoring profile, and current trajectory",
  "verdict": "keep" | "trade" | "sell" | "buy" | "monitor" | "must_have",
  "verdictReasoning": "Detailed reasoning for the verdict - 3-4 sentences with specific stats",
  "formBreakdown": "Analysis of L3 vs L5 vs season avg trends. Is form rising, falling, or steady? What's driving it?",
  "priceAnalysis": "Break-even analysis, predicted price movement over next 3 weeks, is now the right time to buy/sell?",
  "fixtureOutlook": "Next 3-5 week fixture analysis. Good or bad matchups coming? Venue impact?",
  "captaincyCase": "Is this player a viable captain/VC option? When should you captain them?",
  "dppValue": "If DPP, how valuable is that flexibility? If not DPP, is position limiting?",
  "comparisonPlayers": [{"name": "Player Name", "reason": "How they compare - better/worse and why"}],
  "tradeTargets": [{"name": "Player Name", "reason": "Why trade to/from this player", "direction": "in" | "out"}],
  "riskFactors": ["Risk factor 1", "Risk factor 2"],
  "keyStats": [
    {"label": "stat name", "value": "stat value", "trend": "up" | "down" | "stable"}
  ]
}

RULES:
- Be specific with numbers and comparisons
- Compare to same-position players
- If on my team, advise whether to keep or trade
- If not on my team, advise whether to buy
- Include at least 3 comparison players and 2 trade targets
- Include at least 5 key stats with trends`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an elite AFL Fantasy analyst. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    const parsed = JSON.parse(content);
    return {
      overview: parsed.overview || "",
      verdict: parsed.verdict || "monitor",
      verdictReasoning: parsed.verdictReasoning || "",
      formBreakdown: parsed.formBreakdown || "",
      priceAnalysis: parsed.priceAnalysis || "",
      fixtureOutlook: parsed.fixtureOutlook || "",
      captaincyCase: parsed.captaincyCase || "",
      dppValue: parsed.dppValue || "",
      comparisonPlayers: Array.isArray(parsed.comparisonPlayers) ? parsed.comparisonPlayers : [],
      tradeTargets: Array.isArray(parsed.tradeTargets) ? parsed.tradeTargets : [],
      riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
      keyStats: Array.isArray(parsed.keyStats) ? parsed.keyStats : [],
    };
  } catch (error: any) {
    console.error("Player report error:", error.message);
    throw error;
  }
}
