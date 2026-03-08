import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { insertMyTeamPlayerSchema, users, feedback } from "@shared/schema";
import { AFL_FANTASY_CLASSIC_2026, getTradesForRound, getFixtureForTeam } from "@shared/game-rules";
import { z } from "zod";
import multer from "multer";
import { eq, desc } from "drizzle-orm";
import {
  calcTradeEV,
  calcTradeRankingScore,
  calcTradeConfidence,
  getCachedWeights,
  buildWeightConfig,
} from "./services/projection-engine";
import { generateTradeRecommendations } from "./services/trade-engine";
import { evaluateTrade } from "./services/trade-optimizer";
import { buildOptimalTeam, generateSeasonPlan, saveSeasonPlan, getActiveSeasonPlan } from "./services/season-planner";
import { getLiveRoundData, updatePlayerLiveStats, bulkUpdateLiveScores, fetchMatchStatuses, getMatchPlayers, fetchAndStorePlayerScores } from "./services/live-scores";
import { getAllFixtures, getFixturesByRound, fetchAndStoreFixtures, getRoundName } from "./services/fixture-service";
import { isAuthenticated } from "./replit_integrations/auth";

const gameRules = AFL_FANTASY_CLASSIC_2026;

function isAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  if (!user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  db.select().from(users).where(eq(users.id, user.claims.sub)).then(([u]) => {
    if (!u?.isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  }).catch(() => res.status(500).json({ message: "Server error" }));
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use("/api", (req, res, next) => {
    const publicPaths = ["/api/login", "/api/logout", "/api/callback", "/api/auth/user", "/api/auth/dev-login"];
    if (publicPaths.includes(req.path)) return next();
    isAuthenticated(req, res, async () => {
      const userId = (req.user as any)?.claims?.sub;
      if (userId) {
        const [u] = await db.select().from(users).where(eq(users.id, userId));
        if (u?.isBlocked) {
          return res.status(403).json({ message: "Your account has been suspended" });
        }
      }
      next();
    });
  });

  app.get("/api/players", async (_req, res) => {
    try {
      const allPlayers = await storage.getAllPlayers();
      const { calcValueGap } = await import("./services/projection-engine");
      const { AFL_FANTASY_CLASSIC_2026 } = await import("@shared/game-rules");
      const magicNumber = AFL_FANTASY_CLASSIC_2026.magicNumber;
      const enriched = allPlayers.map(p => ({
        ...p,
        valueGap: calcValueGap(p.projectedScore || p.avgScore || 0, p.price, magicNumber),
        priceImpliedAvg: magicNumber > 0 ? Math.round((p.price / magicNumber) * 10) / 10 : 0,
      }));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/players/:id", async (req, res) => {
    try {
      const player = await storage.getPlayer(parseInt(req.params.id));
      if (!player) return res.status(404).json({ message: "Player not found" });
      res.json(player);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/my-team", async (_req, res) => {
    try {
      const team = await storage.getMyTeam();
      res.json(team);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/my-team", async (req, res) => {
    try {
      const data = z
        .object({
          playerId: z.number(),
          fieldPosition: z.string(),
        })
        .parse(req.body);

      const existing = await storage.getMyTeam();
      const alreadyOnTeam = existing.find((p) => p.id === data.playerId);
      if (alreadyOnTeam) {
        return res.status(400).json({ message: "Player already on team" });
      }

      const entry = await storage.addToMyTeam({
        playerId: data.playerId,
        isOnField: true,
        isCaptain: false,
        isViceCaptain: false,
        fieldPosition: data.fieldPosition,
      });
      res.json(entry);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/my-team/:id", async (req, res) => {
    try {
      await storage.removeFromMyTeam(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/my-team/:id/captain", async (req, res) => {
    try {
      await storage.setCaptain(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/my-team/:id/vice-captain", async (req, res) => {
    try {
      await storage.setViceCaptain(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/my-team/setup-glens-team", async (_req, res) => {
    try {
      const allPlayers = await storage.getAllPlayers();
      const findPlayer = (name: string) => allPlayers.find(p => p.name === name);

      const BYE_ROUNDS: Record<string, number> = {
        "Adelaide": 12, "Brisbane Lions": 15, "Carlton": 13, "Collingwood": 13,
        "Essendon": 13, "Fremantle": 15, "Geelong": 14, "Gold Coast": 12,
        "GWS Giants": 13, "Hawthorn": 14, "Melbourne": 13, "North Melbourne": 12,
        "Port Adelaide": 12, "Richmond": 13, "St Kilda": 12, "Sydney": 15,
        "West Coast": 15, "Western Bulldogs": 14,
      };
      const TEAM_VENUES: Record<string, string> = {
        "Adelaide": "Adelaide Oval", "Brisbane Lions": "The Gabba", "Carlton": "MCG",
        "Collingwood": "MCG", "Essendon": "Marvel Stadium", "Fremantle": "Optus Stadium",
        "Geelong": "GMHBA Stadium", "Gold Coast": "People First Stadium",
        "GWS Giants": "GIANTS Stadium", "Hawthorn": "MCG", "Melbourne": "MCG",
        "North Melbourne": "Marvel Stadium", "Port Adelaide": "Adelaide Oval",
        "Richmond": "MCG", "St Kilda": "Marvel Stadium", "Sydney": "SCG",
        "West Coast": "Optus Stadium", "Western Bulldogs": "Marvel Stadium",
      };

      const missingPlayers = [
        { name: "Will Derksen", team: "Essendon", position: "DEF", price: 230000 },
        { name: "Tom Blamires", team: "North Melbourne", position: "MID", price: 230000 },
      ];
      for (const mp of missingPlayers) {
        if (!findPlayer(mp.name)) {
          const byeRound = BYE_ROUNDS[mp.team] || 12;
          const venue = TEAM_VENUES[mp.team] || "TBC";
          await storage.createPlayer({
            name: mp.name,
            team: mp.team,
            position: mp.position,
            price: mp.price,
            avgScore: 0,
            last3Avg: 0,
            last5Avg: 0,
            seasonTotal: 0,
            gamesPlayed: 0,
            ownedByPercent: 0,
            formTrend: "stable",
            isNamedTeam: true,
            isDebutant: true,
            byeRound,
            venue,
            breakEven: 0,
            startingPrice: mp.price,
          });
        }
      }

      const refreshed = await storage.getAllPlayers();
      const fp = (name: string) => {
        const p = refreshed.find(pl => pl.name === name);
        if (!p) throw new Error(`Player not found: ${name}`);
        return p.id;
      };

      const priceUpdates: Array<{ name: string; price: number }> = [
        { name: "Connor Rozee", price: 1092000 },
        { name: "Jack Sinclair", price: 1057000 },
        { name: "Josh Gibcus", price: 230000 },
        { name: "Samuel Grlj", price: 322000 },
        { name: "Lachlan Blakiston", price: 399000 },
        { name: "Jai Serong", price: 274000 },
        { name: "Xavier Taylor", price: 310000 },
        { name: "Lachie Jaques", price: 230000 },
        { name: "Jack Steele", price: 1006000 },
        { name: "Zak Butters", price: 1047000 },
        { name: "Harry Sheezel", price: 1145000 },
        { name: "Darcy Parish", price: 759000 },
        { name: "Cooper Lord", price: 630000 },
        { name: "Willem Duursma", price: 350000 },
        { name: "Tanner Bruhn", price: 517000 },
        { name: "Jagga Smith", price: 230000 },
        { name: "Tom Blamires", price: 230000 },
        { name: "Roan Steele", price: 381000 },
        { name: "Brodie Grundy", price: 1122000 },
        { name: "Lachlan McAndrew", price: 286000 },
        { name: "Liam Reidy", price: 394000 },
        { name: "Sam Lalor", price: 567000 },
        { name: "Christian Petracca", price: 948000 },
        { name: "Sam Flanders", price: 716000 },
        { name: "Mattaes Phillipou", price: 610000 },
        { name: "Billy Dowling", price: 522000 },
        { name: "Deven Robertson", price: 232000 },
        { name: "Sullivan Robey", price: 318000 },
        { name: "Leonardo Lombard", price: 230000 },
        { name: "Charlie Ballard", price: 384000 },
      ];

      for (const update of priceUpdates) {
        const player = refreshed.find(pl => pl.name === update.name);
        if (player) {
          await storage.updatePlayer(player.id, { price: update.price });
        }
      }

      await storage.clearMyTeam();

      const teamEntries: Array<{
        playerId: number;
        isOnField: boolean;
        isCaptain: boolean;
        isViceCaptain: boolean;
        fieldPosition: string;
      }> = [
        { playerId: fp("Connor Rozee"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Jack Sinclair"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Josh Gibcus"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Samuel Grlj"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Lachlan Blakiston"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Jai Serong"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Xavier Taylor"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Lachie Jaques"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Jack Steele"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Zak Butters"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Harry Sheezel"), isOnField: true, isCaptain: false, isViceCaptain: true, fieldPosition: "MID" },
        { playerId: fp("Darcy Parish"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Cooper Lord"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Willem Duursma"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Tanner Bruhn"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Jagga Smith"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Tom Blamires"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Roan Steele"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Brodie Grundy"), isOnField: true, isCaptain: true, isViceCaptain: false, fieldPosition: "RUC" },
        { playerId: fp("Lachlan McAndrew"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "RUC" },
        { playerId: fp("Liam Reidy"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "RUC" },
        { playerId: fp("Sam Lalor"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Christian Petracca"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Sam Flanders"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Mattaes Phillipou"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Billy Dowling"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Deven Robertson"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Sullivan Robey"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Leonardo Lombard"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Charlie Ballard"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "UTIL" },
      ];

      for (const entry of teamEntries) {
        await storage.addToMyTeam(entry);
      }

      const team = await storage.getMyTeam();
      res.json({ success: true, playerCount: team.length, team });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trade-recommendations", async (_req, res) => {
    try {
      const recs = await storage.getTradeRecommendations();
      res.json(recs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-recommendations/generate", async (_req, res) => {
    try {
      await storage.clearTradeRecommendations();

      const myTeam = await storage.getMyTeam();
      if (myTeam.length === 0) {
        return res.status(400).json({ message: "Add players to your team first to generate recommendations" });
      }

      const allPlayers = await storage.getAllPlayers();
      const settings = await storage.getSettings();
      const currentRound = settings?.currentRound ?? 0;
      const salaryCap = settings?.salaryCap || 18300000;

      const finalTrades = generateTradeRecommendations(myTeam, allPlayers, currentRound, salaryCap);

      for (const trade of finalTrades) {
        await storage.createTradeRecommendation({
          playerOutId: trade.playerOut.id,
          playerInId: trade.playerIn.id,
          reason: trade.reasons.join(". ") + ".",
          confidence: trade.confidence,
          priceChange: trade.priceDiff,
          scoreDifference: trade.scoreDiff,
          tradeEv: trade.tradeEv,
          category: trade.category,
          urgency: trade.urgency,
          projectedImpact: trade.projectedImpact,
          cashImpact: trade.cashImpact,
          seasonTradeGain: trade.seasonTradeGain,
          status: "pending",
        });
      }

      const recs = await storage.getTradeRecommendations();
      res.json(recs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-recommendations/:id/execute", async (req, res) => {
    try {
      const tradeId = parseInt(req.params.id);
      const trade = await storage.getTradeRecommendation(tradeId);
      if (!trade) return res.status(404).json({ message: "Trade not found" });

      const settings = await storage.getSettings();
      const maxTradesThisRound = getTradesForRound(settings.currentRound);
      if (settings.tradesRemaining <= 0) {
        return res.status(400).json({ message: `No trades remaining this round (${maxTradesThisRound} per round${gameRules.byeRounds.includes(settings.currentRound) ? ' - bye round' : ''})` });
      }

      const myTeam = await storage.getMyTeam();
      const teamEntry = myTeam.find((p) => p.id === trade.playerOutId);
      if (!teamEntry) {
        return res.status(400).json({ message: "Player not on team" });
      }

      const inheritedOnField = teamEntry.isOnField;
      const inheritedFieldPosition = teamEntry.fieldPosition;

      await storage.removeFromMyTeam(teamEntry.myTeamPlayerId!);

      const playerIn = await storage.getPlayer(trade.playerInId);
      if (!playerIn) return res.status(404).json({ message: "Player not found" });

      await storage.addToMyTeam({
        playerId: trade.playerInId,
        isOnField: inheritedOnField,
        isCaptain: false,
        isViceCaptain: false,
        fieldPosition: inheritedFieldPosition || playerIn.position,
      });

      await storage.updateSettings({
        tradesRemaining: settings.tradesRemaining - 1,
        totalTradesUsed: settings.totalTradesUsed + 1,
      });

      await storage.deleteTradeRecommendation(tradeId);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-evaluate", async (req, res) => {
    try {
      const { candidateId } = req.body as { candidateId: number };
      if (!candidateId) return res.status(400).json({ message: "candidateId required" });
      const settings = await storage.getSettings();
      const myTeam = await storage.getMyTeam();
      const teamPlayerIds = myTeam.map(p => p.id);
      const evaluation = await evaluateTrade(candidateId, teamPlayerIds, settings.currentRound);
      res.json(evaluation);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/season-plan", async (_req, res) => {
    try {
      const plan = await getActiveSeasonPlan();
      if (!plan) return res.json(null);
      res.json({
        ...plan,
        weeklyPlans: JSON.parse(plan.weeklyPlans),
        teamSnapshot: JSON.parse(plan.teamSnapshot),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/season-plan/generate", async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      const myTeam = await storage.getMyTeam();
      const teamPlayerIds = myTeam.map(p => p.id);
      if (teamPlayerIds.length === 0) {
        return res.status(400).json({ message: "No team found. Import or build a team first." });
      }
      const plan = await generateSeasonPlan(teamPlayerIds, settings.currentRound);
      const saved = await saveSeasonPlan(plan, settings.currentRound);
      res.json({
        ...saved,
        weeklyPlans: JSON.parse(saved.weeklyPlans),
        teamSnapshot: JSON.parse(saved.teamSnapshot),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/season-plan/build-team", async (_req, res) => {
    try {
      const result = await buildOptimalTeam();
      await storage.clearMyTeam();
      for (const p of result.teamPlayers) {
        await storage.addToMyTeam({
          playerId: p.id,
          isOnField: p.isOnField,
          isCaptain: false,
          isViceCaptain: false,
          fieldPosition: p.fieldPosition,
        });
      }
      const settings = await storage.getSettings();
      const teamPlayerIds = result.teamPlayers.map(p => p.id);
      const plan = await generateSeasonPlan(teamPlayerIds, settings.currentRound);
      const saved = await saveSeasonPlan(plan, settings.currentRound);

      const bestScorer = result.teamPlayers
        .filter(p => p.isOnField)
        .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))[0];
      const secondBest = result.teamPlayers
        .filter(p => p.isOnField && p.id !== bestScorer?.id)
        .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))[0];

      if (bestScorer) {
        const myTeam = await storage.getMyTeam();
        const captainEntry = myTeam.find(p => p.id === bestScorer.id);
        if (captainEntry?.myTeamPlayerId) {
          await storage.setCaptain(captainEntry.myTeamPlayerId);
        }
        if (secondBest) {
          const vcEntry = myTeam.find(p => p.id === secondBest.id);
          if (vcEntry?.myTeamPlayerId) {
            await storage.setViceCaptain(vcEntry.myTeamPlayerId);
          }
        }
      }

      res.json({
        team: result,
        seasonPlan: {
          ...saved,
          weeklyPlans: JSON.parse(saved.weeklyPlans),
          teamSnapshot: JSON.parse(saved.teamSnapshot),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/settings", async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/game-rules", (_req, res) => {
    res.json(gameRules);
  });

  app.patch("/api/settings", async (req, res) => {
    try {
      const schema = z.object({
        teamName: z.string().min(1).max(50).optional(),
        salaryCap: z.number().min(1000000).max(20000000).optional(),
        currentRound: z.number().min(0).max(24).optional(),
        tradesRemaining: z.number().min(0).max(100).optional(),
        totalTradesUsed: z.number().min(0).optional(),
      });
      const data = schema.parse(req.body);
      if (data.currentRound !== undefined) {
        const tradesForRound = getTradesForRound(data.currentRound);
        if (data.tradesRemaining === undefined) {
          data.tradesRemaining = tradesForRound;
        }
      }
      const updated = await storage.updateSettings(data);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/intel", async (req, res) => {
    try {
      const sinceParam = req.query.since as string | undefined;
      let reports;
      if (sinceParam) {
        const sinceDate = new Date(sinceParam);
        if (isNaN(sinceDate.getTime())) {
          return res.status(400).json({ message: "Invalid 'since' date parameter" });
        }
        reports = await storage.getIntelReportsSince(sinceDate);
      } else {
        reports = await storage.getIntelReports();
      }
      res.json(reports);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/intel/:category", async (req, res) => {
    try {
      const validCategories = ["injuries", "cash_cows", "captain_picks", "bye_strategy", "pod_players", "breakout", "premium_trades", "ground_conditions", "tactical", "historical"];
      if (!validCategories.includes(req.params.category)) {
        return res.status(400).json({ message: "Invalid intel category" });
      }
      const reports = await storage.getIntelReportsByCategory(req.params.category);
      res.json(reports);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/intel/generate", async (_req, res) => {
    try {
      const { generateIntelReports } = await import("./intel-engine");
      await generateIntelReports();
      const reports = await storage.getIntelReports();
      res.json(reports);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/players/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid player ID" });
      const updated = await storage.updatePlayer(id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/late-changes", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      const changes = await storage.getLateChanges(settings.currentRound);
      res.json(changes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/late-changes", async (req, res) => {
    try {
      const schema = z.object({
        playerId: z.number(),
        changeType: z.string().min(1),
        details: z.string().min(1),
        round: z.number(),
      });
      const data = schema.parse(req.body);
      const change = await storage.createLateChange(data);

      await storage.updatePlayer(data.playerId, { lateChange: true });

      res.json(change);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/players/refresh-data", async (req, res) => {
    try {
      const { eq } = await import("drizzle-orm");
      const { db } = await import("./db");
      const { players } = await import("@shared/schema");

      const dppMap: Record<string, { dualPosition?: string; venue?: string; gameTime?: string; projectedScore?: number; breakEven?: number; ceilingScore?: number; priceChange?: number }> = {
        "Nick Daicos": { dualPosition: "MID", venue: "SCG", gameTime: "Saturday 1:45pm", projectedScore: 118, breakEven: 108, ceilingScore: 168, priceChange: 10000 },
        "Marcus Bontempelli": { dualPosition: "FWD", venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 108, breakEven: 110, ceilingScore: 155, priceChange: -3000 },
        "Zak Butters": { dualPosition: "FWD", venue: "Adelaide Oval", gameTime: "Saturday 7:25pm", projectedScore: 115, breakEven: 90, ceilingScore: 152, priceChange: 18000 },
        "Isaac Heeney": { dualPosition: "MID", venue: "SCG", gameTime: "Saturday 1:45pm", projectedScore: 112, breakEven: 92, ceilingScore: 155, priceChange: 12000 },
        "Jordan Dawson": { dualPosition: "MID", venue: "Adelaide Oval", gameTime: "Saturday 1:45pm", projectedScore: 104, breakEven: 90, ceilingScore: 138, priceChange: 7000 },
        "Dayne Zorko": { dualPosition: "FWD", venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 88, breakEven: 100, ceilingScore: 125, priceChange: -5000 },
        "Tim English": { dualPosition: "FWD", venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 106, breakEven: 92, ceilingScore: 140, priceChange: 8000 },
        "Touk Miller": { dualPosition: "DEF", venue: "People First Stadium", gameTime: "Saturday 4:35pm", projectedScore: 98, breakEven: 108, ceilingScore: 138, priceChange: -5000 },
        "Rory Laird": { dualPosition: "MID", venue: "Adelaide Oval", gameTime: "Saturday 1:45pm", projectedScore: 95, breakEven: 98, ceilingScore: 132, priceChange: -1000 },
        "Jack Steele": { dualPosition: "FWD", venue: "Marvel Stadium", gameTime: "Saturday 7:25pm", projectedScore: 99, breakEven: 85, ceilingScore: 135, priceChange: 6000 },
        "Connor Rozee": { dualPosition: "FWD", venue: "Adelaide Oval", gameTime: "Saturday 7:25pm", projectedScore: 101, breakEven: 88, ceilingScore: 140, priceChange: 6000 },
        "Liam Baker": { dualPosition: "FWD", venue: "Adelaide Oval", gameTime: "Saturday 1:45pm", projectedScore: 89, breakEven: 76, ceilingScore: 120, priceChange: 5000 },
        "Jack Sinclair": { dualPosition: "MID", venue: "Marvel Stadium", gameTime: "Saturday 7:25pm", projectedScore: 94, breakEven: 85, ceilingScore: 128, priceChange: 5000 },
      };

      const venueMap: Record<string, { venue: string; gameTime: string; projectedScore: number; breakEven: number; ceilingScore: number; priceChange: number }> = {
        "Lachie Neale": { venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 118, breakEven: 105, ceilingScore: 162, priceChange: 12000 },
        "Clayton Oliver": { venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 100, breakEven: 118, ceilingScore: 148, priceChange: -15000 },
        "Christian Petracca": { venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 112, breakEven: 100, ceilingScore: 158, priceChange: 8000 },
        "Tom Green": { venue: "GIANTS Stadium", gameTime: "Sunday 1:10pm", projectedScore: 108, breakEven: 95, ceilingScore: 145, priceChange: 10000 },
        "Andrew Brayshaw": { venue: "Optus Stadium", gameTime: "Sunday 3:20pm", projectedScore: 100, breakEven: 115, ceilingScore: 140, priceChange: -8000 },
        "Errol Gulden": { venue: "SCG", gameTime: "Saturday 1:45pm", projectedScore: 110, breakEven: 88, ceilingScore: 148, priceChange: 14000 },
        "Sam Docherty": { venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 90, breakEven: 108, ceilingScore: 130, priceChange: -6000 },
        "James Sicily": { venue: "GIANTS Stadium", gameTime: "Sunday 1:10pm", projectedScore: 100, breakEven: 92, ceilingScore: 135, priceChange: 5000 },
        "Max Gawn": { venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 94, breakEven: 108, ceilingScore: 135, priceChange: -6000 },
        "Brodie Grundy": { venue: "SCG", gameTime: "Saturday 1:45pm", projectedScore: 97, breakEven: 95, ceilingScore: 130, priceChange: 2000 },
        "Sean Darcy": { venue: "Optus Stadium", gameTime: "Sunday 3:20pm", projectedScore: 94, breakEven: 85, ceilingScore: 128, priceChange: 6000 },
        "Jeremy Cameron": { venue: "Adelaide Oval", gameTime: "Saturday 7:25pm", projectedScore: 103, breakEven: 90, ceilingScore: 142, priceChange: 7000 },
        "Charlie Curnow": { venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 90, breakEven: 102, ceilingScore: 135, priceChange: -4000 },
        "Tom Lynch": { venue: "Adelaide Oval", gameTime: "Saturday 1:45pm", projectedScore: 84, breakEven: 95, ceilingScore: 120, priceChange: -5000 },
        "Harry McKay": { venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 91, breakEven: 78, ceilingScore: 125, priceChange: 5000 },
        "Aaron Naughton": { venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 80, breakEven: 85, ceilingScore: 118, priceChange: -2000 },
        "Jesse Hogan": { venue: "GIANTS Stadium", gameTime: "Sunday 1:10pm", projectedScore: 93, breakEven: 72, ceilingScore: 130, priceChange: 8000 },
        "Patrick Cripps": { venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 110, breakEven: 100, ceilingScore: 152, priceChange: 7000 },
        "Josh Dunkley": { venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 106, breakEven: 88, ceilingScore: 140, priceChange: 9000 },
        "Caleb Serong": { venue: "Optus Stadium", gameTime: "Sunday 3:20pm", projectedScore: 104, breakEven: 88, ceilingScore: 138, priceChange: 8000 },
        "Sam Walsh": { venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 92, breakEven: 105, ceilingScore: 132, priceChange: -4000 },
        "Jake Lloyd": { venue: "SCG", gameTime: "Saturday 1:45pm", projectedScore: 88, breakEven: 98, ceilingScore: 125, priceChange: -3000 },
        "Adam Treloar": { venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 88, breakEven: 102, ceilingScore: 128, priceChange: -5000 },
        "Jai Newcombe": { venue: "GIANTS Stadium", gameTime: "Sunday 1:10pm", projectedScore: 99, breakEven: 86, ceilingScore: 132, priceChange: 6000 },
        "Dyson Heppell": { venue: "People First Stadium", gameTime: "Saturday 4:35pm", projectedScore: 77, breakEven: 88, ceilingScore: 112, priceChange: -4000 },
        "Darcy Parish": { venue: "People First Stadium", gameTime: "Saturday 4:35pm", projectedScore: 95, breakEven: 80, ceilingScore: 128, priceChange: 6000 },
        "Jack Viney": { venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 82, breakEven: 95, ceilingScore: 118, priceChange: -4000 },
        "Tom Stewart": { venue: "Adelaide Oval", gameTime: "Saturday 7:25pm", projectedScore: 96, breakEven: 93, ceilingScore: 130, priceChange: 2000 },
        "Hayden Young": { venue: "Optus Stadium", gameTime: "Sunday 3:20pm", projectedScore: 93, breakEven: 78, ceilingScore: 125, priceChange: 6000 },
        "Mitch Duncan": { venue: "Adelaide Oval", gameTime: "Saturday 7:25pm", projectedScore: 80, breakEven: 92, ceilingScore: 118, priceChange: -3000 },
      };

      const allPlayers = await storage.getAllPlayers();
      for (const player of allPlayers) {
        const dpp = dppMap[player.name];
        const venue = venueMap[player.name];
        const updates: any = {};

        if (dpp) {
          if (dpp.dualPosition) updates.dualPosition = dpp.dualPosition;
          if (dpp.venue) updates.venue = dpp.venue;
          if (dpp.gameTime) updates.gameTime = dpp.gameTime;
          if (dpp.projectedScore) updates.projectedScore = dpp.projectedScore;
          if (dpp.breakEven) updates.breakEven = dpp.breakEven;
          if (dpp.ceilingScore) updates.ceilingScore = dpp.ceilingScore;
          if (dpp.priceChange !== undefined) updates.priceChange = dpp.priceChange;
        }

        if (venue) {
          updates.venue = venue.venue;
          updates.gameTime = venue.gameTime;
          updates.projectedScore = venue.projectedScore;
          updates.breakEven = venue.breakEven;
          updates.ceilingScore = venue.ceilingScore;
          updates.priceChange = venue.priceChange;
        }

        if (Object.keys(updates).length > 0) {
          await db.update(players).set(updates).where(eq(players.id, player.id));
        }
      }

      const updatedPlayers = await storage.getAllPlayers();
      res.json({ message: "Player data refreshed", count: updatedPlayers.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/players/expand", async (_req, res) => {
    try {
      const { expandPlayerDatabase } = await import("./expand-players");
      const added = await expandPlayerDatabase();
      const allPlayers = await storage.getAllPlayers();
      res.json({ message: `Added ${added} new players. Total: ${allPlayers.length}`, count: allPlayers.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/data-check", async (_req, res) => {
    try {
      const allPlayers = await storage.getAllPlayers();
      const { loadRealPlayers } = await import("./expand-players");
      const realPlayers = loadRealPlayers();
      const realMap = new Map(realPlayers.map((rp: any) => [rp.name, rp]));

      const mismatches: { name: string; field: string; dbValue: any; realValue: any }[] = [];
      for (const p of allPlayers) {
        const real = realMap.get(p.name);
        if (!real) continue;
        if (p.price !== real.salary) {
          mismatches.push({ name: p.name, field: "price", dbValue: p.price, realValue: real.salary });
        }
        if (Math.abs((p.avgScore || 0) - real.avgPoints) > 0.1) {
          mismatches.push({ name: p.name, field: "avgScore", dbValue: p.avgScore, realValue: real.avgPoints });
        }
      }

      res.json({
        totalPlayers: allPlayers.length,
        realPlayersCount: realPlayers.length,
        mismatches,
        isClean: mismatches.length === 0,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/captain-advice", async (_req, res) => {
    try {
      const { generateCaptainAdvice } = await import("./intel-engine");
      const advice = await generateCaptainAdvice();
      res.json(advice);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  app.post("/api/analyze-screenshot", upload.single("screenshot"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No screenshot uploaded" });
      }

      const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
      if (!allowedMimes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Unsupported file type. Please upload a PNG, JPG, or WebP image." });
      }

      const base64Image = req.file.buffer.toString("base64");
      const { analyzeTeamScreenshot } = await import("./intel-engine");
      const analysis = await analyzeTeamScreenshot(base64Image);
      res.json(analysis);
    } catch (error: any) {
      console.error("Screenshot analysis error:", error.message);
      res.status(500).json({ message: "Failed to analyse screenshot. Please try again with a clearer image." });
    }
  });

  app.post("/api/my-team/save-from-analyzer", async (req, res) => {
    try {
      const { players: identifiedPlayers, captainName, viceCaptainName } = req.body as {
        players: { name: string; position: string; isCaptain?: boolean; isViceCaptain?: boolean; isEmergency?: boolean }[];
        captainName?: string | null;
        viceCaptainName?: string | null;
      };
      if (!identifiedPlayers || identifiedPlayers.length === 0) {
        return res.status(400).json({ message: "No players identified to save" });
      }

      const allPlayers = await storage.getAllPlayers();
      await storage.clearMyTeam();

      const posMap: Record<string, string> = {
        DEF: "DEF", DEFENDER: "DEF", BACK: "DEF",
        MID: "MID", MIDFIELDER: "MID",
        RUC: "RUC", RUCK: "RUC",
        FWD: "FWD", FORWARD: "FWD",
      };

      const notFound: string[] = [];

      const posQuotas: Record<string, { onField: number; bench: number }> = {
        DEF: { onField: 6, bench: 2 },
        MID: { onField: 8, bench: 2 },
        RUC: { onField: 2, bench: 1 },
        FWD: { onField: 6, bench: 2 },
      };
      const posFieldCount: Record<string, number> = { DEF: 0, MID: 0, RUC: 0, FWD: 0 };
      let totalOnField = 0;
      const maxOnField = 22;

      const resolvedPlayers: { match: typeof allPlayers[0]; fieldPos: string; ip: typeof identifiedPlayers[0] }[] = [];

      const levenshtein = (a: string, b: string): number => {
        const m = a.length, n = b.length;
        const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
          for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
              ? dp[i - 1][j - 1]
              : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
          }
        }
        return dp[m][n];
      };

      const fuzzyMatchPlayer = (inputName: string, players: typeof allPlayers) => {
        const normalName = inputName.trim().toLowerCase();
        const exact = players.find(p => p.name.toLowerCase() === normalName);
        if (exact) return exact;

        const inputParts = normalName.split(/\s+/);
        const inputSurname = inputParts[inputParts.length - 1];

        const surnameMatch = players.find(p => {
          const parts = p.name.toLowerCase().split(" ");
          return parts[parts.length - 1] === inputSurname;
        });
        if (surnameMatch) return surnameMatch;

        const containsMatch = players.find(p => {
          const pLower = p.name.toLowerCase();
          return pLower.includes(normalName) || normalName.includes(pLower);
        });
        if (containsMatch) return containsMatch;

        if (inputParts.length >= 2) {
          const partialMatch = players.find(p => {
            const pLower = p.name.toLowerCase();
            const pParts = pLower.split(/\s+/);
            const pSurname = pParts[pParts.length - 1];
            const pFirst = pParts[0];
            return (pSurname === inputSurname && pFirst.startsWith(inputParts[0].substring(0, 3))) ||
              (inputParts[0].length >= 3 && pFirst === inputParts[0] && levenshtein(pSurname, inputSurname) <= 2);
          });
          if (partialMatch) return partialMatch;
        }

        const surnameMatches = players.filter(p => {
          const pSurname = p.name.toLowerCase().split(/\s+/).pop() || "";
          return levenshtein(pSurname, inputSurname) <= 2;
        });
        if (surnameMatches.length === 1) return surnameMatches[0];
        if (surnameMatches.length > 1) {
          const bestFullMatch = surnameMatches.reduce((best, p) => {
            const dist = levenshtein(p.name.toLowerCase(), normalName);
            return dist < best.dist ? { player: p, dist } : best;
          }, { player: surnameMatches[0], dist: levenshtein(surnameMatches[0].name.toLowerCase(), normalName) });
          if (bestFullMatch.dist <= 4) return bestFullMatch.player;
        }

        let bestMatch: typeof allPlayers[0] | null = null;
        let bestDist = Infinity;
        for (const p of players) {
          const dist = levenshtein(p.name.toLowerCase(), normalName);
          if (dist < bestDist) {
            bestDist = dist;
            bestMatch = p;
          }
        }
        const maxAllowedDist = Math.max(3, Math.floor(normalName.length * 0.35));
        if (bestMatch && bestDist <= maxAllowedDist) return bestMatch;

        return null;
      };

      for (const ip of identifiedPlayers) {
        const match = fuzzyMatchPlayer(ip.name, allPlayers);

        if (!match) {
          notFound.push(ip.name);
          continue;
        }

        const posRaw = (ip.position || match.position || "MID").toUpperCase();
        const fieldPos = posMap[posRaw] || "MID";
        resolvedPlayers.push({ match, fieldPos, ip });
      }

      resolvedPlayers.sort((a, b) => (b.match.avgScore || 0) - (a.match.avgScore || 0));

      for (const { match, fieldPos, ip } of resolvedPlayers) {
        let isOnField = false;
        let assignedFieldPos = fieldPos;
        if (ip.isEmergency) {
          isOnField = false;
        } else if (totalOnField >= maxOnField) {
          isOnField = false;
        } else {
          const quota = posQuotas[fieldPos];
          if (quota && posFieldCount[fieldPos] < quota.onField) {
            isOnField = true;
            posFieldCount[fieldPos]++;
            totalOnField++;
          } else if (totalOnField < maxOnField) {
            isOnField = true;
            assignedFieldPos = "UTIL";
            totalOnField++;
          }
        }

        const playerIsCaptain = ip.isCaptain ||
          (captainName && match.name.toLowerCase() === captainName.toLowerCase()) ||
          (captainName && match.name.toLowerCase().split(" ").pop() === captainName.toLowerCase().split(" ").pop());

        const playerIsVC = ip.isViceCaptain ||
          (viceCaptainName && match.name.toLowerCase() === viceCaptainName.toLowerCase()) ||
          (viceCaptainName && match.name.toLowerCase().split(" ").pop() === viceCaptainName.toLowerCase().split(" ").pop());

        await storage.addToMyTeam({
          playerId: match.id,
          isOnField,
          isCaptain: !!playerIsCaptain,
          isViceCaptain: !!playerIsVC,
          fieldPosition: assignedFieldPos,
        });
      }

      const team = await storage.getMyTeam();
      res.json({
        success: true,
        savedCount: resolvedPlayers.length,
        notFound,
        totalOnTeam: team.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/my-team/analyze", async (_req, res) => {
    try {
      const myTeam = await storage.getMyTeam();
      if (myTeam.length === 0) {
        return res.status(400).json({ message: "Add players to your team first" });
      }
      const { analyzeMyTeam } = await import("./intel-engine");
      const analysis = await analyzeMyTeam();
      res.json(analysis);
    } catch (error: any) {
      console.error("Team analysis error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/players/:id/report", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid player ID" });
      const player = await storage.getPlayer(id);
      if (!player) return res.status(404).json({ message: "Player not found" });
      const { generatePlayerReport } = await import("./intel-engine");
      const report = await generatePlayerReport(id);
      res.json({ player, report });
    } catch (error: any) {
      console.error("Player report error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/intel/gather", async (_req, res) => {
    try {
      const { gatherIntelligence } = await import("./data-gatherer");
      const result = await gatherIntelligence();
      res.json(result);
    } catch (error: any) {
      console.error("Intel gathering error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/intel/sources", async (_req, res) => {
    try {
      const { getRecentIntelSources } = await import("./data-gatherer");
      const sources = await getRecentIntelSources(30);
      res.json(sources);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/intel/sources/stats", async (_req, res) => {
    try {
      const { getIntelSourceStats } = await import("./data-gatherer");
      const stats = await getIntelSourceStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/intel/pre-game", async (_req, res) => {
    try {
      const { generatePreGameAdvice } = await import("./data-gatherer");
      const advice = await generatePreGameAdvice();
      res.json(advice);
    } catch (error: any) {
      console.error("Pre-game advice error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/scheduler/status", async (_req, res) => {
    try {
      const { getSchedulerStatus } = await import("./scheduler");
      res.json(getSchedulerStatus());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-recommendations/generate-ai", async (_req, res) => {
    try {
      const { generateAITradeRecommendations } = await import("./intel-engine");
      await generateAITradeRecommendations();
      const recs = await storage.getTradeRecommendations();
      res.json(recs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/weekly-stats/:playerId", async (req, res) => {
    try {
      const playerId = parseInt(req.params.playerId);
      const stats = await storage.getWeeklyStats(playerId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/team-context", async (_req, res) => {
    try {
      const contexts = await storage.getAllTeamContexts();
      res.json(contexts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/position-concessions", async (_req, res) => {
    try {
      const concessions = await storage.getAllPositionConcessions();
      res.json(concessions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/position-concessions/:team", async (req, res) => {
    try {
      const concessions = await storage.getPositionConcessions(req.params.team);
      res.json(concessions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/projections/:playerId", async (req, res) => {
    try {
      const playerId = parseInt(req.params.playerId);
      const projs = await storage.getProjections(playerId);
      res.json(projs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/model-weights", async (_req, res) => {
    try {
      const weights = await storage.getAllModelWeights();
      res.json(weights);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/model-weights/:key", async (req, res) => {
    try {
      const weight = await storage.getModelWeight(req.params.key);
      if (!weight) return res.status(404).json({ message: "Weight not found" });
      res.json(weight);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const updateWeightSchema = z.object({
    value: z.number(),
    description: z.string().nullable().optional(),
    category: z.string().optional(),
  });

  const batchUpdateWeightSchema = z.array(z.object({
    key: z.string(),
    value: z.number(),
  }));

  app.put("/api/model-weights/:key", async (req, res) => {
    try {
      const parsed = updateWeightSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      const { value, description, category } = parsed.data;
      const weight = await storage.upsertModelWeight({
        key: req.params.key,
        value,
        description: description ?? null,
        category: category || "general",
      });
      const allWeights = await storage.getAllModelWeights();
      buildWeightConfig(allWeights);
      res.json(weight);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/model-weights", async (req, res) => {
    try {
      const parsed = batchUpdateWeightSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
      }
      const results = [];
      for (const { key, value } of parsed.data) {
        const existing = await storage.getModelWeight(key);
        if (existing) {
          results.push(await storage.upsertModelWeight({
            key,
            value,
            description: existing.description,
            category: existing.category,
          }));
        }
      }
      const allWeights = await storage.getAllModelWeights();
      buildWeightConfig(allWeights);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/fixtures", async (req, res) => {
    try {
      const year = req.query.year != null ? parseInt(req.query.year as string) : 2026;
      const all = await getAllFixtures(year);
      const grouped: Record<number, { roundName: string; matches: typeof all }> = {};
      for (const f of all) {
        if (!grouped[f.round]) {
          grouped[f.round] = { roundName: f.roundName, matches: [] };
        }
        grouped[f.round].matches.push(f);
      }
      res.json(grouped);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/fixtures/:round", async (req, res) => {
    try {
      const round = parseInt(req.params.round);
      const matches = await getFixturesByRound(round);
      res.json({ round, roundName: getRoundName(round), matches });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/fixtures/refresh", isAdmin, async (req, res) => {
    try {
      const count = await fetchAndStoreFixtures();
      res.json({ message: `Refreshed ${count} fixtures` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/live-scores", async (req, res) => {
    try {
      const round = req.query.round != null ? parseInt(req.query.round as string) : undefined;
      const data = await getLiveRoundData(round);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/live-scores/matches", async (req, res) => {
    try {
      const round = req.query.round != null ? parseInt(req.query.round as string) : undefined;
      const matches = await fetchMatchStatuses(round);
      res.json(matches);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/live-scores/match-players", async (req, res) => {
    try {
      const homeTeam = req.query.homeTeam as string;
      const awayTeam = req.query.awayTeam as string;
      const round = req.query.round != null ? parseInt(req.query.round as string) : 0;
      if (!homeTeam || !awayTeam) {
        return res.status(400).json({ message: "homeTeam and awayTeam are required" });
      }
      const matchPlayers = await getMatchPlayers(homeTeam, awayTeam, round);
      res.json(matchPlayers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/live-scores/update-player", async (req, res) => {
    try {
      const schema = z.object({
        playerId: z.number(),
        round: z.number(),
        kicks: z.number().optional(),
        handballs: z.number().optional(),
        marks: z.number().optional(),
        tackles: z.number().optional(),
        hitouts: z.number().optional(),
        goals: z.number().optional(),
        behinds: z.number().optional(),
        freesAgainst: z.number().optional(),
        timeOnGround: z.number().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const { playerId, round, ...stats } = parsed.data;
      const result = await updatePlayerLiveStats(playerId, round, stats);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/live-scores/bulk-update", async (req, res) => {
    try {
      const schema = z.object({
        round: z.number(),
        scores: z.array(z.object({
          playerId: z.number(),
          fantasyScore: z.number(),
        })),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const result = await bulkUpdateLiveScores(parsed.data.round, parsed.data.scores);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/live-scores/fetch-scores", async (req, res) => {
    try {
      const schema = z.object({
        round: z.number(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const result = await fetchAndStorePlayerScores(parsed.data.round);
      const { recalculatePlayerAverages } = await import("./expand-players");
      await recalculatePlayerAverages();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/my-team/risks", async (_req, res) => {
    try {
      const { getTagWarningsForTeam } = await import("./services/tag-intelligence");
      const team = await storage.getMyTeam();
      if (team.length === 0) {
        return res.json({ alerts: [], swapSuggestions: [], tagWarnings: [] });
      }

      const onField = team.filter(p => p.isOnField);
      const bench = team.filter(p => !p.isOnField);
      const settings = await storage.getSettings();
      const currentRound = settings?.currentRound || 1;

      const alerts: any[] = [];
      const swapSuggestions: any[] = [];

      const definitelyOutStatuses = [
        "season", "acl", "knee", "hamstring", "shoulder", "concussion",
        "suspended", "dropped", "omitted", "delisted", "retired",
        "broken", "fracture", "surgery", "torn", "rupture",
      ];

      function isDefinitelyOut(injuryStatus: string | null): boolean {
        if (!injuryStatus) return false;
        const lower = injuryStatus.toLowerCase();
        return definitelyOutStatuses.some(s => lower.includes(s));
      }

      function isMonitoringOnly(injuryStatus: string | null): boolean {
        if (!injuryStatus) return false;
        const lower = injuryStatus.toLowerCase();
        const monitorStatuses = ["test", "managed", "modified", "soreness", "awareness", "cork", "general"];
        return monitorStatuses.some(s => lower.includes(s));
      }

      for (const p of onField) {
        const hasDefiniteInjury = isDefinitelyOut(p.injuryStatus);
        const hasMonitoringInjury = !hasDefiniteInjury && !!p.injuryStatus && !isMonitoringOnly(p.injuryStatus);
        const selStatus = p.selectionStatus || "unknown";
        const isOmitted = selStatus === "omitted";
        const isEmergency = selStatus === "emergency";
        const notNamed = !p.isNamedTeam && currentRound >= 2 && selStatus !== "unknown";
        const isUnavailable = hasDefiniteInjury || !!p.lateChange || isOmitted || notNamed;
        const isWarning = hasMonitoringInjury || isEmergency;
        const isBye = p.byeRound === currentRound;

        if (isUnavailable || isWarning || isBye) {
          const reason = hasDefiniteInjury ? `Injury: ${p.injuryStatus}`
            : p.lateChange ? "Late change — may score 0"
            : isOmitted ? "Not selected for this round"
            : notNamed ? "Not named in squad"
            : isEmergency ? "Named as emergency — only plays if a selected player is withdrawn"
            : hasMonitoringInjury ? `Monitor: ${p.injuryStatus}`
            : `Bye round ${p.byeRound}`;

          const severity = hasDefiniteInjury || p.lateChange ? "critical" : isOmitted || notNamed ? "high" : isEmergency ? "medium" : hasMonitoringInjury ? "low" : "medium";

          alerts.push({
            playerId: p.id,
            playerName: p.name,
            team: p.team,
            position: p.position,
            fieldPosition: p.fieldPosition,
            reason,
            severity,
            avgScore: p.avgScore,
            isCaptain: p.isCaptain,
            isViceCaptain: p.isViceCaptain,
          });

          const eligibleBench = bench.filter(bp => {
            const bpSelStatus = bp.selectionStatus || "unknown";
            if (isDefinitelyOut(bp.injuryStatus) || bp.lateChange || bpSelStatus === "omitted" || (!bp.isNamedTeam && currentRound >= 2 && bpSelStatus !== "unknown")) return false;
            if (bp.byeRound === currentRound) return false;
            const slot = p.fieldPosition || p.position;
            if (slot === "UTIL") return true;
            const bpPositions = [bp.position, bp.dualPosition].filter(Boolean);
            return bpPositions.includes(slot);
          }).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));

          if (eligibleBench.length > 0) {
            const best = eligibleBench[0];
            swapSuggestions.push({
              outPlayerId: p.id,
              outPlayerName: p.name,
              outPosition: p.fieldPosition,
              outAvg: p.avgScore,
              inPlayerId: best.id,
              inPlayerName: best.name,
              inPosition: best.position,
              inAvg: best.avgScore,
              scoreDiff: (best.avgScore || 0) - (isUnavailable ? 0 : (p.avgScore || 0)),
              reason: isUnavailable ? `${p.name} is unavailable — swap in ${best.name}` : `${p.name} on bye — swap in ${best.name}`,
            });
          }
        }
      }

      const tagWarnings = await getTagWarningsForTeam(onField);

      res.json({ alerts, swapSuggestions, tagWarnings });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tag-profiles", async (_req, res) => {
    try {
      const { teamTagProfiles, tagMatchupHistory } = await import("@shared/schema");
      const profiles = await db.select().from(teamTagProfiles).orderBy(teamTagProfiles.team);
      const history = await db.select().from(tagMatchupHistory).orderBy(tagMatchupHistory.season, tagMatchupHistory.round);
      res.json({ profiles, history });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/breakout-candidates", async (_req, res) => {
    try {
      const allPlayers = await storage.getAllPlayers();
      const candidates = allPlayers
        .filter(p => (p.breakoutScore ?? 0) >= 0.50)
        .sort((a, b) => (b.breakoutScore ?? 0) - (a.breakoutScore ?? 0));
      res.json(candidates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/players/update-fixtures", async (req, res) => {
    try {
      const round = req.body.round || 1;
      const allPlayers = await storage.getAllPlayers();
      let updated = 0;
      for (const player of allPlayers) {
        const fixture = getFixtureForTeam(player.team, round);
        if (fixture) {
          await storage.updatePlayer(player.id, {
            nextOpponent: fixture.opponent,
            venue: fixture.venue,
            gameTime: fixture.time,
          });
          updated++;
        }
      }
      res.json({ updated, round });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/simulate-round", async (_req, res) => {
    try {
      const { simulateRound } = await import("./services/simulation-engine");
      const team = await storage.getMyTeam();
      if (team.length === 0) {
        return res.status(400).json({ message: "No team set up" });
      }

      const simPlayers = team.map(p => ({
        id: p.id,
        name: p.name,
        team: p.team,
        position: p.position,
        projectedScore: p.projectedScore || p.avgScore || 50,
        avgScore: p.avgScore || 50,
        scoreStdDev: p.scoreStdDev || 15,
        isCaptain: p.isCaptain || false,
        isViceCaptain: p.isViceCaptain || false,
        isOnField: p.isOnField !== false,
      }));

      const result = simulateRound(simPlayers);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ ADMIN ROUTES ============

  app.get("/api/admin/users", isAdmin, async (_req, res) => {
    try {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      res.json(allUsers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/users/:id/block", isAdmin, async (req, res) => {
    try {
      const { blocked } = req.body;
      const [updated] = await db.update(users)
        .set({ isBlocked: blocked, updatedAt: new Date() })
        .where(eq(users.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/users/:id/admin", isAdmin, async (req, res) => {
    try {
      const { admin } = req.body;
      const [updated] = await db.update(users)
        .set({ isAdmin: admin, updatedAt: new Date() })
        .where(eq(users.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/impersonate/:id", isAdmin, async (req, res) => {
    try {
      const targetUser = await db.select().from(users).where(eq(users.id, req.params.id));
      if (!targetUser.length) {
        return res.status(404).json({ message: "User not found" });
      }
      const sessionUser = req.user as any;
      sessionUser.impersonating = {
        originalUserId: sessionUser.claims.sub,
        targetUserId: req.params.id,
        targetUser: targetUser[0],
      };
      sessionUser.claims = { ...sessionUser.claims, sub: req.params.id };
      res.json({ message: "Now impersonating user", user: targetUser[0] });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/stop-impersonation", isAuthenticated, async (req, res) => {
    try {
      const sessionUser = req.user as any;
      if (!sessionUser.impersonating) {
        return res.status(400).json({ message: "Not currently impersonating" });
      }
      sessionUser.claims = { ...sessionUser.claims, sub: sessionUser.impersonating.originalUserId };
      delete sessionUser.impersonating;
      res.json({ message: "Stopped impersonation" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ ADMIN FEEDBACK ROUTES ============

  app.get("/api/admin/feedback", isAdmin, async (_req, res) => {
    try {
      const allFeedback = await db.select().from(feedback).orderBy(desc(feedback.createdAt));
      res.json(allFeedback);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/feedback/:id/respond", isAdmin, async (req, res) => {
    try {
      const { response } = req.body;
      const [updated] = await db.update(feedback)
        .set({ adminResponse: response, status: "responded", respondedAt: new Date() })
        .where(eq(feedback.id, parseInt(req.params.id)))
        .returning();
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/feedback/:id/archive", isAdmin, async (req, res) => {
    try {
      const [updated] = await db.update(feedback)
        .set({ isArchived: true, status: "archived" })
        .where(eq(feedback.id, parseInt(req.params.id)))
        .returning();
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/feedback/:id", isAdmin, async (req, res) => {
    try {
      await db.delete(feedback).where(eq(feedback.id, parseInt(req.params.id)));
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ DTLIVE DATA SYNC ============

  app.post("/api/admin/sync-dtlive", isAdmin, async (_req, res) => {
    try {
      const { fetchDTLiveData } = await import("./services/dtlive-scraper");
      const result = await fetchDTLiveData();
      const { recalculatePlayerAverages } = await import("./expand-players");
      await recalculatePlayerAverages();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/sync-fantasysports", isAdmin, async (_req, res) => {
    try {
      const { fetchFantasySportsBEs } = await import("./services/fantasysports-scraper");
      const result = await fetchFantasySportsBEs();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ TAG PREDICTION TRACKING ============

  app.post("/api/admin/tag-predictions/save", isAdmin, async (_req, res) => {
    try {
      const { getTagWarningsForTeam, saveTagPredictions } = await import("./services/tag-intelligence");
      const settings = await storage.getSettings();
      const currentRound = settings?.currentRound;
      if (!currentRound || currentRound < 1) {
        return res.status(400).json({ message: "Current round must be set to at least 1 before saving predictions" });
      }

      const team = await storage.getMyTeam();
      const onField = team.filter(p => p.isOnField);
      if (onField.length === 0) {
        return res.status(400).json({ message: "No on-field players found — add players to your team first" });
      }

      const warnings = await getTagWarningsForTeam(
        onField.map(p => ({
          id: p.id,
          name: p.name,
          team: p.team,
          position: p.position,
          dualPosition: p.dualPosition,
          avgScore: p.avgScore,
          nextOpponent: p.nextOpponent,
          isCaptain: p.isCaptain,
          isViceCaptain: p.isViceCaptain,
        }))
      );

      if (warnings.length === 0) {
        return res.json({ message: `No tag warnings to save for round ${currentRound}`, saved: 0, round: currentRound });
      }

      const saved = await saveTagPredictions(currentRound, warnings);
      res.json({ message: `Saved ${saved} tag predictions for round ${currentRound}`, saved, round: currentRound });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/tag-predictions/evaluate/:round", isAdmin, async (req, res) => {
    try {
      const round = parseInt(req.params.round);
      if (isNaN(round) || round < 1) {
        return res.status(400).json({ message: "Round must be a valid number >= 1" });
      }
      const { evaluateTagOutcomes } = await import("./services/tag-intelligence");
      const result = await evaluateTagOutcomes(round);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/tag-predictions/accuracy", isAdmin, async (_req, res) => {
    try {
      const { getTagAccuracyStats } = await import("./services/tag-intelligence");
      const stats = await getTagAccuracyStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ USER FEEDBACK ROUTES ============

  app.post("/api/feedback", async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userRecord = await db.select().from(users).where(eq(users.id, userId));
      const { subject, message } = req.body;
      if (!subject || !message) {
        return res.status(400).json({ message: "Subject and message are required" });
      }
      const [created] = await db.insert(feedback).values({
        userId,
        userEmail: userRecord[0]?.email || null,
        userName: [userRecord[0]?.firstName, userRecord[0]?.lastName].filter(Boolean).join(" ") || null,
        subject,
        message,
      }).returning();
      res.json(created);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/feedback", async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const myFeedback = await db.select().from(feedback)
        .where(eq(feedback.userId, userId))
        .orderBy(desc(feedback.createdAt));
      res.json(myFeedback);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ SAVED TEAMS (TEAM LAB) ROUTES ============

  app.get("/api/saved-teams", async (req, res) => {
    try {
      const teams = await storage.getSavedTeams();
      res.json(teams);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/saved-teams", async (req, res) => {
    try {
      const { name, description, source } = req.body;
      if (!name) return res.status(400).json({ message: "Team name is required" });
      const team = await storage.saveCurrentTeamAsVariant(name, description || null, source || "manual");
      res.json(team);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/saved-teams/from-wizard", async (req, res) => {
    try {
      const { name, description } = req.body;
      const teamName = name || `AI Build ${new Date().toLocaleDateString()}`;

      const currentTeam = await storage.getMyTeam();

      const excludePremiumIds = new Set<number>();
      const premiumOnTeam = currentTeam
        .filter(p => p.isOnField && (p.avgScore || 0) >= 85)
        .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
      const premiumsToExclude = Math.min(Math.ceil(premiumOnTeam.length * 0.4), 4);
      for (let i = 0; i < premiumsToExclude; i++) {
        excludePremiumIds.add(premiumOnTeam[i].id);
      }

      const variationSeed = Date.now() % 100000;

      const builtResult = await buildOptimalTeam({ excludePlayerIds: excludePremiumIds, variationSeed });
      const builtTeam = builtResult.teamPlayers;

      const playerData = builtTeam.map((p) => ({
        playerId: p.id,
        isOnField: p.isOnField,
        isCaptain: false,
        isViceCaptain: false,
        fieldPosition: p.fieldPosition,
      }));

      const teamValue = builtTeam.reduce((sum, p) => sum + p.price, 0);
      const onFieldPlayers = builtTeam.filter(p => p.isOnField);
      const projectedScore = onFieldPlayers.reduce((sum, p) => sum + (p.avgScore || 0), 0);

      const bestScorer = [...onFieldPlayers].sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
      if (bestScorer[0]) {
        const entry = playerData.find(e => e.playerId === bestScorer[0].id);
        if (entry) entry.isCaptain = true;
      }
      if (bestScorer[1]) {
        const entry = playerData.find(e => e.playerId === bestScorer[1].id);
        if (entry) entry.isViceCaptain = true;
      }

      const team = await storage.createSavedTeam({
        name: teamName,
        description: description || "AI-generated alternative team",
        playerData: JSON.stringify(playerData),
        teamValue,
        projectedScore: Math.round(projectedScore),
        isActive: false,
        source: "ai-built",
      });

      res.json(team);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/saved-teams/:id", async (req, res) => {
    try {
      const { name, description } = req.body;
      const updated = await storage.updateSavedTeam(Number(req.params.id), { name, description });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/saved-teams/:id", async (req, res) => {
    try {
      await storage.deleteSavedTeam(Number(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/saved-teams/:id/activate", async (req, res) => {
    try {
      await storage.activateSavedTeam(Number(req.params.id));
      res.json({ success: true, message: "Team activated and loaded" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/saved-teams/:id/compare", async (req, res) => {
    try {
      const savedTeam = await storage.getSavedTeam(Number(req.params.id));
      if (!savedTeam) return res.status(404).json({ message: "Team not found" });

      const currentTeam = await storage.getMyTeam();
      const savedPlayers: Array<{ playerId: number; isOnField: boolean; isCaptain: boolean; isViceCaptain: boolean; fieldPosition: string }> = JSON.parse(savedTeam.playerData);
      const allPlayers = await storage.getAllPlayers();
      const playerMap = new Map(allPlayers.map(p => [p.id, p]));

      const currentIds = new Set(currentTeam.map(p => p.id));
      const savedIds = new Set(savedPlayers.map(p => p.playerId));

      const shared = [...currentIds].filter(id => savedIds.has(id));
      const onlyInCurrent = [...currentIds].filter(id => !savedIds.has(id)).map(id => {
        const p = playerMap.get(id);
        return p ? { id: p.id, name: p.name, position: p.position, avgScore: p.avgScore, price: p.price } : null;
      }).filter(Boolean);
      const onlyInSaved = [...savedIds].filter(id => !currentIds.has(id)).map(id => {
        const p = playerMap.get(id);
        return p ? { id: p.id, name: p.name, position: p.position, avgScore: p.avgScore, price: p.price } : null;
      }).filter(Boolean);

      const currentValue = currentTeam.reduce((sum, p) => sum + p.price, 0);
      const currentProjected = currentTeam.filter(p => p.isOnField).reduce((sum, p) => sum + (p.avgScore || 0), 0);

      res.json({
        currentTeam: { value: currentValue, projectedScore: Math.round(currentProjected), playerCount: currentTeam.length },
        savedTeam: { value: savedTeam.teamValue, projectedScore: savedTeam.projectedScore, playerCount: savedPlayers.length, name: savedTeam.name },
        sharedPlayers: shared.length,
        onlyInCurrent,
        onlyInSaved,
        scoreDiff: Math.round((savedTeam.projectedScore || 0) - currentProjected),
        valueDiff: savedTeam.teamValue - currentValue,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ LEAGUE SPY ROUTES ============

  app.get("/api/league/opponents", async (req, res) => {
    try {
      const leagueName = req.query.leagueName as string | undefined;
      const opponents = await storage.getLeagueOpponents(leagueName);
      res.json(opponents);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/league/opponents", async (req, res) => {
    try {
      const { leagueName, opponentName, totalScore, lastRoundScore, notes } = req.body;
      if (!leagueName || !opponentName) {
        return res.status(400).json({ message: "League name and opponent name are required" });
      }
      const opponent = await storage.createLeagueOpponent({
        leagueName,
        opponentName,
        totalScore: totalScore || null,
        lastRoundScore: lastRoundScore || null,
        notes: notes || null,
      });
      res.json(opponent);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/league/opponents/:id", async (req, res) => {
    try {
      const { opponentName, totalScore, lastRoundScore, notes, leagueName } = req.body;
      const updated = await storage.updateLeagueOpponent(Number(req.params.id), {
        opponentName, totalScore, lastRoundScore, notes, leagueName,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/league/opponents/:id", async (req, res) => {
    try {
      await storage.deleteLeagueOpponent(Number(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/league/import-screenshot", upload.single("screenshot"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No screenshot uploaded" });

      const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
      if (!allowedMimes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Unsupported file type. Please upload a PNG, JPG, or WebP image." });
      }

      const base64Image = req.file.buffer.toString("base64");
      const { analyzeLeagueScreenshot } = await import("./intel-engine");
      const result = await analyzeLeagueScreenshot(base64Image);
      res.json(result);
    } catch (error: any) {
      console.error("League screenshot import error:", error.message);
      res.status(500).json({ message: "Failed to analyse league screenshot. Please try again with a clearer image." });
    }
  });

  app.post("/api/league/import-bulk", async (req, res) => {
    try {
      const bulkImportSchema = z.object({
        leagueName: z.string().min(1),
        teams: z.array(z.object({
          teamName: z.string().min(1),
          managerName: z.string(),
          position: z.number(),
        })).min(1),
      });
      const { leagueName, teams } = bulkImportSchema.parse(req.body);

      const created = [];
      for (const team of teams) {
        const opponentName = team.managerName
          ? `${team.teamName} (${team.managerName})`
          : team.teamName;
        const opponent = await storage.createLeagueOpponent({
          leagueName,
          opponentName,
          totalScore: null,
          lastRoundScore: null,
          notes: `Ladder position: ${team.position}`,
        });
        created.push(opponent);
      }

      res.json({ success: true, count: created.length, opponents: created });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/league/opponents/:id/analyze-screenshot", upload.single("screenshot"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No screenshot uploaded" });

      const base64Image = req.file.buffer.toString("base64");
      const { analyzeTeamScreenshot } = await import("./intel-engine");
      const analysis = await analyzeTeamScreenshot(base64Image);

      if (analysis.players && analysis.players.length > 0) {
        const allPlayers = await storage.getAllPlayers();
        const matchedPlayers = analysis.players.map((ip: any) => {
          const normalName = ip.name.trim().toLowerCase();
          const match = allPlayers.find(p => p.name.toLowerCase() === normalName) ||
            allPlayers.find(p => {
              const parts = p.name.toLowerCase().split(" ");
              return parts[parts.length - 1] === normalName.split(" ").pop();
            });
          return match ? {
            playerId: match.id,
            name: match.name,
            position: match.position,
            avgScore: match.avgScore,
            price: match.price,
          } : { name: ip.name, position: ip.position, avgScore: null, price: null };
        });

        await storage.updateLeagueOpponent(Number(req.params.id), {
          playerData: JSON.stringify(matchedPlayers),
        });

        res.json({ success: true, playersFound: matchedPlayers.length, players: matchedPlayers });
      } else {
        res.json({ success: false, message: "No players identified in screenshot" });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/league/opponents/:id/matchup", async (req, res) => {
    try {
      const opponent = await storage.getLeagueOpponent(Number(req.params.id));
      if (!opponent) return res.status(404).json({ message: "Opponent not found" });
      if (!opponent.playerData) return res.json({ message: "No squad data for this opponent. Upload a screenshot of their team." });

      const currentTeam = await storage.getMyTeam();
      const oppPlayers: Array<{ playerId?: number; name: string; position: string; avgScore: number | null; price: number | null }> = JSON.parse(opponent.playerData);

      const myIds = new Set(currentTeam.map(p => p.id));
      const oppIds = new Set(oppPlayers.filter(p => p.playerId).map(p => p.playerId));

      const myUnique = currentTeam
        .filter(p => !oppIds.has(p.id))
        .map(p => ({ id: p.id, name: p.name, position: p.position, avgScore: p.avgScore, price: p.price, isOnField: p.isOnField }));
      const theirUnique = oppPlayers
        .filter(p => p.playerId && !myIds.has(p.playerId))
        .map(p => ({ id: p.playerId, name: p.name, position: p.position, avgScore: p.avgScore, price: p.price }));
      const sharedPlayers = currentTeam
        .filter(p => oppIds.has(p.id))
        .map(p => ({ id: p.id, name: p.name, position: p.position, avgScore: p.avgScore }));

      const myProjected = currentTeam.filter(p => p.isOnField).reduce((sum, p) => sum + (p.avgScore || 0), 0);
      const oppProjected = oppPlayers.reduce((sum, p) => sum + (p.avgScore || 0), 0);
      const advantage = Math.round(myProjected - oppProjected);

      const captainTips: string[] = [];
      const myUniqueOnField = myUnique.filter(p => p.isOnField).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
      if (myUniqueOnField.length > 0) {
        captainTips.push(`Captain ${myUniqueOnField[0].name} (avg ${Math.round(myUniqueOnField[0].avgScore || 0)}) — your opponent doesn't have them, so a big score doubles your advantage`);
      }
      if (theirUnique.length > 0) {
        const theirBest = [...theirUnique].sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))[0];
        captainTips.push(`Watch out for ${theirBest.name} (avg ${Math.round(theirBest.avgScore || 0)}) — they have this player and you don't`);
      }

      res.json({
        opponentName: opponent.opponentName,
        leagueName: opponent.leagueName,
        projectedAdvantage: advantage,
        myProjected: Math.round(myProjected),
        oppProjected: Math.round(oppProjected),
        sharedPlayers,
        myUniquePicks: myUnique,
        theirUniquePicks: theirUnique,
        captainTips,
        weeklyWinStrategy: advantage > 0
          ? `You're projected +${advantage}pts ahead. Maintain your edge by captaining a high-ceiling unique pick.`
          : `You're projected ${advantage}pts behind. Consider a high-ceiling captain differential to close the gap, even if it's riskier for your season.`,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ WEEKLY PLAN (DIRECTIVE COACHING NARRATIVE) ============

  app.get("/api/weekly-plan", async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      const currentRound = settings?.currentRound || 1;
      const team = await storage.getMyTeam();
      if (team.length === 0) {
        return res.json({ steps: [], round: currentRound, summary: "Set up your team to get your weekly plan." });
      }

      const onField = team.filter(p => p.isOnField);
      const bench = team.filter(p => !p.isOnField);
      const tradeRecs = await storage.getTradeRecommendations();
      const pendingTrades = tradeRecs.filter(t => t.status === "pending");

      const captain = team.find(p => p.isCaptain);
      const viceCaptain = team.find(p => p.isViceCaptain);

      const gameRules = (await import("@shared/game-rules")).AFL_FANTASY_CLASSIC_2026;
      const byeRounds = gameRules.byeRounds || [12, 13, 14];
      const isByeRound = byeRounds.includes(currentRound);
      const maxTrades = currentRound < (gameRules.trades?.startFromRound || 2) ? 0 : isByeRound ? (gameRules.trades?.perByeRound || 3) : (gameRules.trades?.perRound || 2);

      const definitelyOutStatuses = [
        "season", "acl", "knee", "hamstring", "shoulder", "concussion",
        "suspended", "dropped", "omitted", "delisted", "retired",
        "broken", "fracture", "surgery", "torn", "rupture",
      ];
      function isDefinitelyOut(injuryStatus: string | null): boolean {
        if (!injuryStatus) return false;
        return definitelyOutStatuses.some(s => injuryStatus.toLowerCase().includes(s));
      }

      const steps: { priority: "critical" | "important" | "suggested"; action: string; reason: string; link?: string }[] = [];

      const injuredOnField = onField.filter(p => isDefinitelyOut(p.injuryStatus) || p.lateChange);
      const omittedOnField = onField.filter(p => p.selectionStatus === "omitted" && !isDefinitelyOut(p.injuryStatus));
      const unavailable = [...injuredOnField, ...omittedOnField];

      for (const p of unavailable) {
        const topTrade = pendingTrades.find(t => t.playerOutId === p.id);
        if (topTrade) {
          steps.push({
            priority: "critical",
            action: `Trade out ${p.name} → bring in ${topTrade.playerIn.name}`,
            reason: `${p.name} is ${p.injuryStatus || "unavailable"}. ${topTrade.playerIn.name} (avg ${topTrade.playerIn.avgScore?.toFixed(1)}) is the best replacement at ${topTrade.playerIn.position}.`,
            link: "/trades",
          });
        } else {
          const replacement = bench.find(b => {
            const bpPositions = [b.position, b.dualPosition].filter(Boolean);
            return (p.fieldPosition === "UTIL" || bpPositions.includes(p.fieldPosition || "")) && !isDefinitelyOut(b.injuryStatus);
          });
          if (replacement) {
            steps.push({
              priority: "critical",
              action: `Move ${replacement.name} on-field to replace ${p.name}`,
              reason: `${p.name} is ${p.injuryStatus || "unavailable"}. ${replacement.name} (avg ${replacement.avgScore?.toFixed(1)}) is your best bench option at ${p.fieldPosition}.`,
              link: "/team",
            });
          } else {
            steps.push({
              priority: "critical",
              action: `Find a replacement for ${p.name}`,
              reason: `${p.name} is ${p.injuryStatus || "unavailable"} and there's no suitable bench cover. You'll need to use a trade.`,
              link: "/trades",
            });
          }
        }
      }

      const remainingTrades = pendingTrades
        .filter(t => !unavailable.some(u => u.id === t.playerOutId))
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, Math.max(0, maxTrades - unavailable.length));

      for (const t of remainingTrades) {
        if (t.confidence > 0.7) {
          steps.push({
            priority: "important",
            action: `Trade ${t.playerOut.name} → ${t.playerIn.name}`,
            reason: t.reason || `${t.playerIn.name} (avg ${t.playerIn.avgScore?.toFixed(1)}) is a significant upgrade over ${t.playerOut.name} (avg ${t.playerOut.avgScore?.toFixed(1)}).`,
            link: "/trades",
          });
        }
      }

      const byeAffected = onField.filter(p => p.byeRound === currentRound);
      if (byeAffected.length > 0) {
        const swappable = byeAffected.filter(p => {
          return bench.some(b => {
            const bpPositions = [b.position, b.dualPosition].filter(Boolean);
            return (p.fieldPosition === "UTIL" || bpPositions.includes(p.fieldPosition || "")) && b.byeRound !== currentRound;
          });
        });
        if (swappable.length > 0) {
          steps.push({
            priority: "important",
            action: `Swap ${swappable.length} bye-affected player${swappable.length > 1 ? "s" : ""} to bench`,
            reason: `${swappable.map(p => p.name).join(", ")} ${swappable.length > 1 ? "are" : "is"} on bye this round. Move eligible bench players on-field to cover.`,
            link: "/team",
          });
        }
      }

      if (!captain) {
        const topScorer = [...onField].sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))[0];
        if (topScorer) {
          steps.push({
            priority: "important",
            action: `Set ${topScorer.name} as Captain`,
            reason: `No captain assigned. ${topScorer.name} leads your team with a ${topScorer.avgScore?.toFixed(1)} average — their score will be doubled.`,
            link: "/team",
          });
        }
      } else if (!viceCaptain) {
        steps.push({
          priority: "suggested",
          action: "Set a Vice-Captain for loophole strategy",
          reason: `You have ${captain.name} as Captain but no Vice-Captain. Setting a VC who plays early gives you the option to loophole if they score big.`,
          link: "/team",
        });
      }

      let seasonPlan = null;
      try {
        const plan = await getActiveSeasonPlan();
        if (plan) {
          const weeklyPlans = JSON.parse(plan.weeklyPlans) as any[];
          const thisWeek = weeklyPlans.find((wp: any) => wp.round === currentRound);
          if (thisWeek && thisWeek.suggestedTrades?.length > 0) {
            const alreadyCovered = steps.map(s => s.action).join(" ");
            for (const st of thisWeek.suggestedTrades) {
              if (!alreadyCovered.includes(st.playerOut) && !alreadyCovered.includes(st.playerIn)) {
                steps.push({
                  priority: "suggested",
                  action: `Roadmap trade: ${st.playerOut} → ${st.playerIn}`,
                  reason: st.reason || `Part of your season roadmap strategy for Round ${currentRound}.`,
                  link: "/roadmap",
                });
              }
            }
          }
          seasonPlan = { overallStrategy: plan.overallStrategy };
        }
      } catch {}

      if (currentRound >= 3) {
        const coldOnField = onField
          .filter(p => (p.gamesPlayed ?? 0) >= 3 && p.formTrend === "down" && (p.last3Avg || 0) < (p.avgScore || 0) * 0.8)
          .sort((a, b) => ((a.last3Avg || 0) / (a.avgScore || 1)) - ((b.last3Avg || 0) / (b.avgScore || 1)));

        if (coldOnField.length > 0 && steps.length < 6) {
          const worst = coldOnField[0];
          steps.push({
            priority: "suggested",
            action: `Monitor ${worst.name} — form is dropping`,
            reason: `${worst.name}'s last 3 avg (${worst.last3Avg?.toFixed(1)}) is well below their season avg (${worst.avgScore?.toFixed(1)}). Consider trading next round if form doesn't improve.`,
            link: `/player/${worst.id}`,
          });
        }
      }

      const summary = steps.length === 0
        ? "Your team is looking solid this week. No urgent actions needed — hold steady and monitor form."
        : steps.length === 1
          ? "One thing to address this week."
          : `${steps.filter(s => s.priority === "critical").length > 0 ? "Urgent action needed. " : ""}${steps.length} steps in your plan for Round ${currentRound}.`;

      res.json({ steps, round: currentRound, summary, isByeRound, tradesAvailable: settings.tradesRemaining, maxTrades, seasonContext: seasonPlan?.overallStrategy?.slice(0, 200) || null });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ GAME DAY GUIDE ROUTES ============

  app.get("/api/game-day-guide", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      const currentTeam = await storage.getMyTeam();
      const tradeRecs = await storage.getTradeRecommendations();

      const pendingTrades = tradeRecs.filter(t => t.status === "pending").slice(0, settings.tradesRemaining);

      const captain = currentTeam.find(p => p.isCaptain);
      const viceCaptain = currentTeam.find(p => p.isViceCaptain);

      const benchPlayers = currentTeam.filter(p => !p.isOnField);
      const injuredOnField = currentTeam.filter(p => p.isOnField && (p.selectionStatus === "omitted" || p.injuryStatus === "OUT"));
      const fieldMoves: Array<{ action: string; player: string; reason: string }> = [];
      for (const injured of injuredOnField) {
        const replacement = benchPlayers.find(b =>
          b.fieldPosition === injured.fieldPosition && b.selectionStatus !== "omitted" && b.injuryStatus !== "OUT"
        );
        if (replacement) {
          fieldMoves.push({
            action: "Swap",
            player: `${injured.name} → ${replacement.name}`,
            reason: `${injured.name} is ${injured.injuryStatus || "unavailable"}`,
          });
        }
      }

      const tradeSteps = pendingTrades.map((t, i) => ({
        step: i + 1,
        out: { name: t.playerOut.name, price: t.playerOut.price, avgScore: t.playerOut.avgScore },
        in: { name: t.playerIn.name, price: t.playerIn.price, avgScore: t.playerIn.avgScore },
        reason: t.reason,
        scoreDiff: t.scoreDifference,
      }));

      const guide = {
        round: settings.currentRound,
        tradesRemaining: settings.tradesRemaining,
        trades: tradeSteps,
        captain: captain ? { name: captain.name, avgScore: captain.avgScore, position: captain.position } : null,
        viceCaptain: viceCaptain ? { name: viceCaptain.name, avgScore: viceCaptain.avgScore, position: viceCaptain.position } : null,
        fieldMoves,
        tips: [
          "Open the AFL Fantasy app → My Team",
          ...(tradeSteps.length > 0 ? [
            "Go to Trades tab",
            ...tradeSteps.map(t => `Search for "${t.in.name}" and trade out "${t.out.name}"`),
            "Confirm all trades",
          ] : []),
          ...(captain ? [`Set ${captain.name} as Captain (tap the 'C' badge)`] : []),
          ...(viceCaptain ? [`Set ${viceCaptain.name} as Vice-Captain (tap the 'VC' badge)`] : []),
          ...(fieldMoves.length > 0 ? fieldMoves.map(m => `${m.action}: ${m.player}`) : []),
          "Review your team and confirm before lockout",
        ],
        isEmpty: tradeSteps.length === 0 && fieldMoves.length === 0,
      };

      res.json(guide);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
