import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMyTeamPlayerSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/players", async (_req, res) => {
    try {
      const players = await storage.getAllPlayers();
      res.json(players);
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
      const teamPlayerIds = new Set(myTeam.map((p) => p.id));
      const availablePlayers = allPlayers.filter(
        (p) => !teamPlayerIds.has(p.id) && !p.injuryStatus
      );

      const underperformers = myTeam
        .filter((p) => p.isOnField)
        .sort((a, b) => {
          const aFormDiff = (a.last3Avg || 0) - (a.avgScore || 0);
          const bFormDiff = (b.last3Avg || 0) - (b.avgScore || 0);
          return aFormDiff - bFormDiff;
        })
        .slice(0, 5);

      for (const playerOut of underperformers) {
        const samePosPlayers = availablePlayers
          .filter((p) => p.position === playerOut.position)
          .sort((a, b) => {
            const aScore = (a.last3Avg || 0) * 0.4 + (a.avgScore || 0) * 0.3 + (a.formTrend === "up" ? 10 : a.formTrend === "down" ? -10 : 0) * 0.3;
            const bScore = (b.last3Avg || 0) * 0.4 + (b.avgScore || 0) * 0.3 + (b.formTrend === "up" ? 10 : b.formTrend === "down" ? -10 : 0) * 0.3;
            return bScore - aScore;
          })
          .slice(0, 3);

        for (const playerIn of samePosPlayers) {
          const scoreDiff = (playerIn.avgScore || 0) - (playerOut.avgScore || 0);
          const formDiff = (playerIn.last3Avg || 0) - (playerOut.last3Avg || 0);
          const priceDiff = playerIn.price - playerOut.price;

          let confidence = 0.5;
          if (formDiff > 15) confidence += 0.2;
          else if (formDiff > 5) confidence += 0.1;
          if (scoreDiff > 10) confidence += 0.15;
          else if (scoreDiff > 0) confidence += 0.05;
          if (playerIn.formTrend === "up") confidence += 0.1;
          if (playerOut.formTrend === "down") confidence += 0.1;
          if (playerOut.injuryStatus) confidence += 0.15;
          confidence = Math.min(confidence, 0.95);

          const reasons = [];
          if (playerIn.formTrend === "up") reasons.push(`${playerIn.name} is in strong form with a last 3 avg of ${playerIn.last3Avg?.toFixed(1)}`);
          if (playerOut.formTrend === "down") reasons.push(`${playerOut.name} has been underperforming recently`);
          if (scoreDiff > 0) reasons.push(`+${scoreDiff.toFixed(1)} avg points per game`);
          if (priceDiff < 0) reasons.push(`saves $${Math.abs(priceDiff / 1000).toFixed(0)}K in salary`);
          if (playerIn.ownedByPercent > 30) reasons.push(`owned by ${playerIn.ownedByPercent?.toFixed(0)}% of coaches`);
          if (reasons.length === 0) reasons.push("Potential upgrade based on form analysis");

          await storage.createTradeRecommendation({
            playerOutId: playerOut.id,
            playerInId: playerIn.id,
            reason: reasons.join(". ") + ".",
            confidence,
            priceChange: priceDiff,
            scoreDifference: scoreDiff,
          });
        }
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
      if (settings.tradesRemaining <= 0) {
        return res.status(400).json({ message: "No trades remaining" });
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

  app.patch("/api/settings", async (req, res) => {
    try {
      const schema = z.object({
        teamName: z.string().min(1).max(50).optional(),
        salaryCap: z.number().min(1000000).max(20000000).optional(),
        currentRound: z.number().min(1).max(24).optional(),
        tradesRemaining: z.number().min(0).max(100).optional(),
      });
      const data = schema.parse(req.body);
      const updated = await storage.updateSettings(data);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  return httpServer;
}
