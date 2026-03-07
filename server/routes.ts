import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMyTeamPlayerSchema } from "@shared/schema";
import { AFL_FANTASY_CLASSIC_2026, getTradesForRound, getFixtureForTeam } from "@shared/game-rules";
import { z } from "zod";
import multer from "multer";
import {
  calcTradeEV,
  calcTradeRankingScore,
  calcTradeConfidence,
  getCachedWeights,
  buildWeightConfig,
} from "./services/projection-engine";
import { generateTradeRecommendations } from "./services/trade-engine";
import { getLiveRoundData, updatePlayerLiveStats, bulkUpdateLiveScores, fetchMatchStatuses } from "./services/live-scores";

const gameRules = AFL_FANTASY_CLASSIC_2026;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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

      const missingPlayers = [
        { name: "Will Derksen", team: "Essendon", position: "DEF", price: 230000 },
        { name: "Tom Blamires", team: "North Melbourne", position: "MID", price: 230000 },
      ];
      for (const mp of missingPlayers) {
        if (!findPlayer(mp.name)) {
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

      await storage.removeFromMyTeam(teamEntry.myTeamPlayerId!);

      const playerIn = await storage.getPlayer(trade.playerInId);
      if (!playerIn) return res.status(404).json({ message: "Player not found" });

      await storage.addToMyTeam({
        playerId: trade.playerInId,
        isOnField: true,
        isCaptain: false,
        isViceCaptain: false,
        fieldPosition: playerIn.position,
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
      res.status(500).json({ message: "Failed to analyze screenshot. Please try again with a clearer image." });
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

  return httpServer;
}
