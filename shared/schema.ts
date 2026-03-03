import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  team: text("team").notNull(),
  position: text("position").notNull(),
  dualPosition: text("dual_position").default(null),
  price: integer("price").notNull(),
  avgScore: real("avg_score").notNull().default(0),
  last3Avg: real("last3_avg").notNull().default(0),
  last5Avg: real("last5_avg").notNull().default(0),
  seasonTotal: integer("season_total").notNull().default(0),
  gamesPlayed: integer("games_played").notNull().default(0),
  ownedByPercent: real("owned_by_percent").notNull().default(0),
  formTrend: text("form_trend").notNull().default("stable"),
  injuryStatus: text("injury_status").default(null),
  nextOpponent: text("next_opponent").default(null),
  byeRound: integer("bye_round").default(null),
  venue: text("venue").default(null),
  gameTime: text("game_time").default(null),
  projectedScore: real("projected_score").default(null),
  priceChange: integer("price_change").notNull().default(0),
  breakEven: integer("break_even").default(null),
  ceilingScore: integer("ceiling_score").default(null),
  isNamedTeam: boolean("is_named_team").notNull().default(true),
  lateChange: boolean("late_change").notNull().default(false),
});

export const myTeamPlayers = pgTable("my_team_players", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  isOnField: boolean("is_on_field").notNull().default(true),
  isCaptain: boolean("is_captain").notNull().default(false),
  isViceCaptain: boolean("is_vice_captain").notNull().default(false),
  fieldPosition: text("field_position").notNull(),
});

export const tradeRecommendations = pgTable("trade_recommendations", {
  id: serial("id").primaryKey(),
  playerOutId: integer("player_out_id").notNull(),
  playerInId: integer("player_in_id").notNull(),
  reason: text("reason").notNull(),
  confidence: real("confidence").notNull().default(0),
  priceChange: integer("price_change").notNull().default(0),
  scoreDifference: real("score_difference").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const leagueSettings = pgTable("league_settings", {
  id: serial("id").primaryKey(),
  teamName: text("team_name").notNull().default("My Team"),
  salaryCap: integer("salary_cap").notNull().default(10000000),
  currentRound: integer("current_round").notNull().default(1),
  tradesRemaining: integer("trades_remaining").notNull().default(30),
  totalTradesUsed: integer("total_trades_used").notNull().default(0),
});

export const intelReports = pgTable("intel_reports", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  priority: text("priority").notNull().default("medium"),
  playerNames: text("player_names").default(null),
  source: text("source").default(null),
  actionable: boolean("actionable").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lateChanges = pgTable("late_changes", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  changeType: text("change_type").notNull(),
  details: text("details").notNull(),
  round: integer("round").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const intelSources = pgTable("intel_sources", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url").default(null),
  title: text("title").notNull(),
  rawContent: text("raw_content").notNull(),
  processedInsights: text("processed_insights").default(null),
  relevantPlayerNames: text("relevant_player_names").default(null),
  round: integer("round").default(null),
  isProcessed: boolean("is_processed").notNull().default(false),
  isActionable: boolean("is_actionable").notNull().default(false),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  processedAt: timestamp("processed_at").default(null),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export const insertMyTeamPlayerSchema = createInsertSchema(myTeamPlayers).omit({ id: true });
export const insertTradeRecSchema = createInsertSchema(tradeRecommendations).omit({ id: true, createdAt: true });
export const insertLeagueSettingsSchema = createInsertSchema(leagueSettings).omit({ id: true });
export const insertIntelReportSchema = createInsertSchema(intelReports).omit({ id: true, createdAt: true });
export const insertLateChangeSchema = createInsertSchema(lateChanges).omit({ id: true, createdAt: true });
export const insertIntelSourceSchema = createInsertSchema(intelSources).omit({ id: true, fetchedAt: true, processedAt: true });

export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type MyTeamPlayer = typeof myTeamPlayers.$inferSelect;
export type InsertMyTeamPlayer = z.infer<typeof insertMyTeamPlayerSchema>;
export type TradeRecommendation = typeof tradeRecommendations.$inferSelect;
export type InsertTradeRec = z.infer<typeof insertTradeRecSchema>;
export type LeagueSettings = typeof leagueSettings.$inferSelect;
export type InsertLeagueSettings = z.infer<typeof insertLeagueSettingsSchema>;
export type IntelReport = typeof intelReports.$inferSelect;
export type InsertIntelReport = z.infer<typeof insertIntelReportSchema>;
export type LateChange = typeof lateChanges.$inferSelect;
export type InsertLateChange = z.infer<typeof insertLateChangeSchema>;
export type IntelSource = typeof intelSources.$inferSelect;
export type InsertIntelSource = z.infer<typeof insertIntelSourceSchema>;

export type PlayerWithTeamInfo = Player & {
  isOnField?: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  fieldPosition?: string;
  myTeamPlayerId?: number;
};

export type TradeRecommendationWithPlayers = TradeRecommendation & {
  playerOut: Player;
  playerIn: Player;
};

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
