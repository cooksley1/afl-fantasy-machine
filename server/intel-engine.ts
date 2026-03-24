import OpenAI from "openai";
import { storage } from "./storage";
import type { Player, PlayerWithTeamInfo, InsertIntelReport } from "@shared/schema";
import { isByeRound, isEarlyByeRound, isRegularByeRound, getTradesForRound, AFL_FANTASY_CLASSIC_2026 } from "@shared/game-rules";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function buildPlayerSummary(players: Player[]): string {
  return players.map(p => {
    const gp = p.gamesPlayed ?? 0;
    const parts = [
      `${p.name} (${p.team}, ${p.position}${p.dualPosition ? '/' + p.dualPosition : ''})`,
      `GamesPlayed2026: ${gp}${gp === 0 ? ' (ALL STATS ARE 2025 BASELINE — NO 2026 DATA)' : gp <= 2 ? ` (VERY SMALL SAMPLE — only ${gp} game${gp > 1 ? 's' : ''} played)` : ''}`,
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

function buildCompactPlayerSummary(players: Player[]): string {
  return players.map(p => {
    const parts = [
      `${p.name} (${p.team}, ${p.position}${p.dualPosition ? '/' + p.dualPosition : ''})`,
      `Avg:${p.avgScore?.toFixed(0)} L3:${p.last3Avg?.toFixed(0)} $${(p.price/1000).toFixed(0)}K BE:${p.breakEven ?? '-'}`,
      `Form:${p.formTrend} Own:${p.ownedByPercent?.toFixed(0)}% Bye:R${p.byeRound}`,
    ];
    if (p.injuryStatus) parts.push(`INJ:${p.injuryStatus}`);
    if (p.lateChange) parts.push('LATE');
    return parts.join(' | ');
  }).join('\n');
}

function selectRelevantPlayers(allPlayers: Player[], myTeam: PlayerWithTeamInfo[], limit: number = 200): Player[] {
  const teamIds = new Set(myTeam.map(p => p.id));
  const nonTeam = allPlayers.filter(p => !teamIds.has(p.id));

  const injured = nonTeam.filter(p => p.injuryStatus || p.lateChange);
  const topScorers = nonTeam
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
    .slice(0, 80);
  const cashCows = nonTeam
    .filter(p => p.price <= 300000 && (p.avgScore || 0) > (p.breakEven || 999))
    .slice(0, 30);
  const risingForm = nonTeam
    .filter(p => p.formTrend === 'rising' || ((p.last3Avg || 0) > (p.avgScore || 0) * 1.1))
    .slice(0, 30);
  const lowOwnership = nonTeam
    .filter(p => (p.ownedByPercent || 100) < 15 && (p.avgScore || 0) > 70)
    .slice(0, 20);
  const dpp = nonTeam.filter(p => p.dualPosition);

  const selectedIds = new Set<number>();
  const selected: Player[] = [];
  const addPlayers = (list: Player[]) => {
    for (const p of list) {
      if (!selectedIds.has(p.id) && selected.length < limit) {
        selectedIds.add(p.id);
        selected.push(p);
      }
    }
  };

  addPlayers(injured);
  addPlayers(topScorers);
  addPlayers(cashCows);
  addPlayers(risingForm);
  addPlayers(lowOwnership);
  addPlayers(dpp);

  return selected;
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

export async function generateIntelReports(userId: string): Promise<void> {
  const allPlayers = await storage.getAllPlayers();
  const myTeam = await storage.getMyTeam(userId);
  const settings = await storage.getSettings(userId);

  const relevantPlayers = selectRelevantPlayers(allPlayers, myTeam, 200);
  const playerData = buildCompactPlayerSummary(relevantPlayers);
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

KEY STRATEGIC CONCEPTS YOU MUST APPLY (AFL Fantasy Classic 2026 Official Rules):

CAPTAIN LOOPHOLE / VC-C SWITCH STRATEGY:
AFL Fantasy uses a "rolling lockout" where players lock as their individual games begin. The Captain Loophole works by:
1. Set your Vice-Captain (VC) to a player in an EARLY game slot (e.g., Thursday/Friday)
2. If the VC scores above ~110-120, keep them as effective captain (their score doubles)
3. If the VC scores poorly, switch captaincy to a player in a LATER game slot (Saturday night/Sunday)
4. This requires having premium options across DIFFERENT game time slots
Decision tree: IF VC_score > 120 → keep VC as captain | IF VC_score 100-120 → assess captain matchup | IF VC_score < 100 → switch to captain in later game
CAPTAIN TOG 50% RULE: If a Captain finishes below 50% Time On Ground, the doubled score becomes whichever is HIGHER between the Captain and Vice-Captain. This is critical — if your Captain gets injured early, the VC score may be doubled instead. Factor this into VC selection.
EMERGENCIES NEVER GET DOUBLED SCORES — only Captain or VC can receive the doubled score.

DPP (DUAL POSITION PLAYERS) & TPP (TRIPLE POSITION PLAYERS - NEW 2026):
Players with dual/triple position eligibility are extremely valuable because:
- They provide positional flexibility for team structure
- Can be moved to exploit favorable matchups
- Allow bench cover across multiple lines
- Often indicate a role change that leads to scoring upside
- TPP is NEW in 2026: Triple position players can be selected in any of three designated lines
- Once DPP/TPP status is granted, it remains for the ENTIRE SEASON

TOG 50% THRESHOLD:
- Players below 50% Time On Ground may be replaced by a higher-scoring emergency from the same position
- This means sub-50% TOG players are HIGH RISK — their scores can effectively be zeroed if an emergency outscores them
- Always set 4 emergencies to protect against low-TOG disasters
- TOG values from Champion Data are rounded (49.75% treated as 50%)

BEST-18 SCORING (BYE ROUNDS):
- During ALL bye rounds (Early Byes R2-R4 AND Regular Byes R12-R14), only the top 18 on-field scores count
- This means your bottom 4 on-field players effectively score zero
- Strategy: Prioritise quality over quantity — better to have 18 high scorers than 22 mediocre ones during byes
- Trade allocation: Early Bye rounds get 2 trades, Regular Bye rounds get 3 trades (extra trade)

TRADE RULES:
- Standard rounds: 2 trades. Early Byes (R2-R4): 2 trades. Regular Byes (R12-R14): 3 trades.
- Trades start from Round 2. No trades in R0 or R1.
- Advanced Trade-Editing: Coaches can revise previously saved trades before lockout. Rollback available pre-lockout.
- No player can be traded out and back in during the same round.

BREAK-EVEN ANALYSIS:
- Break-even (BE) = the score needed to maintain current price
- Scoring ABOVE BE = price rise (good for trading out later)
- Scoring BELOW BE = price drop (sell before they lose value)
- Low BE + high form = prime trade target (will make lots of money)
- High BE + poor form = sell candidate (about to lose value)
- Price changes begin after Round 1. Opening Round (R0) scores contribute to first price change.

LATE CHANGES / TEAM SELECTION:
- Late changes happen 60 minutes before bounce-down
- Players marked as "late change" or "not named" are HIGH RISK
- If your captain/VC is a late change, you need an emergency plan
- Always have bench cover for late withdrawals

UTILITY (BENCH-ONLY):
- The UTIL position is bench-only. 22 on-field = 6 DEF + 8 MID + 2 RUC + 6 FWD
- UTIL can hold any position player (DEF/MID/RUC/FWD) but NEVER plays on-field
- 8 bench total: 2 DEF + 2 MID + 1 RUC + 2 FWD + 1 UTIL

SCORING: Kick 3, Handball 2, Mark 3, Tackle 4, Hitout 1, Goal 6, Behind 1, Free For 1, Free Against -3.

Be specific with player names from the data provided. Every report should contain actionable advice.
CRITICAL: All player prices MUST come from the provided data. Do NOT use your own training data for player prices — AFL Fantasy Classic 2026 prices differ from SuperCoach and from previous seasons. Only reference prices exactly as shown in the data below.`;

  const isPreseason = settings.currentRound <= 1;
  const preseasonContext = isPreseason ? `
IMPORTANT CONTEXT - PRESEASON / ROUND 0:
We are currently in Round ${settings.currentRound} (${settings.currentRound === 0 ? 'Opening Round / Round 0' : 'Round 1'}). This is VERY EARLY in the season.
- Player averages, L3, L5 are based on 2025 SEASON DATA, NOT 2026 form
- Break-even values are INITIAL break-evens calculated from starting price, not yet meaningful
- Do NOT recommend trades based on "form" this early — use 2025 season averages and preseason performance as a guide
- Prices shown are 2026 STARTING PRICES from AFL Fantasy Classic — DO NOT reference SuperCoach prices
- Focus analysis on: initial squad structure, value picks, cash cow generation potential, avoiding injury-prone players
- Do NOT flag players as "underperforming" based on preseason/R0 scores — data is too limited
- All prices MUST come from the data provided below — never use your own knowledge of player prices as they may differ from AFL Fantasy Classic 2026 pricing
` : '';

  const userPrompt = `Analyze the following AFL Fantasy data and generate strategic intelligence reports.
${preseasonContext}
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
      max_tokens: 8000,
      response_format: { type: "json_object" },
    });

    const finishReason = response.choices[0]?.finish_reason;
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    if (finishReason === "length") {
      console.warn("Intel generation response was truncated due to token limit - attempting to parse partial response");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const fixedContent = content.replace(/,\s*\]/, ']').replace(/,\s*\}/, '}');
      const reportsMatch = fixedContent.match(/"reports"\s*:\s*\[/);
      if (reportsMatch) {
        let depth = 0;
        let lastCompleteReport = -1;
        const startIdx = fixedContent.indexOf('[', reportsMatch.index!);
        for (let i = startIdx; i < fixedContent.length; i++) {
          if (fixedContent[i] === '{') depth++;
          if (fixedContent[i] === '}') {
            depth--;
            if (depth === 0) lastCompleteReport = i;
          }
        }
        if (lastCompleteReport > startIdx) {
          const truncatedJson = `{"reports": [${fixedContent.substring(startIdx + 1, lastCompleteReport + 1)}]}`;
          parsed = JSON.parse(truncatedJson);
        } else {
          throw new Error("Could not recover any complete reports from truncated AI response");
        }
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

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

export async function generateAITradeRecommendations(userId: string): Promise<void> {
  const allPlayers = await storage.getAllPlayers();
  const myTeam = await storage.getMyTeam(userId);
  const settings = await storage.getSettings(userId);

  if (myTeam.length === 0) {
    throw new Error("Add players to your team first");
  }

  const teamPlayerIds = new Set(myTeam.map(p => p.id));
  const availablePlayers = allPlayers.filter(p => !teamPlayerIds.has(p.id));
  const topAvailable = availablePlayers
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
    .slice(0, 100);
  const cashCowTargets = availablePlayers
    .filter(p => p.price <= 300000 && (p.avgScore || 0) > (p.breakEven || 999))
    .slice(0, 30);
  const tradeTargets = [...topAvailable];
  const addedIds = new Set(topAvailable.map(p => p.id));
  for (const p of cashCowTargets) {
    if (!addedIds.has(p.id)) { tradeTargets.push(p); addedIds.add(p.id); }
  }
  const teamData = buildTeamSummary(myTeam);
  const availableData = buildCompactPlayerSummary(tradeTargets);
  const byeBreakdown = getByeRoundBreakdown(myTeam);

  const isPreseason = settings.currentRound <= 1;
  const tradePreseasonCtx = isPreseason ? `
IMPORTANT: We are in Round ${settings.currentRound} — PRESEASON. Player averages are from 2025, not current 2026 form.
Trades do not start until Round 2. Focus recommendations on squad structure assessment, not active trades.
All prices are 2026 AFL Fantasy Classic starting prices — do NOT reference SuperCoach prices or your training data prices.
` : '';

  const tradesByeCtx = isByeRound(settings.currentRound) ? `
BYE ROUND CONTEXT: This is ${isEarlyByeRound(settings.currentRound) ? "an EARLY" : "a REGULAR"} bye round.
- Best-18 scoring applies — only top 18 on-field scores count. Bottom 4 on-field effectively score zero.
- ${getTradesForRound(settings.currentRound)} trades available this round${isRegularByeRound(settings.currentRound) ? " (extra trade for regular bye)" : ""}.
- Prioritise trades that keep 18+ active scorers. Quality > quantity during byes.
` : '';

  const prompt = `You are an expert AFL Fantasy Classic 2026 trade advisor combining statistical optimization with strategic game theory.

2026 RULES:
- Scoring: Kick 3, Handball 2, Mark 3, Tackle 4, Hitout 1, Goal 6, Behind 1, Free For 1, Free Against -3.
- Trades: Standard rounds 2, Early Byes (R2-R4) 2, Regular Byes (R12-R14) 3. Start from R2.
- Best-18 during bye rounds. TOG 50% threshold for emergency substitution. Captain below 50% TOG = higher of C/VC doubled.
- DPP/TPP: Dual/Triple position players have permanent status once granted. TPP is new for 2026.
- UTIL is bench-only. 22 on-field = 6 DEF + 8 MID + 2 RUC + 6 FWD.
- No player traded out and back in the same round. Can revise trades pre-lockout.
${tradePreseasonCtx}${tradesByeCtx}
CURRENT ROUND: ${settings.currentRound}
TRADES AVAILABLE THIS ROUND: ${getTradesForRound(settings.currentRound)}
TRADES REMAINING THIS SEASON: ${settings.tradesRemaining}
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

    await storage.clearTradeRecommendations(userId);

    for (const trade of trades) {
      const playerOut = myTeam.find(p => p.name === trade.playerOutName);
      const playerIn = availablePlayers.find(p => p.name === trade.playerInName);

      if (playerOut && playerIn) {
        await storage.createTradeRecommendation(userId, {
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
  players: { name: string; position: string; score?: number; price?: number; isCaptain?: boolean; isViceCaptain?: boolean; isEmergency?: boolean; isOnField?: boolean }[];
  analysis: string;
  recommendations: { type: string; detail: string; priority: string }[];
  captainTip: string;
  tradeSuggestions: string[];
  captainName: string | null;
  viceCaptainName: string | null;
}> {
  const allPlayers = await storage.getAllPlayers();
  const playersByPos: Record<string, string[]> = { DEF: [], MID: [], RUC: [], FWD: [] };
  for (const p of allPlayers) {
    const entry = `${p.name} [${p.team || "?"}]`;
    const pos = p.position?.toUpperCase() || "MID";
    const positions = pos.split("/");
    for (const pp of positions) {
      if (playersByPos[pp]) playersByPos[pp].push(entry);
    }
    if (!positions.some(pp => playersByPos[pp])) {
      playersByPos["MID"].push(entry);
    }
  }
  const playerLookup = Object.entries(playersByPos)
    .map(([pos, names]) => `${pos}: ${names.join(", ")}`)
    .join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an AFL Fantasy team screenshot reader. Your ONLY job is to read player names from the image and match them to the known player database below.

HOW TO IDENTIFY PLAYERS:
1. Each player card shows a SURNAME in large text and usually a first initial (e.g. "S. Grlj", "J. Lindsay"). Cards also display the player's AFL team logo.
2. Look up the surname in the known player list for that position row. Each entry shows "Full Name [Team]". If only one player has that surname, use their full name.
3. If multiple players share the same surname AND first initial (e.g. two "J. Clark" or two "M. King"), use the team logo on the card to pick the correct one from the database.
4. DNP (Did Not Play) cards still show a player name — read it and match it.
5. Every visible card MUST be matched. A full team = 30 players. Count your output before returning.

KNOWN PLAYER DATABASE (match against these names):
${playerLookup}

LAYOUT RULES:
- On-field players are in the LEFT columns. Interchange (bench) players are in the RIGHT column labelled "INTERCHANGE".
- Per row: DEF 6 on-field + 2 bench, MID 8 on-field + 2 bench, RUC 2 on-field + 1 bench, FWD 6 on-field + 2 bench, UTIL 1 bench = 30 total.
- Set "isOnField": true for left/main players, false for interchange/bench.
- UTILITY row is always bench ("isOnField": false).
- DNP does NOT change on-field/bench status.

BADGES:
- "C" badge = Captain ("isCaptain": true)
- "V" badge = Vice-Captain ("isViceCaptain": true)  
- "E" badge = Emergency ("isEmergency": true)

PRICES: Read exactly as shown. "$517K" = 517000, "$1.047M" = 1047000.

Return ONLY valid JSON.`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Read this AFL Fantasy team screenshot. Match every player card to a name from the known player database.

STEP BY STEP:
1. Go through each position row: DEFENDERS, MIDFIELDERS, RUCKS, FORWARDS, UTILITY.
2. For each card, read the surname and first initial. Look up the matching full name from the known database for that position.
3. DNP cards still show a name — read and match them.
4. Note C/V/E badges and on-field vs interchange placement.
5. Count your output. A complete team = 30 players (8 DEF + 10 MID + 3 RUC + 8 FWD + 1 UTIL). If fewer than 30, go back and find the missing cards.

Use the EXACT full name from the known player database (e.g. if you see "S. Grlj" with a Geelong logo, return "Samuel Grlj"). Include the team name for disambiguation.

Return JSON:
{
  "players": [{"name": "Full Player Name", "team": "Team Name", "position": "DEF/MID/RUC/FWD/UTIL", "score": 0, "price": 0, "isCaptain": false, "isViceCaptain": false, "isEmergency": false, "isOnField": true}],
  "analysis": "Overall team assessment",
  "recommendations": [{"type": "trade|captain|structure|cash_cow|upgrade", "detail": "Specific recommendation", "priority": "high|medium|low"}],
  "captainTip": "Best captain loophole strategy for this team",
  "tradeSuggestions": ["Trade suggestion 1", "Trade suggestion 2"],
  "captainName": "Name of the player with Captain badge or null",
  "viceCaptainName": "Name of the player with Vice-Captain badge or null"
}`
          },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "high" }
          }
        ]
      }
    ],
    temperature: 0.3,
    max_tokens: 5000,
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
      captainName: parsed.captainName || null,
      viceCaptainName: parsed.viceCaptainName || null,
    };
  } catch {
    throw new Error("Failed to parse AI analysis response");
  }
}

export async function analyzeLeagueScreenshot(base64Image: string): Promise<{
  teams: { teamName: string; managerName: string; position: number }[];
}> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert at reading AFL Fantasy league ladder screenshots. You extract team names, manager/coach names, and ladder positions from screenshots of AFL Fantasy league standings.

Look for:
- A numbered list or table showing league standings
- Team names (fantasy team names, not AFL club names)
- Manager/coach names (the person who owns the team)
- Position/rank on the ladder

If you cannot distinguish between team name and manager name, put the most prominent name as teamName and use an empty string for managerName.
Return ONLY valid JSON.`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract all teams from this AFL Fantasy league ladder screenshot. Return every team visible with their ladder position.

Return JSON:
{
  "teams": [
    { "teamName": "Fantasy Team Name", "managerName": "Owner Name", "position": 1 },
    { "teamName": "Another Team", "managerName": "Another Owner", "position": 2 }
  ]
}

Extract ALL teams visible in the image. Position should be their ladder rank (1 = first place).`
          },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "high" }
          }
        ]
      }
    ],
    temperature: 0.3,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI vision analysis");

  try {
    const parsed = JSON.parse(content);
    return {
      teams: Array.isArray(parsed.teams) ? parsed.teams.map((t: any, i: number) => ({
        teamName: t.teamName || `Team ${i + 1}`,
        managerName: t.managerName || "",
        position: t.position || i + 1,
      })) : [],
    };
  } catch {
    throw new Error("Failed to parse AI league analysis response");
  }
}

export async function generateCaptainAdvice(userId: string): Promise<{
  vcPick: { name: string; reason: string; gameTime: string; projectedScore: number };
  captainPick: { name: string; reason: string; gameTime: string; projectedScore: number };
  loopholeThreshold: number;
  decisionTree: string;
}> {
  const myTeam = await storage.getMyTeam(userId);
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

export async function analyzeMyTeam(userId: string): Promise<TeamAnalysisResult> {
  const allPlayers = await storage.getAllPlayers();
  const myTeam = await storage.getMyTeam(userId);
  const settings = await storage.getSettings(userId);

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

  const isByeNow = isByeRound(settings.currentRound);
  const isEarlyBye = isEarlyByeRound(settings.currentRound);
  const isRegBye = isRegularByeRound(settings.currentRound);
  const tradesForRound = getTradesForRound(settings.currentRound);
  const onFieldCount = myTeam.filter(p => p.isOnField).length;
  const emergencyCount = myTeam.filter(p => p.isEmergency).length;

  const prompt = `You are an elite AFL Fantasy Classic 2026 analyst. Analyze my full team and provide a specific verdict on EVERY player.

AFL FANTASY CLASSIC 2026 RULES YOU MUST APPLY:
- Squad: 30 players. 22 on-field (6 DEF, 8 MID, 2 RUC, 6 FWD). 8 bench (2 DEF, 2 MID, 1 RUC, 2 FWD, 1 UTIL). UTIL is bench-only.
- Scoring: Kick 3, Handball 2, Mark 3, Tackle 4, Hitout 1, Goal 6, Behind 1, Free For 1, Free Against -3.
- Trades: Standard rounds 2, Early Byes (R2-R4) 2, Regular Byes (R12-R14) 3. Start from R2.
- Best-18: During ALL bye rounds, only top 18 on-field scores count. Bottom 4 on-field effectively score zero.
- TOG 50%: Players below 50% TOG may be replaced by higher-scoring emergency. Captain below 50% TOG = doubled score is higher of C/VC. Emergencies never get doubled.
- DPP/TPP: Dual and Triple Position Players. Once granted, status is permanent for the season. TPP is new for 2026.
- Rolling lockout: Players lock at match start. Captain loophole works via VC in early game, C in later game.
- Advanced Trade-Editing: Can revise trades before lockout. Rollback available pre-lockout. No player traded out and back in same round.
- Set 4 emergencies to protect against sub-50% TOG and late changes.

CURRENT ROUND: ${settings.currentRound}${isByeNow ? ` (${isEarlyBye ? "EARLY" : "REGULAR"} BYE ROUND — Best-18 scoring applies)` : ""}
TRADES AVAILABLE THIS ROUND: ${tradesForRound}
TRADES REMAINING THIS SEASON: ${settings.tradesRemaining}
SALARY CAP: $${(settings.salaryCap / 1000).toFixed(0)}K
SALARY REMAINING: $${((settings.salaryCap - myTeam.reduce((s, p) => s + p.price, 0)) / 1000).toFixed(0)}K
ON-FIELD: ${onFieldCount}/22 | EMERGENCIES SET: ${emergencyCount}/4

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
      max_tokens: 12000,
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

export async function generatePlayerReport(userId: string, playerId: number): Promise<PlayerReport> {
  const player = await storage.getPlayer(playerId);
  if (!player) throw new Error("Player not found");

  const allPlayers = await storage.getAllPlayers();
  const myTeam = await storage.getMyTeam(userId);
  const settings = await storage.getSettings(userId);

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
- CRITICAL: If GamesPlayed2026 is 0, ALL stats are from 2025 baseline data — you MUST clearly state this in your analysis. Do NOT say "in the last 3 games" or "recent form" — say "based on 2025 season data" instead.
- CRITICAL: If GamesPlayed2026 is 1 or 2, note the very small sample size. Do NOT make confident claims about form trends with only 1-2 games of data.
- NEVER suggest trading IN a player who is listed in MY TEAM above — they are already on the team
- NEVER include Trade Out suggestions for players other than the one being analysed in this report
- Trade targets should be relevant alternatives to THIS player specifically
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

    const teamNames = new Set(myTeam.map(p => p.name.toLowerCase()));
    const rawTradeTargets = Array.isArray(parsed.tradeTargets) ? parsed.tradeTargets : [];
    const filteredTradeTargets = rawTradeTargets.filter((t: any) => {
      if (t.direction === "in" && teamNames.has((t.name || "").toLowerCase())) return false;
      if (t.direction === "out" && (t.name || "").toLowerCase() !== player.name.toLowerCase()) return false;
      return true;
    });

    const rawComparisons = Array.isArray(parsed.comparisonPlayers) ? parsed.comparisonPlayers : [];
    const filteredComparisons = rawComparisons.filter((c: any) =>
      (c.name || "").toLowerCase() !== player.name.toLowerCase()
    );

    return {
      overview: parsed.overview || "",
      verdict: parsed.verdict || "monitor",
      verdictReasoning: parsed.verdictReasoning || "",
      formBreakdown: parsed.formBreakdown || "",
      priceAnalysis: parsed.priceAnalysis || "",
      fixtureOutlook: parsed.fixtureOutlook || "",
      captaincyCase: parsed.captaincyCase || "",
      dppValue: parsed.dppValue || "",
      comparisonPlayers: filteredComparisons,
      tradeTargets: filteredTradeTargets,
      riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
      keyStats: Array.isArray(parsed.keyStats) ? parsed.keyStats : [],
    };
  } catch (error: any) {
    console.error("Player report error:", error.message);
    throw error;
  }
}
