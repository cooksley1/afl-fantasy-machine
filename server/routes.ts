import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { insertMyTeamPlayerSchema, users, feedback, players, weeklyStats } from "@shared/schema";
import { AFL_FANTASY_CLASSIC_2026, getTradesForRound, getFixtureForTeam, isByeRound } from "@shared/game-rules";
import { z } from "zod";
import multer from "multer";
import { eq, desc, and, inArray } from "drizzle-orm";
import {
  calcTradeEV,
  calcTradeRankingScore,
  calcTradeConfidence,
  getCachedWeights,
  buildWeightConfig,
} from "./services/projection-engine";
import { TradeEngine, generateTradeRecommendations } from "./services/trade-engine";
import { buildOptimalTeam, generateSeasonPlan, saveSeasonPlan, getActiveSeasonPlan, buildDreamTeamReverse } from "./services/season-planner";
import { checkPlayersAgainstNews, formatNewsWarningForReason, type NewsWarning } from "./services/news-sanity-check";
import { getLiveRoundData, updatePlayerLiveStats, bulkUpdateLiveScores, fetchMatchStatuses, getMatchPlayers, fetchAndStorePlayerScores } from "./services/live-scores";
import { getAllFixtures, getFixturesByRound, fetchAndStoreFixtures, syncPlayerFixtures, getRoundName } from "./services/fixture-service";
import { isAuthenticated } from "./replit_integrations/auth";

const gameRules = AFL_FANTASY_CLASSIC_2026;
const tradeEngine = new TradeEngine();

function getUserId(req: Request): string {
  const userId = (req.user as any)?.claims?.sub;
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

function getEffectiveUserId(req: Request): string {
  const session = (req as any).session;
  if (session?.impersonateUserId) {
    return session.impersonateUserId;
  }
  return getUserId(req);
}

async function isAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user as any;
    if (!user?.claims?.sub) {
      return res.status(401).json({ message: "Unauthorised" });
    }
    const [u] = await db.select().from(users).where(eq(users.id, user.claims.sub));
    if (!u?.isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  } catch (error) {
    console.error("[isAdmin] Error:", error);
    res.status(500).json({ message: "Server error" });
  }
}

class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ValidationError"; }
}

function parseIntParam(value: string, name: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) throw new ValidationError(`Invalid ${name}`);
  return parsed;
}

