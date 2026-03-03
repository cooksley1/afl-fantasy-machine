import { eq, desc, asc } from "drizzle-orm";
import { db } from "./db";
import {
  players,
  myTeamPlayers,
  tradeRecommendations,
  leagueSettings,
  intelReports,
  lateChanges,
  type Player,
  type InsertPlayer,
  type MyTeamPlayer,
  type InsertMyTeamPlayer,
  type TradeRecommendation,
  type InsertTradeRec,
  type LeagueSettings,
  type InsertLeagueSettings,
  type PlayerWithTeamInfo,
  type TradeRecommendationWithPlayers,
  type IntelReport,
  type InsertIntelReport,
  type LateChange,
  type InsertLateChange,
} from "@shared/schema";

export interface IStorage {
  getAllPlayers(): Promise<Player[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;

  getMyTeam(): Promise<PlayerWithTeamInfo[]>;
  addToMyTeam(entry: InsertMyTeamPlayer): Promise<MyTeamPlayer>;
  removeFromMyTeam(id: number): Promise<void>;
  setCaptain(id: number): Promise<void>;
  setViceCaptain(id: number): Promise<void>;

  getTradeRecommendations(): Promise<TradeRecommendationWithPlayers[]>;
  createTradeRecommendation(rec: InsertTradeRec): Promise<TradeRecommendation>;
  clearTradeRecommendations(): Promise<void>;
  getTradeRecommendation(id: number): Promise<TradeRecommendation | undefined>;
  deleteTradeRecommendation(id: number): Promise<void>;

  getSettings(): Promise<LeagueSettings>;
  updateSettings(settings: Partial<InsertLeagueSettings>): Promise<LeagueSettings>;

  getIntelReports(): Promise<IntelReport[]>;
  getIntelReportsByCategory(category: string): Promise<IntelReport[]>;
  createIntelReport(report: InsertIntelReport): Promise<IntelReport>;
  clearIntelReports(): Promise<void>;

  getLateChanges(round: number): Promise<LateChange[]>;
  createLateChange(change: InsertLateChange): Promise<LateChange>;
  clearLateChanges(round: number): Promise<void>;

  updatePlayer(id: number, data: Partial<InsertPlayer>): Promise<Player>;
}

export class DatabaseStorage implements IStorage {
  async getAllPlayers(): Promise<Player[]> {
    return db.select().from(players).orderBy(desc(players.avgScore));
  }

  async getPlayer(id: number): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player;
  }

  async createPlayer(player: InsertPlayer): Promise<Player> {
    const [created] = await db.insert(players).values(player).returning();
    return created;
  }

  async getMyTeam(): Promise<PlayerWithTeamInfo[]> {
    const teamEntries = await db.select().from(myTeamPlayers);
    const result: PlayerWithTeamInfo[] = [];

    for (const entry of teamEntries) {
      const [player] = await db
        .select()
        .from(players)
        .where(eq(players.id, entry.playerId));
      if (player) {
        result.push({
          ...player,
          isOnField: entry.isOnField,
          isCaptain: entry.isCaptain,
          isViceCaptain: entry.isViceCaptain,
          fieldPosition: entry.fieldPosition,
          myTeamPlayerId: entry.id,
        });
      }
    }

    return result;
  }

  async addToMyTeam(entry: InsertMyTeamPlayer): Promise<MyTeamPlayer> {
    const [created] = await db.insert(myTeamPlayers).values(entry).returning();
    return created;
  }

  async removeFromMyTeam(id: number): Promise<void> {
    await db.delete(myTeamPlayers).where(eq(myTeamPlayers.id, id));
  }

  async setCaptain(id: number): Promise<void> {
    await db
      .update(myTeamPlayers)
      .set({ isCaptain: false })
      .where(eq(myTeamPlayers.isCaptain, true));
    await db
      .update(myTeamPlayers)
      .set({ isCaptain: true, isViceCaptain: false })
      .where(eq(myTeamPlayers.id, id));
  }

