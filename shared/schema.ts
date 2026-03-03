import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  team: text("team").notNull(),
  position: text("position").notNull(),
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

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export const insertMyTeamPlayerSchema = createInsertSchema(myTeamPlayers).omit({ id: true });
export const insertTradeRecSchema = createInsertSchema(tradeRecommendations).omit({ id: true, createdAt: true });
export const insertLeagueSettingsSchema = createInsertSchema(leagueSettings).omit({ id: true });

export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type MyTeamPlayer = typeof myTeamPlayers.$inferSelect;
export type InsertMyTeamPlayer = z.infer<typeof insertMyTeamPlayerSchema>;
export type TradeRecommendation = typeof tradeRecommendations.$inferSelect;
export type InsertTradeRec = z.infer<typeof insertTradeRecSchema>;
export type LeagueSettings = typeof leagueSettings.$inferSelect;
export type InsertLeagueSettings = z.infer<typeof insertLeagueSettingsSchema>;

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
