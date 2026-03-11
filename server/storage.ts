import { eq, desc, asc, and, gte, sql } from "drizzle-orm";
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
  savedTeams,
  leagueOpponents,
  playerAlerts,
  type SavedTeam,
  type InsertSavedTeam,
  type LeagueOpponent,
  type InsertLeagueOpponent,
  type PlayerAlert,
  type InsertPlayerAlert,
} from "@shared/schema";

export interface IStorage {
  getAllPlayers(): Promise<Player[]>;
  getPlayer(id: number): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;

  getMyTeam(userId: string): Promise<PlayerWithTeamInfo[]>;
  addToMyTeam(userId: string, entry: InsertMyTeamPlayer): Promise<MyTeamPlayer>;
  removeFromMyTeam(userId: string, id: number): Promise<void>;
  clearMyTeam(userId: string): Promise<void>;
  setCaptain(userId: string, id: number): Promise<void>;
  setViceCaptain(userId: string, id: number): Promise<void>;
  updateMyTeamPlayer(userId: string, id: number, data: Partial<Pick<MyTeamPlayer, "isOnField" | "fieldPosition">>): Promise<void>;

  getTradeRecommendations(userId: string): Promise<TradeRecommendationWithPlayers[]>;
  createTradeRecommendation(userId: string, rec: InsertTradeRec): Promise<TradeRecommendation>;
  clearTradeRecommendations(userId: string): Promise<void>;
  getTradeRecommendation(userId: string, id: number): Promise<TradeRecommendation | undefined>;
  deleteTradeRecommendation(userId: string, id: number): Promise<void>;

  getSettings(userId: string): Promise<LeagueSettings>;
  updateSettings(userId: string, settings: Partial<InsertLeagueSettings>): Promise<LeagueSettings>;

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

  getSavedTeams(userId: string): Promise<SavedTeam[]>;
  getSavedTeam(userId: string, id: number): Promise<SavedTeam | undefined>;
  createSavedTeam(userId: string, data: InsertSavedTeam): Promise<SavedTeam>;
  updateSavedTeam(userId: string, id: number, data: Partial<InsertSavedTeam>): Promise<SavedTeam>;
  deleteSavedTeam(userId: string, id: number): Promise<void>;
  activateSavedTeam(userId: string, id: number): Promise<void>;
  saveCurrentTeamAsVariant(userId: string, name: string, description: string | null, source: string): Promise<SavedTeam>;

  getLeagueOpponents(userId: string, leagueName?: string): Promise<LeagueOpponent[]>;
  getLeagueOpponent(userId: string, id: number): Promise<LeagueOpponent | undefined>;
  createLeagueOpponent(userId: string, data: InsertLeagueOpponent): Promise<LeagueOpponent>;
  updateLeagueOpponent(userId: string, id: number, data: Partial<InsertLeagueOpponent>): Promise<LeagueOpponent>;
  deleteLeagueOpponent(userId: string, id: number): Promise<void>;

  getPlayerAlerts(userId: string, unreadOnly?: boolean): Promise<PlayerAlert[]>;
  getUnreadAlertCount(userId: string): Promise<number>;
  createPlayerAlert(alert: InsertPlayerAlert): Promise<PlayerAlert>;
  markAlertRead(userId: string, id: number): Promise<void>;
  markAllAlertsRead(userId: string): Promise<void>;
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