function handleRouteError(res: Response, error: any) {
  if (error instanceof ValidationError) {
    return res.status(400).json({ message: error.message });
  }
  console.error("[Route Error]", error);
  res.status(500).json({ message: "Something went wrong" });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/data/status", async (_req, res) => {
    try {
      const { getSchedulerStatus } = await import("./scheduler");
      const status = getSchedulerStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

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
      const magicNumber = gameRules.magicNumber;
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
      const id = parseIntParam(req.params.id, "player id");
      const player = await storage.getPlayer(id);
      if (!player) return res.status(404).json({ message: "Player not found" });
      res.json(player);
    } catch (error: any) {
      handleRouteError(res, error);
    }
  });

  app.get("/api/my-team", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const team = await storage.getMyTeam(uid);
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
          isOnField: z.boolean().optional(),
        })
        .parse(req.body);

      const uid = getEffectiveUserId(req);
      const existing = await storage.getMyTeam(uid);
      const alreadyOnTeam = existing.find((p) => p.id === data.playerId);
      if (alreadyOnTeam) {
        return res.status(400).json({ message: "Player already on team" });
      }

      const entry = await storage.addToMyTeam(uid, {
        playerId: data.playerId,
        isOnField: data.isOnField !== undefined ? data.isOnField : true,
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
      const uid = getEffectiveUserId(req);
      await storage.removeFromMyTeam(uid, parseIntParam(req.params.id, "team player id"));
      res.json({ success: true });
    } catch (error: any) {
      handleRouteError(res, error);
    }
  });

  app.delete("/api/my-team", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      await storage.clearMyTeam(uid);
      res.json({ success: true, message: "Team cleared" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/my-team/:id/captain", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      await storage.setCaptain(uid, parseIntParam(req.params.id, "team player id"));
      res.json({ success: true });
    } catch (error: any) {
      handleRouteError(res, error);
    }
  });

  app.post("/api/my-team/:id/vice-captain", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      await storage.setViceCaptain(uid, parseIntParam(req.params.id, "team player id"));
      res.json({ success: true });
    } catch (error: any) {
      handleRouteError(res, error);
    }
  });

  app.patch("/api/my-team/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = z.object({
        isOnField: z.boolean().optional(),
        fieldPosition: z.string().optional(),
      }).parse(req.body);

      const uid = getEffectiveUserId(req);
      await storage.updateMyTeamPlayer(uid, id, data);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/my-team/swap", async (req, res) => {
    try {
      const { playerAId, playerBId } = z.object({
        playerAId: z.number(),
        playerBId: z.number(),
      }).parse(req.body);

      const uid = getEffectiveUserId(req);
      const team = await storage.getMyTeam(uid);
      const playerA = team.find(p => p.myTeamPlayerId === playerAId);
      const playerB = team.find(p => p.myTeamPlayerId === playerBId);

      if (!playerA || !playerB) {
        return res.status(404).json({ message: "Player not found on team" });
      }

      const canPlayPosition = (player: typeof playerA, targetPos: string): boolean => {
        if (targetPos === "UTIL") return true;
        const primary = player.position?.toUpperCase() || "";
        const dual = player.dualPosition?.toUpperCase() || "";
        return primary === targetPos || dual === targetPos;
      };

      const bTargetPos = playerA.fieldPosition!;
      const aTargetPos = playerB.fieldPosition!;

      if (!canPlayPosition(playerA, aTargetPos)) {
        return res.status(400).json({ message: `${playerA.name} cannot play ${aTargetPos}` });
      }
      if (!canPlayPosition(playerB, bTargetPos)) {
        return res.status(400).json({ message: `${playerB.name} cannot play ${bTargetPos}` });
      }

      await storage.updateMyTeamPlayer(uid, playerAId, {
        fieldPosition: aTargetPos,
        isOnField: playerB.isOnField!,
      });
      await storage.updateMyTeamPlayer(uid, playerBId, {
        fieldPosition: bTargetPos,
        isOnField: playerA.isOnField!,
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/my-team/:id/move", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isOnField } = z.object({ isOnField: z.boolean() }).parse(req.body);
      const uid = getEffectiveUserId(req);
      const team = await storage.getMyTeam(uid);
      const player = team.find(p => p.myTeamPlayerId === id);
      if (!player) return res.status(404).json({ message: "Player not found on team" });

      const posQuotas: Record<string, number> = { DEF: 6, MID: 8, RUC: 2, FWD: 6 };
      const pos = player.fieldPosition || "MID";

      if (isOnField && pos === "UTIL") {
        return res.status(400).json({ message: "Utility players cannot be moved on-field." });
      }

      if (isOnField) {
        const currentOnField = team.filter(p => p.fieldPosition === pos && p.isOnField && p.myTeamPlayerId !== id).length;
        const quota = posQuotas[pos] || 6;
        if (currentOnField >= quota) {
          return res.status(400).json({ message: `No open on-field ${pos} slots. Swap with a teammate first.` });
        }
      }

      if (!isOnField) {
        const posStructure: Record<string, number> = { DEF: 2, MID: 2, RUC: 1, FWD: 2 };
        const currentBench = team.filter(p => p.fieldPosition === pos && !p.isOnField && p.myTeamPlayerId !== id).length;
        const benchQuota = posStructure[pos] || 2;
        if (currentBench >= benchQuota) {
          return res.status(400).json({ message: `No open bench ${pos} slots. Swap with a teammate first.` });
        }
      }

      await storage.updateMyTeamPlayer(uid, id, { isOnField });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/my-team/:id/replace", async (req, res) => {
    try {
      const myTeamPlayerId = parseInt(req.params.id);
      const { newPlayerId } = z.object({
        newPlayerId: z.number(),
      }).parse(req.body);

      const uid = getEffectiveUserId(req);
      const team = await storage.getMyTeam(uid);
      const oldPlayer = team.find(p => p.myTeamPlayerId === myTeamPlayerId);
      if (!oldPlayer) {
        return res.status(404).json({ message: "Player not found on team" });
      }

      const alreadyOnTeam = team.find(p => p.id === newPlayerId);
      if (alreadyOnTeam) {
        return res.status(400).json({ message: "Player already on team" });
      }

      const newPlayer = await storage.getPlayer(newPlayerId);
      if (!newPlayer) {
        return res.status(404).json({ message: "Player not found in database" });
      }

      const settings = await storage.getSettings(uid);
      const salaryCap = settings.salaryCap || AFL_FANTASY_CLASSIC_2026.salaryCap;
      const currentTotal = team.reduce((sum, p) => sum + p.price, 0);
      const newTotal = currentTotal - oldPlayer.price + newPlayer.price;
      if (newTotal > salaryCap) {
        return res.status(400).json({ message: `Exceeds salary cap by $${((newTotal - salaryCap) / 1000).toFixed(0)}k` });
      }

      const targetPos = oldPlayer.fieldPosition!;
      const canPlay = targetPos === "UTIL" ||
        newPlayer.position?.toUpperCase() === targetPos ||
        newPlayer.dualPosition?.toUpperCase() === targetPos;
      if (!canPlay) {
        return res.status(400).json({ message: `${newPlayer.name} cannot play ${targetPos}` });
      }

      await storage.removeFromMyTeam(uid, myTeamPlayerId);
      await storage.addToMyTeam(uid, {
        playerId: newPlayerId,
        isOnField: oldPlayer.isOnField!,
        isCaptain: false,
        isViceCaptain: false,
        fieldPosition: targetPos,
      });

      res.json({ success: true, replacedWith: newPlayer.name });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/my-team/setup-glens-team", async (req, res) => {
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

      const uid = getEffectiveUserId(req);

      const teamEntries = [
        { playerId: fp("Connor Rozee"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Jack Sinclair"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Josh Gibcus"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Samuel Grlj"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Lachlan Blakiston"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Jai Serong"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Josh Lindsay"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Lachie Jaques"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
        { playerId: fp("Jack Steele"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Zak Butters"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Errol Gulden"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Darcy Parish"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Cooper Lord"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Willem Duursma"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Tanner Bruhn"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Jagga Smith"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Tom Blamires"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Roan Steele"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
        { playerId: fp("Brodie Grundy"), isOnField: true, isCaptain: true, isViceCaptain: false, fieldPosition: "RUC" },
        { playerId: fp("Lachlan McAndrew"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "RUC" },
        { playerId: fp("Vigo Visentini"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "RUC" },
        { playerId: fp("Harry Sheezel"), isOnField: true, isCaptain: false, isViceCaptain: true, fieldPosition: "FWD" },
        { playerId: fp("Christian Petracca"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Sam Flanders"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Mattaes Phillipou"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Gryan Miers"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Connor Budarick"), isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Deven Robertson"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Leonardo Lombard"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
        { playerId: fp("Jack Carroll"), isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "UTIL" },
      ];

      await storage.replaceMyTeam(uid, teamEntries);

      const team = await storage.getMyTeam(uid);
      res.json({ success: true, playerCount: team.length, team });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trade-recommendations", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const recs = await storage.getTradeRecommendations(uid);
      res.json(recs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-recommendations/generate", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      await storage.clearTradeRecommendations(uid);

      const myTeam = await storage.getMyTeam(uid);
      if (myTeam.length === 0) {
        return res.status(400).json({ message: "Add players to your team first to generate recommendations" });
      }

      const allPlayers = await storage.getAllPlayers();
      const settings = await storage.getSettings(uid);
      const currentRound = settings?.currentRound ?? 0;
      const salaryCap = settings?.salaryCap || gameRules.salaryCap;

      const executedThisRound = await tradeEngine.getTradeHistoryForRound(uid, currentRound);
      const finalTrades = tradeEngine.generateRecommendations(myTeam, allPlayers, currentRound, salaryCap, executedThisRound);

      const playerNamesToCheck = new Set<string>();
      for (const trade of finalTrades) {
        playerNamesToCheck.add(trade.playerOut.name);
        playerNamesToCheck.add(trade.playerIn.name);
      }
      const newsWarnings = await checkPlayersAgainstNews([...playerNamesToCheck], currentRound);

      for (const trade of finalTrades) {
        let reasonLines = [...trade.reasons];
        const outWarnings = newsWarnings.get(trade.playerOut.name) || [];
        const inWarnings = newsWarnings.get(trade.playerIn.name) || [];
        for (const w of outWarnings) {
          reasonLines.push(formatNewsWarningForReason(w));
        }
        for (const w of inWarnings) {
          reasonLines.push(formatNewsWarningForReason(w));
        }

        await storage.createTradeRecommendation(uid, {
          playerOutId: trade.playerOut.id,
          playerInId: trade.playerIn.id,
          reason: reasonLines.join(". ") + ".",
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

      const recs = await storage.getTradeRecommendations(uid);

      const tradeNewsWarnings: Record<number, NewsWarning[]> = {};
      for (const rec of recs) {
        const recWarnings: NewsWarning[] = [];
        const playerOutObj = finalTrades.find(t => t.playerOut.id === rec.playerOutId);
        const playerInObj = finalTrades.find(t => t.playerIn.id === rec.playerInId);
        if (playerOutObj) {
          const w = newsWarnings.get(playerOutObj.playerOut.name);
          if (w) recWarnings.push(...w);
        }
        if (playerInObj) {
          const w = newsWarnings.get(playerInObj.playerIn.name);
          if (w) recWarnings.push(...w);
        }
        if (recWarnings.length > 0) {
          tradeNewsWarnings[rec.id] = recWarnings;
        }
      }

      res.json({ recommendations: recs, newsWarnings: tradeNewsWarnings });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-recommendations/:id/execute", async (req, res) => {
    try {
      const tradeId = parseInt(req.params.id);
      const uid = getEffectiveUserId(req);
      const trade = await storage.getTradeRecommendation(uid, tradeId);
      if (!trade) return res.status(404).json({ message: "Trade not found" });

      const settings = await storage.getSettings(uid);
      const maxTradesThisRound = getTradesForRound(settings.currentRound);
      if (settings.tradesRemaining <= 0) {
        return res.status(400).json({ message: `No trades remaining this round (${maxTradesThisRound} per round${isByeRound(settings.currentRound) ? ' - bye round' : ''})` });
      }

      const executedThisRound = await tradeEngine.getTradeHistoryForRound(uid, settings.currentRound);
      const validation = tradeEngine.validateRecommendation(trade.playerInId, settings.currentRound, executedThisRound);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.reason });
      }

      const myTeam = await storage.getMyTeam(uid);
      const teamEntry = myTeam.find((p) => p.id === trade.playerOutId);
      if (!teamEntry) {
        return res.status(400).json({ message: "Player not on team" });
      }

      const playerIn = await storage.getPlayer(trade.playerInId);
      if (!playerIn) return res.status(404).json({ message: "Player not found" });

      const inheritedOnField = teamEntry.isOnField;
      const inheritedFieldPosition = teamEntry.fieldPosition;

      await db.transaction(async () => {
        await storage.removeFromMyTeam(uid, teamEntry.myTeamPlayerId!);

        await storage.addToMyTeam(uid, {
          playerId: trade.playerInId,
          isOnField: inheritedOnField,
          isCaptain: false,
          isViceCaptain: false,
          fieldPosition: inheritedFieldPosition || playerIn.position,
        });

        await storage.updateSettings(uid, {
          tradesRemaining: settings.tradesRemaining - 1,
          totalTradesUsed: settings.totalTradesUsed + 1,
        });

        await tradeEngine.markAsExecuted(uid, trade.playerOutId, trade.playerInId, settings.currentRound);
        await storage.deleteTradeRecommendation(uid, tradeId);
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trade-evaluate", async (req, res) => {
    try {
      const { candidateId } = req.body as { candidateId: number };
      if (!candidateId) return res.status(400).json({ message: "candidateId required" });
      const uid = getEffectiveUserId(req);
      const settings = await storage.getSettings(uid);
      const myTeam = await storage.getMyTeam(uid);
      const teamPlayerIds = myTeam.map(p => p.id);
      const evaluation = await tradeEngine.evaluateCandidate(candidateId, teamPlayerIds, settings.currentRound);
      res.json(evaluation);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/captain-advice", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const myTeam = await storage.getMyTeam(uid);
      if (myTeam.length === 0) return res.status(400).json({ message: "Add players to your team first" });

      const settings = await storage.getSettings(uid);
      const currentRound = settings?.currentRound ?? 0;
      const roundFixtures = await getFixturesByRound(currentRound);
      const fixtureData = roundFixtures.map(f => ({
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        date: f.date,
        localTime: f.localTime,
        complete: f.complete,
      }));

      const advice = tradeEngine.getCaptainLoopholeAdvice(myTeam, currentRound, fixtureData);

      const captainNames: string[] = [];
      if (advice.recommendedVC?.player?.name) captainNames.push(advice.recommendedVC.player.name);
      if (advice.recommendedCaptain?.player?.name) captainNames.push(advice.recommendedCaptain.player.name);
      for (const alt of advice.alternativeVCs || []) {
        if (alt.player?.name) captainNames.push(alt.player.name);
      }
      for (const alt of advice.alternativeCaptains || []) {
        if (alt.player?.name) captainNames.push(alt.player.name);
      }

      const newsWarnings = await checkPlayersAgainstNews([...new Set(captainNames)], currentRound);

      const attachWarnings = (rec: { player: any; reasons: string[] } | null) => {
        if (!rec?.player?.name) return;
        const warnings = newsWarnings.get(rec.player.name);
        if (warnings && warnings.length > 0) {
          for (const w of warnings) {
            rec.reasons.push(formatNewsWarningForReason(w));
          }
        }
      };

      attachWarnings(advice.recommendedVC);
      attachWarnings(advice.recommendedCaptain);
      for (const alt of advice.alternativeVCs || []) attachWarnings(alt);
      for (const alt of advice.alternativeCaptains || []) attachWarnings(alt);

      const newsWarningsList: NewsWarning[] = [];
      for (const [, warnings] of newsWarnings) {
        newsWarningsList.push(...warnings);
      }
      (advice as any).newsWarnings = newsWarningsList;

      res.json(advice);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/loophole-decision", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const myTeam = await storage.getMyTeam(uid);
      if (myTeam.length === 0) return res.status(400).json({ message: "No team set up" });

      const settings = await storage.getSettings(uid);
      const currentRound = settings?.currentRound ?? 0;
      const liveData = await getLiveRoundData(currentRound, uid);

      const vcTeamEntry = myTeam.find(p => p.isViceCaptain);
      const captainTeamEntry = myTeam.find(p => p.isCaptain);
      if (!vcTeamEntry || !captainTeamEntry) {
        return res.json({ action: "keep_captain", confidence: 0, reason: "Set both a Captain and Vice-Captain in the official app first.", vcScore: 0, captainProjectedFloor: 0, captainProjectedCeiling: 0, captainTogRisk: false, captainAvailable: true });
      }

      const vcLive = liveData.myTeamScores.find(s => s.playerId === vcTeamEntry.id);
      const captainLive = liveData.myTeamScores.find(s => s.playerId === captainTeamEntry.id);
      if (!vcLive || !captainLive) {
        return res.json({ action: "keep_captain", confidence: 0, reason: "Live scores not yet available — check back once games begin.", vcScore: 0, captainProjectedFloor: 0, captainProjectedCeiling: 0, captainTogRisk: false, captainAvailable: true });
      }

      if (vcLive.matchStatus !== "complete") {
        return res.json({ action: "keep_captain", confidence: 0, reason: `VC ${vcTeamEntry.name}'s game is still ${vcLive.matchStatus} — wait until it finishes for a loophole decision.`, vcScore: vcLive.fantasyScore, captainProjectedFloor: 0, captainProjectedCeiling: 0, captainTogRisk: false, captainAvailable: true });
      }

      const decision = tradeEngine.getLiveLoopholeDecision(
        vcTeamEntry,
        vcLive.fantasyScore,
        vcLive.timeOnGround,
        captainTeamEntry,
        captainLive.matchStatus as "upcoming" | "live" | "complete",
      );
      res.json(decision);
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

  app.post("/api/season-plan/generate", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const settings = await storage.getSettings(uid);
      const myTeam = await storage.getMyTeam(uid);
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

  app.post("/api/season-plan/build-team", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const result = await buildOptimalTeam();
      await storage.replaceMyTeam(uid, result.teamPlayers.map(p => ({
        playerId: p.id,
        isOnField: p.isOnField,
        isCaptain: false,
        isViceCaptain: false,
        fieldPosition: p.fieldPosition,
      })));
      const settings = await storage.getSettings(uid);
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
        const myTeam = await storage.getMyTeam(uid);
        const captainEntry = myTeam.find(p => p.id === bestScorer.id);
        if (captainEntry?.myTeamPlayerId) {
          await storage.setCaptain(uid, captainEntry.myTeamPlayerId);
        }
        if (secondBest) {
          const vcEntry = myTeam.find(p => p.id === secondBest.id);
          if (vcEntry?.myTeamPlayerId) {
            await storage.setViceCaptain(uid, vcEntry.myTeamPlayerId);
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

  app.get("/api/dream-team/reverse-engineer", async (_req, res) => {
    try {
      const result = await buildDreamTeamReverse();
      res.json(result);
    } catch (error: any) {
      console.error("[DreamTeam] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/dream-team/activate-starting", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const result = await buildDreamTeamReverse();
      await storage.replaceMyTeam(uid, result.startingTeam.map(p => ({
        playerId: p.id,
        isOnField: p.isOnField,
        isCaptain: false,
        isViceCaptain: false,
        fieldPosition: p.fieldPosition,
      })));
      res.json({ success: true, teamSize: result.startingTeam.length, cost: result.startingTeamCost });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/data/refresh", async (_req, res) => {
    try {
      const { runManualRefresh } = await import("./scheduler");
      const result = await runManualRefresh();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/settings", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const settings = await storage.getSettings(uid);
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/game-rules", (_req, res) => {
    res.json(gameRules);
  });

  app.get("/api/team-sheet-status", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const userSettings = await storage.getSettings(uid);
      const currentRound = userSettings?.currentRound ?? 0;

      const { checkTeamLineupStatus } = await import("./services/afl-lineup-scraper");
      const data = await checkTeamLineupStatus(currentRound);

      res.json({
        round: currentRound,
        announced: data.announcedTeams.sort(),
        notAnnounced: data.pendingTeams.sort(),
        byeTeams: data.byeTeams.sort(),
        allAnnounced: data.pendingTeams.length === 0,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
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
      const uid = getEffectiveUserId(req);
      const updated = await storage.updateSettings(uid, data);
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

  app.post("/api/intel/generate", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const { generateIntelReports } = await import("./intel-engine");
      await generateIntelReports(uid);
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
      const uid = getEffectiveUserId(req);
      const settings = await storage.getSettings(uid);
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

  app.get("/api/captain-advice", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const { generateCaptainAdvice } = await import("./intel-engine");
      const advice = await generateCaptainAdvice(uid);
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

  app.post("/api/parse-team-text", async (req, res) => {
    try {
      const { text } = req.body as { text: string };
      if (!text || text.trim().length < 20) {
        return res.status(400).json({ message: "Please paste your team list text" });
      }

      const lines = text.split("\n").map(l => l.trim());

      interface ParsedPlayer {
        name: string;
        position: string;
        price?: number;
        isOnField?: boolean;
        isCaptain?: boolean;
        isViceCaptain?: boolean;
        isEmergency?: boolean;
      }

      const players: ParsedPlayer[] = [];

      let currentSection = "";
      let sectionOnFieldCount = 0;
      let sectionBenchCount = 0;
      let sectionPlayerIndex = 0;

      const sectionHeaderRe = /^(DEF|MID|RUC|FWD)\s+section\s+with\s+(\d+)\s+lineup\s+players?\s+and\s+(\d+)\s+bench/i;
      const utilityHeaderRe = /utility\s+position\s+section/i;
      const playerLineRe = /^Player\s+.+\s+in\s+(Defender|Midfielder|Ruck|Forward|Utility)\s+position/i;
      const statusLineRe = /^(uncertain|injured|captain|vice-?captain|emergency)?([A-Z])\.\s*(.+)$/;
      const priceRe = /^\$([0-9,.]+)(k|m)$/i;
      const posCodeRe = /^(DEF|MID|RUC|FWD|D\/M|F\/M|R\/D|R\/F|D\/F|M\/F|F\/D|M\/D)$/i;

      const posMap: Record<string, string> = {
        "defender": "DEF", "midfielder": "MID", "ruck": "RUC", "forward": "FWD", "utility": "UTIL",
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const sectionMatch = line.match(sectionHeaderRe);
        if (sectionMatch) {
          currentSection = sectionMatch[1].toUpperCase();
          sectionOnFieldCount = parseInt(sectionMatch[2]);
          sectionBenchCount = parseInt(sectionMatch[3]);
          sectionPlayerIndex = 0;
          continue;
        }

        if (utilityHeaderRe.test(line)) {
          currentSection = "UTIL";
          sectionOnFieldCount = 0;
          sectionBenchCount = 1;
          sectionPlayerIndex = 0;
          continue;
        }

        const playerMatch = line.match(playerLineRe);
        if (playerMatch) {
          const posWord = playerMatch[1].toLowerCase();
          const fallbackPos = posMap[posWord] || currentSection || "MID";

          const window = lines.slice(i + 1, Math.min(i + 8, lines.length)).filter(l => l !== "");

          let playerName = "";
          let pos = fallbackPos;
          let price: number | undefined;
          let isCaptain = false;
          let isViceCaptain = false;
          let isEmergency = false;

          for (const wl of window) {
            if (!playerName && !wl.startsWith("$") && !wl.match(posCodeRe) && !wl.match(priceRe)
                && !wl.startsWith("Player ") && !wl.match(/^[+-]?\$/) && !wl.match(/^\d/) && !wl.match(sectionHeaderRe)
                && wl.length > 2 && wl.includes(" ")) {
              playerName = wl;
              continue;
            }

            if (wl.match(/^(uncertain|injured|captain|vice|emergency)/i)) {
              const lower = wl.toLowerCase();
              if (lower.startsWith("captain")) isCaptain = true;
              if (lower.startsWith("vice")) isViceCaptain = true;
              if (lower.startsWith("emergency")) isEmergency = true;
              continue;
            }

            const pcm = wl.match(posCodeRe);
            if (pcm) {
              const code = pcm[1].toUpperCase();
              if (code === "D/M" || code === "M/D") pos = currentSection === "DEF" ? "DEF" : "MID";
              else if (code === "F/M" || code === "M/F") pos = currentSection === "FWD" ? "FWD" : "MID";
              else if (code === "R/D" || code === "D/R") pos = currentSection === "RUC" ? "RUC" : "DEF";
              else if (code === "R/F" || code === "F/R") pos = currentSection === "RUC" ? "RUC" : "FWD";
              else if (code === "D/F" || code === "F/D") pos = currentSection === "DEF" ? "DEF" : "FWD";
              else pos = code;
              continue;
            }

            const pm = wl.match(priceRe);
            if (pm && !price) {
              const val = parseFloat(pm[1].replace(",", ""));
              price = pm[2].toLowerCase() === "m" ? Math.round(val * 1000000) : Math.round(val * 1000);
              break;
            }
          }

          if (!playerName) continue;

          if (currentSection === "UTIL") pos = "UTIL";

          const isOnField = currentSection === "UTIL"
            ? false
            : sectionPlayerIndex < sectionOnFieldCount;

          sectionPlayerIndex++;

          players.push({
            name: playerName,
            position: pos,
            price,
            isOnField,
            isCaptain,
            isViceCaptain,
            isEmergency,
          });
        }
      }

      if (players.length === 0) {
        return res.status(400).json({ message: "Could not identify any players from the pasted text. Make sure you copy the full team list from AFL Fantasy." });
      }

      console.log(`[TextParser] Parsed ${players.length} players from pasted text`);

      res.json({
        players,
        analysis: `Parsed ${players.length} players from your team list. ${players.filter(p => p.isOnField).length} on-field, ${players.filter(p => !p.isOnField).length} on bench.`,
        recommendations: [],
        captainTip: "",
        tradeSuggestions: [],
        captainName: players.find(p => p.isCaptain)?.name || null,
        viceCaptainName: players.find(p => p.isViceCaptain)?.name || null,
      });
    } catch (error: any) {
      console.error("Text parse error:", error.message);
      res.status(500).json({ message: "Failed to parse team text" });
    }
  });

  app.post("/api/my-team/save-from-analyzer", async (req, res) => {
    try {
      const { players: identifiedPlayers, captainName, viceCaptainName } = req.body as {
        players: { name: string; team?: string; position: string; price?: number; isCaptain?: boolean; isViceCaptain?: boolean; isEmergency?: boolean; isOnField?: boolean }[];
        captainName?: string | null;
        viceCaptainName?: string | null;
      };
      if (!identifiedPlayers || identifiedPlayers.length === 0) {
        return res.status(400).json({ message: "No players identified to save" });
      }

      const uid = getEffectiveUserId(req);
      const allPlayers = await storage.getAllPlayers();

      const posMap: Record<string, string> = {
        DEF: "DEF", DEFENDER: "DEF", BACK: "DEF",
        MID: "MID", MIDFIELDER: "MID",
        RUC: "RUC", RUCK: "RUC",
        FWD: "FWD", FORWARD: "FWD",
        UTIL: "UTIL", UTILITY: "UTIL",
        "D/M": "DEF", "M/D": "MID", "F/M": "FWD", "M/F": "MID",
        "R/D": "RUC", "R/F": "RUC", "D/F": "DEF", "F/D": "FWD",
        "D/R": "DEF", "F/R": "FWD",
      };

      const notFound: string[] = [];

      const hasAiFieldData = identifiedPlayers.some(p => p.isOnField !== undefined);

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

      const stripInitialDot = (s: string) => s.replace(/\.$/, "");

      const normalizeTeam = (t: string) => t?.trim().toLowerCase().replace(/[^a-z]/g, "") || "";

      type MatchResult = { match: typeof allPlayers[0]; ambiguous?: false } | { match: typeof allPlayers[0]; ambiguous: true; candidates: typeof allPlayers };

      const fuzzyMatchPlayer = (inputName: string, players: typeof allPlayers, inputTeam?: string, inputPrice?: number): MatchResult | null => {
        const normalName = inputName.trim().toLowerCase().replace(/[''`]/g, "'");

        const exact = players.find(p => p.name.toLowerCase() === normalName);
        if (exact) return { match: exact };

        const inputParts = normalName.split(/\s+/);
        const inputSurname = inputParts[inputParts.length - 1];
        const inputFirst = stripInitialDot(inputParts[0]);
        const isInitial = inputFirst.length <= 2;
        const inputTeamNorm = normalizeTeam(inputTeam || "");

        const narrowByTeam = (candidates: typeof allPlayers): typeof allPlayers[0] | null => {
          if (!inputTeamNorm || candidates.length <= 1) return null;
          const tm = candidates.find(p => {
            const pt = normalizeTeam(p.team);
            return pt === inputTeamNorm || pt.includes(inputTeamNorm) || inputTeamNorm.includes(pt);
          });
          return tm || null;
        };

        const narrowByPrice = (candidates: typeof allPlayers): typeof allPlayers[0] | null => {
          if (!inputPrice || inputPrice <= 0 || candidates.length <= 1) return null;
          const withDiffs = candidates.map(p => ({ player: p, diff: Math.abs(p.price - inputPrice) }));
          withDiffs.sort((a, b) => a.diff - b.diff);
          if (withDiffs[0].diff < 10000 && (withDiffs.length === 1 || withDiffs[1].diff > withDiffs[0].diff * 3)) {
            return withDiffs[0].player;
          }
          return null;
        };

        const surnameMatches = players.filter(p => {
          const parts = p.name.toLowerCase().split(" ");
          return parts[parts.length - 1] === inputSurname;
        });

        if (surnameMatches.length === 1) return { match: surnameMatches[0] };

        if (surnameMatches.length > 1) {
          const byTeam = narrowByTeam(surnameMatches);
          if (byTeam) return { match: byTeam };

          const firstMatch = surnameMatches.filter(p => {
            const pFirst = p.name.toLowerCase().split(/\s+/)[0];
            if (isInitial) return pFirst.startsWith(inputFirst);
            return pFirst.startsWith(inputFirst.substring(0, 2)) || inputFirst.startsWith(pFirst.substring(0, 2));
          });
          if (firstMatch.length === 1) return { match: firstMatch[0] };
          if (firstMatch.length > 1) {
            const byPrice = narrowByPrice(firstMatch);
            if (byPrice) return { match: byPrice };
            const byTeam2 = narrowByTeam(firstMatch);
            if (byTeam2) return { match: byTeam2 };
            return { match: firstMatch[0], ambiguous: true, candidates: firstMatch };
          }
          const byPrice = narrowByPrice(surnameMatches);
          if (byPrice) return { match: byPrice };
          return { match: surnameMatches[0], ambiguous: true, candidates: surnameMatches };
        }

        if (isInitial && inputParts.length >= 2) {
          const initialMatch = players.filter(p => {
            const pParts = p.name.toLowerCase().split(/\s+/);
            const pSurname = pParts[pParts.length - 1];
            const pFirst = pParts[0];
            return pFirst.startsWith(inputFirst) && levenshtein(pSurname, inputSurname) <= 2;
          });
          if (initialMatch.length === 1) return { match: initialMatch[0] };
          if (initialMatch.length > 1) {
            const byTeam = narrowByTeam(initialMatch);
            if (byTeam) return { match: byTeam };
            const byPrice = narrowByPrice(initialMatch);
            if (byPrice) return { match: byPrice };
            return { match: initialMatch[0], ambiguous: true, candidates: initialMatch };
          }
        }

        const fuzzySurnameMatches = players.filter(p => {
          const pSurname = p.name.toLowerCase().split(/\s+/).pop() || "";
          return levenshtein(pSurname, inputSurname) <= 2;
        });
        if (fuzzySurnameMatches.length === 1) return { match: fuzzySurnameMatches[0] };
        if (fuzzySurnameMatches.length > 1) {
          const best = fuzzySurnameMatches.reduce((b, p) => {
            const pFirst = p.name.toLowerCase().split(/\s+/)[0];
            const firstScore = pFirst.startsWith(inputFirst) ? 0 : levenshtein(pFirst, inputFirst);
            return firstScore < b.dist ? { player: p, dist: firstScore } : b;
          }, { player: fuzzySurnameMatches[0], dist: Infinity });
          return { match: best.player };
        }

        const teamFiltered = inputTeamNorm ? players.filter(p => {
          const pt = normalizeTeam(p.team);
          return pt === inputTeamNorm || pt.includes(inputTeamNorm) || inputTeamNorm.includes(pt);
        }) : [];
        if (teamFiltered.length > 0) {
          let bestTeamMatch: typeof allPlayers[0] | null = null;
          let bestTeamDist = Infinity;
          for (const p of teamFiltered) {
            const dist = levenshtein(p.name.toLowerCase(), normalName);
            if (dist < bestTeamDist) { bestTeamDist = dist; bestTeamMatch = p; }
          }
          if (bestTeamMatch && bestTeamDist <= Math.max(4, Math.floor(normalName.length * 0.4))) {
            return { match: bestTeamMatch };
          }
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
        if (bestMatch && bestDist <= Math.max(3, Math.floor(normalName.length * 0.35))) return { match: bestMatch };

        return null;
      };

      const ambiguousPlayers: { inputName: string; position: string; team?: string; isOnField?: boolean; isCaptain?: boolean; isViceCaptain?: boolean; isEmergency?: boolean; candidates: { id: number; name: string; team: string; position: string; avgScore: number | null; price: number | null }[] }[] = [];

      for (const ip of identifiedPlayers) {
        const result = fuzzyMatchPlayer(ip.name, allPlayers, ip.team, ip.price);

        if (!result) {
          console.log(`[save-from-analyzer] No match found for: "${ip.name}" (team: ${ip.team || "none"}, price: ${ip.price || "none"})`);
          notFound.push(ip.name);
          continue;
        }
        console.log(`[save-from-analyzer] Matched "${ip.name}" → "${result.match.name}" (${result.match.team})${result.ambiguous ? " [AMBIGUOUS]" : ""}`);

        if (result.ambiguous) {
          ambiguousPlayers.push({
            inputName: ip.name,
            position: ip.position,
            team: ip.team,
            isOnField: ip.isOnField,
            isCaptain: ip.isCaptain,
            isViceCaptain: ip.isViceCaptain,
            isEmergency: ip.isEmergency,
            candidates: result.candidates.map(c => ({
              id: c.id,
              name: c.name,
              team: c.team || "Unknown",
              position: c.position || "MID",
              avgScore: c.avgScore,
              price: c.price,
            })),
          });
          continue;
        }

        const posRaw = (ip.position || result.match.position || "MID").toUpperCase().trim().replace(/\s*\/\s*/g, "/");
        const fieldPos = posMap[posRaw] || "MID";
        resolvedPlayers.push({ match: result.match, fieldPos, ip });
      }

      if (ambiguousPlayers.length > 0) {
        return res.json({
          success: false,
          needsDisambiguation: true,
          ambiguous: ambiguousPlayers,
          resolvedCount: resolvedPlayers.length,
          notFound,
        });
      }

      const hasReliableFieldData = hasAiFieldData && resolvedPlayers.some(({ ip }) => ip.isOnField === true);

      if (!hasReliableFieldData) {
        resolvedPlayers.sort((a, b) => (b.match.avgScore || 0) - (a.match.avgScore || 0));
      }

      const teamEntriesToSave = resolvedPlayers.map(({ match, fieldPos, ip }) => {
        let isOnField = false;
        let assignedFieldPos = fieldPos;

        if (assignedFieldPos === "UTIL") {
          isOnField = false;
        } else if (hasReliableFieldData) {
          isOnField = ip.isOnField !== false;
        } else if (ip.isEmergency) {
          isOnField = false;
        } else if (totalOnField >= maxOnField) {
          isOnField = false;
        } else {
          const quota = posQuotas[fieldPos];
          if (quota && posFieldCount[fieldPos] < quota.onField) {
            isOnField = true;
            posFieldCount[fieldPos]++;
            totalOnField++;
          } else {
            isOnField = false;
          }
        }

        const playerIsCaptain = ip.isCaptain ||
          (captainName && match.name.toLowerCase() === captainName.toLowerCase()) ||
          (captainName && match.name.toLowerCase().split(" ").pop() === captainName.toLowerCase().split(" ").pop());

        const playerIsVC = ip.isViceCaptain ||
          (viceCaptainName && match.name.toLowerCase() === viceCaptainName.toLowerCase()) ||
          (viceCaptainName && match.name.toLowerCase().split(" ").pop() === viceCaptainName.toLowerCase().split(" ").pop());

        return {
          playerId: match.id,
          isOnField,
          isCaptain: !!playerIsCaptain,
          isViceCaptain: !!playerIsVC,
          fieldPosition: assignedFieldPos,
        };
      });

      await storage.replaceMyTeam(uid, teamEntriesToSave);

      const team = await storage.getMyTeam(uid);
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

  app.post("/api/my-team/analyze", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const myTeam = await storage.getMyTeam(uid);
      if (myTeam.length === 0) {
        return res.status(400).json({ message: "Add players to your team first" });
      }
      const { analyzeMyTeam } = await import("./intel-engine");
      const analysis = await analyzeMyTeam(uid);
      res.json(analysis);
    } catch (error: any) {
      console.error("Team analysis error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/players/:id/detailed-stats", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid player ID" });
      const player = await storage.getPlayer(id);
      if (!player) return res.status(404).json({ message: "Player not found" });

      const stats = await db.select().from(weeklyStats).where(eq(weeklyStats.playerId, id)).orderBy(weeklyStats.round);

      const { fixtures: fixturesTable } = await import("@shared/schema");
      const allFixtures = await db.select().from(fixturesTable).where(eq(fixturesTable.year, 2026)).orderBy(fixturesTable.round);
      const teamFixtures = allFixtures.filter(f =>
        f.homeTeam === player.team || f.awayTeam === player.team
      );

      const upcomingFixtures = teamFixtures
        .filter(f => !f.complete)
        .map(f => ({
          round: f.round,
          opponent: f.homeTeam === player.team ? f.awayTeam : f.homeTeam,
          venue: f.venue,
          date: f.date,
          localTime: f.localTime,
          isHome: f.homeTeam === player.team,
        }));

      const opponentAgg: Record<string, { games: number; totalScore: number; kicks: number; handballs: number; marks: number; tackles: number; hitouts: number; goals: number; behinds: number; freesAgainst: number }> = {};
      const venueAgg: Record<string, { games: number; totalScore: number; kicks: number; handballs: number; marks: number; tackles: number; hitouts: number; goals: number; behinds: number; freesAgainst: number }> = {};

      for (const s of stats) {
        const opp = s.opponent || "Unknown";
        const ven = s.venue || "Unknown";
        for (const [key, agg] of [[opp, opponentAgg], [ven, venueAgg]] as const) {
          if (!(agg as any)[key]) {
            (agg as any)[key] = { games: 0, totalScore: 0, kicks: 0, handballs: 0, marks: 0, tackles: 0, hitouts: 0, goals: 0, behinds: 0, freesAgainst: 0 };
          }
          const a = (agg as any)[key];
          a.games++;
          a.totalScore += s.fantasyScore || 0;
          a.kicks += s.kickCount || 0;
          a.handballs += s.handballCount || 0;
          a.marks += s.markCount || 0;
          a.tackles += s.tackleCount || 0;
          a.hitouts += s.hitouts || 0;
          a.goals += s.goalsKicked || 0;
          a.behinds += s.behindsKicked || 0;
          a.freesAgainst += s.freesAgainst || 0;
        }
      }

      const formatAgg = (agg: Record<string, any>) => {
        return Object.entries(agg).map(([name, d]) => ({
          name,
          games: d.games,
          avgScore: Math.round((d.totalScore / d.games) * 10) / 10,
          kicks: Math.round((d.kicks / d.games) * 10) / 10,
          handballs: Math.round((d.handballs / d.games) * 10) / 10,
          marks: Math.round((d.marks / d.games) * 10) / 10,
          tackles: Math.round((d.tackles / d.games) * 10) / 10,
          hitouts: Math.round((d.hitouts / d.games) * 10) / 10,
          goals: Math.round((d.goals / d.games) * 10) / 10,
          behinds: Math.round((d.behinds / d.games) * 10) / 10,
          freesAgainst: Math.round((d.freesAgainst / d.games) * 10) / 10,
        })).sort((a, b) => b.avgScore - a.avgScore);
      };

      let runningTotal = 0;
      const matchHistory = stats.map((s, i) => {
        runningTotal += s.fantasyScore || 0;
        const gamesPlayed = i + 1;
        return {
          round: s.round,
          opponent: s.opponent,
          venue: s.venue,
          score: s.fantasyScore,
          avg: Math.round((runningTotal / gamesPlayed) * 10) / 10,
          avgSince: Math.round((runningTotal / gamesPlayed) * 10) / 10,
          total: runningTotal,
          tog: s.timeOnGroundPercent,
          kicks: s.kickCount,
          handballs: s.handballCount,
          marks: s.markCount,
          tackles: s.tackleCount,
          hitouts: s.hitouts,
          goals: s.goalsKicked,
          behinds: s.behindsKicked,
          freesAgainst: s.freesAgainst,
          inside50s: s.inside50s,
          rebound50s: s.rebound50s,
          contestedPoss: s.contestedPossessions,
          uncontestedPoss: s.uncontestedPossessions,
          cba: s.centreBounceAttendancePercent,
        };
      });

      const highestScore = stats.length > 0 ? Math.max(...stats.map(s => s.fantasyScore || 0)) : null;
      const lowestScore = stats.length > 0 ? Math.min(...stats.map(s => s.fantasyScore || 0)) : null;
      const totalPoints = stats.reduce((sum, s) => sum + (s.fantasyScore || 0), 0);
      const pricePerPoint = totalPoints > 0 ? Math.round(player.price / totalPoints) : null;
      const roundPriceChange = player.priceChange || 0;
      const seasonPriceChange = player.startingPrice ? player.price - player.startingPrice : 0;

      const effectiveUserId = getEffectiveUserId(req);
      const settings = await storage.getSettings(effectiveUserId);
      const currentRound = settings?.currentRound ?? 0;

      const projectedPriceChange = (() => {
        const proj = player.projectedScore || 0;
        const be = player.breakEven || 0;
        if (proj === 0 || be === 0) return null;
        const startP = player.startingPrice || player.price;
        const magicPerPoint = startP / 10490;
        return Math.round((proj - be) * magicPerPoint * 1000) / 1000;
      })();

      const lastRoundPlayed = stats.length > 0 ? stats[stats.length - 1].round : null;

      res.json({
        player,
        matchHistory,
        upcomingFixtures,
        opponentBreakdown: formatAgg(opponentAgg),
        venueBreakdown: formatAgg(venueAgg),
        currentRound,
        lastRoundPlayed,
        overview: {
          highestScore,
          lowestScore,
          totalPoints,
          pricePerPoint,
          roundPriceChange,
          seasonPriceChange,
          projectedPriceChange,
        },
      });
    } catch (error: any) {
      console.error("Player detailed stats error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/players/:id/report", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid player ID" });
      const player = await storage.getPlayer(id);
      if (!player) return res.status(404).json({ message: "Player not found" });
      const uid = getEffectiveUserId(req);
      const { generatePlayerReport } = await import("./intel-engine");
      const report = await generatePlayerReport(uid, id);
      res.json({ player, report });
    } catch (error: any) {
      console.error("Player report error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/intel/gather", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const { gatherIntelligence } = await import("./data-gatherer");
      const result = await gatherIntelligence(uid);
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

  app.post("/api/intel/pre-game", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const { generatePreGameAdvice } = await import("./data-gatherer");
      const advice = await generatePreGameAdvice(uid);
      res.json(advice);
    } catch (error: any) {
      console.error("Pre-game advice error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/player-alerts", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const unreadOnly = req.query.unreadOnly === "true";
      const alerts = await storage.getPlayerAlerts(uid, unreadOnly);
      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/player-alerts/count", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const count = await storage.getUnreadAlertCount(uid);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/player-alerts/:id/read", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      await storage.markAlertRead(uid, parseIntParam(req.params.id, "alert id"));
      res.json({ success: true });
    } catch (error: any) {
      handleRouteError(res, error);
    }
  });

  app.post("/api/player-alerts/read-all", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      await storage.markAllAlertsRead(uid);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/player-alerts/check", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const { generatePlayerAlerts } = await import("./alert-generator");
      const newAlerts = await generatePlayerAlerts(uid);
      res.json({ generated: newAlerts });
    } catch (error: any) {
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

  app.post("/api/trade-recommendations/generate-ai", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const { generateAITradeRecommendations } = await import("./intel-engine");
      await generateAITradeRecommendations(uid);
      const recs = await storage.getTradeRecommendations(uid);
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

  app.get("/api/fixtures/:round/match-synopsis", async (req, res) => {
    try {
      const round = parseInt(req.params.round);
      const homeTeam = req.query.home as string;
      const awayTeam = req.query.away as string;
      if (!homeTeam || !awayTeam) {
        return res.status(400).json({ message: "home and away query params are required" });
      }

      const matchPlayers = await db
        .select()
        .from(players)
        .where(inArray(players.team, [homeTeam, awayTeam]));

      const playerIds = matchPlayers.map(p => p.id);
      let stats: any[] = [];
      if (playerIds.length > 0) {
        stats = await db
          .select()
          .from(weeklyStats)
          .where(and(inArray(weeklyStats.playerId, playerIds), eq(weeklyStats.round, round)));
      }

      if (stats.length === 0) {
        return res.json({
          synopsis: "No stats available yet for this match. Check back once the game has been played.",
          topPerformers: [],
          keyObservations: [],
          highlightsUrl: null,
        });
      }

      const statsMap = new Map(stats.map(s => [s.playerId, s]));
      const playerStats = matchPlayers
        .filter(p => statsMap.has(p.id))
        .map(p => {
          const s = statsMap.get(p.id)!;
          return {
            name: p.name,
            team: p.team,
            position: p.position,
            dualPosition: p.dualPosition,
            avgScore: p.avgScore,
            fantasyScore: s.fantasyScore,
            kicks: s.kickCount ?? 0,
            handballs: s.handballCount ?? 0,
            marks: s.markCount ?? 0,
            tackles: s.tackleCount ?? 0,
            hitouts: s.hitouts ?? 0,
            goals: s.goalsKicked ?? 0,
            behinds: s.behindsKicked ?? 0,
            tog: s.timeOnGroundPercent,
            cba: s.centreBounceAttendancePercent,
            i50: s.inside50s ?? 0,
            r50: s.rebound50s ?? 0,
            contestedPoss: s.contestedPossessions ?? 0,
            uncontestedPoss: s.uncontestedPossessions ?? 0,
            freesAgainst: s.freesAgainst ?? 0,
            subFlag: s.subFlag,
            scoreDiff: p.avgScore ? Math.round(s.fantasyScore - p.avgScore) : null,
          };
        })
        .sort((a, b) => b.fantasyScore - a.fantasyScore);

      const homeStats = playerStats.filter(p => p.team === homeTeam);
      const awayStats = playerStats.filter(p => p.team === awayTeam);

      const topPerformers = playerStats.slice(0, 6).map(p => ({
        name: p.name,
        team: p.team,
        position: p.position,
        score: p.fantasyScore,
        scoreDiff: p.scoreDiff,
        subFlag: p.subFlag,
      }));

      const prompt = `You are an expert AFL Fantasy analyst. Analyse this match from a FANTASY FOOTBALL perspective.

Match: ${homeTeam} vs ${awayTeam} (Round ${round})

HOME TEAM (${homeTeam}) player stats:
${homeStats.map(p => `${p.name} (${p.position}${p.dualPosition ? '/' + p.dualPosition : ''}): ${p.fantasyScore}pts (avg ${p.avgScore?.toFixed(0) ?? '?'}, diff ${p.scoreDiff ? (p.scoreDiff >= 0 ? '+' : '') + p.scoreDiff : '?'}) | K${p.kicks} H${p.handballs} M${p.marks} T${p.tackles} G${p.goals}.${p.behinds} | TOG:${p.tog ? p.tog.toFixed(0) + '%' : '?'} CBA:${p.cba ? p.cba.toFixed(0) + '%' : '?'} | CP:${p.contestedPoss} UP:${p.uncontestedPoss}${p.hitouts ? ' HO:' + p.hitouts : ''}${p.subFlag ? ' [SUBBED/INJURED]' : ''}`).join('\n')}

AWAY TEAM (${awayTeam}) player stats:
${awayStats.map(p => `${p.name} (${p.position}${p.dualPosition ? '/' + p.dualPosition : ''}): ${p.fantasyScore}pts (avg ${p.avgScore?.toFixed(0) ?? '?'}, diff ${p.scoreDiff ? (p.scoreDiff >= 0 ? '+' : '') + p.scoreDiff : '?'}) | K${p.kicks} H${p.handballs} M${p.marks} T${p.tackles} G${p.goals}.${p.behinds} | TOG:${p.tog ? p.tog.toFixed(0) + '%' : '?'} CBA:${p.cba ? p.cba.toFixed(0) + '%' : '?'} | CP:${p.contestedPoss} UP:${p.uncontestedPoss}${p.hitouts ? ' HO:' + p.hitouts : ''}${p.subFlag ? ' [SUBBED/INJURED]' : ''}`).join('\n')}

Respond with a JSON object (no markdown) with these fields:
{
  "synopsis": "A 3-4 sentence summary of the match from a fantasy perspective — who dominated, key storylines, overall scoring environment",
  "keyObservations": [
    {
      "player": "Player Name",
      "team": "Team Name",
      "type": "role_change|injury|tag|breakout|bust|sub|watch",
      "observation": "One sentence describing the fantasy-relevant observation"
    }
  ]
}

Focus on:
- Players who scored WAY above or below average (breakout/bust)
- Players with sub flags (injured/subbed out) — flag these as needing monitoring
- Role changes: significant CBA% changes, position shifts, increased/decreased TOG
- Tagging: players with unusually low scores who may have been tagged
- Emerging cheapies or rookies who scored well
- Players with high frees-against (discipline issues)

Return 5-10 key observations, prioritised by fantasy relevance.`;

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const completion = await aiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 1200,
      });

      const raw = completion.choices[0]?.message?.content || "";
      let parsed: any;
      try {
        const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        parsed = { synopsis: raw, keyObservations: [] };
      }

      const highlightsUrl = `https://www.afl.com.au/video?tags=highlights&rounds=CD_R0260140${String(round).padStart(2, '0')}`;

      res.json({
        synopsis: parsed.synopsis || "",
        topPerformers,
        keyObservations: parsed.keyObservations || [],
        highlightsUrl,
      });
    } catch (error: any) {
      console.error("[MatchSynopsis] Error:", error.message);
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
      const uid = getEffectiveUserId(req);
      const round = req.query.round != null ? parseInt(req.query.round as string) : undefined;
      const data = await getLiveRoundData(round, uid);
      const { getSchedulerStatus: getStatus } = await import("./scheduler");
      const schedulerStatus = getStatus();
      data.lastUpdated = schedulerStatus.lastLiveFetchTime || data.lastUpdated;
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
      const uid = getEffectiveUserId(req);
      const homeTeam = req.query.homeTeam as string;
      const awayTeam = req.query.awayTeam as string;
      const round = req.query.round != null ? parseInt(req.query.round as string) : 0;
      if (!homeTeam || !awayTeam) {
        return res.status(400).json({ message: "homeTeam and awayTeam are required" });
      }
      const matchPlayers = await getMatchPlayers(homeTeam, awayTeam, round, uid);
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

  app.get("/api/live-scores/active-windows", async (req, res) => {
    try {
      const round = req.query.round != null ? parseInt(req.query.round as string) : undefined;
      const { getActiveGameWindows } = await import("./services/live-scores");
      const data = await getActiveGameWindows(round);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/league/opponents/:id/live-matchup", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const round = req.query.round != null ? parseInt(req.query.round as string) : undefined;
      const { getLiveH2HMatchup } = await import("./services/live-scores");
      const data = await getLiveH2HMatchup(uid, Number(req.params.id), round);
      if (!data) return res.status(404).json({ message: "Opponent not found or no squad data" });
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/my-team/risks", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const { getTagWarningsForTeam } = await import("./services/tag-intelligence");
      const team = await storage.getMyTeam(uid);
      if (team.length === 0) {
        return res.json({ alerts: [], swapSuggestions: [], tagWarnings: [] });
      }

      const onField = team.filter(p => p.isOnField);
      const bench = team.filter(p => !p.isOnField);
      const settings = await storage.getSettings(uid);
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

  app.post("/api/players/update-fixtures", isAdmin, async (req, res) => {
    try {
      const round = parseInt(req.body.round, 10) || 1;
      await fetchAndStoreFixtures();
      const updated = await syncPlayerFixtures(round);
      res.json({ updated, round, source: "squiggle" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/players/sync-prices", isAdmin, async (req, res) => {
    try {
      const { syncAflFantasyPrices } = await import("./expand-players");
      const result = await syncAflFantasyPrices();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/players/sync-footywire", isAdmin, async (req, res) => {
    try {
      const { fetchFootywireData } = await import("./services/footywire-scraper");
      const result = await fetchFootywireData();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/players/sync-afltables", isAdmin, async (req, res) => {
    try {
      const { fetchAflTablesHistoricalData } = await import("./services/afltables-scraper");
      const years = req.body.years || [2024, 2025];
      const result = await fetchAflTablesHistoricalData(years);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/simulate-round", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const { simulateRound } = await import("./services/simulation-engine");
      const team = await storage.getMyTeam(uid);
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
      const session = (req as any).session;
      session.impersonateUserId = req.params.id;
      res.json({ message: "Now impersonating user", user: targetUser[0] });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/stop-impersonation", isAuthenticated, async (req, res) => {
    try {
      const session = (req as any).session;
      if (!session.impersonateUserId) {
        return res.status(400).json({ message: "Not currently impersonating" });
      }
      delete session.impersonateUserId;
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

  app.post("/api/admin/tag-predictions/save", isAdmin, async (req, res) => {
    try {
      const { getTagWarningsForTeam, saveTagPredictions } = await import("./services/tag-intelligence");
      const uid = getEffectiveUserId(req);
      const settings = await storage.getSettings(uid);
      const currentRound = settings?.currentRound;
      if (!currentRound || currentRound < 1) {
        return res.status(400).json({ message: "Current round must be set to at least 1 before saving predictions" });
      }

      const team = await storage.getMyTeam(uid);
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
      const uid = getEffectiveUserId(req);
      const teams = await storage.getSavedTeams(uid);
      res.json(teams);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/saved-teams", async (req, res) => {
    try {
      const { name, description, source } = req.body;
      if (!name) return res.status(400).json({ message: "Team name is required" });
      const uid = getEffectiveUserId(req);
      const team = await storage.saveCurrentTeamAsVariant(uid, name, description || null, source || "manual");
      res.json(team);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/saved-teams/from-wizard", async (req, res) => {
    try {
      const { name, description } = req.body;
      const teamName = name || `AI Build ${new Date().toLocaleDateString()}`;

      const uid = getEffectiveUserId(req);
      const currentTeam = await storage.getMyTeam(uid);

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

      const team = await storage.createSavedTeam(uid, {
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
      const uid = getEffectiveUserId(req);
      const updated = await storage.updateSavedTeam(uid, Number(req.params.id), { name, description });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/saved-teams/:id", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      await storage.deleteSavedTeam(uid, Number(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/saved-teams/:id/activate", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      await storage.activateSavedTeam(uid, Number(req.params.id));
      res.json({ success: true, message: "Team activated and loaded" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/saved-teams/:id/compare", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const savedTeam = await storage.getSavedTeam(uid, Number(req.params.id));
      if (!savedTeam) return res.status(404).json({ message: "Team not found" });

      const currentTeam = await storage.getMyTeam(uid);
      const savedPlayers: Array<{ playerId: number; isOnField: boolean; isCaptain: boolean; isViceCaptain: boolean; fieldPosition: string }> = JSON.parse(savedTeam.playerData);
      const allPlayers = await storage.getAllPlayers();
      const playerMap = new Map(allPlayers.map(p => [p.id, p]));

      const currentIds = new Set(currentTeam.map(p => p.id));
      const savedIds = new Set(savedPlayers.map(p => p.playerId));

      const shared = Array.from(currentIds).filter(id => savedIds.has(id));
      const onlyInCurrent = Array.from(currentIds).filter(id => !savedIds.has(id)).map(id => {
        const p = playerMap.get(id);
        return p ? { id: p.id, name: p.name, position: p.position, avgScore: p.avgScore, price: p.price } : null;
      }).filter(Boolean);
      const onlyInSaved = Array.from(savedIds).filter(id => !currentIds.has(id)).map(id => {
        const p = playerMap.get(id);
        return p ? { id: p.id, name: p.name, position: p.position, avgScore: p.avgScore, price: p.price } : null;
      }).filter(Boolean);

      const currentValue = currentTeam.reduce((sum, p) => sum + p.price, 0);
      const currentProjected = currentTeam.filter(p => p.isOnField).reduce((sum, p) => sum + (p.avgScore || 0), 0);

      const currentAllPlayers = currentTeam.map(p => ({
        id: p.id, name: p.name, position: p.position, avgScore: p.avgScore, price: p.price,
        isOnField: p.isOnField, fieldPosition: p.fieldPosition, isUnique: !savedIds.has(p.id),
      }));
      const savedAllPlayers = savedPlayers.map(sp => {
        const p = playerMap.get(sp.playerId);
        return p ? {
          id: p.id, name: p.name, position: p.position, avgScore: p.avgScore, price: p.price,
          isOnField: sp.isOnField, fieldPosition: sp.fieldPosition, isUnique: !currentIds.has(p.id),
        } : null;
      }).filter(Boolean);

      res.json({
        currentTeam: { value: currentValue, projectedScore: Math.round(currentProjected), playerCount: currentTeam.length, players: currentAllPlayers },
        savedTeam: { value: savedTeam.teamValue, projectedScore: savedTeam.projectedScore, playerCount: savedPlayers.length, name: savedTeam.name, players: savedAllPlayers },
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
      const uid = getEffectiveUserId(req);
      const opponents = await storage.getLeagueOpponents(uid, leagueName);
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
      const uid = getEffectiveUserId(req);
      const opponent = await storage.createLeagueOpponent(uid, {
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
      const uid = getEffectiveUserId(req);
      const updated = await storage.updateLeagueOpponent(uid, Number(req.params.id), {
        opponentName, totalScore, lastRoundScore, notes, leagueName,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/league/opponents/:id", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      await storage.deleteLeagueOpponent(uid, Number(req.params.id));
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
      const uid = getEffectiveUserId(req);
      const { leagueName, teams } = bulkImportSchema.parse(req.body);

      const created = [];
      for (const team of teams) {
        const opponentName = team.managerName
          ? `${team.teamName} (${team.managerName})`
          : team.teamName;
        const opponent = await storage.createLeagueOpponent(uid, {
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

          const uid = getEffectiveUserId(req);
        await storage.updateLeagueOpponent(uid, Number(req.params.id), {
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
      const uid = getEffectiveUserId(req);
      const opponent = await storage.getLeagueOpponent(uid, Number(req.params.id));
      if (!opponent) return res.status(404).json({ message: "Opponent not found" });
      if (!opponent.playerData) return res.json({ message: "No squad data for this opponent. Upload a screenshot of their team." });

      const currentTeam = await storage.getMyTeam(uid);
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

  app.get("/api/weekly-plan", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const settings = await storage.getSettings(uid);
      const currentRound = settings?.currentRound || 1;
      const team = await storage.getMyTeam(uid);
      if (team.length === 0) {
        return res.json({ steps: [], round: currentRound, summary: "Set up your team to get your weekly plan." });
      }

      const onField = team.filter(p => p.isOnField);
      const bench = team.filter(p => !p.isOnField);
      const tradeRecs = await storage.getTradeRecommendations(uid);
      const pendingTrades = tradeRecs.filter(t => t.status === "pending");

      const captain = team.find(p => p.isCaptain);
      const viceCaptain = team.find(p => p.isViceCaptain);

      const gameRulesModule = await import("@shared/game-rules");
      const gameRules = gameRulesModule.AFL_FANTASY_CLASSIC_2026;
      const isByeRoundNow = gameRulesModule.isByeRound(currentRound);
      const maxTrades = gameRulesModule.getTradesForRound(currentRound);

      const longTermKeywords = ["season", "acl", "torn", "rupture", "surgery", "broken", "fracture", "delisted", "retired"];
      function isLongTermInjury(injuryStatus: string | null): boolean {
        if (!injuryStatus) return false;
        return longTermKeywords.some(s => injuryStatus.toLowerCase().includes(s));
      }
      function getTierLabel(price: number): string {
        if (price < 350000) return "Rookie";
        if (price < 700000) return "Mid-pricer";
        return "Premium";
      }
      function calcProjPriceChange(p: any): number | null {
        const proj = p.projectedScore || 0;
        const be = p.breakEven;
        const sp = p.startingPrice || p.price;
        if (be === null || be === undefined || !proj) return null;
        return Math.round((proj - be) * (sp / 10490));
      }
      function isCashCowGenerating(p: any): boolean {
        if ((p.price || 0) >= 400000) return false;
        const be = p.breakEven;
        if (be === null || be === undefined) return false;
        return be < (p.avgScore || 0);
      }

      const steps: { priority: "critical" | "important" | "suggested"; action: string; reason: string; link?: string }[] = [];

      const notPlayingOnField = onField.filter(p =>
        p.injuryStatus || p.lateChange || p.selectionStatus === "injured" ||
        p.selectionStatus === "not-playing" || p.selectionStatus === "omitted" ||
        p.byeRound === currentRound
      );

      const tradeSteps: { priority: "critical" | "important" | "suggested"; action: string; reason: string; link?: string; impactScore: number }[] = [];

      for (const p of notPlayingOnField) {
        const tierLabel = getTierLabel(p.price || 0);
        const statusText = p.injuryStatus || p.selectionStatus || "not playing";
        const onBye = p.byeRound === currentRound;
        const longTerm = isLongTermInjury(p.injuryStatus);
        const cashGen = isCashCowGenerating(p);
        const pChange = calcProjPriceChange(p);
        const pChangeStr = pChange !== null ? (pChange >= 0 ? `+$${(pChange / 1000).toFixed(0)}k` : `-$${Math.abs(pChange / 1000).toFixed(0)}k`) : null;

        if (onBye && !longTerm && !p.injuryStatus) {
          const benchCover = bench.find(b => {
            const bPositions = [b.position, b.dualPosition].filter(Boolean);
            return (p.fieldPosition === "UTIL" || bPositions.includes(p.fieldPosition || "")) &&
              b.byeRound !== currentRound && !b.injuryStatus &&
              b.selectionStatus !== "injured" && b.selectionStatus !== "not-playing";
          });
          if (benchCover) {
            steps.push({
              priority: "critical",
              action: `${p.name} — on bye. Swap ${benchCover.name} on-field`,
              reason: `${tierLabel} on bye this round. ${benchCover.name} (avg ${benchCover.avgScore?.toFixed(0)}) can cover at ${p.fieldPosition}.`,
              link: "/team",
            });
          } else {
            steps.push({
              priority: "suggested",
              action: `${p.name} — on bye (no bench cover)`,
              reason: `${tierLabel} on bye, no eligible bench swap. Returns next round.${cashGen && pChangeStr ? ` Still generating ${pChangeStr}/wk — don't waste a trade.` : ""}`,
              link: "/team",
            });
          }
          continue;
        }

        if (longTerm) {
          const impactScore = (p.avgScore || 0) + ((p.price || 0) >= 700000 ? 50 : 0);
          tradeSteps.push({
            priority: "critical",
            action: `Trade ${p.name} — ${statusText}`,
            reason: `${tierLabel} out long-term (${statusText}). ${(p.price || 0) < 350000 ? `Was $${((p.price || 0) / 1000).toFixed(0)}k — cash generation over.` : `Avg ${p.avgScore?.toFixed(0)}, $${((p.price || 0) / 1000).toFixed(0)}k — free up salary.`}`,
            link: "/trades",
            impactScore,
          });
          continue;
        }

        if (cashGen && (p.price || 0) < 350000) {
          let remainingValue = pChange && pChange > 0 ? Math.min(pChange * Math.min(24 - currentRound, 6), 200000) : 0;
          if (remainingValue === 0) {
            const avgAboveBe = (p.avgScore || 0) - (p.breakEven || 0);
            if (avgAboveBe > 0) {
              const approxWeeklyGain = avgAboveBe * ((p.startingPrice || p.price || 230000) / 10490);
              remainingValue = Math.min(approxWeeklyGain * Math.min(24 - currentRound, 6), 200000);
            }
          }
          if (remainingValue > 30000) {
            steps.push({
              priority: "important",
              action: `${p.name} — ${statusText} (hold for cash)`,
              reason: `Rookie cash cow (avg ${p.avgScore?.toFixed(0)}, BE ${p.breakEven}, ${pChangeStr || "growing"}) — still making money. ${p.selectionStatus === "injured" ? "Monitor injury timeline." : "Likely returns soon."} Move to bench and cover with a playing player.`,
              link: "/team",
            });
            continue;
          }
        }

        if ((p.price || 0) >= 700000 || (p.price || 0) >= 350000) {
          const benchCover = bench.find(b => {
            const bPositions = [b.position, b.dualPosition].filter(Boolean);
            return (p.fieldPosition === "UTIL" || bPositions.includes(p.fieldPosition || "")) &&
              !b.injuryStatus && b.selectionStatus !== "injured" && b.selectionStatus !== "not-playing" && b.byeRound !== currentRound;
          });
          if (benchCover && !isLongTermInjury(p.injuryStatus)) {
            steps.push({
              priority: "critical",
              action: `${p.name} — ${statusText}. Swap ${benchCover.name} on-field`,
              reason: `${tierLabel} (avg ${p.avgScore?.toFixed(0)}) not playing. ${benchCover.name} (avg ${benchCover.avgScore?.toFixed(0)}) can cover. ${p.selectionStatus === "injured" ? "Hold if short-term injury." : "Monitor status."}`,
              link: "/team",
            });
          } else {
            const impactScore = (p.avgScore || 0) + ((p.price || 0) >= 700000 ? 30 : 15);
            tradeSteps.push({
              priority: "critical",
              action: `Trade ${p.name} — ${statusText}`,
              reason: `${tierLabel} (avg ${p.avgScore?.toFixed(0)}, $${((p.price || 0) / 1000).toFixed(0)}k) not playing${benchCover ? "" : " with no bench cover"}. ${p.selectionStatus === "injured" ? "If extended, trade out." : "Trade for a playing replacement."}`,
              link: "/trades",
              impactScore,
            });
          }
          continue;
        }

        const impactScore = cashGen ? 5 : 20;
        tradeSteps.push({
          priority: cashGen ? "suggested" : "important",
          action: `${p.name} — ${statusText}`,
          reason: `${tierLabel} (avg ${p.avgScore?.toFixed(0)}, BE ${p.breakEven ?? "-"}, ${pChangeStr || "no projected growth"}). ${cashGen ? "Still generating some cash — consider holding." : "Not generating cash. Trade for an active player."}`,
          link: cashGen ? "/team" : "/trades",
          impactScore,
        });
      }

      tradeSteps.sort((a, b) => b.impactScore - a.impactScore);
      const effectiveTradeLimit = Math.min(maxTrades, settings?.tradesRemaining ?? maxTrades);
      let tradeCount = 0;
      for (const ts of tradeSteps) {
        if (tradeCount < effectiveTradeLimit) {
          steps.push({ priority: ts.priority, action: ts.action, reason: ts.reason, link: ts.link });
          tradeCount++;
        } else {
          steps.push({
            priority: "suggested",
            action: ts.action,
            reason: `(Over trade limit — ${effectiveTradeLimit} this round) ${ts.reason}`,
            link: ts.link,
          });
        }
      }

      if (isByeRoundNow) {
        const activeOnField = onField.filter(p => p.byeRound !== currentRound && !p.injuryStatus && p.selectionStatus !== "injured" && p.selectionStatus !== "not-playing");
        const best18Count = gameRules.best18.count;
        if (activeOnField.length < best18Count) {
          steps.push({
            priority: "critical",
            action: `Best-18 warning: Only ${activeOnField.length} active on-field players`,
            reason: `During bye rounds, only your top ${best18Count} on-field scores count. You have ${activeOnField.length} active — ${best18Count - activeOnField.length} below threshold.`,
            link: "/trades",
          });
        }

        const isEarlyBye = gameRulesModule.isEarlyByeRound(currentRound);
        if (isEarlyBye) {
          steps.push({
            priority: "suggested",
            action: `Early Bye round — ${maxTrades} trades available`,
            reason: `Rounds 2-4 are early bye rounds. Best-18 scoring applies. Prioritise structure and cash cow generation over aggressive moves.`,
            link: "/trades",
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
        const alreadyMentioned = new Set(notPlayingOnField.map(p => p.id));
        const coldOnField = onField
          .filter(p => !alreadyMentioned.has(p.id) && (p.gamesPlayed ?? 0) >= 3 && p.formTrend === "down" && (p.last3Avg || 0) < (p.avgScore || 0) * 0.8)
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

      const premiums = onField.filter(p => (p.price || 0) >= 700000).length + bench.filter(p => (p.price || 0) >= 700000).length;
      const cashCows = bench.filter(p => (p.price || 0) < 350000).length;
      const midPricers = team.length - premiums - cashCows;
      const topPlayers = [...team].sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0)).slice(0, 3);
      const topStr = topPlayers.map(p => `${p.name} (avg ${p.avgScore?.toFixed(0)})`).join(", ");
      const liveContext = `Your ${team.length}-player squad has ${premiums} premiums led by ${topStr}. ${cashCows} cash cows on bench. ${midPricers} mid-pricers.`;
      const finalContext = liveContext;

      const isEarlyByeNow = gameRulesModule.isEarlyByeRound(currentRound);
      const isRegularByeNow = gameRulesModule.isRegularByeRound(currentRound);
      const byeType = isEarlyByeNow ? "early" : isRegularByeNow ? "regular" : null;

      res.json({ steps, round: currentRound, summary, isByeRound: isByeRoundNow, byeType, tradesAvailable: settings.tradesRemaining, maxTrades, best18Applies: isByeRoundNow, seasonContext: finalContext });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============ GAME DAY GUIDE ROUTES ============

  app.get("/api/game-day-guide", async (req, res) => {
    try {
      const uid = getEffectiveUserId(req);
      const settings = await storage.getSettings(uid);
      const currentTeam = await storage.getMyTeam(uid);
      const tradeRecs = await storage.getTradeRecommendations(uid);

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

      const gameRulesModule = await import("@shared/game-rules");
      const isByeRoundNow = gameRulesModule.isByeRound(settings.currentRound);
      const maxTradesThisRound = gameRulesModule.getTradesForRound(settings.currentRound);
      const emergencies = currentTeam.filter(p => p.isEmergency);

      const tips: string[] = [
        "Open the AFL Fantasy app → My Team",
      ];

      if (tradeSteps.length > 0) {
        tips.push("Go to Trades tab");
        tips.push(...tradeSteps.map(t => `Search for "${t.in.name}" and trade out "${t.out.name}"`));
        tips.push("Confirm all trades");
        if (tradeSteps.length < maxTradesThisRound) {
          tips.push(`Note: You have ${maxTradesThisRound - tradeSteps.length} unused trade${maxTradesThisRound - tradeSteps.length > 1 ? "s" : ""} this round — consider saving or using strategically`);
        }
      }

      if (captain) {
        tips.push(`Set ${captain.name} as Captain (tap the 'C' badge)`);
      }
      if (viceCaptain) {
        tips.push(`Set ${viceCaptain.name} as Vice-Captain (tap the 'VC' badge)`);
        tips.push("Captain Loophole: If your VC plays early and scores 120+, keep them. If under 100, switch captain to a player in a later game.");
      }

      tips.push("TOG 50% rule: If your Captain finishes below 50% Time On Ground (e.g. injury), the doubled score becomes whichever is higher between Captain and VC. Emergencies never get doubled.");

      if (emergencies.length < 4) {
        tips.push(`Set ${4 - emergencies.length} more emergency/ies — players below 50% TOG can be replaced by a higher-scoring emergency from the same position`);
      }

      if (fieldMoves.length > 0) {
        tips.push(...fieldMoves.map(m => `${m.action}: ${m.player}`));
      }

      if (isByeRoundNow) {
        const activeOnField = currentTeam.filter(p => p.isOnField && p.byeRound !== settings.currentRound);
        tips.push(`Bye round: Best-18 scoring — only your top 18 on-field scores count. You have ${activeOnField.length} active on-field players.`);
      }

      tips.push("You can revise trades before lockout using Advanced Trade-Editing. Rollback restores your team to end of last round.");
      tips.push("Review your team and confirm before lockout (rolling lockout — players lock at match start)");

      const guide = {
        round: settings.currentRound,
        tradesRemaining: settings.tradesRemaining,
        tradesAvailableThisRound: maxTradesThisRound,
        isByeRound: isByeRoundNow,
        trades: tradeSteps,
        captain: captain ? { name: captain.name, avgScore: captain.avgScore, position: captain.position } : null,
        viceCaptain: viceCaptain ? { name: viceCaptain.name, avgScore: viceCaptain.avgScore, position: viceCaptain.position } : null,
        fieldMoves,
        emergenciesSet: emergencies.length,
        tips,
        isEmpty: tradeSteps.length === 0 && fieldMoves.length === 0,
      };

      res.json(guide);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