  async setViceCaptain(id: number): Promise<void> {
    await db
      .update(myTeamPlayers)
      .set({ isViceCaptain: false })
      .where(eq(myTeamPlayers.isViceCaptain, true));
    await db
      .update(myTeamPlayers)
      .set({ isViceCaptain: true, isCaptain: false })
      .where(eq(myTeamPlayers.id, id));
  }

  async getTradeRecommendations(): Promise<TradeRecommendationWithPlayers[]> {
    const recs = await db
      .select()
      .from(tradeRecommendations)
      .orderBy(desc(tradeRecommendations.confidence));
    const result: TradeRecommendationWithPlayers[] = [];

    for (const rec of recs) {
      const [playerOut] = await db
        .select()
        .from(players)
        .where(eq(players.id, rec.playerOutId));
      const [playerIn] = await db
        .select()
        .from(players)
        .where(eq(players.id, rec.playerInId));
      if (playerOut && playerIn) {
        result.push({ ...rec, playerOut, playerIn });
      }
    }

    return result;
  }

  async createTradeRecommendation(rec: InsertTradeRec): Promise<TradeRecommendation> {
    const [created] = await db
      .insert(tradeRecommendations)
      .values(rec)
      .returning();
    return created;
  }

  async clearTradeRecommendations(): Promise<void> {
    await db.delete(tradeRecommendations);
  }

  async getTradeRecommendation(
    id: number
  ): Promise<TradeRecommendation | undefined> {
    const [rec] = await db
      .select()
      .from(tradeRecommendations)
      .where(eq(tradeRecommendations.id, id));
    return rec;
  }

  async deleteTradeRecommendation(id: number): Promise<void> {
    await db
      .delete(tradeRecommendations)
      .where(eq(tradeRecommendations.id, id));
  }

  async getSettings(): Promise<LeagueSettings> {
    const [existing] = await db.select().from(leagueSettings);
    if (existing) return existing;
    const [created] = await db
      .insert(leagueSettings)
      .values({
        teamName: "My Team",
        salaryCap: 10000000,
        currentRound: 1,
        tradesRemaining: 30,
        totalTradesUsed: 0,
      })
      .returning();
    return created;
  }

  async updateSettings(
    settings: Partial<InsertLeagueSettings>
  ): Promise<LeagueSettings> {
    const existing = await this.getSettings();
    const [updated] = await db
      .update(leagueSettings)
      .set(settings)
      .where(eq(leagueSettings.id, existing.id))
      .returning();
    return updated;
  }

  async getIntelReports(): Promise<IntelReport[]> {
    return db.select().from(intelReports).orderBy(desc(intelReports.createdAt));
  }

  async getIntelReportsByCategory(category: string): Promise<IntelReport[]> {
    return db
      .select()
      .from(intelReports)
      .where(eq(intelReports.category, category))
      .orderBy(desc(intelReports.createdAt));
  }

  async createIntelReport(report: InsertIntelReport): Promise<IntelReport> {
    const [created] = await db.insert(intelReports).values(report).returning();
    return created;
  }

  async clearIntelReports(): Promise<void> {
    await db.delete(intelReports);
  }

  async getLateChanges(round: number): Promise<LateChange[]> {
    return db
      .select()
      .from(lateChanges)
      .where(eq(lateChanges.round, round))
      .orderBy(desc(lateChanges.createdAt));
  }

  async createLateChange(change: InsertLateChange): Promise<LateChange> {
    const [created] = await db.insert(lateChanges).values(change).returning();
    return created;
  }

  async clearLateChanges(round: number): Promise<void> {
    await db.delete(lateChanges).where(eq(lateChanges.round, round));
  }

  async updatePlayer(id: number, data: Partial<InsertPlayer>): Promise<Player> {
    const [updated] = await db
      .update(players)
      .set(data)
      .where(eq(players.id, id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