  async getMyTeam(userId: string): Promise<PlayerWithTeamInfo[]> {
    const teamEntries = await db.select().from(myTeamPlayers).where(eq(myTeamPlayers.userId, userId));
    const result: PlayerWithTeamInfo[] = [];

    const playerIds = teamEntries.map(e => e.playerId);
    const lastScoreMap = new Map<number, { score: number; round: number }>();
    if (playerIds.length > 0) {
      const allPlayerStats = await db
        .select({
          playerId: weeklyStats.playerId,
          round: weeklyStats.round,
          fantasyScore: weeklyStats.fantasyScore,
        })
        .from(weeklyStats);

      for (const stat of allPlayerStats) {
        if (!playerIds.includes(stat.playerId)) continue;
        const existing = lastScoreMap.get(stat.playerId);
        if (!existing || stat.round > existing.round) {
          lastScoreMap.set(stat.playerId, {
            score: stat.fantasyScore || 0,
            round: stat.round,
          });
        }
      }
    }

    for (const entry of teamEntries) {
      const [player] = await db
        .select()
        .from(players)
        .where(eq(players.id, entry.playerId));
      if (player) {
        const lastScore = lastScoreMap.get(player.id);
        result.push({
          ...player,
          isOnField: entry.isOnField,
          isCaptain: entry.isCaptain,
          isViceCaptain: entry.isViceCaptain,
          fieldPosition: entry.fieldPosition,
          myTeamPlayerId: entry.id,
          lastRoundScore: lastScore?.score ?? null,
          lastRoundNumber: lastScore?.round ?? null,
        });
      }
    }

    return result;
  }

  async addToMyTeam(userId: string, entry: InsertMyTeamPlayer): Promise<MyTeamPlayer> {
    const [created] = await db.insert(myTeamPlayers).values({ ...entry, userId }).returning();
    return created;
  }

  async removeFromMyTeam(userId: string, id: number): Promise<void> {
    await db.delete(myTeamPlayers).where(and(eq(myTeamPlayers.id, id), eq(myTeamPlayers.userId, userId)));
  }

  async updateMyTeamPlayer(userId: string, id: number, data: Partial<Pick<MyTeamPlayer, "isOnField" | "fieldPosition">>): Promise<void> {
    await db.update(myTeamPlayers).set(data).where(and(eq(myTeamPlayers.id, id), eq(myTeamPlayers.userId, userId)));
  }

  async clearMyTeam(userId: string): Promise<void> {
    await db.delete(myTeamPlayers).where(eq(myTeamPlayers.userId, userId));
  }

  async setCaptain(userId: string, id: number): Promise<void> {
    await db
      .update(myTeamPlayers)
      .set({ isCaptain: false })
      .where(and(eq(myTeamPlayers.userId, userId), eq(myTeamPlayers.isCaptain, true)));
    await db
      .update(myTeamPlayers)
      .set({ isCaptain: true, isViceCaptain: false })
      .where(and(eq(myTeamPlayers.id, id), eq(myTeamPlayers.userId, userId)));
  }

  async setViceCaptain(userId: string, id: number): Promise<void> {
    await db
      .update(myTeamPlayers)
      .set({ isViceCaptain: false })
      .where(and(eq(myTeamPlayers.userId, userId), eq(myTeamPlayers.isViceCaptain, true)));
    await db
      .update(myTeamPlayers)
      .set({ isViceCaptain: true, isCaptain: false })
      .where(and(eq(myTeamPlayers.id, id), eq(myTeamPlayers.userId, userId)));
  }

