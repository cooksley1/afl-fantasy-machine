import { eq, desc, asc, and, gte } from "drizzle-orm";
import { db } from "./db";
import {
  players,
  myTeamPlayers,
  tradeRecommendations,
  leagueSettings,
  intelReports,
  lateChanges,
  weeklyStats,
  teamContext,
  positionConcessions,
  projections,
  modelWeights,
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
  type WeeklyStat,
  type InsertWeeklyStat,
  type TeamContextType,
  type InsertTeamContext,
  type PositionConcession,
  type InsertPositionConcession,
  type Projection,
  type InsertProjection,
  type ModelWeight,
  type InsertModelWeight,
} from "@shared/schema";

export interface IStorage {
  getAllPlayers(): Promise<Player[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;

  getMyTeam(): Promise<PlayerWithTeamInfo[]>;
  addToMyTeam(entry: InsertMyTeamPlayer): Promise<MyTeamPlayer>;
  removeFromMyTeam(id: number): Promise<void>;
  clearMyTeam(): Promise<void>;
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
  getIntelReportsSince(since: Date): Promise<IntelReport[]>;
  getIntelReportsByCategory(category: string): Promise<IntelReport[]>;
  createIntelReport(report: InsertIntelReport): Promise<IntelReport>;
  clearIntelReports(): Promise<void>;

  getLateChanges(round: number): Promise<LateChange[]>;
  createLateChange(change: InsertLateChange): Promise<LateChange>;
  clearLateChanges(round: number): Promise<void>;

  updatePlayer(id: number, data: Partial<InsertPlayer>): Promise<Player>;

  getWeeklyStats(playerId: number): Promise<WeeklyStat[]>;
  getWeeklyStatsByRound(round: number): Promise<WeeklyStat[]>;
  createWeeklyStat(stat: InsertWeeklyStat): Promise<WeeklyStat>;
  deleteWeeklyStats(playerId: number): Promise<void>;

  getTeamContext(team: string, round: number): Promise<TeamContextType | undefined>;
  getAllTeamContexts(): Promise<TeamContextType[]>;
  createTeamContext(ctx: InsertTeamContext): Promise<TeamContextType>;
  clearTeamContexts(): Promise<void>;

  getPositionConcessions(team: string): Promise<PositionConcession[]>;
  getAllPositionConcessions(): Promise<PositionConcession[]>;
  createPositionConcession(pc: InsertPositionConcession): Promise<PositionConcession>;
  clearPositionConcessions(): Promise<void>;

  getProjections(playerId: number): Promise<Projection[]>;
  getProjectionsByRound(round: number): Promise<Projection[]>;
  createProjection(proj: InsertProjection): Promise<Projection>;
  deleteProjections(playerId: number): Promise<void>;
  clearProjectionsByRound(round: number): Promise<void>;

  getAllModelWeights(): Promise<ModelWeight[]>;
  getModelWeight(key: string): Promise<ModelWeight | undefined>;
  upsertModelWeight(weight: InsertModelWeight): Promise<ModelWeight>;
  deleteModelWeight(key: string): Promise<void>;
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

  async clearMyTeam(): Promise<void> {
    await db.delete(myTeamPlayers);
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
        currentRound: 0,
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

  async getIntelReportsSince(since: Date): Promise<IntelReport[]> {
    return db.select().from(intelReports)
      .where(gte(intelReports.createdAt, since))
      .orderBy(desc(intelReports.createdAt));
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

  async getWeeklyStats(playerId: number): Promise<WeeklyStat[]> {
    return db
      .select()
      .from(weeklyStats)
      .where(eq(weeklyStats.playerId, playerId))
      .orderBy(desc(weeklyStats.round));
  }

  async getWeeklyStatsByRound(round: number): Promise<WeeklyStat[]> {
    return db
      .select()
      .from(weeklyStats)
      .where(eq(weeklyStats.round, round));
  }

  async createWeeklyStat(stat: InsertWeeklyStat): Promise<WeeklyStat> {
    const [created] = await db.insert(weeklyStats).values(stat).returning();
    return created;
  }

  async getTeamContext(team: string, round: number): Promise<TeamContextType | undefined> {
    const [ctx] = await db
      .select()
      .from(teamContext)
      .where(and(eq(teamContext.team, team), eq(teamContext.round, round)));
    return ctx;
  }

  async getAllTeamContexts(): Promise<TeamContextType[]> {
    return db.select().from(teamContext).orderBy(desc(teamContext.round));
  }

  async createTeamContext(ctx: InsertTeamContext): Promise<TeamContextType> {
    const [created] = await db.insert(teamContext).values(ctx).returning();
    return created;
  }

  async getPositionConcessions(team: string): Promise<PositionConcession[]> {
    return db
      .select()
      .from(positionConcessions)
      .where(eq(positionConcessions.team, team));
  }

  async getAllPositionConcessions(): Promise<PositionConcession[]> {
    return db.select().from(positionConcessions);
  }

  async createPositionConcession(pc: InsertPositionConcession): Promise<PositionConcession> {
    const [created] = await db.insert(positionConcessions).values(pc).returning();
    return created;
  }

  async getProjections(playerId: number): Promise<Projection[]> {
    return db
      .select()
      .from(projections)
      .where(eq(projections.playerId, playerId))
      .orderBy(desc(projections.round));
  }

  async getProjectionsByRound(round: number): Promise<Projection[]> {
    return db
      .select()
      .from(projections)
      .where(eq(projections.round, round));
  }

  async createProjection(proj: InsertProjection): Promise<Projection> {
    const [created] = await db.insert(projections).values(proj).returning();
    return created;
  }

  async deleteWeeklyStats(playerId: number): Promise<void> {
    await db.delete(weeklyStats).where(eq(weeklyStats.playerId, playerId));
  }

  async clearTeamContexts(): Promise<void> {
    await db.delete(teamContext);
  }

  async clearPositionConcessions(): Promise<void> {
    await db.delete(positionConcessions);
  }

  async deleteProjections(playerId: number): Promise<void> {
    await db.delete(projections).where(eq(projections.playerId, playerId));
  }

  async clearProjectionsByRound(round: number): Promise<void> {
    await db.delete(projections).where(eq(projections.round, round));
  }

  async getAllModelWeights(): Promise<ModelWeight[]> {
    return db.select().from(modelWeights);
  }

  async getModelWeight(key: string): Promise<ModelWeight | undefined> {
    const [weight] = await db.select().from(modelWeights).where(eq(modelWeights.key, key));
    return weight;
  }

  async upsertModelWeight(weight: InsertModelWeight): Promise<ModelWeight> {
    const existing = await this.getModelWeight(weight.key);
    if (existing) {
      const [updated] = await db.update(modelWeights)
        .set({ value: weight.value, description: weight.description, category: weight.category })
        .where(eq(modelWeights.key, weight.key))
        .returning();
      return updated;
    }
    const [created] = await db.insert(modelWeights).values(weight).returning();
    return created;
  }

  async deleteModelWeight(key: string): Promise<void> {
    await db.delete(modelWeights).where(eq(modelWeights.key, key));
  }
}

export const storage = new DatabaseStorage();