  async getTradeRecommendations(userId: string): Promise<TradeRecommendationWithPlayers[]> {
    const recs = await db
      .select()
      .from(tradeRecommendations)
      .where(eq(tradeRecommendations.userId, userId))
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

  async createTradeRecommendation(userId: string, rec: InsertTradeRec): Promise<TradeRecommendation> {
    const [created] = await db
      .insert(tradeRecommendations)
      .values({ ...rec, userId })
      .returning();
    return created;
  }

  async clearTradeRecommendations(userId: string): Promise<void> {
    await db.delete(tradeRecommendations).where(eq(tradeRecommendations.userId, userId));
  }

  async getTradeRecommendation(
    userId: string,
    id: number
  ): Promise<TradeRecommendation | undefined> {
    const [rec] = await db
      .select()
      .from(tradeRecommendations)
      .where(and(eq(tradeRecommendations.id, id), eq(tradeRecommendations.userId, userId)));
    return rec;
  }

  async deleteTradeRecommendation(userId: string, id: number): Promise<void> {
    await db
      .delete(tradeRecommendations)
      .where(and(eq(tradeRecommendations.id, id), eq(tradeRecommendations.userId, userId)));
  }

  async getSettings(userId: string): Promise<LeagueSettings> {
    const [existing] = await db.select().from(leagueSettings).where(eq(leagueSettings.userId, userId));
    if (existing) {
      if (existing.salaryCap === 10000000) {
        const [fixed] = await db.update(leagueSettings).set({ salaryCap: 18300000 }).where(eq(leagueSettings.id, existing.id)).returning();
        return fixed;
      }
      return existing;
    }
    const [created] = await db
      .insert(leagueSettings)
      .values({
        userId,
        teamName: "My Team",
        salaryCap: 18300000,
        currentRound: 1,
        tradesRemaining: 30,
        totalTradesUsed: 0,
      })
      .returning();
    return created;
  }

  async updateSettings(
    userId: string,
    settings: Partial<InsertLeagueSettings>
  ): Promise<LeagueSettings> {
    const existing = await this.getSettings(userId);
    const [updated] = await db
      .update(leagueSettings)
      .set(settings)
      .where(and(eq(leagueSettings.id, existing.id), eq(leagueSettings.userId, userId)))
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

  async getSavedTeams(userId: string): Promise<SavedTeam[]> {
    return db.select().from(savedTeams).where(eq(savedTeams.userId, userId)).orderBy(desc(savedTeams.createdAt));
  }

  async getSavedTeam(userId: string, id: number): Promise<SavedTeam | undefined> {
    const [team] = await db.select().from(savedTeams).where(and(eq(savedTeams.id, id), eq(savedTeams.userId, userId)));
    return team;
  }

  async createSavedTeam(userId: string, data: InsertSavedTeam): Promise<SavedTeam> {
    const [created] = await db.insert(savedTeams).values({ ...data, userId }).returning();
    return created;
  }

  async updateSavedTeam(userId: string, id: number, data: Partial<InsertSavedTeam>): Promise<SavedTeam> {
    const [updated] = await db.update(savedTeams).set(data).where(and(eq(savedTeams.id, id), eq(savedTeams.userId, userId))).returning();
    return updated;
  }

  async deleteSavedTeam(userId: string, id: number): Promise<void> {
    await db.delete(savedTeams).where(and(eq(savedTeams.id, id), eq(savedTeams.userId, userId)));
  }

  async activateSavedTeam(userId: string, id: number): Promise<void> {
    await db.update(savedTeams).set({ isActive: false }).where(eq(savedTeams.userId, userId));
    await db.update(savedTeams).set({ isActive: true }).where(and(eq(savedTeams.id, id), eq(savedTeams.userId, userId)));

    const team = await this.getSavedTeam(userId, id);
    if (!team) throw new Error("Saved team not found");

    const playerEntries: Array<{ playerId: number; isOnField: boolean; isCaptain: boolean; isViceCaptain: boolean; fieldPosition: string }> = JSON.parse(team.playerData);

    await db.delete(myTeamPlayers).where(eq(myTeamPlayers.userId, userId));
    for (const entry of playerEntries) {
      await db.insert(myTeamPlayers).values({
        userId,
        playerId: entry.playerId,
        isOnField: entry.isOnField,
        isCaptain: entry.isCaptain,
        isViceCaptain: entry.isViceCaptain,
        fieldPosition: entry.fieldPosition,
      });
    }
  }

  async saveCurrentTeamAsVariant(userId: string, name: string, description: string | null, source: string): Promise<SavedTeam> {
    const teamEntries = await db.select().from(myTeamPlayers).where(eq(myTeamPlayers.userId, userId));
    const allPlayers = await db.select().from(players);
    const playerMap = new Map(allPlayers.map(p => [p.id, p]));

    const playerData = teamEntries.map(e => ({
      playerId: e.playerId,
      isOnField: e.isOnField,
      isCaptain: e.isCaptain,
      isViceCaptain: e.isViceCaptain,
      fieldPosition: e.fieldPosition,
    }));

    const teamValue = teamEntries.reduce((sum, e) => {
      const p = playerMap.get(e.playerId);
      return sum + (p?.price || 0);
    }, 0);

    const projectedScore = teamEntries
      .filter(e => e.isOnField)
      .reduce((sum, e) => {
        const p = playerMap.get(e.playerId);
        return sum + (p?.avgScore || 0);
      }, 0);

    return this.createSavedTeam(userId, {
      name,
      description,
      playerData: JSON.stringify(playerData),
      teamValue,
      projectedScore: Math.round(projectedScore),
      isActive: false,
      source,
    });
  }

  async getLeagueOpponents(userId: string, leagueName?: string): Promise<LeagueOpponent[]> {
    if (leagueName) {
      return db.select().from(leagueOpponents)
        .where(and(eq(leagueOpponents.userId, userId), eq(leagueOpponents.leagueName, leagueName)))
        .orderBy(desc(leagueOpponents.createdAt));
    }
    return db.select().from(leagueOpponents).where(eq(leagueOpponents.userId, userId)).orderBy(desc(leagueOpponents.createdAt));
  }

  async getLeagueOpponent(userId: string, id: number): Promise<LeagueOpponent | undefined> {
    const [opp] = await db.select().from(leagueOpponents).where(and(eq(leagueOpponents.id, id), eq(leagueOpponents.userId, userId)));
    return opp;
  }

  async createLeagueOpponent(userId: string, data: InsertLeagueOpponent): Promise<LeagueOpponent> {
    const [created] = await db.insert(leagueOpponents).values({ ...data, userId }).returning();
    return created;
  }

  async updateLeagueOpponent(userId: string, id: number, data: Partial<InsertLeagueOpponent>): Promise<LeagueOpponent> {
    const [updated] = await db.update(leagueOpponents).set(data).where(and(eq(leagueOpponents.id, id), eq(leagueOpponents.userId, userId))).returning();
    return updated;
  }

  async deleteLeagueOpponent(userId: string, id: number): Promise<void> {
    await db.delete(leagueOpponents).where(and(eq(leagueOpponents.id, id), eq(leagueOpponents.userId, userId)));
  }

  async getPlayerAlerts(userId: string, unreadOnly?: boolean): Promise<PlayerAlert[]> {
    if (unreadOnly) {
      return db.select().from(playerAlerts)
        .where(and(eq(playerAlerts.userId, userId), eq(playerAlerts.isRead, false)))
        .orderBy(desc(playerAlerts.createdAt))
        .limit(50);
    }
    return db.select().from(playerAlerts)
      .where(eq(playerAlerts.userId, userId))
      .orderBy(desc(playerAlerts.createdAt))
      .limit(100);
  }

  async getUnreadAlertCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(playerAlerts)
      .where(and(eq(playerAlerts.userId, userId), eq(playerAlerts.isRead, false)));
    return Number(result[0]?.count || 0);
  }

  async createPlayerAlert(alert: InsertPlayerAlert): Promise<PlayerAlert> {
    const [created] = await db.insert(playerAlerts).values(alert).returning();
    return created;
  }

  async markAlertRead(userId: string, id: number): Promise<void> {
    await db.update(playerAlerts).set({ isRead: true })
      .where(and(eq(playerAlerts.id, id), eq(playerAlerts.userId, userId)));
  }

  async markAllAlertsRead(userId: string): Promise<void> {
    await db.update(playerAlerts).set({ isRead: true })
      .where(and(eq(playerAlerts.userId, userId), eq(playerAlerts.isRead, false)));
  }
}

export const storage = new DatabaseStorage();
